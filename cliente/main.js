/* Gerado por ferramentas/build.mjs. API 3. */
(() => {
"use strict";
// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # O que mudou com a API 3 completa
//
// A versão anterior sabia **redesenhar por relógio** e nada mais: perguntava ao
// servidor a cada quatro segundos e mostrava a resposta. Um MOD assim é uma tela
// de leitura, e foi nisso que os três oficiais viraram depois da migração.
//
// Agora ela sabe três coisas a mais:
//
// - **receber evento.** `SeeleUI.aoEvento` traz o que a pessoa fez — digitou,
//   escolheu, apertou, arrastou — sem que o MOD tenha perguntado;
// - **redesenhar na hora.** Um evento muda o estado local e a tela acompanha
//   imediatamente, em vez de esperar o próximo relógio;
// - **guardar rascunho.** O que está sendo editado **não** é sobrescrito pela
//   resposta do servidor. Sem isso, digitar durante um ciclo de quatro segundos
//   perderia o que foi digitado — e o produto preservar o foco não bastaria: o
//   foco ficaria numa caixa cujo valor o próprio MOD acabou de trocar.
function interfaceMod(id, titulo, intervalo = 4000) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui) throw new Error('Este MOD exige a API 3 do SEELE.');

  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const cabecalho = dentro => ({ forma: 'titulo', dentro: String(dentro ?? '') });
  const lista = itens => ({ forma: 'lista', dentro: itens.map(dentro => ({ forma: 'item', dentro: String(dentro) })) });
  const campo = (chave, rotulo, valor) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? '') });
  const escolha = (chave, rotulo, valor, opcoes) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes });
  const botao = (chave, dentro, desligado = false) => ({ forma: 'botao', chave, dentro: String(dentro), desligado });
  const linha = dentro => ({ forma: 'linha', dentro });

  const canalDe = snapshot => {
    const id = snapshot.open_channel ?? snapshot.channels?.[0]?.id;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  async function request(canal, valor) {
    const resposta = await api.request(id, canal, valor);
    if (!resposta?.ok) throw new Error(resposta?.error || 'O servidor recusou a consulta.');
    return resposta;
  }

  // O último canal visto, para um evento saber a quem falar sem perguntar de
  // novo: `snapshot` é uma ida à ponte, e um arraste não pode pagar uma por
  // quadro.
  let canalAtual = null;
  let pintando = false;
  let pendente = null;

  /**
   * Uma pintura de cada vez, e **nenhuma perdida**.
   *
   * Dois `regiao` em voo chegariam fora de ordem, e o desenho de trás apagaria
   * o da frente — por isso a segunda espera. Mas a primeira versão **descartava**
   * a segunda, e dois eventos seguidos (escolher a densidade e a fonte, no mesmo
   * quadro) perdiam o desenho do segundo: a tela ficava mostrando a escolha
   * anterior, e só o relógio a corrigia, quatro segundos depois.
   *
   * Guardar a última e pintá-la ao fim da que está em voo é o que resolve. É a
   * mesma forma do aviso que chega durante uma colheita: o que não cabe agora
   * não se joga fora, fica marcado.
   */
  const desenhar = async partes => {
    if (pintando) { pendente = partes; return; }
    pintando = true;
    try {
      let atual = partes;
      for (;;) {
        pendente = null;
        await ui.regiao([cabecalho(titulo), ...atual]);
        if (!pendente) return;
        atual = pendente;
      }
    } finally {
      pintando = false;
    }
  };

  function iniciar(consultar, semCanal = async () => {}, aoEvento = null) {
    /**
     * Redesenha com o que o estado local diz **agora**.
     *
     * É o que um evento chama. Ele não vai ao servidor: quem digita espera a
     * letra aparecer, e não esperar a rede.
     */
    const repintar = partes => { void desenhar(partes); };

    if (aoEvento) {
      ui.aoEvento(evento => {
        // O erro do MOD fica com o MOD, e é dito na região em vez de sumir.
        try {
          const talvez = aoEvento(evento, canalAtual, repintar);
          if (talvez && typeof talvez.catch === 'function') {
            talvez.catch(erro => void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]));
          }
        } catch (erro) {
          void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]);
        }
      });
    }

    async function atualizar() {
      try {
        const snapshot = await api.snapshot(), canal = canalDe(snapshot);
        canalAtual = canal;
        if (canal === null) {
          await semCanal();
          await desenhar([texto('Entre em um servidor com um canal de texto.')]);
        } else {
          const resultado = await consultar(snapshot, canal);
          // Não apresente uma resposta do canal anterior após a navegação.
          if (canalDe(await api.snapshot()) === canal) await desenhar(resultado);
          else await desenhar([texto('Canal alterado. Atualizando…')]);
        }
      } catch (erro) {
        try { await desenhar([texto('Não foi possível atualizar: ' + (erro.message || String(erro)))]); }
        catch (falha) { console.error(titulo + ': ' + (falha.message || String(falha))); }
      } finally {
        // Agenda depois de concluir: nunca sobrepõe consultas nem repete
        // escritas. O SEELE encerra o executor e seus temporizadores ao sair.
        setTimeout(atualizar, intervalo);
      }
    }
    void atualizar();
  }

  return { texto, cabecalho, lista, campo, escolha, botao, linha, request, iniciar, desenhar };
}

