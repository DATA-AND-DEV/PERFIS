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
  texto, cabecalho, campo, botao, linha, escolha,
  caixa, pilha, grade, separador, espaco,
  formulario, acoes, textoLongo, cor, retrato, distintivo, arquivo, midia,
  request, iniciar, temSuperficies, temContribuicoes,
  pagina, dialogo, contribuir, entrada, avisar, agruparAtualizacoes,
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

/** Quanto cabe num fragmento deste servidor. Ele recusa acima disso. */
const FRAGMENTO = 6000;

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
/** O handle da substituição de cartão, para revogá-la ao sair. */
let cartaoRegistrado = null;

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

const mudouOPerfil = () => {
  const guardado = meuRascunho();
  return guardado !== null && JSON.stringify(guardado) !== JSON.stringify(meuPerfil());
};

/** O apelido do servidor, que é a identidade que o produto conhece. */
const apelidoDe = id => {
  const pessoa = ultimo?.pessoas?.find(p => String(p.id) === String(id));
  return pessoa?.nickname || pessoa?.apelido || 'Pessoa ' + id;
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
  canal: ultimo.canal,
  pedido: { op: 'asset', person: String(id), slot },
  campo: 'image',
});

// ------------------------------------------------ a apresentação da pessoa

/**
 * O cartão de uma pessoa, na lista do produto.
 *
 * # O que ele é agora, e por que isso responde U27
 *
 * Antes: uma linha de texto **abaixo** do apelido do servidor, com o nome
 * exibido, o pronome e o status, cada um num parágrafo. A cor guardada não
 * aparecia; o efeito guardado não aparecia; a faixa não existia.
 *
 * Agora: uma composição — faixa ao fundo, retrato sobreposto, nome, pronome e
 * status em hierarquia, com a cor escolhida na borda e o efeito animando. É a
 * apresentação que a versão `ce976fd` tinha, declarada em vez de escrita no
 * DOM do produto.
 *
 * # O que ele continua não sendo
 *
 * Ele não recebe foco, não tem botão dentro e não alcança nó nenhum. O clique
 * — que U27 também pediu — é montado pelo **produto**, em volta desta
 * declaração, ligado ao ID real: ver `acaoPrincipal` no registro abaixo.
 */
