// O PERFIS: quem está aqui, e a ficha de cada um — **editável e desenhada**.
//
// # O que esta versão conserta
//
// A auditoria de 20/09/2026 disse duas coisas sobre este MOD, e as duas eram
// sobre apresentação e não sobre dados:
//
// - **U19/U27.** «`ferramentas/perfis.js` lê e grava `accent` e `effect`, mas
//   não os usa na árvore visual. O renderer do produto acrescenta esse conteúdo
//   à linha existente; não substitui a identidade visual e não recebe clique de
//   dentro do cartão.» A versão `ce976fd` tinha faixa, retrato sobreposto, cor,
//   animação e cartão clicável — e a migração para a API 3 trocou tudo isso por
//   uma linha de texto embaixo do apelido do servidor.
// - **U20.** «Editar PERFIS não abre modal: troca a lista por formulário longo;
//   "Sobre mim" é input de uma linha.»
//
// Nenhum dos dois era uma escolha deste pacote. A API 3 não tinha como declarar
// uma caixa dentro de outra, nem uma cor, nem uma superfície. A API 4 tem, e é
// isso que esta versão usa.
//
// **Não se restauram os seletores DOM antigos.** O que volta é a capacidade e o
// resultado para a pessoa, por uma API explícita: `pessoa.cartao` substitui a
// apresentação, `pessoa.detalhes` abre o perfil inteiro, e a identidade
// verificável continua nos detalhes nativos do produto, que recolhem em vez de
// sumir.

const {
  texto, campo, botao, escolha,
  caixa, pilha, grade, separador, espaco,
  formulario, acoes, textoLongo, cor, retrato, arquivo,
  request, iniciar, lerRetrato, folha, atualizar,
  pagina, dialogo, contribuir, revogar, entrada, avisar, agruparAtualizacoes, anotar,
} = interfaceMod('seele/perfis', 'PERFIS');

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

/**
 * **O perfil é do servidor, e todo pedido do PERFIS vai sem canal.** O `0`
 * quer dizer «nenhum canal» no fio, e a metade de servidor recebe
 * `channel: null`. Antes, os pedidos iam pelo canal aberto, e num servidor só
 * de voz o PERFIS não tinha por onde perguntar nada.
 */
const ESCOPO_DE_SERVIDOR = 0;


const EFEITOS = [
  { valor: 'none', dentro: 'NENHUM' },
  { valor: 'aurora', dentro: 'AURORA' },
  { valor: 'sparkle', dentro: 'BRILHO' },
  { valor: 'pulse', dentro: 'PULSO' },
];

/**
 * O efeito escolhido, virado na animação que a API do produto conhece.
 *
 * **Três nomes deste MOD, quatro presets do produto**, e o mapa é explícito
 * porque os dois vocabulários não têm por que coincidir: `sparkle` é o nome que
 * este perfil usa desde a versão que a auditoria chamou de melhor, e `brilho` é
 * o que o validador de estilo aceita. Um mapa aqui é mais honesto que renomear
 * o que as pessoas já escolheram.
 */
const ANIMACAO_DO_EFEITO = {
  none: 'nenhuma',
  aurora: 'aurora',
  sparkle: 'brilho',
  pulse: 'pulso',
};

/**
 * **O efeito, como a moldura animada do retrato.**
 *
 * A `aurora` do produto anima `background-position` com `background-size:
 * 220%` (`mods-superficies.css`): posta no retrato, ela ampliaria a foto. Por
 * isso o efeito vai numa moldura com gradiente na cor da pessoa, atrás do
 * retrato. As animações do produto param sob movimento reduzido.
 */
function molduraDoEfeito(perfil, conteudo) {
  const animacao = ANIMACAO_DO_EFEITO[perfil?.effect] ?? 'nenhuma';
  if (animacao === 'nenhuma') return conteudo;
  const acento = acentoDe(perfil);
  return caixa([conteudo], {
    preenchimento: 2, encolher: 0,
    // A forma de `gradienteDeMod` no produto: paradas com `cor` e `em` (0 a
    // 100), ângulo de 0 a 360.
    gradiente: { angulo: 135, paradas: [{ cor: acento, em: 0 }, { cor: '#0a0806', em: 50 }, { cor: acento, em: 100 }] },
    animacao,
  });
}

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
let enviandoImagem = false;
/** Se `DESCARTAR` foi apertado e ainda espera a confirmação. */
let perguntandoDescarte = false;
/** De quem é a ficha aberta no diálogo de detalhes. */
let aberto = null;
/** Os punhos das superfícies de pé, para montar de novo sem recriar. */
const telas = { diretorio: null, detalhes: null, editor: null };
/** O handle da entrada «Perfis» na navegação, pela mesma razão. */
let entradaRegistrada = null;
/** Se um GRAVAR está no servidor: o segundo, antes de o primeiro voltar, é ignorado. */
let gravando = false;

const meuPerfil = () => ultimo?.perfis?.[String(ultimo.me)] ?? {};

/**
 * A chave do rascunho: a pessoa, **neste servidor**.
 *
 * O servidor deste MOD guarda perfil por servidor, e um rascunho não deve
 * viajar de um destino para outro — foi um dos riscos que a auditoria mandou
 * reproduzir. Quem fecha isso é o produto: a instância do MOD vive dentro de
 * uma sessão, e sair do servidor encerra todas. O canal ficava fora disso e
 * dentro da chave: uma troca de canal no mesmo servidor, com o editor aberto,
 * remontava o editor com outra chave e o texto sumia da tela.
 */
const chaveDoRascunho = () => String(ultimo?.me ?? '-');

/** O rascunho desta entidade, ou nada quando ninguém editou. */
const meuRascunho = () => rascunhos.get(chaveDoRascunho()) ?? null;

const emEdicao = () => {
  const gravado = meuPerfil(), rascunho = meuRascunho();
  // Imagens são gravadas ao enviar; o rascunho conserva apenas a edição de
  // texto/aparência e nunca esconde uma foto já enviada ou já removida.
  return rascunho ? { ...rascunho, avatar: gravado.avatar, banner: gravado.banner, revision: gravado.revision } : gravado;
};

const mudouOPerfil = () => {
  const guardado = meuRascunho();
  return guardado !== null && JSON.stringify(emEdicao()) !== JSON.stringify(meuPerfil());
};

/** O apelido do servidor, que é a identidade que o produto conhece. */
const apelidoDe = id => {
  const pessoa = ultimo?.pessoas?.find(p => String(p.id) === String(id));
  return pessoa?.apelido || 'Pessoa ' + id;
};