// O PERFIS: quem está aqui, e a ficha de cada um — **editável**.
//
// A versão anterior listava os textos e dizia que «edição, imagens, efeitos e
// cartões na lista de pessoas aguardam suporte do SEELE». Com a API 3 completa
// a ficha se edita, e o retrato e a faixa aparecem: o produto busca os bytes na
// metade de servidor deste MOD, reconhece o formato e monta a imagem.
//
// Enviar uma imagem nova voltou junto: a pessoa aperta, o seletor é do
// sistema, e este MOD recebe um **identificador** — não um caminho. Os bytes
// saem do produto em pedaços e entram no servidor pelo protocolo que ele já
// tinha, `upload-start` e `upload-part`.

const { texto, cabecalho, campo, escolha, botao, linha, request, iniciar } =
  interfaceMod('seele/perfis', 'PERFIS');

/**
 * Os tetos que o servidor deste MOD confere, repetidos aqui **para recusar
 * antes de ler**.
 *
 * O servidor tem a palavra final (`LIMITS` em `servidor/main.js`); estes
 * números só evitam carregar dez megabytes na memória para descobrir depois
 * que não cabem — e deixam o botão dizer o teto antes de o seletor abrir.
 */
const TETO_DO_RETRATO = 10 * 1024 * 1024;
const TETO_DA_FAIXA = 10 * 1024 * 1024;

const CAMPOS = [
  ['displayName', 'NOME EXIBIDO'],
  ['pronouns', 'PRONOMES'],
  ['status', 'STATUS'],
  ['bio', 'SOBRE MIM'],
  ['accent', 'COR (#RRGGBB)'],
];

const EFEITOS = [
  { valor: 'none', dentro: 'NENHUM' },
  { valor: 'aurora', dentro: 'AURORA' },
  { valor: 'sparkle', dentro: 'BRILHO' },
  { valor: 'pulse', dentro: 'PULSO' },
];

/** Quanto cabe num fragmento deste servidor. Ele recusa acima disso. */
const FRAGMENTO = 6000;

/** O último retrato da rede, e o que está sendo editado por cima dele. */
let ultimo = null;
/**
 * O que está sendo editado, **por entidade**.
 *
 * `{ [servidor + pessoa]: perfil }`, e não uma variável só. A diferença
 * aparece no conserto de U26: `FECHAR` apagava `rascunho` sem perguntar nada,
 * e quem tinha escrito uma biografia e fechado sem querer a perdia em silêncio.
 *
 * Amarrar o rascunho à entidade é o que permite às duas coisas conviverem:
 * fechar deixa de ser destrutivo (o que estava escrito continua lá ao reabrir)
 * e descartar continua existindo, explícito, para quem quis mesmo jogar fora.
 */
const rascunhos = new Map();
let aviso = '';
/** Se `FECHAR` foi apertado com alteração pendente e ainda espera decisão. */
let perguntandoDescarte = false;
/** De quem a ficha aberta é. Nulo quando ninguém abriu nenhuma. */
let aberto = null;

const meuPerfil = () => ultimo?.perfis?.[String(ultimo.me)] ?? {};

/**
 * A chave do rascunho: servidor e pessoa.
 *
 * O canal entra porque o servidor deste MOD guarda perfil por servidor, e o
 * MOD atravessa troca de canal sem recarregar. Um rascunho de perfil não deve
 * viajar de um destino para outro — foi um dos riscos que a auditoria mandou
 * reproduzir, e amarrá-lo aqui é o que o fecha.
 */