function cartaoDaPessoa(id) {
  const perfil = ultimo.perfis[id] ?? {};
  const acento = acentoDe(perfil);
  const exibido = String(perfil.displayName ?? '').trim();
  const apelido = apelidoDe(id);
  const pronome = String(perfil.pronouns ?? '').trim();
  const status = String(perfil.status ?? '').trim();
  const bio = String(perfil.bio ?? '').trim();
  const animacao = ANIMACAO_DO_EFEITO[perfil.effect] ?? 'nenhuma';

  const dentro = [];

  // **A faixa existe sempre.**
  //
  // Ela era desenhada só quando havia imagem enviada, e sem ela o cartão era
  // uma linha: retrato pequeno, nome, pastilha. A versão de `ce976fd` tinha
  // faixa sempre — `linear-gradient(120deg, accent, #172c48)` quando não havia
  // imagem —, e é ela que dá ao cartão a forma de cartão: um bloco de cor, o
  // retrato subindo sobre ele, o nome embaixo.
  //
  // Aqui o gradiente é declarado por paradas, que é o que a API aceita: o
  // valor é montado pelo produto de partes que ele conferiu, e não por um
  // texto de `linear-gradient` que este MOD escreveria.
  dentro.push(caixa(
    perfil.banner
      ? [midia('faixa', { doServidor: imagemDoServidor(id, 'banner'), descricao: 'faixa de ' + apelido })]
      : [],
    {
      altura: 44,
      recortar: 'cortar',
      largura: 'total',
      ...(perfil.banner ? {} : {
        gradiente: {
          angulo: 120,
          paradas: [{ cor: acento, em: 0 }, { cor: '#101014', em: 100 }],
        },
      }),
      ...(animacao !== 'nenhuma' ? { animacao: { nome: animacao, duracao: 6000 } } : {}),
    },
  ));

  const identidade = [
    retrato('retrato', {
      inicial: inicialDe(perfil, id),
      formato: 'quadrado',
      descricao: exibido ? 'retrato de ' + exibido : 'retrato de ' + apelido,
      ...(perfil.avatar ? { doServidor: imagemDoServidor(id, 'avatar') } : {}),
      // A cor escolhida entra na borda do retrato: é a peça de identidade mais
      // estável do cartão, e a que aparece mesmo sem imagem nenhuma.
      // O retrato sobe sobre a faixa, com uma borda da cor do fundo do
      // cartão em volta — é o recorte que separa os dois e o que a versão de
      // `ce976fd` fazia com `border:5px solid #171d2c`.
      estilo: {
        largura: 52,
        altura: 52,
        posicao: 'relativa',
        // O retrato precisa se destacar: fundo mais claro que o cartão e um
        // anel da cor escolhida. Com o fundo igual ao do cartão ele só
        // aparecia onde cruzava a faixa, e lia como um recorte, não como um
        // retrato.
        fundo: '#161310',
        borda: { largura: 2, cor: acento },
        ...(animacao !== 'nenhuma' ? { animacao: { nome: animacao, duracao: 2600 } } : {}),
      },
    }),
    pilha([
      // O nome exibido quando há; senão o apelido. Nunca os dois: repeti-los
      // seria a linha dizendo duas vezes a mesma coisa.
      caixa([exibido || apelido], { cor: acento, peso: 'forte', corpo: 15, linhasMaximas: 2 }),
      ...(pronome || status ? [caixa([
        ...(pronome ? [distintivo([pronome], {
          borda: { largura: 1, cor: '#3a322a' },
          corpo: 10,
          opacidade: 0.9,
        })] : []),
        ...(status ? [caixa([status], {
          cor: '#c9c1ae',
          corpo: 12, linhasMaximas: 2, largura: 'total',
        })] : []),
      ], { direcao: 'linha', intervalo: 6, quebra: 'sim' })] : []),
    ], { intervalo: 6, crescer: 1, base: 0 }),
  ];

  // Identidade em fluxo: nomes longos não sobem sobre a faixa nem deixam
  // uma lacuna vazia no lugar de uma transformação visual.
  dentro.push(caixa(identidade, {
    direcao: 'linha', alinhar: 'inicio', intervalo: 12,
    preenchimento: 12, largura: 'total', margem: 0,
  }));

  // Resumo com reticências; a biografia inteira continua no perfil aberto.
  if (bio) dentro.push(caixa([caixa([bio], {
    corpo: 12, cor: '#c9c1ae', entrelinha: 1.45, linhasMaximas: 2,
  })], { preenchimento: 10, margem: 0 }));
  dentro.push(caixa(['Ver perfil completo'], {
    corpo: 11, cor: '#b6aa97', preenchimento: 10, margem: 0,
  }));

  // Quem não escreveu nada não ganha cartão: uma moldura vazia ao lado de um
  // nome é o produto anunciando uma ausência que ninguém pediu para anunciar.
  const escreveu = exibido || pronome || status || perfil.avatar || perfil.banner;
  if (!escreveu) return null;

  return [caixa(dentro, {
    largura: 'total',
    fundo: '#0a0806',
    borda: { largura: 1, cor: '#3a322a' },
    recortar: 'cortar',
    // O espaço de baixo é do conteúdo; o de cima é da faixa, que encosta na
    // borda. Sem `preenchimento` assimétrico a faixa ficaria emoldurada, e ela
    // é o fundo do cartão.
    margem: 0,
  })];
}

/** Os cartões de todo mundo, por `id`, para `SeeleUI.cartoes`. */
function cartoesDaLista() {
  const cartoes = {};
  for (const id of ultimo.ids) {
    const partes = cartaoDaPessoa(id);
    if (partes) cartoes[id] = partes;
  }
  return cartoes;
}

/**
 * Registra a substituição da apresentação, uma vez por sessão.
 *
 * **Uma contribuição geral, e não uma por pessoa.** O conteúdo de cada cartão
 * já é por pessoa — `SeeleUI.cartoes` o entrega por `id` — e registrar
 * sessenta e quatro contribuições para dizer a mesma regra sessenta e quatro
 * vezes seria pagar por pessoa uma decisão que é do MOD.
 */