/** A cor escolhida, ou a do produto quando ninguém escolheu. */
const acentoDe = perfil => {
  const escolhida = String(perfil?.accent ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(escolhida) ? escolhida : '#f2521f';
};

/** A inicial que o retrato mostra enquanto não há imagem — ou nunca há. */
const inicialDe = (perfil, id) =>
  (String(perfil?.displayName ?? '').trim() || apelidoDe(id)).charAt(0);

/** De onde o produto busca os bytes de uma imagem deste perfil. */
const imagemDoServidor = (id, slot) => ({
  canal: ESCOPO_DE_SERVIDOR,
  pedido: { op: 'asset', person: String(id), slot, path: ultimo.perfis[String(id)]?.[slot] ?? null, ...(ultimo.perfis[String(id)]?.[slot]?.startsWith('volume:') ? { transporte: 'volume' } : {}) },
  campo: 'image',
});

// ------------------------------------------------ a apresentação da pessoa

/** Linha da lista: capa ao fundo, foto quadrada e nome; o clique abre o perfil. */
function cartaoDaPessoa(id, { citar = false } = {}) {
  const perfil = ultimo.perfis[id] ?? {};
  const nome = String(perfil.displayName ?? '').trim() || apelidoDe(id);
  const acento = acentoDe(perfil);
  if (!perfil.displayName && !perfil.pronouns && !perfil.status && !perfil.avatar && !perfil.banner) return null;
  // **Citar só no cartão da lista.** Ali o destino é a pessoa, e `daPessoa`
  // usa a capa e a foto que as contribuições dela já carregaram, sem pedido
  // novo. Numa superfície (a prévia do editor) não há pessoa no destino, e a
  // citação ficaria sem imagem: lá vai o pedido ao servidor.
  const imagem = slot => (citar ? { daPessoa: slot === 'banner' ? 'capa' : 'avatar' } : { doServidor: imagemDoServidor(id, slot) });
  return [{
    forma: 'caixa', chave: 'pessoa-compacta',
    ...(perfil.banner ? { fundoDeMidia: imagem('banner') } : {}),
    estilo: { largura: 'total', altura: 44, preenchimento: 6, direcao: 'linha', alinhar: 'centro', intervalo: 10,
      fundo: '#0a0806', borda: { largura: 1, cor: '#3a322a' }, recortar: 'cortar', margem: 0 },
    dentro: [
      molduraDoEfeito(perfil, retrato('foto', { inicial: inicialDe(perfil, id), formato: 'quadrado', descricao: 'Foto de ' + nome,
        ...(perfil.avatar ? imagem('avatar') : {}),
        estilo: { largura: 30, altura: 30, encolher: 0, borda: { largura: 1, cor: acento } } })),
      caixa([nome], { corpo: 14, peso: 'forte', cor: '#eae3cf', linhasMaximas: 1, crescer: 1, larguraMinima: 0 }),
    ],
  }];
}

/** O cartão de cada pessoa na lista: `{ handle, assinatura }`, por id. */
const cartoesRegistrados = new Map();
/** Quantas ficaram de fora da última vez, para dizer só quando muda. */
let cartoesDeFora = 0;

/**
 * Os cartões da lista, **um por pessoa**: `pessoa.cartao` com `alvo`.
 *
 * Na 3.x o conjunto inteiro ia numa mensagem só, com teto de 12.288 bytes, e a
 * lista congelava a partir de umas 14 pessoas com foto e faixa. Aqui cada
 * pessoa é uma contribuição, numa mensagem própria, fora do teto agregado.
 * Quem já tem cartão é **atualizado**, e nunca registrado de novo (o produto
 * recusa a segunda com «use atualizar»). No teto de alvos do ponto, o próprio
 * cartão vem primeiro, e quem não coube fica com a apresentação do SEELE.
 */
const publicarCartoesDaLista = agruparAtualizacoes(async () => {
  if (!ultimo) return;
  const meu = String(ultimo.me);
  const ordem = ultimo.ids.includes(meu) ? [meu, ...ultimo.ids.filter(id => id !== meu)] : [...ultimo.ids];
  const vivos = new Set();
  let fora = 0, cheio = false, teto = null;
  for (const id of ordem) {
    const conteudo = cartaoDaPessoa(id, { citar: true });
    if (!conteudo) continue;
    vivos.add(id);
    const assinatura = JSON.stringify(conteudo);
    const anterior = cartoesRegistrados.get(id);
    if (anterior) {
      if (anterior.assinatura === assinatura) continue;
      if (await atualizar(anterior.handle, conteudo) !== false) { anterior.assinatura = assinatura; continue; }
      cartoesRegistrados.delete(id);
    }
    if (cheio) { fora += 1; vivos.delete(id); continue; }
    try {
      const { handle } = await contribuir({
        ponto: 'pessoa.cartao', modo: 'substituir', alvo: id, prioridade: 10,
        // O clique abre o perfil. O produto monta o alvo e liga o `id` real;
        // este MOD só diz **o que fazer** e recebe o `id` de volta no evento.
        acaoPrincipal: 'abrir-perfil', nomeAcessivel: 'perfil', conteudo,
      });
      cartoesRegistrados.set(id, { handle, assinatura });
    } catch (erro) {
      if (erro?.erro !== 'teto-de-alvos') throw erro;
      cheio = true; teto = erro.teto ?? null; fora += 1; vivos.delete(id);
    }
  }
  for (const [id, anterior] of cartoesRegistrados) {
    if (vivos.has(id)) continue;
    await revogar(anterior.handle);
    cartoesRegistrados.delete(id);
  }
  if (fora !== cartoesDeFora) {
    cartoesDeFora = fora;
    if (fora) {
      anotar('warn', 'PERFIS: ' + fora + ' pessoa(s) ficaram com a apresentação do SEELE na lista: o SEELE aceita '
        + (teto ? 'até ' + teto + ' pessoas' : 'um número limitado de pessoas') + ' em «pessoa.cartao».');
    }
  }
});

// ------------------------------------------------------- as superfícies

/** O cartão de uma pessoa no diretório. A raiz guarda a chave do marcador. */
function cartaoDoDiretorio(id) {
  const perfil = ultimo.perfis[id] ?? {};
  const eu = id === String(ultimo.me);
  return caixa([
    caixa([
      molduraDoEfeito(perfil, retrato('r-' + id, {
        inicial: inicialDe(perfil, id),
        formato: 'quadrado',
        descricao: 'foto de ' + apelidoDe(id),
        ...(perfil.avatar ? { doServidor: imagemDoServidor(id, 'avatar') } : {}),
        estilo: { borda: { largura: 2, cor: acentoDe(perfil) }, largura: 44, altura: 44 },
      })),
      pilha([
        caixa([String(perfil.displayName ?? '').trim() || apelidoDe(id)],
          { peso: 'forte', cor: acentoDe(perfil) }),
        caixa([apelidoDe(id) + (eu ? ' · você' : '')], { corpo: 11, opacidade: 0.7 }),
      ], { intervalo: 2, crescer: 1 }),
    ], { direcao: 'linha', alinhar: 'centro', intervalo: 10 }),
    String(perfil.status ?? '').trim()
      ? caixa([String(perfil.status).trim()], { corpo: 12, linhasMaximas: 2, alturaMinima: 36, crescer: 1 })
      : caixa([], { alturaMinima: 36, crescer: 1 }),
    acoes([
      botao('abrir-' + id, eu ? 'EDITAR MEU PERFIL' : 'VER PERFIL',
        false, { variante: eu ? 'primaria' : 'secundaria' }),
    ]),
  ], {
    direcao: 'coluna', intervalo: 12,
    preenchimento: 16,
    borda: { largura: 1, cor: '#3a322a' },
    raio: 0,
  }, { chave: 'dir-' + id });
}

/** Quantas pessoas cada bloco do diretório leva: uma grade por mensagem. */
const PESSOAS_POR_BLOCO = 24;

/** As pessoas do diretório, em blocos de `PESSOAS_POR_BLOCO`, na ordem da lista. */
function blocosDoDiretorio() {
  const blocos = [];
  for (let i = 0; i < ultimo.ids.length; i += PESSOAS_POR_BLOCO) blocos.push(ultimo.ids.slice(i, i + PESSOAS_POR_BLOCO));
  return blocos;
}

/**
 * O diretório: **o esqueleto**, com um marcador por bloco.
 *
 * Na 3.x ele tinha páginas de dez só porque a declaração inteira não cabia
 * numa mensagem de 12 KiB. Agora o esqueleto vai numa montagem, cada bloco num
 * `superficie.atualizar` (a grade com o marcador de cada pessoa, `dir-<id>`), e
 * cada cartão no seu. Um marcador por pessoa no esqueleto passava de 12 KiB
 * com umas 200 pessoas; por bloco, ele tem o mesmo tamanho com 10 ou com 250.
 */
function oDiretorio() {
  if (!ultimo) return [texto('Consultando os perfis deste servidor…')];
  if (!ultimo.ids.length) return [texto('Nenhuma pessoa disponível.')];
  return [
    caixa(['Cada pessoa aqui escolheu como aparecer neste servidor.'],
      { opacidade: 0.75, corpo: 11 }),
    // A contagem total é o que alguém procura para saber se falta gente.
    caixa([ultimo.ids.length + ' pessoa(s) neste servidor'], { corpo: 11, opacidade: 0.7 }),
    pilha(blocosDoDiretorio().map((_, k) => caixa([], null, { chave: 'dir-bloco-' + k })), { intervalo: 12 }),
  ];
}

/**
 * Um bloco: a grade com o marcador de cada pessoa. Duas colunas em janela
 * larga, uma quando o contêiner aperta; a consulta é **do contêiner** e não da
 * janela — ver `classes` abaixo. A chave fica na grade, para o bloco ser
 * trocado de novo.
 */
const oBloco = (ids, k) => grade(ids.map(id => caixa([], null, { chave: 'dir-' + id })),
  { colunas: 2, intervalo: 12 }, { classe: 'diretorio', chave: 'dir-bloco-' + k });

/** O que o diretório aberto tem montado: o esqueleto, cada bloco e cada cartão. */
const diretorioMontado = { esqueleto: null, blocos: new Map(), cartoes: new Map() };

/**
 * Monta o diretório por partes: o esqueleto só quando ele muda (quem entrou,
 * quem saiu), os blocos cujas pessoas mudaram, e só os cartões que mudaram.
 */
async function montarDiretorio() {
  const tela = telas.diretorio;
  if (!tela) return;
  const esqueleto = oDiretorio();
  const assinatura = JSON.stringify(esqueleto);
  if (assinatura !== diretorioMontado.esqueleto) {
    await tela.montar(esqueleto);
    diretorioMontado.esqueleto = assinatura;
    diretorioMontado.blocos.clear();
    diretorioMontado.cartoes.clear();
  }
  if (!ultimo?.ids.length) return;
  for (const [k, ids] of blocosDoDiretorio().entries()) {
    const doBloco = ids.join(',');
    if (diretorioMontado.blocos.get(k) === doBloco) continue;
    await tela.atualizar('dir-bloco-' + k, oBloco(ids, k));
    diretorioMontado.blocos.set(k, doBloco);
    for (const id of ids) diretorioMontado.cartoes.delete(id);
  }
  for (const id of ultimo.ids) {
    const cartao = cartaoDoDiretorio(id);
    const doCartao = JSON.stringify(cartao);
    if (diretorioMontado.cartoes.get(id) === doCartao) continue;
    await tela.atualizar('dir-' + id, cartao);
    diretorioMontado.cartoes.set(id, doCartao);
  }
}

/** As classes do diretório: o que muda quando a superfície é estreita. */
const CLASSES_DO_DIRETORIO = {
  diretorio: {
    base: {},
    consultas: [{ ateLargura: 520, estilo: { colunas: 1 } }],
  },
};

/** O perfil de uma pessoa, inteiro, para o diálogo de detalhes. */
function osDetalhes(id) {
  const perfil = ultimo.perfis[id] ?? {};
  const acento = acentoDe(perfil);
  const apelido = apelidoDe(id);
  const exibido = String(perfil.displayName ?? '').trim();
  const partes = [];

  // **A capa e a foto, citadas com o id da pessoa.** A imagem é a que a
  // contribuição dela já carregou, sem pedido novo nem bytes a mais no bolso
  // desta superfície; a troca de foto ou de capa chega aqui sozinha, e com o
  // movimento reduzido a capa é o quadro parado. Quem não está na sessão fica
  // com o fundo liso e a inicial.
  if (perfil.banner) {
    partes.push(caixa([], { altura: 120, largura: 'total', raio: 0 },
      { chave: 'd-capa', fundoDeMidia: { daPessoa: 'capa', pessoa: id } }));
  }

  partes.push(caixa([
    molduraDoEfeito(perfil, retrato('d-retrato', {
      inicial: inicialDe(perfil, id),
      formato: 'quadrado',
      descricao: 'foto de ' + apelido,
      ...(perfil.avatar ? { daPessoa: 'avatar', pessoa: id } : {}),
      estilo: { largura: 72, altura: 72, borda: { largura: 3, cor: acento } },
    })),
    pilha([
      caixa([exibido || apelido], { corpo: 20, peso: 'forte', cor: acento }),
      // **A identidade que o servidor conhece fica visível.** Um nome exibido
      // pode ser qualquer coisa; o apelido é o que o produto usa para moderar,
      // e esconder essa diferença é o que tornaria a apresentação enganosa.
      caixa(['neste servidor: ' + apelido + ' · ID ' + id], { corpo: 11, opacidade: 0.7 }),
      ...(String(perfil.pronouns ?? '').trim()
        ? [caixa([String(perfil.pronouns).trim()], { corpo: 12, opacidade: 0.85 })]
        : []),
    ], { intervalo: 3, crescer: 1 }),
  ], {
    direcao: 'linha',
    alinhar: 'fim',
    intervalo: 12,
    ...(perfil.banner ? { mover: { x: 8, y: -36 } } : {}),
  }));

  if (String(perfil.status ?? '').trim()) {
    partes.push(caixa([String(perfil.status).trim()],
      { borda: { largura: 1, cor: acento }, cor: acento }));
  }

  const bio = String(perfil.bio ?? '').trim();
  if (bio) {
    partes.push(separador());
    partes.push(caixa([bio], { entrelinha: 1.6, alturaMaxima: 320, recortar: 'rolar' }));
  } else if (!ultimo.perfis[id]) {
    partes.push(caixa(['Ainda sem perfil salvo.'], { opacidade: 0.7 }));
  }

  return partes;
}

/**
 * O editor: formulário e prévia lado a lado.
 *
 * U20 pediu exatamente esta forma — «editor em modal, biografia multilinha e
 * prévia» — e o §2 do plano a detalha: «prévia lado a lado em janela larga,
 * empilhados em janela estreita». O empilhamento é uma consulta de contêiner,
 * e não de janela: o diálogo tem largura própria, e é ela que decide.
 */
/**
 * Um título de grupo dentro de uma superfície.
 *
 * O terceiro e último nível de tipo desta tela. Acima dele está a cartela do
 * título da janela, que o produto monta; abaixo, o rótulo de campo, que o
 * produto desenha em mono apagado. Tudo o que não for uma destas três coisas
 * não é título de nada — e era esse o defeito da versão anterior, em que cada
 * campo carregava um rótulo do mesmo peso e a tela inteira lia como uma lista
 * de coisas iguais.
 */
function grupo(nome) {
  return caixa([nome], {
    familia: 'sans',
    peso: 'forte',
    corpo: 13,
    espacamento: 1,
    transformar: 'maiuscula',
    cor: '#908574',
  });
}

/**
 * O editor: **o cartão em tamanho real, e os controles servindo ele.**
 *
 * # Por que a prévia subiu
 *
 * A composição anterior punha o formulário à esquerda e a prévia à direita, e
 * a coluna da direita ficava 60% vazia — o cartão tem 90px de altura e o
 * formulário tem 700. O que se está editando aparecia como um detalhe ao lado
 * da ferramenta de editar.
 *
 * Aqui ele abre a janela, com a largura inteira, do tamanho em que vai
 * aparecer na lista. Quem digita o nome vê o nome mudar no lugar para onde já
 * está olhando, e a coluna vazia deixa de existir porque não há mais duas
 * colunas de alturas diferentes.
 *
 * # Por que dois grupos, e não seis campos
 *
 * «Identidade» e «imagens» são decisões de naturezas diferentes: uma é texto
 * que se digita, a outra é arquivo que se escolhe e que pode falhar no envio.
 * Separá-las é hierarquia de comando — `specs/07` — e não arrumação.
 */
/**
 * A prévia do editor, num nó com chave: a cada tecla ela é trocada sozinha
 * (`superficie.atualizar`), sem remontar o editor.
 */
function previaDoEditor() {
  const perfil = emEdicao();
  const mudou = mudouOPerfil();
  const acento = acentoDe(perfil);
  const cartao = cartaoDaPreviaComRascunho(String(ultimo.me));
  // **A prévia, em tamanho real.** Sem moldura extra em volta: o cartão já tem
  // a dele, e uma segunda borda a 10px da primeira é a moldura de uma moldura.
  // O que diz que aquilo é uma prévia é a linha acima dela, não um quadro.
  return pilha([
    caixa([
      grupo('Seu cartão na lista de pessoas'),
      caixa([mudou ? 'ainda não gravado' : 'como está gravado'], {
        corpo: 11,
        cor: mudou ? acento : '#908574',
      }),
    ], { direcao: 'linha', alinhar: 'fim', distribuir: 'entre', intervalo: 12, quebra: 'sim' }),
    caixa(cartao ?? [caixa([
      'Escreva um nome, escolha uma cor, e o cartão aparece aqui.',
    ], {
      preenchimento: 20,
      alinhamento: 'centro',
      cor: '#908574',
      borda: { largura: 1, estilo: 'tracejada', cor: '#3a322a' },
      largura: 'total',
    })], { largura: 'total', larguraMaxima: 288 }),
  ], { intervalo: 10 }, { chave: 'previa' });
}

/** O aviso e o DESCARTAR, num nó com chave, pela mesma razão da prévia. */
function rodapeDoEditor() {
  const mudou = mudouOPerfil();
  return pilha([
    ...(aviso ? [caixa([aviso], { corpo: 12, cor: acentoDe(emEdicao()) })] : []),
    acoes([
      botao('descartar', perguntandoDescarte ? 'CONFIRMAR DESCARTE' : 'DESCARTAR',
        !mudou, { variante: perguntandoDescarte ? 'perigo' : 'discreta' }),
    ]),
  ], { intervalo: 8 }, { chave: 'rodape' });
}

/**
 * O editor: **o cartão em tamanho real, e os controles servindo ele.**
 *
 * É um formulário declarado: o produto valida o tamanho de cada campo, monta
 * GRAVAR (o primário, que manda todos os valores juntos no `submeter`) e FECHAR
 * (a saída dele), e deriva o `sujo` do valor contra o `inicial`. Com um
 * rascunho guardado, o valor é o rascunho e o inicial é o gravado: o editor
 * reabre sujo, e voltar ao gravado o limpa.
 *
 * «Identidade» e «aparência» são decisões de naturezas diferentes: uma é texto
 * que se digita, a outra é arquivo que se escolhe e que pode falhar no envio.
 */
function oEditor() {
  const perfil = emEdicao();
  const gravado = meuPerfil();
  const acento = acentoDe(perfil);
  const doTexto = chave => ({ tamanhoMaximo: LIMITES_DE_TEXTO[chave], inicial: String(gravado[chave] ?? '') });

  const identidade = pilha([
    grupo('Identidade'),
    campo('displayName', 'NOME EXIBIDO', perfil.displayName ?? '', doTexto('displayName')),
    // Pronome e status dividem a linha: são dois campos curtos, e um deles
    // sozinho numa linha de 900px é uma linha dizendo que sobrou espaço.
    caixa([
      caixa([campo('pronouns', 'PRONOMES', perfil.pronouns ?? '', doTexto('pronouns'))],
        { crescer: 1, base: 0, larguraMinima: 160 }),
      caixa([campo('status', 'STATUS', perfil.status ?? '', doTexto('status'))],
        { crescer: 1, base: 0, larguraMinima: 160 }),
    ], { direcao: 'linha', intervalo: 16, quebra: 'sim' }),
    textoLongo('bio', 'SOBRE MIM', perfil.bio ?? '', {
      ...doTexto('bio'),
      linhas: 4,
      sugestao: 'O que você quer que as pessoas deste servidor saibam.',
    }),
  ]);

  // **Sem envio de imagem neste aparelho, sem seletor.** A ponte do web app
  // pode não ter o volume, e o `SeeleUI.enviar` falta dela: mostrar o
  // seletor seria recusar a foto depois de a pessoa escolhê-la.
  const imagens = typeof SeeleUI.enviar === 'function' ? [
    arquivo('avatar', 'FOTO', {
      desligado: enviandoImagem,
      // **Para quê, de que tipo, até quanto.** O produto usa a finalidade
      // como título do diálogo do sistema, o tipo como filtro de extensões e
      // o teto para recusar antes de ler.
      finalidade: 'Escolha a foto do seu perfil neste servidor',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DO_RETRATO,
    }),
    arquivo('banner', 'CAPA', {
      desligado: enviandoImagem,
      finalidade: 'Escolha a capa que aparece atrás da sua foto',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DA_FAIXA,
    }),
  ] : [caixa(['Neste aparelho, foto e capa se trocam pelo computador.'], { corpo: 12, cor: '#908574' })];

  const aparencia = pilha([
    grupo('Aparência'),
    // **Seletor e hexadecimal**: escolher uma cor num campo de texto é escolher
    // uma cor sem vê-la.
    cor('accent', 'COR', acento, { inicial: acentoDe(gravado) }),
    escolha('effect', 'EFEITO', perfil.effect ?? 'none', EFEITOS, { inicial: gravado.effect ?? 'none' }),
    ...imagens,
    ...(gravado.avatar || gravado.banner ? [caixa([
      botao('tirar-avatar', 'TIRAR FOTO', !gravado.avatar, { variante: 'discreta' }),
      botao('tirar-banner', 'TIRAR CAPA', !gravado.banner, { variante: 'discreta' }),
    ], { direcao: 'linha', intervalo: 12, quebra: 'sim' })] : []),
  ]);

  return [
    previaDoEditor(),
    separador(),
    formulario('perfil', [
      caixa([
        caixa([identidade], { crescer: 1.4, base: 0, larguraMinima: 280 }),
        caixa([aparencia], { crescer: 1, base: 0, larguraMinima: 220 }),
      ], { direcao: 'linha', intervalo: 32, quebra: 'sim', alinhar: 'inicio' }),
    ], { primario: 'GRAVAR', secundario: 'FECHAR' }),
    rodapeDoEditor(),
  ];
}

/** Troca a prévia e o rodapé do editor aberto, sem remontá-lo. */
const atualizarEditor = agruparAtualizacoes(async () => {
  if (!telas.editor || !ultimo) return;
  await telas.editor.atualizar('previa', previaDoEditor());
  await telas.editor.atualizar('rodape', rodapeDoEditor());
});

/** As classes do editor: empilhado quando o diálogo é estreito. */
const CLASSES_DO_EDITOR = {
  editor: {
    base: {},
    consultas: [{ ateLargura: 560, estilo: { direcao: 'coluna' } }],
  },
};

/** O cartão da prévia: o desenho de sempre, com o rascunho por cima. */
function cartaoDaPreviaComRascunho(id) {
  const gravado = ultimo.perfis[id];
  ultimo.perfis[id] = emEdicao();
  try {
    return cartaoDaPessoa(id);
  } finally {
    // Reposto sempre: a prévia é uma leitura, e deixá-la no lugar do gravado
    // faria a gravação seguinte comparar o rascunho consigo mesmo e concluir
    // que nada mudou.
    if (gravado === undefined) delete ultimo.perfis[id];
    else ultimo.perfis[id] = gravado;
  }
}

// -------------------------------------------------- abrir e fechar telas

async function abrirDiretorio() {
  if (!telas.diretorio) {
    telas.diretorio = await pagina('perfis-diretorio', 'Perfis deste servidor');
    diretorioMontado.esqueleto = null;
  }
  try {
    await telas.diretorio.classes(CLASSES_DO_DIRETORIO);
    await montarDiretorio();
  } catch (erro) {
    // **Uma página que não montou não fica de pé.** De pé, ela seria
    // remontada a cada aviso e a cada pessoa que entra, repetindo o mesmo
    // erro; abrir de novo tenta do começo.
    const tela = telas.diretorio;
    telas.diretorio = null;
    diretorioMontado.esqueleto = null;
    await tela?.descartar().catch(() => {});
    throw erro;
  }
  await telas.diretorio.mostrar();
}

async function abrirDetalhes(id) {
  aberto = String(id);
  // **Numa folha**, ao lado da conversa: ver um perfil não pede que a
  // conversa pare, e no celular a folha sobe da borda.
  telas.detalhes ??= await folha('perfis-detalhes', 'Perfil');
  await telas.detalhes.titulo('Perfil de ' + (ultimo.perfis[aberto]?.displayName?.trim() || apelidoDe(aberto)));
  await telas.detalhes.montar(osDetalhes(aberto));
  await telas.detalhes.mostrar();
}

async function abrirEditor() {
  telas.editor ??= await dialogo('perfis-editor', 'Editar meu perfil', {
    tamanho: { largura: 820 },
    focoInicial: 'displayName',
    // **Fechar o editor sujo passa pela pergunta do produto**, sem opção a
    // declarar: um campo que difere do gravado (o `inicial`) basta. O sim
    // chega como `fechar` com `descartou`, e o rascunho sai junto.
  });
  await telas.editor.classes(CLASSES_DO_EDITOR);
  await telas.editor.montar(oEditor());
  await telas.editor.mostrar();
}

/** Redesenha a tela que estiver aberta, sem ir ao servidor. */
const repintarTelas = agruparAtualizacoes(async () => {
  if (telas.editor) await telas.editor.montar(oEditor());
  if (telas.detalhes && aberto) await telas.detalhes.montar(osDetalhes(aberto));
  if (telas.diretorio) await montarDiretorio();
});

// --------------------------------------------------------- o envio de imagem

/**
 * Manda ao servidor o arquivo que alguém escolheu, **pelo volume**.
 *
 * O MOD autoriza (`upload-start`), o produto transmite os bytes direto ao
 * disco de quem hospeda (`SeeleUI.enviar`), e só então o MOD publica a
 * referência nova (`upload-finish`). Os bytes nunca passam por aqui.
 */
async function enviarImagem(slot, escolhido) {
  if (escolhido.papel !== 'imagem') throw new Error('Escolha uma imagem.');
  // **`finally`, e não depois do envio**: um envio que falha no meio deixava
  // os bytes presos no produto até a saída da sessão.
  try {
    const inicio = await request(ESCOPO_DE_SERVIDOR, { op: 'upload-start', slot, transporte: 'volume', bytes: escolhido.bytes });
    await SeeleUI.enviar(escolhido.id, inicio.token);
    await request(ESCOPO_DE_SERVIDOR, { op: 'upload-finish', token: inicio.token });
  } finally {
    try { await SeeleUI.soltar(escolhido.id); }
    catch (erro) { anotar('error', 'PERFIS: falha ao soltar arquivo: ' + (erro.message || erro)); }
  }
}

// --------------------------------------------------------------- gravar

const LIMITES_DE_TEXTO = { displayName: 40, pronouns: 30, status: 60, bio: 280 };

/** O que o `submeter` do editor traz que é do perfil. */
function camposDoPerfil(valores) {
  const campos = {};
  for (const chave of ['displayName', 'pronouns', 'status', 'bio', 'accent', 'effect']) {
    if (typeof valores?.[chave] === 'string') campos[chave] = valores[chave];
  }
  return campos;
}

/**
 * A frase de cada recusa de envio, pelo nome que o produto manda (API 6).
 * `tipo-recusado` leva `detectado` quando o produto reconhece o formato.
 */
const FRASE_DA_RECUSA = {
  'tipo-recusado': falha => (falha.detectado === 'heic'
    ? 'HEIC não é aceito: escolha PNG, JPEG, WebP ou GIF.'
    : 'Use PNG, JPEG, WebP ou GIF.'),
  'formato-desconhecido': () => 'Use PNG, JPEG, WebP ou GIF.',
  'arquivo-grande-demais': () => 'Use uma imagem de até 10 MiB.',
  'nao-gravei': () => 'O servidor não conseguiu gravar a imagem.',
  'incompleto': () => 'O envio parou no meio. Escolha a imagem de novo.',
  'sem-espera': () => 'O envio expirou. Escolha a imagem de novo.',
  'sessao-encerrada': () => 'A sessão acabou no meio do envio.',
};
const fraseDaFalha = falha => FRASE_DA_RECUSA[falha?.erro]?.(falha) ?? (falha?.message || String(falha));

async function gravar() {
  const perfil = emEdicao();
  aviso = 'gravando…';
  const resposta = await request(ESCOPO_DE_SERVIDOR, {
    op: 'save',
    revision: meuPerfil().revision ?? 0,
    profile: {
      displayName: perfil.displayName ?? '',
      pronouns: perfil.pronouns ?? '',
      bio: perfil.bio ?? '',
      status: perfil.status ?? '',
      accent: acentoDe(perfil),
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
  await publicarCartoes();
}

async function tirarImagem(slot) {
  aviso = 'removendo…';
  const resposta = await request(ESCOPO_DE_SERVIDOR, {
    op: 'clear-image',
    slot,
    revision: meuPerfil().revision ?? 0,
  });
  ultimo.perfis[String(ultimo.me)] = resposta.profile ?? meuPerfil();
  aviso = 'removida';
  await publicarCartoes();
}

/** A foto e a capa de cada pessoa, pelos pontos do produto. */
const PONTO_DA_IMAGEM = { avatar: 'pessoa.avatar', banner: 'pessoa.capa' };
const NOME_DA_IMAGEM = { 'pessoa.avatar': 'foto', 'pessoa.capa': 'capa' };
/** `{ handle, assinatura }` por `slot + ':' + id`. */
const imagensRegistradas = new Map();
/** Quantas ficaram de fora em cada ponto da última vez, para dizer só quando muda. */
const imagensDeFora = { avatar: 0, banner: 0 };

/**
 * A foto (`pessoa.avatar`) e a capa (`pessoa.capa`) de cada pessoa.
 *
 * O produto aplica a foto na chamada, nas mensagens e na barra do operador, e
 * a capa no cartão da chamada, no fundo da barra do operador (no computador)
 * e no «SEU PERFIL». O PERFIS só registra, uma contribuição por pessoa e por
 * ponto: uma imagem nova é `atualizar`, e nunca uma segunda contribuição. No
 * teto de alvos de cada ponto, a própria pessoa vem primeiro.
 *
 * Consulta e edição compartilham a fila, para não duplicar handles em voo.
 */
const publicarImagens = agruparAtualizacoes(async () => {
  if (!ultimo) return;
  const meu = String(ultimo.me);
  const ordem = ultimo.ids.includes(meu) ? [meu, ...ultimo.ids.filter(id => id !== meu)] : [...ultimo.ids];
  for (const slot of ['avatar', 'banner']) {
    const ponto = PONTO_DA_IMAGEM[slot];
    const vivas = new Set();
    let fora = 0, cheio = false, teto = null;
    for (const id of ordem) {
      if (!ultimo.perfis[id]?.[slot]) continue;
      const chave = slot + ':' + id;
      vivas.add(chave);
      const conteudo = { doServidor: imagemDoServidor(id, slot) };
      const assinatura = JSON.stringify(conteudo);
      const anterior = imagensRegistradas.get(chave);
      if (anterior) {
        if (anterior.assinatura === assinatura) continue;
        if (await atualizar(anterior.handle, conteudo) !== false) { anterior.assinatura = assinatura; continue; }
        imagensRegistradas.delete(chave);
      }
      if (cheio) { fora += 1; vivas.delete(chave); continue; }
      try {
        const { handle } = await contribuir({ ponto, modo: 'substituir', alvo: id, prioridade: 10, conteudo });
        imagensRegistradas.set(chave, { handle, assinatura });
      } catch (erro) {
        if (erro?.erro !== 'teto-de-alvos') throw erro;
        cheio = true; teto = erro.teto ?? null; fora += 1; vivas.delete(chave);
      }
    }
    for (const [chave, anterior] of imagensRegistradas) {
      if (!chave.startsWith(slot + ':') || vivas.has(chave)) continue;
      await revogar(anterior.handle);
      imagensRegistradas.delete(chave);
    }
    if (fora !== imagensDeFora[slot]) {
      imagensDeFora[slot] = fora;
      if (fora) {
        anotar('warn', 'PERFIS: ' + fora + ' pessoa(s) ficaram sem a ' + NOME_DA_IMAGEM[ponto] + ' do PERFIS: o SEELE aceita '
          + (teto ? 'até ' + teto + ' pessoas' : 'um número limitado de pessoas') + ' em «' + ponto + '».');
      }
    }
  }
});

/** Entrega ao produto o que este MOD apresenta. A recusa não derruba o painel. */
async function publicarCartoes() {
  try {
    await publicarImagens();
  } catch (erro) {
    anotar('warn', 'PERFIS: a foto ou a capa foram recusadas: ' + (erro.message || erro));
  }
  try {
    await publicarCartoesDaLista();
  } catch (erro) {
    anotar('warn', 'PERFIS: a lista recusou os cartões: ' + (erro.message || erro));
  }
}

/**
 * Os perfis destas pessoas, em lotes de até 32, um lote de cada vez. A série
 * é a do primeiro lote: o que mudou depois dele chega por aviso.
 */
async function perfisDe(ids) {
  const perfis = {};
  let me = null, serie = null;
  for (let i = 0; i < ids.length; i += 32) {
    if (i) await new Promise(resolve => setTimeout(resolve, 150));
    const resposta = await request(ESCOPO_DE_SERVIDOR, { op: 'view', people: ids.slice(i, i + 32) });
    Object.assign(perfis, resposta.profiles);
    me = resposta.me ?? me;
    if (serie === null && Number.isInteger(resposta.serie)) serie = resposta.serie;
  }
  return { perfis, me, serie };
}

// ------------------------------------------------- a presença e os avisos
//
// **Os eventos marcam; uma tarefa só lê.** O produto entrega um evento por
// pessoa que entrou e recusa o nono pedido em voo: um pedido por evento perdia
// quem entrasse em rajada, e quem entrava durante a primeira consulta. E o
// Servidor 1.0 junta os avisos acima de quatro por segundo, ficando com o mais
// novo: a série deles diz quando um se perdeu, e aí todo mundo é relido.

/** O que falta saber: quem reler, se a presença mudou, se é preciso reler todos. */
const pendente = { pessoas: new Set(), presenca: false, tudo: false };
/** A série até onde os avisos chegaram em sequência; `null` antes da primeira leitura. */
let ultimaSerie = null;
/** As séries que chegaram depois de um buraco, à espera de fechá-lo. */
const seriesVistas = new Set();
/** Quanto esperar para tentar de novo uma leitura que falhou. */
const NOVA_TENTATIVA = 4000;

const haPendencia = () => pendente.pessoas.size > 0 || pendente.presenca || pendente.tudo;

/** Anda a série pelo que chegou em sequência; um buraco pede a leitura de todos. */
function avancarSerie() {
  if (ultimaSerie === null) return;
  for (const serie of seriesVistas) if (serie <= ultimaSerie) seriesVistas.delete(serie);
  while (seriesVistas.delete(ultimaSerie + 1)) ultimaSerie += 1;
  if (seriesVistas.size) pendente.tudo = true;
}

/** A série de uma leitura de todos: dela em diante, os avisos contam. */
function partirDaSerie(serie) {
  if (serie === null) return;
  ultimaSerie = ultimaSerie === null ? serie : Math.max(ultimaSerie, serie);
  avancarSerie();
}

/** Um aviso da metade de servidor: `{ pessoa, revisao, serie }`. */
function anotarAviso({ pessoa, revisao, serie }) {
  const chave = String(pessoa);
  if (Number.isInteger(serie) && (ultimaSerie === null || serie > ultimaSerie)) seriesVistas.add(serie);
  // A janela que gravou recebe o próprio aviso, e a resposta já lhe trouxe
  // aquela revisão: só o que é mais novo do que o que ela tem é relido.
  if ((ultimo?.perfis?.[chave]?.revision ?? -1) < revisao) pendente.pessoas.add(chave);
  avancarSerie();
}

/** A presença pelo retrato: quem entrou, quem saiu, e o apelido de cada um. */
function reconciliar(retratoDaSessao, novas) {
  const pessoas = (retratoDaSessao.pessoas || []).map(p => ({ id: p.id, apelido: p.apelido }));
  const ids = [...new Set(pessoas.map(p => String(p.id)))];
  const eu = String(ultimo.me);
  if (!ids.includes(eu)) ids.push(eu);
  for (const id of ids) if (!ultimo.ids.includes(id)) novas.add(id);
  for (const id of ultimo.ids) {
    if (ids.includes(id)) continue;
    delete ultimo.perfis[id];
    if (aberto === id) aberto = null;
  }
  ultimo.ids = ids;
  ultimo.pessoas = pessoas;
}

/**
 * Lê o que falta, de uma vez, e redesenha. O que não deu volta para a fila e é
 * tentado de novo depois de 4 s: quem entrou não fica sem PERFIS a sessão
 * inteira porque uma leitura falhou.
 */
const sincronizar = agruparAtualizacoes(async () => {
  // Antes da primeira consulta, as marcas esperam: ela as lê no fim.
  if (!ultimo || !haPendencia()) return;
  const { pessoas, presenca, tudo } = pendente;
  pendente.pessoas = new Set();
  pendente.presenca = false;
  pendente.tudo = false;
  try {
    if (presenca || tudo) reconciliar(await lerRetrato(), pessoas);
    const ids = tudo ? [...ultimo.ids] : [...pessoas].filter(id => ultimo.ids.includes(id));
    if (ids.length) {
      const { perfis, serie } = await perfisDe(ids);
      Object.assign(ultimo.perfis, perfis);
      if (tudo) partirDaSerie(serie);
    }
    await publicarCartoes();
    await repintarTelas();
  } catch (erro) {
    for (const id of pessoas) pendente.pessoas.add(id);
    pendente.presenca ||= presenca;
    pendente.tudo ||= tudo;
    anotar('warn', 'PERFIS: não foi possível atualizar as pessoas; tento de novo: ' + (erro.message || erro));
    setTimeout(() => void sincronizar(), NOVA_TENTATIVA);
  }
});

iniciar(
  async retratoDaSessao => {
    const pessoas = (retratoDaSessao.pessoas || []).map(p => ({ id: p.id, apelido: p.apelido }));
    const ids = [...new Set(pessoas.map(p => String(p.id)))];
    if (retratoDaSessao.eu != null && !ids.includes(String(retratoDaSessao.eu))) ids.push(String(retratoDaSessao.eu));
    const { perfis, me, serie } = await perfisDe(ids);
    ultimo = { ids, pessoas, perfis, me: me ?? retratoDaSessao.eu };
    partirDaSerie(serie);
    await publicarCartoes();
    // A entrada, uma vez por sessão. Registrá-la a cada consulta seria uma
    // entrada nova a cada volta.
    if (!entradaRegistrada) {
      try {
        entradaRegistrada = (await entrada('Perfis', 'abrir-diretorio')).handle;
      } catch (erro) {
        anotar('warn', 'PERFIS: a integração foi recusada: ' + (erro.message || erro));
      }
    }
    await repintarTelas();
    // O que chegou durante a consulta: quem entrou, quem saiu, quem mudou.
    if (haPendencia()) void sincronizar();
  },
  evento => {
    // ---- um perfil mudou: o aviso da metade de servidor ----
    //
    // A carga é `{ pessoa, revisao, serie }`. Marca e lê; antes da primeira
    // consulta, só marca.
    if (evento.nome === 'servidor') {
      const carga = evento.carga ?? {};
      if (carga.pessoa === undefined || carga.pessoa === null || !Number.isInteger(carga.revisao)) return null;
      anotarAviso(carga);
      return sincronizar();
    }

    // ---- quem entra e quem sai do servidor ----
    if (evento.nome === 'pessoas') {
      const entrou = evento.entrou ?? null, saiu = evento.saiu ?? null;
      if (entrou === null && saiu === null) return null;
      pendente.presenca = true;
      if (entrou !== null) pendente.pessoas.add(String(entrou));
      return sincronizar();
    }

    if (!ultimo) return null;

    // ---- a foto ou a capa que o produto não conseguiu mostrar ----
    //
    // O evento diz o ponto e de quem era a imagem. A própria pessoa fica
    // sabendo no editor; a de outra pessoa vai ao registro de quem hospeda.
    if (evento.nome === 'midia' && (evento.ponto === 'pessoa.capa' || evento.ponto === 'pessoa.avatar')) {
      const qual = NOME_DA_IMAGEM[evento.ponto];
      const porque = evento.porque || evento.estado || 'recusada';
      if (String(evento.alvo) === String(ultimo.me)) {
        aviso = 'Sua ' + qual + ' não aparece na chamada: ' + porque;
        return repintarTelas();
      }
      anotar('warn', 'PERFIS: a ' + qual + ' da pessoa ' + evento.alvo + ' não apareceu: ' + porque);
      return null;
    }

    // ---- o clique numa apresentação, vindo do produto ----
    //
    // O `id` é o que o **produto** escreveu no alvo, e não nada que este MOD
    // tenha desenhado: é a diferença entre apresentar uma identidade e afirmar
    // uma. Ver `ligarAcoesDeApresentacao` em `base.js`.
    if (evento.nome === 'acao') {
      if (evento.acao === 'abrir-diretorio') return abrirDiretorio();
      if (evento.acao === 'abrir-perfil' && evento.pessoa) {
        // **O próprio cartão abre o editor, e o dos outros abre a leitura.**
        // Clicar no próprio nome para «ver» o que você mesmo escreveu é um
        // clique a mais para chegar onde a pessoa já queria ir.
        return String(evento.pessoa) === String(ultimo.me)
          ? abrirEditor()
          : abrirDetalhes(evento.pessoa);
      }
      return null;
    }

    // O host pediu para fechar uma superfície. Aceitar é a regra: ver
    // `pedirFechamento` no produto.
    if (evento.nome === 'fechar' || evento.nome === 'fechar-pedido') {
      if (evento.superficie === 'perfis-detalhes') aberto = null;
      // **Quando o produto diz que descartou, descartou.** Com o editor sujo,
      // fechar passa pela confirmação dele — «o que você escreveu e não gravou
      // será perdido» —, e `descartou` é a resposta. Guardar o rascunho aqui
      // tornaria falsa a frase que a pessoa acabou de aceitar.
      if (evento.nome === 'fechar' && evento.superficie === 'perfis-editor' && evento.descartou) {
        rascunhos.delete(chaveDoRascunho());
        perguntandoDescarte = false;
        aviso = '';
        return repintarTelas();
      }
      return null;
    }

    if (evento.nome === 'arquivo') {
      // **Cancelar e falhar deixaram de ser a mesma resposta.** Os dois
      // chegavam como `arquivo: null`; agora `resultado` os separa, e o
      // cancelamento volta a ser o que a auditoria pediu — neutro e sem drama.
      if (!evento.arquivo) {
        aviso = evento.resultado === 'falhou'
          ? (evento.porque || 'não foi possível abrir o seletor')
          : '';
        return repintarTelas();
      }
      if (enviandoImagem) return SeeleUI.soltar(evento.arquivo.id);
      enviandoImagem = true;
      aviso = 'enviando…';
      return repintarTelas().then(() => enviarImagem(evento.chave, evento.arquivo)).then(
        async () => {
          const visto = await request(ESCOPO_DE_SERVIDOR, { op: 'view', people: [String(ultimo.me)] });
          Object.assign(ultimo.perfis, visto.profiles);
          aviso = 'enviada';
          await publicarCartoes();
          await repintarTelas();
        },
        async erro => {
          aviso = fraseDaFalha(erro);
          await repintarTelas();
        },
      ).finally(async () => { enviandoImagem = false; await repintarTelas(); });
    }

    if (evento.nome === 'campo' || evento.nome === 'escolha' || evento.nome === 'cor') {
      const editado = { ...(meuRascunho() ?? meuPerfil()) };
      editado[evento.chave] = evento.valor;
      rascunhos.set(chaveDoRascunho(), editado);
      perguntandoDescarte = false;
      aviso = '';
      return atualizarEditor();
    }

    // ---- GRAVAR, o primário do formulário do produto ----
    //
    // O `submeter` traz todos os valores juntos. Eles viram o rascunho antes de
    // ir ao servidor: uma recusa não pode custar o que foi escrito. A recusa
    // de campo volta ao campo (`formulario.erros`); a outra (a revisão trocada,
    // a permissão) vira o aviso do editor.
    if (evento.nome === 'submeter' && evento.chave === 'perfil') {
      // **Um GRAVAR de cada vez.** O segundo — um clique duplo, um Enter a
      // mais —, antes de o primeiro voltar, gravaria com a mesma revisão e
      // seria recusado com «seu perfil mudou em outra janela».
      if (gravando) return null;
      gravando = true;
      rascunhos.set(chaveDoRascunho(), { ...emEdicao(), ...camposDoPerfil(evento.valores) });
      perguntandoDescarte = false;
      return gravar().finally(() => { gravando = false; }).then(
        async () => {
          await repintarTelas();
          await telas.editor?.formulario.erros({});
          await avisar('Perfil gravado.');
        },
        async erro => {
          const deCampo = erro?.erros && typeof erro.erros === 'object';
          aviso = deCampo ? '' : (erro.message || String(erro));
          await repintarTelas();
          if (deCampo) await telas.editor?.formulario.erros(erro.erros);
        },
      );
    }

    if (evento.nome !== 'botao') return null;


    if (evento.chave.startsWith('abrir-')) {
      const id = evento.chave.slice('abrir-'.length);
      return id === String(ultimo.me) ? abrirEditor() : abrirDetalhes(id);
    }

    // **Descartar é explícito, e confirma.** Ele é a única porta que joga fora
    // o que foi escrito, então ele pergunta uma vez antes de fazê-lo.
    if (evento.chave === 'descartar') {
      if (!perguntandoDescarte) {
        perguntandoDescarte = true;
        aviso = 'Descartar apaga o que você escreveu e não gravou. Aperte de novo para confirmar.';
        return repintarTelas();
      }
      rascunhos.delete(chaveDoRascunho());
      perguntandoDescarte = false;
      aviso = 'Alterações descartadas.';
      return repintarTelas();
    }

    const feito = evento.chave === 'tirar-avatar' ? tirarImagem('avatar')
      : evento.chave === 'tirar-banner' ? tirarImagem('banner')
        : null;
    // A recusa do servidor — permissão, limite, revisão trocada — vira a linha
    // de aviso desta ficha, e não um erro que ninguém lê.
    return feito?.then(
      async () => {
        await repintarTelas();
      },
      async erro => {
        aviso = erro.message || String(erro);
        await repintarTelas();
      },
    ) ?? null;
  },
);