const chaveDoRascunho = () => String(ultimo?.canal ?? '-') + ':' + String(ultimo?.me ?? '-');

/** O rascunho desta entidade, ou nada quando ninguém editou. */
const meuRascunho = () => rascunhos.get(chaveDoRascunho()) ?? null;

const emEdicao = () => meuRascunho() ?? meuPerfil();

/** A ficha de outra pessoa: mostrada, e nunca editável. */
function fichaDeOutro(id) {
  const perfil = ultimo.perfis[id] ?? {};
  const pessoa = ultimo.pessoas.find(p => String(p.id) === id);
  const nome = pessoa?.nickname || pessoa?.apelido || 'Pessoa ' + id;
  const partes = [cabecalho(perfil.displayName || nome), texto(nome + ' · ID ' + id)];
  // **A imagem vem do servidor deste MOD**, e não de um endereço qualquer: a
  // janela de quem conversa não busca bytes na rede de um estranho.
  if (perfil.banner) {
    partes.push({
      forma: 'midia',
      chave: 'banner-' + id,
      doServidor: { canal: ultimo.canal, pedido: { op: 'asset', person: id, slot: 'banner' }, campo: 'image' },
      descricao: 'Faixa de ' + nome,
    });
  }
  if (perfil.avatar) {
    partes.push({
      forma: 'midia',
      chave: 'avatar-' + id,
      doServidor: { canal: ultimo.canal, pedido: { op: 'asset', person: id, slot: 'avatar' }, campo: 'image' },
      descricao: 'Retrato de ' + nome,
    });
  }
  for (const [chave, rotulo] of [['pronouns', 'Pronomes'], ['status', 'Status'], ['bio', 'Sobre mim']]) {
    if (perfil[chave]) partes.push(texto(rotulo + ': ' + perfil[chave]));
  }
  if (!ultimo.perfis[id]) partes.push(texto('Ainda sem perfil salvo.'));
  partes.push(botao('fechar', 'FECHAR'));
  return partes;
}

/** A minha ficha: campos, efeito, imagens e o que grava. */
function minhaFicha() {
  const perfil = emEdicao();
  const guardado = meuRascunho();
  const mudou = guardado !== null && JSON.stringify(guardado) !== JSON.stringify(meuPerfil());
  const partes = [cabecalho('MEU PERFIL')];
  const meu = String(ultimo.me);
  if (meuPerfil().banner) {
    partes.push({
      forma: 'midia',
      chave: 'meu-banner',
      doServidor: { canal: ultimo.canal, pedido: { op: 'asset', person: meu, slot: 'banner' }, campo: 'image' },
      descricao: 'Minha faixa',
    });
  }
  if (meuPerfil().avatar) {
    partes.push({
      forma: 'midia',
      chave: 'meu-avatar',
      doServidor: { canal: ultimo.canal, pedido: { op: 'asset', person: meu, slot: 'avatar' }, campo: 'image' },
      descricao: 'Meu retrato',
    });
  }
  partes.push(
    ...CAMPOS.map(([chave, rotulo]) => campo(chave, rotulo, perfil[chave] ?? '')),
    escolha('effect', 'EFEITO', perfil.effect ?? 'none', EFEITOS),
    linha([
      botao('gravar', mudou ? 'GRAVAR' : 'GRAVADO', !mudou),
      botao('descartar', 'DESCARTAR', !mudou),
      botao('fechar', 'FECHAR'),
    ]),
  );
  if (meuPerfil().avatar || meuPerfil().banner) {
    partes.push(linha([
      botao('tirar-avatar', 'TIRAR RETRATO', !meuPerfil().avatar),
      botao('tirar-banner', 'TIRAR FAIXA', !meuPerfil().banner),
    ]));
  }
  // **Escolher é ato de quem usa.** O botão abre o seletor do sistema; o que
  // volta é um identificador e o que o produto provou sobre os bytes.
  partes.push(linha([
    {
      forma: 'arquivo', chave: 'avatar', dentro: 'ENVIAR RETRATO',
      // **Para quê, de que tipo, até quanto.** O produto usa a finalidade como
      // título do diálogo do sistema, o tipo como filtro de extensões e o teto
      // para recusar antes de ler. A auditoria de 20/09/2026 abriu este mesmo
      // botão e leu «Escolha um arquivo para este MOD», com JSONs na lista.
      finalidade: 'Escolha o retrato do seu perfil neste servidor',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DO_RETRATO,
    },
    {
      forma: 'arquivo', chave: 'banner', dentro: 'ENVIAR FAIXA',
      finalidade: 'Escolha a faixa que aparece atrás do seu retrato',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DA_FAIXA,
    },
  ]));
  partes.push(texto(aviso || 'Revisão ' + (meuPerfil().revision ?? 0)));
  return partes;
}

