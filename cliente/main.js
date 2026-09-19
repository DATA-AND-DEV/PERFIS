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

  const desenhar = async partes => {
    // Uma pintura de cada vez: dois `regiao` em voo chegariam fora de ordem, e
    // o desenho de trás apagaria o da frente.
    if (pintando) return;
    pintando = true;
    try {
      await ui.regiao([cabecalho(titulo), ...partes]);
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
// O que continua fora está na emenda de 19/09 do ADR 0049: **escolher um
// arquivo do disco** é um caminho que nenhum cliente do SEELE abre por conta de
// terceiro. As imagens já enviadas aparecem e podem ser removidas; enviar uma
// nova espera o seletor ser do produto. Está escrito lá, com a razão.

const { texto, cabecalho, campo, escolha, botao, linha, request, iniciar } =
  interfaceMod('seele/perfis', 'PERFIS');

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

/** O último retrato da rede, e o que está sendo editado por cima dele. */
let ultimo = null;
let rascunho = null;
let aviso = '';
/** De quem a ficha aberta é. Nulo quando ninguém abriu nenhuma. */
let aberto = null;

const meuPerfil = () => ultimo?.perfis?.[String(ultimo.me)] ?? {};
const emEdicao = () => rascunho ?? meuPerfil();

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
  const mudou = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(meuPerfil());
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
  partes.push(texto(aviso || 'Revisão ' + (meuPerfil().revision ?? 0)));
  return partes;
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
  rascunho = null;
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
    return desenhoDoEstado();
  },
  async () => { ultimo = null; aberto = null; },
  (evento, canal, repintar) => {
    if (!ultimo) return null;
    if (evento.nome === 'campo' || evento.nome === 'escolha') {
      rascunho = { ...(rascunho ?? meuPerfil()) };
      rascunho[evento.chave] = evento.valor;
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
    if (evento.chave === 'fechar') {
      aberto = null; rascunho = null; aviso = '';
      repintar(desenhoDoEstado());
      return null;
    }
    if (evento.chave === 'descartar') {
      rascunho = null; aviso = '';
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