async function registrarApresentacao() {
  if (!temContribuicoes || cartaoRegistrado) return;
  const { handle } = await contribuir({
    ponto: 'pessoa.cartao',
    modo: 'substituir',
    // O clique abre o perfil. O produto monta o alvo e liga o `id` real; este
    // MOD só diz **o que fazer** e recebe o `id` de volta no evento.
    acaoPrincipal: 'abrir-perfil',
    nomeAcessivel: 'perfil',
    prioridade: 10,
  });
  cartaoRegistrado = handle;
}

// ------------------------------------------------------- as superfícies

/**
 * Quantas pessoas o diretório monta de uma vez.
 *
 * **Não é gosto, é o fio.** Cada cartão do diretório dá cerca de 700 bytes de
 * declaração, e o teto por mensagem da ponte é 12.288. Com setenta pessoas, o
 * `superficie-montar` dava 52.862 bytes: a mensagem é recusada, a página nasce
 * vazia, e quem está olhando não descobre por quê.
 *
 * É o mesmo defeito que a validação nativa de 20/09/2026 encontrou no ESTILO
 * (N1). Lá ele aparecia com uma pessoa só, porque eram três abas montadas de
 * uma vez; aqui ele aparece a partir de umas vinte pessoas, e por isso não
 * apareceu naquela rodada — o servidor de teste tinha uma.
 *
 * A conta, medida e não estimada: dezesseis cartões deram 12.792 bytes, ou
 * cerca de 780 por cartão mais 300 de casca. Dez deixa a mensagem perto de
 * 8 KiB e guarda margem para nome longo, status longo e faixa — que é o que
 * um cartão cheio tem e o do teste não tinha.
 */
const PESSOAS_POR_PAGINA = 10;

/** Em que página do diretório estamos. Volta a zero ao reabrir. */
let paginaDoDiretorio = 0;