/**
 * Manda ao servidor o arquivo que alguém escolheu, em fragmentos.
 *
 * Os bytes nunca estão inteiros aqui: o produto os entrega em pedaços, e cada
 * pedaço é recortado no tamanho que este servidor aceita. O primeiro fragmento
 * carrega o prefixo `data:` porque é isso que o servidor confere para saber que
 * recebeu uma imagem, e não um texto qualquer.
 */
async function enviarImagem(canal, slot, escolhido) {
  if (escolhido.papel !== 'imagem') throw new Error('Escolha uma imagem.');
  const prefixo = 'data:' + escolhido.tipo + ';base64,';
  // O tamanho anunciado é o da cadeia inteira, prefixo incluído: é o que o
  // servidor compara ao somar os fragmentos.
  const total = prefixo.length + Math.ceil(escolhido.bytes / 3) * 4;
  const inicio = await request(canal, { op: 'upload-start', slot, length: total });

  let sobra = prefixo;
  let lidos = 0;
  let indice = 0;
  let enviado = 0;
  for (;;) {
    if (sobra.length < FRAGMENTO && lidos < escolhido.bytes) {
      const pedaco = await SeeleUI.pedaco(escolhido.id, lidos);
      if (!pedaco) throw new Error('O arquivo acabou antes do esperado.');
      // Quatro caracteres por três bytes: é assim que se sabe quanto do
      // arquivo o pedaço cobriu, sem ter os bytes na mão.
      lidos += (pedaco.length / 4) * 3;
      sobra += pedaco;
      continue;
    }
    if (!sobra.length) break;
    // O último fragmento é o único que pode ser menor: o servidor recusa um
    // fragmento curto no meio, porque um curto no meio é um upload truncado.
    const parte = sobra.slice(0, FRAGMENTO);
    sobra = sobra.slice(parte.length);
    enviado += parte.length;
    if (parte.length < FRAGMENTO && enviado !== total) {
      throw new Error('O arquivo mudou no meio do envio.');
    }
    const resposta = await request(canal, {
      op: 'upload-part', slot, token: inicio.token, index: indice, part: parte,
    });
    indice += 1;
    if (resposta.finished) break;
  }
  // **Devolvido na hora.** Dez megabytes presos até a saída da sessão seriam
  // dez megabytes que ninguém mais vai ler.
  await SeeleUI.soltar(escolhido.id);
}

/**
 * O cartão que cada pessoa passa a ter **na lista do produto**.
 *
 * O retrato e o nome que alguém escolheu são sobre aquela pessoa; mostrá-los só
 * dentro deste painel é mostrá-los longe de onde significam alguma coisa.
 *
 * O que chega ao produto é **declaração**, na mesma gramática da região — e é o
 * renderer dele que monta, com a tipografia dele e o tamanho dele. Este MOD não
 * escolhe posição, não escolhe medida e não alcança nó nenhum. A gramática do
 * cartão é menor que a da região: nada que receba foco ou clique, porque a
 * linha do roster já tem um botão do produto.
 *
 * O que entra é o que a pessoa escreveu para ser visto: o retrato, o nome
 * exibido quando ele difere do apelido, o pronome e o status. Quem não escreveu
 * nada não ganha cartão — uma moldura vazia ao lado de um nome é o produto
 * anunciando uma ausência que ninguém pediu para anunciar.
 */
function cartoesDaLista() {
  const cartoes = {};
  for (const id of ultimo.ids) {
    const perfil = ultimo.perfis[id] ?? {};
    const pessoa = ultimo.pessoas.find(p => String(p.id) === id);
    const apelido = pessoa?.nickname || pessoa?.apelido || '';
    const partes = [];

    // O retrato vem do **servidor deste MOD**, e nunca de um endereço: é a
    // mesma origem da ficha, e o produto decide o tamanho.
    if (perfil.avatar) {
      partes.push({
        forma: 'midia',
        chave: 'retrato',
        descricao: 'retrato de ' + (apelido || 'quem está aqui'),
        doServidor: { canal: ultimo.canal, pedido: { op: 'asset', person: id, slot: 'avatar' }, campo: 'image' },
      });
    }

    // O nome exibido só entra quando **difere** do apelido: repeti-lo seria a
    // linha dizendo duas vezes a mesma coisa.
    const exibido = String(perfil.displayName ?? '').trim();
    if (exibido && exibido !== apelido) partes.push({ forma: 'titulo', chave: 'nome', dentro: exibido });

    const pronome = String(perfil.pronouns ?? '').trim();
    if (pronome) partes.push({ forma: 'texto', chave: 'pronome', dentro: pronome });

    const status = String(perfil.status ?? '').trim();
    if (status) partes.push({ forma: 'texto', chave: 'status', dentro: status });

    if (partes.length) cartoes[id] = partes;
  }
  return cartoes;
}

/** A lista: uma linha por pessoa, com o botão que abre a ficha dela. */
function aLista() {
  if (!ultimo) return [texto('Consultando os perfis deste servidor…')];
  if (!ultimo.ids.length) return [texto('Nenhuma pessoa disponível.')];
  const partes = [];
  for (const id of ultimo.ids) {
    const pessoa = ultimo.pessoas.find(p => String(p.id) === id);
    const nome = pessoa?.nickname || pessoa?.apelido || 'Pessoa ' + id;
    const perfil = ultimo.perfis[id] ?? {};
    const eu = id === String(ultimo.me);
    partes.push(linha([
      texto((perfil.displayName || nome) + (eu ? ' (eu)' : '') + ' · ID ' + id),
      botao('abrir-' + id, eu ? 'EDITAR' : 'VER'),
    ]));
  }
  return partes;
}

const desenhoDoEstado = () => {
  if (!ultimo) return [texto('Consultando os perfis deste servidor…')];
  if (aberto === String(ultimo.me)) return minhaFicha();
  if (aberto) return fichaDeOutro(aberto);
  return aLista();
};

async function gravar(canal) {
  const perfil = emEdicao();
  aviso = 'gravando…';
  const resposta = await request(canal, {
    op: 'save',
    revision: meuPerfil().revision ?? 0,
    profile: {
      displayName: perfil.displayName ?? '',
      pronouns: perfil.pronouns ?? '',
      bio: perfil.bio ?? '',
      status: perfil.status ?? '',
      accent: perfil.accent || '#f2521f',
      effect: perfil.effect || 'none',
    },
  });
  // **O que o servidor devolveu, e não o que foi mandado.** A revisão sobe a
  // cada gravação, e guardar o rascunho no lugar dela faria a gravação seguinte
  // ser recusada com «seu perfil mudou em outra janela» — que é verdade sobre a
  // revisão e mentira sobre o que aconteceu.
  ultimo.perfis[String(ultimo.me)] = resposta.profile ?? perfil;
  // Gravado é a única saída que apaga o rascunho sem perguntar: o que ele
  // guardava está no servidor agora.
  rascunhos.delete(chaveDoRascunho());
  perguntandoDescarte = false;
  aviso = 'gravado';
}

async function tirarImagem(canal, slot) {
  aviso = 'removendo…';
  const resposta = await request(canal, {
    op: 'clear-image',
    slot,
    revision: meuPerfil().revision ?? 0,
  });
  ultimo.perfis[String(ultimo.me)] = resposta.profile ?? meuPerfil();
  aviso = 'removida';
}