/** O diretório: quem está aqui, com o cartão de cada um e o que abrir. */
function oDiretorio() {
  if (!ultimo) return [texto('Consultando os perfis deste servidor…')];
  if (!ultimo.ids.length) return [texto('Nenhuma pessoa disponível.')];

  const meu = String(ultimo.me);
  const paginas = Math.max(1, Math.ceil(ultimo.ids.length / PESSOAS_POR_PAGINA));
  const pagina = Math.min(Math.max(paginaDoDiretorio, 0), paginas - 1);
  const primeira = pagina * PESSOAS_POR_PAGINA;
  const daPagina = ultimo.ids.slice(primeira, primeira + PESSOAS_POR_PAGINA);
  const cartoes = daPagina.map(id => {
    const perfil = ultimo.perfis[id] ?? {};
    const eu = id === meu;
    return caixa([
      caixa([
        retrato('r-' + id, {
          inicial: inicialDe(perfil, id),
          formato: 'quadrado',
          descricao: 'retrato de ' + apelidoDe(id),
          ...(perfil.avatar ? { doServidor: imagemDoServidor(id, 'avatar') } : {}),
          estilo: { borda: { largura: 2, cor: acentoDe(perfil) }, largura: 44, altura: 44 },
        }),
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
    ].filter(Boolean), {
      direcao: 'coluna', intervalo: 12,
      preenchimento: 16,
      borda: { largura: 1, cor: '#3a322a' },
      raio: 0,
    });
  });

  return [
    caixa(['Cada pessoa aqui escolheu como aparecer neste servidor.'],
      { opacidade: 0.75, corpo: 11 }),
    // **Quantas existem, e quais estão nesta página.** A contagem total é o
    // que alguém procura para saber se falta gente; ela não pode sumir só
    // porque a página mostra dezesseis.
    caixa([ultimo.ids.length + ' pessoa(s) neste servidor'
      + (paginas > 1
        ? ' · mostrando ' + (primeira + 1) + '–' + (primeira + daPagina.length)
        : '')],
    { corpo: 11, opacidade: 0.7 }),
    // Grade: duas colunas em janela larga, uma quando o contêiner aperta. A
    // consulta é **do contêiner** e não da janela — ver `classes` abaixo.
    grade(cartoes, { colunas: 2, intervalo: 12 }, { classe: 'diretorio' }),
    ...(paginas > 1 ? [acoes([
      botao('diretorio-anterior', 'ANTERIORES', pagina === 0, { variante: 'discreta' }),
      espaco(),
      caixa(['página ' + (pagina + 1) + ' de ' + paginas], { corpo: 11, opacidade: 0.7 }),
      espaco(),
      botao('diretorio-proximas', 'PRÓXIMAS', pagina >= paginas - 1, { variante: 'discreta' }),
    ])] : []),
  ];
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

  if (perfil.banner) {
    partes.push(caixa(
      [midia('d-faixa', { doServidor: imagemDoServidor(id, 'banner'), descricao: 'faixa de ' + apelido })],
      { altura: 120, recortar: 'cortar', raio: 0 },
    ));
  }

  partes.push(caixa([
    retrato('d-retrato', {
      inicial: inicialDe(perfil, id),
      formato: 'quadrado',
      descricao: 'retrato de ' + apelido,
      ...(perfil.avatar ? { doServidor: imagemDoServidor(id, 'avatar') } : {}),
      estilo: { largura: 72, altura: 72, borda: { largura: 3, cor: acento } },
    }),
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
function oEditor() {
  const perfil = emEdicao();
  const mudou = mudouOPerfil();
  const meu = String(ultimo.me);
  const acento = acentoDe(perfil);
  const cartao = cartaoDaPreviaComRascunho(meu);

  // **A prévia, em tamanho real.** Sem moldura extra em volta: o cartão já tem
  // a dele, e uma segunda borda a 10px da primeira é a moldura de uma moldura.
  // O que diz que aquilo é uma prévia é a linha acima dela, não um quadro.
  const previa = pilha([
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
  ], { intervalo: 10 });

  const identidade = pilha([
    grupo('Identidade'),
    campo('displayName', 'NOME EXIBIDO', perfil.displayName ?? '', { erro: erroDeTexto('displayName', perfil) }),
    // Pronome e status dividem a linha: são dois campos curtos, e um deles
    // sozinho numa linha de 900px é uma linha dizendo que sobrou espaço.
    caixa([
      caixa([campo('pronouns', 'PRONOMES', perfil.pronouns ?? '', { erro: erroDeTexto('pronouns', perfil) })],
        { crescer: 1, base: 0, larguraMinima: 160 }),
      caixa([campo('status', 'STATUS', perfil.status ?? '', { erro: erroDeTexto('status', perfil) })],
        { crescer: 1, base: 0, larguraMinima: 160 }),
    ], { direcao: 'linha', intervalo: 16, quebra: 'sim' }),
    // **Multilinha.** U20: «"Sobre mim" é input de uma linha.» Não era uma
    // escolha deste pacote: a API 3 não tinha outra forma para declarar.
    textoLongo('bio', 'SOBRE MIM', perfil.bio ?? '', {
      erro: erroDeTexto('bio', perfil),
      linhas: 4,
      sugestao: 'O que você quer que as pessoas deste servidor saibam.',
    }),
  ]);

  const aparencia = pilha([
    grupo('Aparência'),
    // **Seletor e hexadecimal.** U23 pediu os dois juntos para o ESTILO, e a
    // mesma razão vale aqui: escolher uma cor num campo de texto é escolher
    // uma cor sem vê-la.
    cor('accent', 'COR', acento),
    escolha('effect', 'EFEITO', perfil.effect ?? 'none', EFEITOS),
    arquivo('avatar', 'RETRATO', {
      desligado: enviandoImagem,
      // **Para quê, de que tipo, até quanto.** O produto usa a finalidade
      // como título do diálogo do sistema, o tipo como filtro de extensões e
      // o teto para recusar antes de ler. A auditoria de 20/09/2026 abriu
      // este mesmo botão e leu «Escolha um arquivo para este MOD», com JSONs
      // na lista.
      finalidade: 'Escolha o retrato do seu perfil neste servidor',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DO_RETRATO,
    }),
    arquivo('banner', 'FAIXA', {
      desligado: enviandoImagem,
      finalidade: 'Escolha a faixa que aparece atrás do seu retrato',
      tipos: ['imagem'],
      limiteDeBytes: TETO_DA_FAIXA,
    }),
    ...(meuPerfil().avatar || meuPerfil().banner ? [caixa([
      botao('tirar-avatar', 'TIRAR', !meuPerfil().avatar, { variante: 'discreta' }),
      botao('tirar-banner', 'TIRAR FAIXA', !meuPerfil().banner, { variante: 'discreta' }),
    ], { direcao: 'linha', intervalo: 12, quebra: 'sim' })] : []),
  ]);

  return [
    previa,
    separador(),
    formulario('perfil', [
      caixa([
        caixa([identidade], { crescer: 1.4, base: 0, larguraMinima: 280 }),
        caixa([aparencia], { crescer: 1, base: 0, larguraMinima: 220 }),
      ], { direcao: 'linha', intervalo: 32, quebra: 'sim', alinhar: 'inicio' }),
    ]),
    ...(aviso ? [caixa([aviso], { corpo: 12, cor: acento })] : []),
    acoes([
      botao('descartar', perguntandoDescarte ? 'CONFIRMAR DESCARTE' : 'DESCARTAR',
        !mudou, { variante: perguntandoDescarte ? 'perigo' : 'discreta' }),
      espaco(),
      botao('gravar', mudou ? 'GRAVAR' : 'GRAVADO', !mudou, { variante: 'primaria' }),
    ], true),
  ];
}

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
  if (!temSuperficies) return;
  // Abrir começa na primeira página: quem fechou na página quatro e voltou
  // meia hora depois procura o começo, e não onde parou.
  if (!telas.diretorio) paginaDoDiretorio = 0;
  telas.diretorio ??= await pagina('perfis-diretorio', 'Perfis deste servidor');
  await telas.diretorio.classes(CLASSES_DO_DIRETORIO);
  await telas.diretorio.montar(oDiretorio());
  await telas.diretorio.mostrar();
}

async function abrirDetalhes(id) {
  if (!temSuperficies) return;
  aberto = String(id);
  telas.detalhes ??= await dialogo('perfis-detalhes', 'Perfil', {
    tamanho: { largura: 520 },
  });
  await telas.detalhes.titulo('Perfil de ' + (ultimo.perfis[aberto]?.displayName?.trim() || apelidoDe(aberto)));
  await telas.detalhes.montar(osDetalhes(aberto));
  await telas.detalhes.mostrar();
}

async function abrirEditor() {
  if (!temSuperficies) return;
  telas.editor ??= await dialogo('perfis-editor', 'Editar meu perfil', {
    tamanho: { largura: 820 },
    focoInicial: 'displayName',
    // **O host pergunta antes de descartar.** Ver `pedirFechamento` no produto:
    // o MOD é avisado e pode responder, mas não pode vetar a saída para sempre.
    fecharComAlteracoes: 'confirmar',
  });
  await telas.editor.classes(CLASSES_DO_EDITOR);
  await telas.editor.montar(oEditor());
  await telas.editor.suja(mudouOPerfil());
  await telas.editor.mostrar();
}

/** Redesenha a tela que estiver aberta, sem ir ao servidor. */
const repintarTelas = agruparAtualizacoes(async () => {
  if (telas.editor) {
    await telas.editor.montar(oEditor());
    await telas.editor.suja(mudouOPerfil());
  }
  if (telas.detalhes && aberto) await telas.detalhes.montar(osDetalhes(aberto));
  if (telas.diretorio) await telas.diretorio.montar(oDiretorio());
});

// --------------------------------------------------------- o envio de imagem

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
  let inicio;

  let sobra = prefixo;
  let lidos = 0;
  let indice = 0;
  let enviado = 0;
  // **`finally`, e não depois do laço** — o mesmo risco que a auditoria de
  // 20/09/2026 apontou no MESA, e que vale igual aqui: um envio que falha no
  // meio deixava os bytes presos no produto até a saída da sessão.
  try {
  inicio = await request(canal, { op: 'upload-start', slot, length: total });
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
  } finally {
    // **Devolvido na hora.** Dez megabytes presos até a saída da sessão seriam
    // dez megabytes que ninguém mais vai ler.
    try {
      await SeeleUI.soltar(escolhido.id);
    } catch (erro) {
      // Uma falha ao devolver não pode substituir a falha que a trouxe.
      console.error('PERFIS: o arquivo não foi devolvido: ' + (erro.message || erro));
    }
  }
}

// ------------------------------------------------------------ a região

/**
 * O que continua na faixa, e por que é tão pouco.
 *
 * U01: «O centro da janela fica disponível para conversa vazia, enquanto
 * editar perfil e jogar exige rolar um rodapé.» A resposta não é uma faixa
 * melhor — é uma faixa que não precisa carregar a atividade inteira.
 *
 * O que sobra aqui é o que **cabe numa linha**: quem você é neste servidor, e
 * a porta para o resto. Sem superfícies — um SEELE de API 3 — a faixa volta a
 * ser tudo o que há, e o MOD degrada em vez de falhar.
 */
function aRegiao() {
  if (!ultimo) return [texto('Consultando os perfis deste servidor…')];
  if (!temSuperficies) return oDiretorioNaFaixa();
  const meu = String(ultimo.me);
  const perfil = meuPerfil();
  return [
    caixa([
      retrato('meu-retrato', {
        inicial: inicialDe(perfil, meu),
        formato: 'quadrado',
        descricao: 'seu retrato',
        ...(perfil.avatar ? { doServidor: imagemDoServidor(meu, 'avatar') } : {}),
        estilo: { borda: { largura: 2, cor: acentoDe(perfil) } },
      }),
      pilha([
        caixa([String(perfil.displayName ?? '').trim() || apelidoDe(meu)],
          { peso: 'forte', cor: acentoDe(perfil) }),
        caixa([ultimo.ids.length + ' pessoa(s) neste servidor'],
          { corpo: 11, opacidade: 0.7 }),
      ], { intervalo: 2, crescer: 1 }),
      botao('abrir-diretorio', 'PERFIS'),
      botao('abrir-editor', 'EDITAR', false, { variante: 'primaria' }),
    ], { direcao: 'linha', alinhar: 'centro', intervalo: 8, quebra: 'sim' }),
    ...(aviso ? [texto(aviso)] : []),
  ];
}

/** A faixa de antes, para um SEELE que ainda não tem superfícies. */
function oDiretorioNaFaixa() {
  const partes = [];
  for (const id of ultimo.ids) {
    const perfil = ultimo.perfis[id] ?? {};
    const eu = id === String(ultimo.me);
    partes.push(linha([
      texto((perfil.displayName || apelidoDe(id)) + (eu ? ' (eu)' : '') + ' · ID ' + id),
      botao('abrir-' + id, eu ? 'EDITAR' : 'VER'),
    ]));
  }
  if (aviso) partes.push(texto(aviso));
  return partes;
}

// --------------------------------------------------------------- gravar

const LIMITES_DE_TEXTO = { displayName: 40, pronouns: 30, status: 60, bio: 280 };
const NOMES_DE_TEXTO = { displayName: 'Nome exibido', pronouns: 'Pronomes', status: 'Status', bio: 'Sobre mim' };
function erroDeTexto(chave, perfil) {
  const tamanho = String(perfil[chave] ?? '').length;
  const teto = LIMITES_DE_TEXTO[chave];
  return tamanho > teto ? `${NOMES_DE_TEXTO[chave]}: use até ${teto} caracteres (atual: ${tamanho}).` : '';
}

async function gravar(canal) {
  const perfil = emEdicao();
  const erro = Object.keys(LIMITES_DE_TEXTO).map(chave => erroDeTexto(chave, perfil)).find(Boolean);
  if (erro) throw new Error(erro);
  aviso = 'gravando…';
  const resposta = await request(canal, {
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

async function tirarImagem(canal, slot) {
  aviso = 'removendo…';
  const resposta = await request(canal, {
    op: 'clear-image',
    slot,
    revision: meuPerfil().revision ?? 0,
  });
  ultimo.perfis[String(ultimo.me)] = resposta.profile ?? meuPerfil();
  aviso = 'removida';
  await publicarCartoes();
}

/** Entrega os cartões ao produto. A recusa não derruba o painel. */
async function publicarCartoes() {
  try {
    await SeeleUI.cartoes(cartoesDaLista());
  } catch (erro) {
    console.warn('PERFIS: a lista recusou os cartões: ' + (erro.message || erro));
  }
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
    await publicarCartoes();
    // A entrada e a substituição, uma vez por sessão. Registrá-las a cada
    // consulta seria uma entrada nova a cada quatro segundos.
    if (temContribuicoes && !cartaoRegistrado) {
      try {
        await entrada('Perfis', 'abrir-diretorio');
        await registrarApresentacao();
      } catch (erro) {
        console.warn('PERFIS: a integração foi recusada: ' + (erro.message || erro));
      }
    }
    await repintarTelas();
    return aRegiao();
  },
  async () => {
    ultimo = null;
    aberto = null;
    cartaoRegistrado = null;
    telas.diretorio = null;
    telas.detalhes = null;
    telas.editor = null;
    // Fora de canal não há perfil de ninguém, e um cartão de antes seria uma
    // afirmação sobre gente que este MOD não está mais vendo.
    try { await SeeleUI.cartoes({}); } catch { /* a sessão pode já ter saído */ }
  },
  (evento, canal, repintar) => {
    if (!ultimo) return null;

    // ---- o clique numa apresentação, vindo do produto ----
    //
    // O `id` é o que o **produto** escreveu no alvo, e não nada que este MOD
    // tenha desenhado: é a diferença entre apresentar uma identidade e afirmar
    // uma. Ver `ligarAcoesDeApresentacao` em `base.js`.
    if (evento.nome === 'acao') {
      if (evento.acao === 'abrir-diretorio') return abrirDiretorio();
      if (evento.acao === 'abrir-editor') return abrirEditor();
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
        repintar(aRegiao());
        return repintarTelas();
      }
      if (canal === null || enviandoImagem) return SeeleUI.soltar(evento.arquivo.id);
      enviandoImagem = true;
      aviso = 'enviando…';
      repintar(aRegiao());
      return repintarTelas().then(() => enviarImagem(canal, evento.chave, evento.arquivo)).then(
        async () => {
          const visto = await request(canal, { op: 'view', people: [String(ultimo.me)] });
          Object.assign(ultimo.perfis, visto.profiles);
          aviso = 'enviada';
          await publicarCartoes();
          repintar(aRegiao());
          await repintarTelas();
        },
        async erro => {
          aviso = erro.message || String(erro);
          repintar(aRegiao());
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
      repintar(aRegiao());
      return repintarTelas();
    }

    if (evento.nome !== 'botao') return null;

    if (evento.chave === 'abrir-diretorio') return abrirDiretorio();
    if (evento.chave === 'abrir-editor') return abrirEditor();

    // As páginas do diretório. Elas existem porque a declaração inteira não
    // cabe na ponte — ver `PESSOAS_POR_PAGINA`.
    if (evento.chave === 'diretorio-anterior' || evento.chave === 'diretorio-proximas') {
      paginaDoDiretorio += evento.chave === 'diretorio-proximas' ? 1 : -1;
      if (paginaDoDiretorio < 0) paginaDoDiretorio = 0;
      return repintarTelas();
    }
    if (evento.chave.startsWith('abrir-')) {
      const id = evento.chave.slice('abrir-'.length);
      if (!temSuperficies) {
        // Sem superfícies, a faixa continua sendo tudo o que há.
        aberto = id;
        repintar(aRegiao());
        return null;
      }
      return id === String(ultimo.me) ? abrirEditor() : abrirDetalhes(id);
    }

    // **Descartar é explícito, e confirma.** Ele é a única porta que joga fora
    // o que foi escrito, então ele pergunta uma vez antes de fazê-lo.
    if (evento.chave === 'descartar') {
      if (!perguntandoDescarte) {
        perguntandoDescarte = true;
        aviso = 'Descartar apaga o que você escreveu e não gravou. Aperte de novo para confirmar.';
        repintar(aRegiao());
        return repintarTelas();
      }
      rascunhos.delete(chaveDoRascunho());
      perguntandoDescarte = false;
      aviso = 'Alterações descartadas.';
      repintar(aRegiao());
      return repintarTelas();
    }

    if (canal === null) return null;
    const feito = evento.chave === 'gravar' ? gravar(canal)
      : evento.chave === 'tirar-avatar' ? tirarImagem(canal, 'avatar')
        : evento.chave === 'tirar-banner' ? tirarImagem(canal, 'banner')
          : null;
    // A recusa do servidor — permissão, limite, revisão trocada — vira a linha
    // de aviso desta ficha, e não um erro que ninguém lê.
    return feito?.then(
      async () => {
        repintar(aRegiao());
        await repintarTelas();
        if (evento.chave === 'gravar') await avisar('Perfil gravado.');
      },
      async erro => {
        aviso = erro.message || String(erro);
        repintar(aRegiao());
        await repintarTelas();
      },
    ) ?? null;
  },
);