iniciar(
  async (snapshot, canal) => {
    const pessoas = snapshot.presentes || [];
    const ids = [...new Set(pessoas.map(p => String(p.id)))];
    if (snapshot.me != null && !ids.includes(String(snapshot.me))) ids.push(String(snapshot.me));
    const perfis = {};
    let me = snapshot.me;
    for (let i = 0; i < ids.length; i += 32) {
      if (i) await new Promise(resolve => setTimeout(resolve, 150));
      const resposta = await request(canal, { op: 'view', people: ids.slice(i, i + 32) });
      Object.assign(perfis, resposta.profiles);
      me = resposta.me ?? me;
    }
    ultimo = { ids, pessoas, perfis, me, canal };
    // A recusa de um cartão não pode derrubar o painel: ele continua servindo
    // mesmo quando a lista do produto não recebe nada.
    try { await SeeleUI.cartoes(cartoesDaLista()); }
    catch (erro) { console.warn('PERFIS: a lista recusou os cartões: ' + (erro.message || erro)); }
    return desenhoDoEstado();
  },
  async () => {
    ultimo = null;
    aberto = null;
    // Fora de canal não há perfil de ninguém, e um cartão de antes seria uma
    // afirmação sobre gente que este MOD não está mais vendo.
    try { await SeeleUI.cartoes({}); } catch { /* a sessão pode já ter saído */ }
  },
  (evento, canal, repintar) => {
    if (!ultimo) return null;
    if (evento.nome === 'arquivo') {
      // **Cancelar e falhar deixaram de ser a mesma resposta.** Os dois
      // chegavam como `arquivo: null`; agora `resultado` os separa, e o
      // cancelamento volta a ser o que a auditoria pediu — neutro e sem drama.
      if (!evento.arquivo) {
        aviso = evento.resultado === 'falhou'
          ? (evento.porque || 'não foi possível abrir o seletor')
          : '';
        repintar(desenhoDoEstado());
        return null;
      }
      if (canal === null) return null;
      aviso = 'enviando…';
      repintar(desenhoDoEstado());
      return enviarImagem(canal, evento.chave, evento.arquivo).then(
        async () => {
          const visto = await request(canal, { op: 'view', people: [String(ultimo.me)] });
          Object.assign(ultimo.perfis, visto.profiles);
          aviso = 'enviada';
          repintar(desenhoDoEstado());
        },
        erro => { aviso = erro.message || String(erro); repintar(desenhoDoEstado()); },
      );
    }
    if (evento.nome === 'campo' || evento.nome === 'escolha') {
      const editado = { ...(meuRascunho() ?? meuPerfil()) };
      editado[evento.chave] = evento.valor;
      rascunhos.set(chaveDoRascunho(), editado);
      perguntandoDescarte = false;
      aviso = '';
      repintar(desenhoDoEstado());
      return null;
    }
    if (evento.nome !== 'botao') return null;
    if (evento.chave.startsWith('abrir-')) {
      aberto = evento.chave.slice('abrir-'.length);
      aviso = '';
      repintar(desenhoDoEstado());
      return null;
    }
    // ---- fechar, e o que ele não pode fazer em silêncio (U26) ----
    //
    // `FECHAR` apagava o rascunho. Quem escrevesse a biografia e fechasse a
    // ficha — de propósito ou sem querer — perdia o que tinha escrito sem
    // nenhum aviso. Agora fechar **guarda**: o rascunho pertence à entidade e
    // continua lá na próxima abertura.
    //
    // O aviso só aparece quando há perda possível, que é a regra que a
    // auditoria pediu: «cancelar/descartar explícitos e aviso apenas quando
    // houver perda».
    if (evento.chave === 'fechar') {
      const guardado = meuRascunho();
      const mudou = guardado !== null
        && JSON.stringify(guardado) !== JSON.stringify(meuPerfil());
      aberto = null;
      aviso = mudou
        ? 'Fechado com alterações não gravadas. Elas continuam aqui ao reabrir.'
        : '';
      perguntandoDescarte = false;
      repintar(desenhoDoEstado());
      return null;
    }
    // **Descartar é explícito, e confirma.** Ele é a única porta que joga fora
    // o que foi escrito, então ele pergunta uma vez antes de fazê-lo.
    if (evento.chave === 'descartar') {
      if (!perguntandoDescarte) {
        perguntandoDescarte = true;
        aviso = 'Descartar apaga o que você escreveu e não gravou. Aperte DESCARTAR de novo para confirmar.';
        repintar(desenhoDoEstado());
        return null;
      }
      rascunhos.delete(chaveDoRascunho());
      perguntandoDescarte = false;
      aviso = 'Alterações descartadas.';
      repintar(desenhoDoEstado());
      return null;
    }
    if (canal === null) return null;
    const feito = evento.chave === 'gravar' ? gravar(canal)
      : evento.chave === 'tirar-avatar' ? tirarImagem(canal, 'avatar')
        : evento.chave === 'tirar-banner' ? tirarImagem(canal, 'banner')
          : null;
    // A recusa do servidor — permissão, limite, revisão trocada — vira a linha
    // de aviso desta ficha, e não um erro que ninguém lê.
    return feito?.then(
      () => repintar(desenhoDoEstado()),
      erro => { aviso = erro.message || String(erro); repintar(desenhoDoEstado()); },
    ) ?? null;
  },
);

})();
