const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const source = fs.readFileSync(path.join(root, manifest.client), 'utf8');
const serverSource = fs.readFileSync(path.join(root, manifest.server), 'utf8');
/**
 * O servidor deste MOD, com o disco e o relógio de mentira.
 *
 * # O que este mundo **não** faz mais, e por que a mudança é o conserto
 *
 * Ele completava `revision` e `nonce` em todo pedido antes de entregá-lo ao
 * servidor. Isso fazia o teste do cliente provar um caminho que o produto não
 * percorre: o cliente nunca mandava nenhum dos dois, e na máquina de quem usa
 * a criação de campanha voltava `invalid-id` — com a suíte inteira verde.
 *
 * Agora o pedido atravessa **intacto**. Um teste que precise de uma escrita
 * direta ao servidor — sem passar pelo cliente — monta os campos ele mesmo,
 * por `escritaDireta`, e essa é a diferença que o nome deixa visível.
 */
function world() {
  const data = {}, files = new Map();
  const call = (body, person = '1', channel = 1) => {
    const sandbox = vm.createContext({ dados: data, mundo: { agora: () => 100 }, arquivos: { ler: p => files.get(p) ?? null, escrever: (p, v) => (files.set(p, v), true), apagar: p => files.delete(p), listar: () => [...files.keys()] } });
    vm.runInContext(serverSource, sandbox);
    return JSON.parse(sandbox.aoPedir(JSON.stringify({ person, channel, admin: person === '1', write: true }), JSON.stringify(body)));
  };
  /**
   * Uma escrita montada pelo teste, com a revisão que o servidor tem agora.
   *
   * É o que semeia estado para um caso; **não** é o caminho do produto, e o
   * nome diz isso para ninguém voltar a confundir os dois.
   */
  let serial = 0;
  const escritaDireta = (body, person = '1', channel = 1) => {
    const atual = call({ op: 'view' }, person, channel);
    const revision = atual.campaign ? atual.campaign.revision : 0;
    return call({ revision, nonce: 'semente-' + (++serial), ...body }, person, channel);
  };
  return { data, call, escritaDireta };
}
function client(w, options = {}) {
  const regions = [], themes = [], requests = [], timers = [], errors = [], cartoes = [], pedidosDeCartao = [];
  // As superfícies de pé, por `id`, e os avisos que passaram pela fila.
  const superficies = new Map(), avisos = [], contribuicoes = [];
  // Os arquivos que uma pessoa «escolheu», por número — o que o produto
  // guardaria. O MOD nunca os vê inteiros: ele pede pedaços.
  const escolhidos = new Map(), soltos = [];
  const snapshot = { me: 2, open_channel: 1, channels: [{ id: 1 }], presentes: [{ id: 1, nickname: 'Alex' }, { id: 2, nickname: 'Lia' }] };
  const sandbox = vm.createContext({
    console: { error: e => errors.push(e) },
    setTimeout: (fn, ms) => { if (ms === 150) { void Promise.resolve().then(fn); } else timers.push(fn); },
    SeeleMods: {
      snapshot: async () => structuredClone(snapshot),
      request: async (id, channel, body) => {
        requests.push({ id, channel, body });
        if (options.request) return options.request(id, channel, body);
        return w.call(body, String(snapshot.me), channel);
      },
    },
    SeeleUI: {
      regiao: async tree => { checkTree(tree); regions.push(structuredClone(tree)); },
      tema: async values => { if (options.tema) await options.tema(values); themes.push(structuredClone(values)); },
      // A API 3 completa: a janela fala com o MOD sem que ele tenha perguntado.
      // Um só ouvinte, e o último vence — é o que o produto oferece.
      aoEvento: fn => { listener = fn; },
      // O arquivo que alguém escolheu: o MOD recebe um número e lê os bytes em
      // pedaços. Aqui os bytes são de mentira, e o número é o índice deles.
      pedaco: async (arquivo, inicio) => {
        const bytes = escolhidos.get(arquivo);
        if (!bytes) throw new Error('arquivo-nao-esta-de-pe');
        // O mesmo tamanho do produto, e múltiplo de três: dois pedaços
        // seguidos precisam concatenar no arquivo.
        return bytes.subarray(inicio, inicio + 65535).toString('base64');
      },
      soltar: async arquivo => { escolhidos.delete(arquivo); soltos.push(arquivo); },
      // A única superfície fora da região: uma declaração por pessoa, na mesma
      // gramática, montada pelo renderer do produto na lista dele. Os limites e
      // as recusas aqui são os de `mods-regiao.js` — um MOD que ponha um botão
      // num cartão descobre **no teste dele**, e não numa lista que
      // silenciosamente não mostra o botão.
      // ---- as superfícies (API 4) ----
      //
      // **O mesmo ciclo de vida do produto, com o mesmo teto.** Um MOD que
      // abra treze superfícies descobre aqui, e não numa janela onde a décima
      // terceira simplesmente não apareceu.
      //
      // Reabrir com o mesmo `id` **não recria**: é o que o produto faz, e um
      // teste que recriasse esconderia o caso que mais importa — o campo que
      // continua preenchido ao reabrir.
      superficies: {
        criar: async descricao => {
          const chave = String(descricao?.id ?? '') || 'sem-id';
          if (!superficies.has(chave)) {
            if (superficies.size >= 12) {
              throw new Error('um MOD mantém até 12 superfícies de pé');
            }
            superficies.set(chave, {
              descricao: structuredClone(descricao ?? {}),
              arvores: [],
              classes: null,
              visivel: true,
              suja: false,
              titulo: String(descricao?.titulo ?? ''),
              descartada: false,
            });
          }
          const tela = superficies.get(chave);
          tela.visivel = true;
          tela.descartada = false;
          return {
            id: chave,
            montar: async arvore => {
              checkTree(arvore);
              tela.arvores.push(structuredClone(arvore));
            },
            classes: async mapa => {
              for (const [, declarado] of Object.entries(mapa ?? {})) {
                for (const [estado, estilo] of Object.entries(declarado ?? {})) {
                  if (estado === 'consultas') {
                    for (const consulta of estilo ?? []) checkEstilo(consulta?.estilo, 'consulta');
                    continue;
                  }
                  checkEstilo(estilo, 'classe');
                }
              }
              tela.classes = structuredClone(mapa ?? {});
            },
            mostrar: async () => { tela.visivel = true; },
            ocultar: async () => { tela.visivel = false; },
            suja: async valor => { tela.suja = valor !== false; },
            titulo: async t => { tela.titulo = String(t ?? ''); },
            fechar: async () => { tela.visivel = false; },
            descartar: async () => { tela.descartada = true; superficies.delete(chave); },
          };
        },
        avisar: async (mensagem, tom) => {
          avisos.push({ mensagem: String(mensagem ?? ''), tom: tom ?? 'normal' });
          return { superficie: 'aviso', reaproveitada: false };
        },
      },

      // ---- as contribuições (API 4) ----
      //
      // Os pontos e os modos são os de `mods-contribuicoes.js`. Um MOD que
      // peça um ponto que não existe descobre aqui, com a lista dos que
      // existem — que é o que o produto também responde.
      contribuicoes: {
        registrar: async pedido => {
          const PONTOS = {
            'pessoa.identidade': ['substituir', 'decorar'],
            'pessoa.cartao': ['substituir', 'adicionar'],
            'pessoa.detalhes': ['adicionar'],
            'pessoa.acoes': ['adicionar'],
            'canal.item': ['decorar', 'adicionar'],
            'canal.cabecalho': ['adicionar'],
            'compositor.ferramentas': ['adicionar'],
            'sala.acoes': ['adicionar'],
            'servidor.navegacao': ['adicionar'],
            'servidor.aparencia': ['substituir'],
          };
          const ponto = String(pedido?.ponto ?? '');
          const modos = PONTOS[ponto];
          if (!modos) {
            throw new Error('a API de MODs não conhece o ponto «' + ponto
              + '»; os que existem são ' + Object.keys(PONTOS).join(', '));
          }
          const modo = String(pedido?.modo ?? 'adicionar');
          if (!modos.includes(modo)) {
            throw new Error('«' + ponto + '» aceita ' + modos.join(' ou ') + ', e veio «' + modo + '»');
          }
          if (contribuicoes.length >= 128) {
            throw new Error('um MOD mantém até 128 contribuições de pé');
          }
          const handle = 'c' + (contribuicoes.length + 1);
          contribuicoes.push({ handle, ...structuredClone(pedido) });
          return { handle };
        },
        revogar: async handle => {
          const onde = contribuicoes.findIndex(c => c.handle === handle);
          if (onde < 0) return false;
          contribuicoes.splice(onde, 1);
          return true;
        },
      },

      cartoes: async pedidos => {
        const entradas = Object.entries(pedidos ?? {});
        if (entradas.length > 64) throw new Error('um MOD dá cartão a até 64 pessoas, e vieram ' + entradas.length);
        // **A gramática do cartão, e o que continua de fora dela.**
        //
        // Ela cresceu com a API 4 — composição e apresentação de pessoa
        // entraram, porque U27 pediu que o cartão pudesse **substituir** a
        // identidade. O que não mudou é a razão de a lista existir: a linha do
        // roster já tem um botão do produto, e nada que receba foco entra aqui.
        //
        // Os mesmos nomes de `PERFIS_DE_RENDER.cartao.formas` no produto. Um
        // MOD que ponha um botão num cartão descobre **no teste dele**, e não
        // numa lista que silenciosamente não o mostra.
        const DENTRO = new Set([
          'texto', 'titulo', 'linha', 'lista', 'item', 'midia',
          'caixa', 'pilha', 'grade', 'separador', 'espaco',
          'retrato', 'distintivo',
        ]);
        const montados = {};
        let recusados = 0;
        let nos = 0;
        const andar = (no, fundura) => {
          if (fundura > 6 || no == null) return [];
          if (Array.isArray(no)) return no.flatMap(um => andar(um, fundura));
          if (typeof no === 'string') { nos += 1; return [{ texto: no }]; }
          if (typeof no !== 'object' || !no.forma) return [];
          if (!DENTRO.has(no.forma)) { recusados += 1; return []; }
          nos += 1;
          checkEstilo(no.estilo, 'cartão/' + no.forma);
          return [{ ...no, dentro: andar(no.dentro, fundura + 1) }];
        };
        for (const [pessoa, declaracao] of entradas) {
          nos = 0;
          const partes = andar(declaracao, 0);
          if (!partes.length) continue;
          // Os mesmos 64 nós de `LIMITES_DO_CARTAO`, contados em todos os
          // níveis: contar só a raiz deixaria passar uma árvore funda.
          if (nos > 64) throw new Error('um cartão cabe em 64 nós, e vieram ' + nos);
          montados[String(pessoa)] = partes;
        }
        cartoes.length = 0;
        cartoes.push(montados);
        pedidosDeCartao.length = 0;
        pedidosDeCartao.push(structuredClone(pedidos ?? {}));
        return recusados;
      },
    },
  });
  let listener = null;
  // **Um SEELE de API 3 não tem superfícies nem contribuições**, e a diferença
  // é ausência e não recusa: o prelúdio monta um `SeeleUI` em que os dois
  // simplesmente não estão. Reproduzir isso aqui é o que permite a um MOD
  // provar que degrada em vez de falhar — e é o único jeito de testar a
  // compatibilidade que `APIS_ACEITAS` promete.
  if (options.semApi4) {
    delete sandbox.SeeleUI.superficies;
    delete sandbox.SeeleUI.contribuicoes;
  }
  vm.runInContext(source, sandbox, { timeout: 1000 });
  return {
    regions, themes, requests, timers, errors, snapshot, avisos, contribuicoes,
    /** As superfícies de pé, por `id`. */
    superficies,
    /** A última árvore que o MOD montou numa superfície. */
    superficie: chave => superficies.get(String(chave))?.arvores.at(-1) ?? null,
    /** Os controles de uma superfície, pela chave — como `controles()` na região. */
    controlesDe: chave => {
      const achados = new Map();
      const andar = no => {
        if (!no || typeof no !== 'object') return;
        if (Array.isArray(no)) { no.forEach(andar); return; }
        if (no.chave) achados.set(no.chave, no);
        andar(no.dentro);
      };
      andar(superficies.get(String(chave))?.arvores.at(-1));
      return achados;
    },
    /** As entradas de navegação que o MOD registrou. */
    entradas: () => contribuicoes.filter(c => c.ponto === 'servidor.navegacao'),
    /** Os cartões que o produto montou na lista de pessoas, por último. */
    cartoes: () => cartoes.at(-1) ?? {},
    /** O que o MOD **pediu**, antes da regra do produto. */
    cartoesPedidos: () => pedidosDeCartao.at(-1) ?? {},
    tick: () => { assert.equal(timers.length, 1); timers.shift()(); },
    // O que a pessoa fez. Quem monta o elemento é o produto, então o teste
    // manda o **evento** dele, e não um clique num DOM que não existe aqui.
    fire: evento => { assert.ok(listener, 'o MOD não registrou ouvinte de evento'); listener(evento); },
    /**
     * O que o produto manda quando alguém aperta uma apresentação de MOD.
     *
     * O `id` da pessoa é o que o **produto** escreveu no alvo, e não nada que
     * o MOD tenha desenhado: é a diferença entre apresentar uma identidade e
     * afirmar uma, e o teste a reproduz para não haver dois contratos.
     */
    agir: (acao, pessoa = '', canal = '') => {
      assert.ok(listener, 'o MOD não registrou ouvinte de evento');
      listener({ nome: 'acao', acao, pessoa: String(pessoa), canal: String(canal) });
    },
    escolhidos, soltos,
    /** Simula o que a pessoa escolheu no seletor do sistema. */
    escolher: (chave, bytes, tipo = 'image/png') => {
      const id = escolhidos.size + 1;
      escolhidos.set(id, Buffer.from(bytes));
      listener({ nome: 'arquivo', chave, arquivo: { id, tipo, papel: 'imagem', bytes: bytes.length } });
      return id;
    },
    // Os controles que estão na tela agora, pela chave — é o que permite a um
    // teste apertar «o botão de gravar» sem saber onde ele ficou.
    controles: () => {
      const achados = new Map();
      const andar = no => {
        if (!no || typeof no !== 'object') return;
        if (Array.isArray(no)) { no.forEach(andar); return; }
        if (no.chave) achados.set(no.chave, no);
        andar(no.dentro);
      };
      andar(regions.at(-1));
      return achados;
    },
  };
}
// As chaves que cada forma da API 3 aceita. Escritas aqui para um MOD que
// invente um campo descobrir **no teste dele**, e não numa região que o produto
// monta sem aquele campo e sem dizer por quê.
// **Toda forma aceita `estilo`, `classe` e `nomeAcessivel`.** Eles não são de
// nenhuma forma em particular: são o que a API 4 acrescentou a todas.
const CHAVES_DE_TODA_FORMA = ['estilo', 'classe', 'nomeAcessivel', 'chave'];

const CHAVES_DA_FORMA = {
  // ---- API 3 ----
  titulo: ['dentro'], texto: ['dentro'], linha: ['dentro'],
  lista: ['dentro'], item: ['dentro'],
  campo: ['chave', 'rotulo', 'valor', 'erro'],
  escolha: ['chave', 'rotulo', 'valor', 'opcoes'],
  botao: ['chave', 'dentro', 'desligado', 'variante', 'emProgresso', 'porqueIndisponivel'],
  // `finalidade`, `tipos` e `limiteDeBytes` chegaram com o conserto de U21/U22:
  // o botão de arquivo não tinha nome acessível nenhum, e o seletor do sistema
  // abria dizendo «Escolha um arquivo para este MOD» com JSONs na lista.
  arquivo: ['chave', 'dentro', 'rotulo', 'desligado', 'finalidade', 'tipos', 'limiteDeBytes'],
  // `fundo` chegou com o conserto do mapa (auditoria 20/09/2026): ele era
  // montado como mídia **ao lado** do canvas, e as coordenadas das peças
  // ficavam num plano que ninguém alinhava com a imagem.
  tela: ['chave', 'largura', 'altura', 'figuras', 'tracos', 'fundo'],
  midia: ['chave', 'fonte', 'doServidor', 'descricao', 'tocando'],
  // ---- API 4: composição ----
  caixa: ['dentro'], pilha: ['dentro'], grade: ['dentro'], rolagem: ['dentro'],
  separador: [], espaco: [],
  // ---- API 4: controle ----
  formulario: ['chave', 'dentro', 'erro'],
  acoes: ['dentro', 'fixas'],
  abas: ['chave', 'valor', 'dentro'],
  aba: ['chave', 'rotulo', 'dentro'],
  textoLongo: ['chave', 'rotulo', 'valor', 'linhas', 'sugestao', 'erro'],
  numero: ['chave', 'rotulo', 'valor', 'minimo', 'maximo', 'passo', 'erro'],
  deslizante: ['chave', 'rotulo', 'valor', 'minimo', 'maximo', 'passo'],
  marca: ['chave', 'rotulo', 'valor', 'desligado'],
  interruptor: ['chave', 'rotulo', 'valor', 'desligado'],
  cor: ['chave', 'rotulo', 'valor'],
  // ---- API 4: apresentação ----
  retrato: ['chave', 'inicial', 'formato', 'descricao', 'fonte', 'doServidor'],
  distintivo: ['dentro'],
  link: ['chave', 'dentro', 'endereco', 'desligado'],
};

/**
 * As propriedades de estilo que `mods-estilos.js` reconhece.
 *
 * Escritas aqui pela mesma razão que as formas: um MOD que escreva `corDeFundo`
 * em vez de `fundo` descobre **no teste dele**, e não numa tela em que a cor
 * simplesmente não aparece. O produto conta a recusa e a devolve como erro; o
 * teste a transforma numa falha com o nome da propriedade.
 */
const PROPRIEDADES_DE_ESTILO = new Set([
  'cor', 'fundo', 'gradiente', 'opacidade',
  'raio', 'borda', 'sombra',
  'familia', 'peso', 'corpo', 'entrelinha', 'espacamento', 'alinhamento', 'transformar',
  'direcao', 'alinhar', 'distribuir', 'quebra', 'crescer', 'encolher',
  'intervalo', 'preenchimento', 'margem',
  'largura', 'altura', 'larguraMinima', 'larguraMaxima', 'alturaMinima', 'alturaMaxima',
  'colunas', 'posicao', 'recortar', 'proporcao',
  'girar', 'escalar', 'mover', 'transicao', 'animacao',
]);

function checkEstilo(estilo, onde) {
  if (estilo === null || estilo === undefined) return;
  assert.equal(typeof estilo, 'object', `o estilo de «${onde}» não é um objeto`);
  for (const chave of Object.keys(estilo)) {
    assert.ok(
      PROPRIEDADES_DE_ESTILO.has(chave),
      `«${chave}» não é uma propriedade de estilo que o SEELE reconhece (em «${onde}»)`,
    );
  }
}

function checkTree(tree, depth = 0) {
  // O teto da superfície, que é o maior dos três perfis do produto.
  assert.ok(depth <= 16, 'o renderer do produto cortaria este conteúdo');
  if (tree === null || tree === undefined) return;
  if (typeof tree === 'string') return;
  // **Um vetor não é um nível.** `planejar`, no produto, percorre um vetor com
  // a mesma fundura — ele é uma lista de irmãos, e não um nó. Contá-lo aqui
  // fazia o laboratório recusar árvores que o produto monta sem reclamar, e o
  // MOD via «o renderer do produto cortaria este conteúdo» num lugar onde o
  // renderer não corta nada. Um laboratório que discorda do produto é pior que
  // nenhum: ele ensina a coisa errada.
  if (Array.isArray(tree)) { tree.forEach(n => checkTree(n, depth)); return; }
  const aceitas = CHAVES_DA_FORMA[tree.forma];
  assert.ok(aceitas, 'forma que a API do SEELE não conhece: ' + tree.forma);
  for (const chave of Object.keys(tree)) {
    if (chave === 'forma') continue;
    if (chave === 'estilo') { checkEstilo(tree.estilo, tree.forma); continue; }
    if (CHAVES_DE_TODA_FORMA.includes(chave)) continue;
    assert.ok(aceitas.includes(chave), `«${chave}» não existe em «${tree.forma}»`);
  }
  if ('dentro' in tree) checkTree(tree.dentro, depth + 1);
}
const settle = () => new Promise(resolve => setImmediate(resolve));
/**
 * Espera várias voltas de microtarefa.
 *
 * Abrir uma superfície são quatro idas à ponte — criar, classes, montar,
 * mostrar —, e cada uma é uma promessa. Um `settle()` só assenta a primeira, e
 * um teste que olhasse ali veria a superfície criada e vazia. O nome diz o que
 * se está esperando, para ninguém voltar a contar `await settle()` na mão.
 */
const assentar = async (voltas = 12) => { for (let i = 0; i < voltas; i += 1) await settle(); };
const content = c => JSON.stringify(c.regions.at(-1));
test('o cliente final executa sem DOM e só consulta o próprio servidor', async () => {
  const c = client(world()); await settle();
  // O pacote declara uma API que este SEELE executa — ver `APIS_ACEITAS`.
  assert.ok([3, 4].includes(manifest.api), 'manifesto declara API ' + manifest.api);
  assert.ok(c.regions.length); assert.equal(c.errors.length, 0);
  assert.ok(c.requests.length); assert.ok(c.requests.every(r => r.id === manifest.id && r.body.op === 'view'));
  assert.equal(c.timers.length, 1);
});
test('canal ausente limpa o conteúdo anterior e não envia pedidos', async () => {
  const c = client(world()); await settle(); const before = c.requests.length;
  c.snapshot.channels = []; c.snapshot.open_channel = null; c.tick(); await settle();
  assert.equal(c.requests.length, before); assert.match(content(c), /canal de texto/);
});
test('consulta lenta não agenda outra consulta em paralelo', async () => {
  let release;
  const w = world(), c = client(w, { request: () => new Promise(resolve => { release = resolve; }) });
  await settle(); assert.equal(c.requests.length, 1); assert.equal(c.timers.length, 0);
  release(w.call({ op: 'view' }, '2')); await settle();
  assert.equal(c.timers.length, 1); assert.equal(c.regions.length, 1);
});
test('recusa substitui dados antigos e próxima consulta pode recuperar', async () => {
  let fail = false; const w = world();
  const c = client(w, { request: (_id, canal, body) => fail ? Promise.reject(Error('timeout')) : w.call(body, '2', canal) });
  await settle(); fail = true; c.tick(); await settle(); assert.match(content(c), /timeout/);
  fail = false; c.tick(); await settle(); assert.doesNotMatch(content(c), /timeout/);
});
test('resposta do canal anterior não é exibida após navegar', async () => {
  let release; const w = world();
  const c = client(w, { request: () => new Promise(resolve => { release = resolve; }) });
  await settle(); c.snapshot.open_channel = 2; release(w.call({ op: 'view' }, '2')); await settle();
  assert.match(content(c), /Canal alterado/);
});
if (manifest.id === 'seele/mesa') {
  // ---- a mesa virou um espaço, e não um rodapé (U01, U25) ----
  //
  // A auditoria de 20/09/2026 mediu que jogar exigia rolar uma faixa de 240px
  // com o tabuleiro, os controles, as fichas, o compêndio e o registro
  // empilhados. Agora a faixa diz qual mesa e de quem é a vez, e a atividade
  // acontece numa página com abas.
  //
  // Os casos abaixo passaram a abrir a mesa antes de olhar os controles, e a
  // olhar a **página**. O que eles verificam não mudou: é o mesmo contrato com
  // o servidor, no lugar onde a pessoa de fato o exerce.

  /** Abre a página da mesa e espera as idas à ponte assentarem. */
  const abrirMesa = async c => { c.agir('abrir-mesa'); await assentar(); };
  /** Abre uma aba da página. */
  const naAba = async (c, qual) => {
    c.fire({ nome: 'aba', chave: 'aba', valor: qual });
    await assentar();
  };
  /** Os controles da página da mesa, e não os da faixa. */
  const naMesa = c => c.controlesDe('mesa');
  /** O que a página da mesa diz agora. */
  const oQueAMesaDiz = c => JSON.stringify(c.superficie('mesa'));
  test('MESA: a mesa se cria num diálogo, com sistema e mestre escolhidos', async () => {
    const w = world();
    // Sem campanha: o único caminho é criar uma, e a porta está na faixa.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    // Quem cria a mesa é quem administra: o retrato precisa dizer que é ela,
    // porque é esse nome que vai no `gm` do pedido.
    await settle();
    c.snapshot.me = 1;
    c.tick(); await settle();

    // A faixa oferece a porta, e não um formulário.
    assert.ok(c.controles().has('abrir-criar'), 'a faixa não tem porta para criar a mesa');
    c.fire({ nome: 'botao', chave: 'abrir-criar' });
    await assentar();

    // **Sistema e mestre voltaram ao diálogo.** A auditoria anotou que «a
    // criação fixa sistema `free` e GM atual; a versão anterior oferecia
    // sistema e GM no diálogo». Fixar os dois não foi decisão: foi o que cabia
    // na faixa.
    const noDialogo = c.controlesDe('mesa-criar');
    assert.ok(noDialogo.has('criar-campanha'), 'não há como criar a mesa: '
      + JSON.stringify(c.superficie('mesa-criar')));
    assert.ok(noDialogo.has('novo-sistema'), 'o diálogo não oferece o sistema');
    assert.ok(noDialogo.has('novo-gm'), 'o diálogo não oferece o mestre');
    assert.equal(noDialogo.get('criar-campanha').desligado, true, 'CRIAR MESA começa ligado sem nome');

    c.fire({ nome: 'campo', chave: 'nova-campanha', valor: 'A Casa' });
    await assentar();
    assert.equal(c.controlesDe('mesa-criar').get('criar-campanha').desligado, false);
    c.fire({ nome: 'botao', chave: 'criar-campanha' });
    await assentar(20);
    assert.ok(w.call({ op: 'view' }, '1').campaign, 'a mesa não foi criada');
    assert.equal(w.call({ op: 'view' }, '1').campaign.name, 'A Casa');

    // E a página da mesa abre com ela.
    await abrirMesa(c);
    // O rascunho esvaziou: deixá-lo cheio repetiria o nome na criação seguinte.
    assert.equal(naMesa(c).get('nova-cena').valor, '');

    c.fire({ nome: 'campo', chave: 'nova-cena', valor: 'Salão' }); await settle();
    c.fire({ nome: 'botao', chave: 'criar-cena' }); await settle(); await settle();
    const comCena = w.call({ op: 'view' }, '1').campaign;
    assert.equal(comCena.scenes.at(-1).name, 'Salão');

    c.fire({ nome: 'escolha', chave: 'cena', valor: String(comCena.scenes.at(-1).id) });
    await settle(); await settle();
    c.fire({ nome: 'campo', chave: 'nova-peca', valor: 'Goblin' }); await settle();
    c.fire({ nome: 'botao', chave: 'criar-peca' }); await settle(); await settle();
    const comPeca = w.call({ op: 'view' }, '1').campaign.scenes.at(-1);
    assert.equal(comPeca.tokens.at(-1).name, 'Goblin');

    c.fire({ nome: 'campo', chave: 'nova-ficha', valor: 'Iria' }); await settle();
    c.fire({ nome: 'botao', chave: 'criar-ficha' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).name, 'Iria');
  });
  test('MESA: a ficha aberta fere, cura, marca condição e entra na iniciativa', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);

    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();
    assert.ok(naMesa(c).has('ferir'), 'a ficha aberta não trouxe os controles de vida');

    c.fire({ nome: 'campo', chave: 'dano', valor: '4' }); await settle();
    c.fire({ nome: 'botao', chave: 'ferir' }); await settle(); await settle();
    const ferida = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    assert.equal(ferida.hp, ficha.hp - 4, 'o dano não chegou ao servidor');

    c.fire({ nome: 'botao', chave: 'curar' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).hp, ficha.hp);

    c.fire({ nome: 'botao', chave: 'condicao-atordoado' }); await settle(); await settle();
    assert.ok(
      w.call({ op: 'view' }, '1').campaign.sheets.at(-1).conditions.includes('stunned'),
      'a condição não foi marcada',
    );
    // E ela sai pelo mesmo botão: o rótulo diz qual dos dois ele faz agora.
    c.fire({ nome: 'botao', chave: 'condicao-atordoado' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).conditions.length, 0);

    c.fire({ nome: 'botao', chave: 'iniciativa-add' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.initiative.at(-1).name, 'Iria');
  });
  test('MESA: o mapa escolhido chega inteiro ao servidor e é devolvido', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    // Maior que um fragmento e que um pedaço: é o que prova a junção.
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(70000, 3),
    ]);
    const arquivo = c.escolher('mapa', png);
    for (let i = 0; i < 120; i++) await settle();

    const guardada = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id);
    assert.ok(guardada.asset, 'o mapa não foi publicado: ' + oQueAMesaDiz(c));
    const lido = w.call({ op: 'asset', scene: id }, '1');
    const base64 = lido.image.slice(lido.image.indexOf(',') + 1);
    assert.deepEqual(Buffer.from(base64, 'base64'), png, 'o mapa chegou diferente do que saiu');
    assert.deepEqual(c.soltos, [arquivo], 'o arquivo escolhido não foi devolvido');
  });
  test('MESA: a ficha inteira se edita e grava, e o rascunho sobrevive à consulta', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    for (const chave of ['f-name', 'f-className', 'f-level', 'f-ac', 'a-str', 'f-inventory']) {
      assert.ok(naMesa(c).has(chave), `a ficha não trouxe «${chave}»`);
    }
    c.fire({ nome: 'campo', chave: 'f-className', valor: 'Ladina' });
    c.fire({ nome: 'campo', chave: 'f-level', valor: '3' });
    c.fire({ nome: 'campo', chave: 'a-dex', valor: '17' });
    c.fire({ nome: 'campo', chave: 'f-inventory', valor: 'Corda, gazua' });
    await settle();

    // O relógio bate no meio da edição, a cada dois segundos.
    c.tick(); await settle();
    assert.equal(naMesa(c).get('f-className').valor, 'Ladina', 'a consulta apagou a edição');

    c.fire({ nome: 'botao', chave: 'gravar-ficha' }); await settle(); await settle();
    const salva = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    assert.equal(salva.className, 'Ladina');
    assert.equal(salva.level, 3);
    assert.equal(salva.abilities.dex, 17);
    assert.equal(salva.inventory, 'Corda, gazua');
  });
  test('MESA: pintar parede troca a casa, e não move a peça que está nela', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    w.escritaDireta({ op: 'token-add', scene: id, name: 'Chefe', x: 3, y: 3 });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    c.fire({ nome: 'botao', chave: 'modo-parede' }); await settle();
    // Em cima da peça, de propósito: quem pinta parede quer pintar ali também.
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: 26 * 3 + 5, y: 26 * 3 + 5, alvo: 'peca:token-2' });
    await settle(); await settle();
    const comParede = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id);
    assert.deepEqual(comParede.walls, [{ x: 3, y: 3 }], 'a parede não foi pintada');
    assert.equal(comParede.tokens[0].x, 3, 'a peça se moveu enquanto se pintava parede');

    // O mesmo toque de novo tira a parede.
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: 26 * 3 + 5, y: 26 * 3 + 5, alvo: null });
    await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).walls.length, 0);

    // E sair do modo devolve o arraste.
    c.fire({ nome: 'botao', chave: 'modo-parede' }); await settle();
    const tela = [...naMesa(c).values()].find(n => n.forma === 'tela');
    const peca = tela.figuras.find(f => String(f.chave || '').startsWith('peca:'));
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: peca.x, y: peca.y, alvo: peca.chave });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 26 * 6, y: 26 * 6, alvo: peca.chave });
    await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).tokens[0].x, 6);
  });
  test('MESA: trilha da mesa e da cena, e verbete do compêndio', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    c.fire({ nome: 'escolha', chave: 'trilha-mesa', valor: 'battle' });
    await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.music.preset, 'battle');

    c.fire({ nome: 'escolha', chave: 'trilha', valor: 'mystery' });
    await settle(); await settle();
    assert.equal(
      w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).ambience,
      'mystery',
    );

    c.fire({ nome: 'campo', chave: 'nova-entrada', valor: 'Poção de cura' }); await settle();
    c.fire({ nome: 'botao', chave: 'criar-entrada' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.entries.at(-1).name, 'Poção de cura');
  });
  test('MESA: o retrato de uma ficha é enviado e aparece', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(9000, 5),
    ]);
    const arquivo = c.escolher('retrato', png);
    for (let i = 0; i < 60; i++) await settle();

    const comRetrato = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    assert.ok(comRetrato.portrait, 'o retrato não foi publicado: ' + oQueAMesaDiz(c));
    const lido = w.call({ op: 'portrait-asset', sheet: ficha.id }, '1');
    const base64 = lido.image.slice(lido.image.indexOf(',') + 1);
    assert.deepEqual(Buffer.from(base64, 'base64'), png, 'o retrato chegou diferente');
    assert.deepEqual(c.soltos, [arquivo], 'o arquivo escolhido não foi devolvido');

    // E ele aparece na ficha, vindo do servidor deste MOD.
    c.tick(); await settle();
    const midia = [...naMesa(c).values()].find(n => n.forma === 'midia' && String(n.chave).startsWith('retrato:'));
    assert.ok(midia, 'o retrato não foi montado na ficha');
    assert.equal(midia.doServidor.pedido.op, 'portrait-asset');
  });
  test('MESA: espaços de magia, preparar e conjurar gastam o espaço', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    w.escritaDireta({ op: 'entry-save', name: 'Míssil', kind: 'magia', level: 1, published: true });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    const magia = w.call({ op: 'view' }, '1').campaign.entries.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    // Os espaços são editáveis, nível a nível.
    assert.ok(naMesa(c).has('s-0'), 'não há campo de espaços de nível 1');
    c.fire({ nome: 'campo', chave: 's-0', valor: '2' }); await settle();
    c.fire({ nome: 'botao', chave: 'magia-' + magia.id }); await settle();
    c.fire({ nome: 'botao', chave: 'gravar-ficha' }); await settle(); await settle();

    const salva = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    assert.equal(salva.slots[0].max, 2, 'os espaços não foram gravados');
    assert.ok(salva.spells.includes(magia.id), 'a magia não foi preparada');

    // Conjurar gasta um espaço, e o servidor é quem conta.
    c.tick(); await settle();
    c.fire({ nome: 'botao', chave: 'conjurar-' + magia.id }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).slots[0].used, 1);

    // E o descanso longo devolve tudo.
    c.fire({ nome: 'botao', chave: 'descansar' }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).slots[0].used, 0);
  });
  test('MESA: ações com fórmula, usos e recuperação se criam, usam e saem', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    c.fire({ nome: 'campo', chave: 'ac-name', valor: 'Adaga' });
    c.fire({ nome: 'campo', chave: 'ac-formula', valor: '1d4+2' });
    c.fire({ nome: 'campo', chave: 'ac-max', valor: '2' });
    c.fire({ nome: 'escolha', chave: 'ac-recharge', valor: 'long' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar-acao' }); await settle(); await settle();

    const comAcao = w.call({ op: 'view' }, '1').campaign.sheets.at(-1).actions.at(-1);
    assert.equal(comAcao.name, 'Adaga');
    assert.equal(comAcao.formula, '1d4+2');
    assert.equal(comAcao.max, 2);
    assert.equal(comAcao.recharge, 'long');

    c.tick(); await settle();
    c.fire({ nome: 'botao', chave: 'usar-acao-' + comAcao.id }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).actions.at(-1).used, 1);

    c.fire({ nome: 'botao', chave: 'tirar-acao-' + comAcao.id }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.sheets.at(-1).actions.length, 0);
  });
  test('MESA: um verbete se edita e se publica', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    c.fire({ nome: 'campo', chave: 'v-name', valor: 'Poção' });
    c.fire({ nome: 'campo', chave: 'v-level', valor: '2' });
    c.fire({ nome: 'campo', chave: 'v-description', valor: 'Cura 2d4.' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar-verbete' }); await settle(); await settle();
    const criado = w.call({ op: 'view' }, '1').campaign.entries.at(-1);
    assert.equal(criado.name, 'Poção');
    assert.equal(criado.level, 2);
    assert.equal(criado.published, false, 'um verbete novo já nasceu publicado');

    c.tick(); await settle();
    c.fire({ nome: 'botao', chave: 'publicar-verbete-' + criado.id }); await settle(); await settle();
    assert.equal(w.call({ op: 'view' }, '1').campaign.entries.at(-1).published, true);

    // E editar um já existente muda o mesmo verbete, sem criar outro.
    c.tick(); await settle();
    c.fire({ nome: 'botao', chave: 'editar-verbete-' + criado.id }); await settle();
    assert.equal(naMesa(c).get('v-name').valor, 'Poção');
    c.fire({ nome: 'campo', chave: 'v-name', valor: 'Poção maior' }); await settle();
    c.fire({ nome: 'botao', chave: 'gravar-verbete' }); await settle(); await settle();
    const entradas = w.call({ op: 'view' }, '1').campaign.entries;
    assert.equal(entradas.length, 1, 'editar criou um verbete novo');
    assert.equal(entradas[0].name, 'Poção maior');
  });
  test('MESA: a cena se ajusta — grade, descrição e notas do GM', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    assert.ok(naMesa(c).has('c-cols'), 'não há ajuste de grade');
    c.fire({ nome: 'campo', chave: 'c-cols', valor: '30' });
    c.fire({ nome: 'campo', chave: 'c-rows', valor: '20' });
    c.fire({ nome: 'campo', chave: 'c-description', valor: 'Um salão longo.' });
    c.fire({ nome: 'campo', chave: 'c-notes', valor: 'Alçapão em 4,4.' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar-cena' }); await settle(); await settle();

    const salva = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id);
    assert.equal(salva.cols, 30);
    assert.equal(salva.rows, 20);
    assert.equal(salva.description, 'Um salão longo.');
    assert.equal(salva.notes, 'Alçapão em 4,4.');

    // E o tabuleiro acompanha a grade nova.
    c.tick(); await settle();
    const tela = [...naMesa(c).values()].find(n => n.forma === 'tela');
    assert.equal(tela.largura, 30 * 26, 'o tabuleiro não acompanhou a grade');
  });
  test('MESA: o tabuleiro é figura declarada, e arrastar uma peça a move no servidor', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' }).ok, true);
    assert.equal(w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '2' }).ok, true);
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    assert.equal(cena.ok, true);
    const id = cena.campaign.scenes.at(-1).id;
    const ficha = cena.campaign.sheets.at(-1).id;
    assert.equal(w.escritaDireta({ op: 'scene-show', id }).ok, true);
    assert.equal(w.escritaDireta({ op: 'token-add', scene: id, name: 'Iria', sheet: ficha, x: 2, y: 3 }).ok, true);
    // **Duas peças na mesma casa.** É aqui que `alvo` importa: sem ele, este
    // lado teria de adivinhar qual das duas o dedo pegou, e adivinharia pela
    // posição — que é igual para as duas. A que está por cima é a última
    // declarada, e é a que o produto entrega.
    assert.equal(w.escritaDireta({ op: 'token-add', scene: id, name: 'Sombra', x: 2, y: 3 }).ok, true);

    // O GM é a pessoa 1, e o cliente entra como ela: o GM move qualquer peça,
    // então a permissão de jogador não entra neste caso.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    const tela = [...naMesa(c).values()].find(n => n.forma === 'tela');
    assert.ok(tela, 'o tabuleiro não virou uma tela');
    const pecas = tela.figuras.filter(f => typeof f.chave === 'string' && f.chave.startsWith('peca:'));
    assert.equal(pecas.length, 2, 'as duas peças da mesma casa não foram declaradas');
    // A de cima é a última: o produto entrega a última declarada sob o dedo.
    const peca = pecas.at(-1);
    assert.equal(peca.tipo, 'circulo');
    assert.equal(pecas[0].x, peca.x, 'as duas peças não estão na mesma casa');
    assert.ok(tela.figuras.some(f => f.tipo === 'linha'), 'a grade não foi declarada');
    // A grade é linha, e linha não tem chave: pegá-la roubaria o toque da peça.
    assert.ok(tela.figuras.filter(f => f.tipo === 'linha').every(f => !f.chave));

    // Arrastar: pegar, mover e soltar. O produto diz **qual** peça foi pega.
    const antes = c.requests.length;
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: peca.x, y: peca.y, alvo: peca.chave });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'moveu', x: 26 * 7 + 13, y: 26 * 5 + 13, alvo: peca.chave });
    await settle();
    // O movimento **não** foi ao servidor: um pedido por ponto satura a fila.
    assert.equal(c.requests.length, antes, 'cada ponto do arraste foi ao servidor');
    const durante = [...naMesa(c).values()].find(n => n.forma === 'tela')
      .figuras.find(f => f.chave === peca.chave);
    assert.equal(durante.x, 26 * 7 + 13, 'a peça não acompanhou o dedo');

    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 26 * 7 + 13, y: 26 * 5 + 13, alvo: peca.chave });
    await settle(); await settle();
    const depois = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).tokens;
    const movida = depois.find(t => 'peca:' + t.id === peca.chave);
    assert.equal(movida.x, 7, 'a peça de cima não foi a que se moveu');
    assert.equal(movida.y, 5);
    // E a de baixo ficou onde estava.
    const parada = depois.find(t => 'peca:' + t.id === pecas[0].chave);
    assert.equal(parada.x, 2, 'moveu a peça de baixo');
  });
  test('MESA: a recusa do servidor devolve a peça e é dita', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    w.escritaDireta({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
    // Quem entra é a pessoa 2, que não é GM e não tem ficha nesta peça.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '2', canal) });
    await settle();
    await abrirMesa(c);
    const tela = [...naMesa(c).values()].find(n => n.forma === 'tela');
    const peca = tela.figuras.find(f => typeof f.chave === 'string' && f.chave.startsWith('peca:'));
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: peca.x, y: peca.y, alvo: peca.chave });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 26 * 9, y: 26 * 9, alvo: peca.chave });
    await settle(); await settle();
    assert.match(oQueAMesaDiz(c), /a peça não se move/);
    const gravada = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).tokens[0];
    assert.equal(gravada.x, 1, 'o servidor moveu uma peça que não era de quem arrastou');
  });
  // ---- o guarda de `invalid-id` ----
  //
  // A auditoria de 20/09/2026 reproduziu isolado: o pedido que o cliente
  // montava não tinha `nonce` nem `revision`, e o servidor recusa os dois
  // **antes** de qualquer escrita. Criar campanha devolvia `invalid-id` no
  // produto enquanto a suíte inteira ficava verde — porque era o **teste** que
  // completava os campos antes de chamar o servidor.
  //
  // Este caso olha o pedido como ele sai do cliente, e não o resultado: um
  // `escrever` que voltasse a omitir qualquer um dos dois falha aqui, e falha
  // dizendo qual campo faltou.
  test('MESA: o pedido que sai do cliente carrega nonce e revisão', async () => {
    const w = world();
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);

    c.fire({ nome: 'campo', chave: 'nova-campanha', valor: 'A Casa' });
    await settle();
    c.fire({ nome: 'botao', chave: 'criar-campanha' });
    await settle(); await settle();

    const criacao = c.requests.find(r => r.body.op === 'setup');
    assert.ok(criacao, 'CRIAR MESA não foi ao servidor');
    assert.match(String(criacao.body.nonce ?? ''), /^[a-z0-9-]{1,64}$/,
      'o pedido de criação saiu sem `nonce`, e o servidor recusa com invalid-id');
    // `setup` cria: não há revisão de que discordar, e mandá-la seria inventar.
    assert.equal('revision' in criacao.body, false,
      'a criação mandou `revision` para uma campanha que ainda não existe');
    assert.ok(w.call({ op: 'view' }, '1').campaign, 'a campanha não foi criada');

    // E a operação seguinte concorda com a revisão que o servidor tem agora.
    const antes = c.requests.length;
    c.fire({ nome: 'campo', chave: 'formula', valor: '2d6+3' });
    c.fire({ nome: 'botao', chave: 'rolar' });
    await settle(); await settle();
    const rolagem = c.requests.slice(antes).find(r => r.body.op === 'roll');
    assert.ok(rolagem, 'ROLAR não foi ao servidor');
    assert.match(String(rolagem.body.nonce ?? ''), /^[a-z0-9-]{1,64}$/,
      'a rolagem saiu sem `nonce`');
    assert.equal(rolagem.body.revision, w.call({ op: 'view' }, '1').campaign.revision - 1,
      'a rolagem não concordou com a revisão que o servidor tinha ao recebê-la');

    // Duas escritas não repetem a marca: o servidor guarda recibos, e repetir
    // a marca faria a segunda ser respondida com a projeção da primeira.
    assert.notEqual(criacao.body.nonce, rolagem.body.nonce);
  });
  // ---- o mapa é o fundo da tela, e não uma imagem ao lado dela ----
  //
  // A auditoria anotou: «O mapa é montado como mídia separada do canvas, em vez
  // de fundo sob as peças.» Um `<img>` ao lado de um `<canvas>` é um mapa que
  // não tem relação nenhuma com onde as peças estão — zoom, deslocamento e
  // coordenadas ficam em dois planos que ninguém alinha.
  test('MESA: o mapa entra como fundo do tabuleiro, e não ao lado dele', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });

    // Um mapa mínimo pelo caminho de sempre do servidor.
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const parte = w.escritaDireta({
      op: 'image-part', scene: id, upload: 'm1', total: 1, index: 0, part: png,
    });
    assert.equal(parte.ok, true, parte.error);

    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle(); await abrirMesa(c);

    const tela = [...naMesa(c).values()].find(n => n.forma === 'tela');
    assert.ok(tela, 'o tabuleiro não virou uma tela');
    assert.ok(tela.fundo, 'o mapa não entrou como fundo do tabuleiro: ' + JSON.stringify(tela));
    assert.equal(tela.fundo.doServidor.pedido.op, 'asset');
    assert.equal(tela.fundo.doServidor.pedido.scene, id);

    // E ele **não** é declarado uma segunda vez como mídia ao lado: duas
    // cópias da mesma imagem é o defeito que esta mudança existe para tirar.
    const midias = [...naMesa(c).values()].filter(n => n.forma === 'midia'
      && String(n.chave || '').startsWith('cena:'));
    assert.equal(midias.length, 0,
      'o mapa continua sendo declarado ao lado do tabuleiro: ' + JSON.stringify(midias));
  });

  // ---- a trilha escolhida passou a tocar ----
  //
  // «As escolhas de trilha alteram estado no servidor, mas o cliente atual não
  // declara tocador de som.» O estado ia e ninguém ouvia nada.
  test('MESA: a trilha escolhida vira um tocador com o arquivo do pacote', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle(); await abrirMesa(c);

    // Sem trilha, não há tocador: silêncio não é um som.
    assert.ok(!oQueAMesaDiz(c).includes('"trilha:'), 'declarou tocador sem trilha escolhida');

    c.fire({ nome: 'escolha', chave: 'trilha-mesa', valor: 'battle' });
    await assentar(20);

    const tocador = [...naMesa(c).values()].find(n => String(n.chave || '').startsWith('trilha:'));
    assert.ok(tocador, 'a trilha escolhida não virou tocador: ' + oQueAMesaDiz(c));
    assert.equal(tocador.forma, 'midia');
    // **Do pacote, e não de um endereço.** A janela de quem joga não busca
    // bytes na rede de ninguém, e o manifesto é quem autoriza o arquivo.
    assert.ok(tocador.fonte, 'o tocador não nomeou um arquivo do pacote');
    assert.ok(manifest.arquivos.includes(tocador.fonte),
      'o tocador nomeou um arquivo que o manifesto não declara: ' + tocador.fonte);
    assert.doesNotMatch(JSON.stringify(tocador), /https?:/);
    assert.equal(tocador.tocando, true, 'a trilha foi escolhida e não começou a tocar');
  });

  // ---- a degradação é explícita, e ela é testada ----
  test('MESA: sem superfícies, a faixa volta a ser a mesa inteira', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const c = client(w, {
      semApi4: true,
      request: (_i, canal, corpo) => w.call(corpo, '1', canal),
    });
    await settle();
    assert.equal(c.errors.length, 0,
      'o MOD falhou num SEELE sem superfícies: ' + JSON.stringify(c.errors));
    assert.match(content(c), /Casa/, 'a faixa não voltou a desenhar a mesa');
    assert.ok(c.controles().has('rolar'), 'a faixa não voltou a oferecer os dados');
    assert.equal(c.contribuicoes.length, 0, 'registrou contribuição num SEELE que não as tem');
  });

  // ---- a edição não atravessa a troca de canal ----
  //
  // Um dos riscos que a auditoria de 20/09/2026 mandou reproduzir: «Rascunhos e
  // respostas em voo atravessando mudança de canal […] Prender abertura/edição
  // à entidade e ao canal de origem.»
  //
  // Uma campanha é por canal. Continuar com a ficha `sheet-3` aberta depois de
  // trocar de canal é ter aberta a ficha de **outra mesa**, com o mesmo número
  // — e editá-la é escrever na mesa errada.
  test('MESA: trocar de canal larga o que estava sendo editado', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'A Casa', system: 'free', gm: '1' });
    w.escritaDireta({ op: 'sheet-create', name: 'Iria', owner: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle(); await abrirMesa(c);

    // Uma ficha aberta e um nome de cena por escrever.
    await naAba(c, 'fichas');
    const abrir = [...naMesa(c).keys()].find(k => k.startsWith('abrir-ficha-'));
    assert.ok(abrir, 'não há ficha para abrir: ' + oQueAMesaDiz(c));
    c.fire({ nome: 'botao', chave: abrir });
    await assentar();
    assert.match(oQueAMesaDiz(c), /Iria/);

    await naAba(c, 'tabuleiro');
    c.fire({ nome: 'campo', chave: 'nova-cena', valor: 'Salão desta mesa' });
    await assentar();
    assert.equal(naMesa(c).get('nova-cena').valor, 'Salão desta mesa');

    // **O canal 2 tem uma mesa também**, e é isso que torna o caso um caso: com
    // o canal vazio, os rascunhos não seriam desenhados de qualquer jeito, e o
    // teste passaria sem medir nada.
    w.escritaDireta({ op: 'setup', name: 'A Outra', system: 'free', gm: '1' }, '1', 2);
    w.escritaDireta({ op: 'sheet-create', name: 'Outra ficha', owner: '1' }, '1', 2);

    c.snapshot.open_channel = 2;
    c.tick();
    await assentar(20);

    // Chegou na mesa do canal 2.
    assert.match(oQueAMesaDiz(c), /A Outra/, 'a página não acompanhou a troca de canal');

    // E o que estava sendo editado ficou para trás.
    assert.doesNotMatch(oQueAMesaDiz(c), /Salão desta mesa/,
      'o nome de cena de uma mesa apareceu noutro canal');
    assert.doesNotMatch(oQueAMesaDiz(c), /Iria/,
      'a ficha de uma mesa continuou aberta noutro canal');
  });

  test('MESA: rolar dados vai ao servidor com a fórmula digitada', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    c.fire({ nome: 'campo', chave: 'formula', valor: '2d6+3' });
    c.fire({ nome: 'botao', chave: 'rolar' });
    await settle(); await settle();
    const rolagem = c.requests.find(r => r.body.op === 'roll');
    assert.ok(rolagem, 'ROLAR não foi ao servidor');
    assert.equal(rolagem.body.formula, '2d6+3');
    assert.match(oQueAMesaDiz(c), /Dados/);
  });
  test('MESA: um toque no vazio do tabuleiro não move peça nenhuma', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    w.escritaDireta({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrirMesa(c);
    const antes = c.requests.length;
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: 300, y: 300, alvo: null });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 300, y: 300, alvo: null });
    await settle(); await settle();
    assert.equal(c.requests.length, antes, 'um toque no vazio mandou pedido ao servidor');
  });
}
if (manifest.id === 'seele/perfis') {
  // ---- a faixa deixou de ser tudo (U01, U20) ----
  //
  // A auditoria de 20/09/2026 mediu que editar um perfil exigia «rolar um
  // rodapé» de 240px, com «Sobre mim» num input de uma linha. A faixa agora
  // carrega o que cabe numa linha — quem você é, e a porta para o resto —, e a
  // atividade acontece numa superfície própria.
  test('PERFIS: a faixa vira uma linha, e o diretório é uma página', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: '<img src=x>', pronouns: 'ela/dela', bio: 'Minha bio', status: 'Presente', accent: '#a78bfa', effect: 'aurora' } }, '2').ok, true);
    const before = JSON.stringify(w.data), c = client(w); await settle();

    // A faixa não lista mais todo mundo: ela tem a porta.
    const naFaixa = c.controles();
    assert.ok(naFaixa.has('abrir-diretorio'), 'a faixa não tem porta para o diretório');
    assert.ok(naFaixa.has('abrir-editor'), 'a faixa não tem porta para o editor');

    // E a entrada na navegação do servidor existe: é o gesto que U03 pediu.
    const entradas = c.entradas();
    assert.equal(entradas.length, 1, 'o MOD não registrou entrada de navegação');
    assert.equal(entradas[0].rotulo, 'Perfis');

    // Abrir o diretório **não** vai ao servidor: os perfis já estão na mão.
    const antes = c.requests.length;
    c.agir('abrir-diretorio'); await assentar();
    assert.equal(c.requests.length, antes, 'abrir o diretório foi ao servidor');
    const diretorio = JSON.stringify(c.superficie('perfis-diretorio'));
    assert.ok(diretorio, 'o diretório não foi montado numa superfície');
    assert.match(diretorio, /<img src=x>/);
    assert.equal(JSON.stringify(w.data), before, 'abrir o diretório escreveu no servidor');
  });

  test('PERFIS: o editor é um diálogo, com bio multilinha, cor e prévia', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();

    const controles = c.controlesDe('perfis-editor');
    assert.ok(controles.size, 'o editor não abriu numa superfície');

    // U20: «"Sobre mim" é input de uma linha.» Agora é `textoLongo`.
    assert.equal(controles.get('bio')?.forma, 'textoLongo',
      'a biografia voltou a ser um campo de uma linha');
    // U23 pediu seletor de cor para o ESTILO; a mesma razão vale aqui.
    assert.equal(controles.get('accent')?.forma, 'cor',
      'a cor voltou a ser um campo de texto hexadecimal');

    // A prévia existe, e ela usa o **mesmo** desenho do cartão: duas funções
    // de desenho seriam duas verdades sobre o mesmo cartão.
    assert.match(JSON.stringify(c.superficie('perfis-editor')), /PRÉVIA/);

    // E o diálogo é um diálogo de verdade: ele pede confirmação ao fechar com
    // alteração pendente, em vez de descartar em silêncio.
    const tela = c.superficies.get('perfis-editor');
    assert.equal(tela.descricao.fecharComAlteracoes, 'confirmar');
    assert.equal(tela.suja, false, 'nasceu suja sem ninguém ter editado');
    c.fire({ nome: 'campo', chave: 'bio', valor: 'Escrito agora.' });
    await assentar();
    assert.equal(tela.suja, true, 'editar não marcou o diálogo como sujo');
  });

  test('PERFIS: o cartão apresenta a identidade — retrato, cor e efeito', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: 'Lia da Torre', pronouns: 'ela/dela', status: 'jogando', bio: '', accent: '#a78bfa', effect: 'aurora' } }, '2').ok, true);
    const c = client(w); await settle();

    const cartoes = c.cartoes();
    const meu = cartoes['2'];
    assert.ok(meu, 'a pessoa 2 não ganhou cartão: ' + JSON.stringify(cartoes));
    const textos = JSON.stringify(meu);
    assert.match(textos, /Lia da Torre/, 'o nome exibido não entrou: ' + textos);
    assert.match(textos, /ela\/dela/, 'o pronome não entrou: ' + textos);
    assert.match(textos, /jogando/, 'o status não entrou: ' + textos);

    // **U27 pelo nome.** A cor e o efeito eram lidos e gravados e não apareciam
    // em lugar nenhum da árvore visual. Agora a cor é a borda do retrato e o
    // efeito é a animação dele.
    assert.match(textos, /#a78bfa/, 'a cor escolhida continua sem aparecer: ' + textos);
    assert.match(textos, /"animacao"/, 'o efeito escolhido continua sem aparecer: ' + textos);
    assert.ok(meu.some(() => true) && textos.includes('"retrato"'),
      'o cartão não tem retrato: ' + textos);

    // **Quem não escreveu nada não ganha cartão.** Uma moldura vazia ao lado
    // de um nome é o produto anunciando uma ausência que ninguém pediu.
    assert.equal(cartoes['1'], undefined, 'quem não tem perfil ganhou um cartão vazio');
    assert.equal(c.cartoesPedidos()['1'], undefined, 'o MOD pediu cartão para quem não escreveu nada');
  });

  test('PERFIS: o cartão substitui a apresentação, e o clique é do produto', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: 'Lia', pronouns: 'ela/dela', status: '', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    const c = client(w); await settle();

    // A substituição é registrada como contribuição, e não adivinhada pelo
    // produto a partir de haver cartão.
    const cartao = c.contribuicoes.find(x => x.ponto === 'pessoa.cartao');
    assert.ok(cartao, 'o MOD não registrou a substituição do cartão');
    assert.equal(cartao.modo, 'substituir');
    assert.ok(cartao.acaoPrincipal, 'o cartão ficou sem ação de clique');

    // **Nada que receba foco ou clique dentro dele.** A linha do roster já tem
    // um botão do produto; o clique do cartão é montado em volta da
    // declaração, pelo produto, ligado ao ID real.
    const pedido = JSON.stringify(c.cartoesPedidos());
    for (const proibida of ['"botao"', '"campo"', '"escolha"', '"arquivo"', '"tela"', '"link"']) {
      assert.ok(!pedido.includes(proibida), `o cartão declarou ${proibida}: ` + pedido);
    }

    // E o clique chega com o ID que o produto escreveu, não com o texto do MOD.
    c.agir(cartao.acaoPrincipal, '1'); await assentar();
    assert.ok(c.superficie('perfis-detalhes'), 'clicar no cartão de outra pessoa não abriu o perfil dela');
    assert.match(JSON.stringify(c.superficie('perfis-detalhes')), /ID 1/);
  });

  test('PERFIS: clicar no próprio cartão abre o editor, e não a leitura', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-perfil', '2'); await assentar();
    assert.ok(c.superficie('perfis-editor'), 'o próprio cartão abriu a leitura em vez do editor');
  });

  test('PERFIS: o retrato do cartão vem do servidor deste MOD, e nunca de um endereço', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: '', pronouns: 'elu/delu', status: '', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    // Sem retrato guardado, o cartão traz a inicial e nenhuma origem de bytes.
    let c = client(w); await settle();
    assert.ok(!JSON.stringify(c.cartoesPedidos()).includes('doServidor'),
      'declarou origem de bytes sem haver retrato');

    // Com retrato, ele vem por `doServidor` — a única origem que a API aceita.
    const store = JSON.parse(w.data.profiles);
    store['2'].avatar = 'perfis/2/avatar';
    w.data.profiles = JSON.stringify(store);
    c = client(w); await settle();
    const pedido = JSON.stringify(c.cartoesPedidos()['2'] ?? []);
    assert.match(pedido, /"doServidor"/, 'o retrato não entrou no cartão: ' + pedido);
    assert.match(pedido, /"slot":"avatar"/);
    assert.ok(!pedido.includes('"fonte"') && !pedido.includes('"url"'),
      'o retrato ganhou uma segunda origem: ' + pedido);
  });

  test('PERFIS: sair do canal tira os cartões da lista', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: '', pronouns: 'ela/dela', status: '', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    const c = client(w); await settle();
    assert.ok(c.cartoes()['2'], 'o cartão não chegou à lista');
    // Fora de canal não há perfil de ninguém: um cartão de antes seria uma
    // afirmação sobre gente que este MOD não está mais vendo.
    c.snapshot.open_channel = null;
    c.snapshot.channels = [];
    c.tick(); await settle();
    assert.deepEqual(c.cartoes(), {}, 'o cartão sobreviveu à saída do canal: ' + JSON.stringify(c.cartoes()));
  });

  test('PERFIS: editar e gravar muda o perfil, e a recusa do servidor é dita', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();
    c.fire({ nome: 'campo', chave: 'displayName', valor: 'Lia' });
    c.fire({ nome: 'campo', chave: 'bio', valor: 'Joga de longe.' });
    c.fire({ nome: 'escolha', chave: 'effect', valor: 'sparkle' });
    await assentar();
    assert.equal(c.controlesDe('perfis-editor').get('displayName').valor, 'Lia');
    assert.equal(c.controlesDe('perfis-editor').get('gravar').desligado, false);

    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);
    const salvo = w.call({ op: 'view', people: ['2'] }, '2').profiles['2'];
    assert.equal(salvo.displayName, 'Lia');
    assert.equal(salvo.effect, 'sparkle');

    // ---- a recusa do servidor não pode custar o que foi escrito ----
    //
    // **A cor inválida deixou de chegar ao servidor**, e isso é o conserto de
    // U23 funcionando: o controle é um seletor, e um seletor não produz
    // «roxo». O que ainda chega são as recusas que só o servidor conhece —
    // revisão trocada, permissão, limite —, e é essa que este caso exercita.
    //
    // O que importa é o mesmo de antes: a frase aparece onde a pessoa apertou,
    // e o rascunho continua no formulário para ser corrigido.
    c.fire({ nome: 'campo', chave: 'bio', valor: 'Um texto que vale a pena não perder.' });
    await assentar();
    // Outra janela gravou no meio: a revisão que este lado tem ficou velha.
    assert.equal(w.escritaDireta({
      op: 'save', revision: 1,
      profile: { displayName: 'Outra', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'none' },
    }, '2').ok, true);
    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);
    const dito = JSON.stringify(c.superficie('perfis-editor'));
    assert.match(dito, /outra janela/i,
      'a recusa do servidor não chegou a quem editava: ' + dito);
    assert.equal(
      c.controlesDe('perfis-editor').get('bio').valor,
      'Um texto que vale a pena não perder.',
      'o que foi escrito sumiu com a recusa',
    );
  });

  test('PERFIS: a imagem vem do servidor deste MOD, e nunca de um endereço', async () => {
    const w = world();
    // Um PNG mínimo, pelo caminho de sempre do servidor: `upload-start` e um
    // fragmento só, com o prefixo que o servidor exige ver no primeiro.
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const inicio = w.escritaDireta({ op: 'upload-start', slot: 'avatar', length: png.length }, '2');
    assert.equal(inicio.ok, true, inicio.error);
    const parte = w.escritaDireta({ op: 'upload-part', slot: 'avatar', token: inicio.token, index: 0, part: png }, '2');
    assert.equal(parte.ok, true, parte.error);
    assert.equal(parte.finished, true, 'o upload do vetor não completou');
    const c = client(w); await settle();
    c.agir('abrir-perfil', '2'); await assentar();
    const arvore = JSON.stringify(c.superficie('perfis-editor'));
    assert.match(arvore, /"doServidor"/, 'a ficha não montou a imagem do servidor');
    assert.match(arvore, /"op":"asset"/);
    // Nenhuma forma da API carrega endereço, e é isso que impede a janela de
    // quem conversa de buscar bytes na rede de um estranho.
    assert.doesNotMatch(arvore, /https?:/);
  });

  test('PERFIS: a pessoa escolhe uma imagem e ela chega inteira ao servidor', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();

    // Um PNG de verdade, maior que um fragmento e que um pedaço do produto:
    // é o único jeito de provar que a junção dos pedaços não perde nada.
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(70000, 7),
    ]);
    const id = c.escolher('avatar', png);
    for (let i = 0; i < 120; i++) await settle();

    const perfil = w.call({ op: 'view', people: ['2'] }, '2').profiles['2'];
    assert.ok(perfil.avatar, 'o retrato não foi publicado: ' + content(c));

    // E os bytes que chegaram são os que saíram.
    const lido = w.call({ op: 'asset', person: '2', slot: 'avatar' }, '2');
    let uri = lido.image, proximo = lido.proximo;
    while (proximo) {
      const mais = w.call({ op: 'asset', person: '2', slot: 'avatar', ...proximo }, '2');
      uri += mais.image; proximo = mais.proximo;
    }
    const base64 = uri.slice(uri.indexOf(',') + 1);
    assert.deepEqual(Buffer.from(base64, 'base64'), png, 'a imagem chegou diferente do que saiu');

    // **Devolvido na hora**, sem esperar a saída da sessão.
    assert.deepEqual(c.soltos, [id], 'o arquivo escolhido não foi devolvido');
  });

  // ---- o rascunho pertence à pessoa, e não ao momento (U26) ----
  //
  // `FECHAR` apagava `rascunho`. Quem escrevesse a biografia e fechasse a
  // ficha — de propósito ou sem querer — perdia o que escreveu, em silêncio.
  // O conserto amarra o rascunho à entidade: fechar guarda, e só `DESCARTAR`
  // — explícito e confirmado — joga fora.
  test('PERFIS: fechar o editor não apaga o que foi escrito; descartar pede confirmação', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();

    c.fire({ nome: 'campo', chave: 'bio', valor: 'Uma biografia longa que custou a ser escrita.' });
    await assentar();
    assert.equal(c.controlesDe('perfis-editor').get('bio').valor,
      'Uma biografia longa que custou a ser escrita.');

    // Fecha e reabre: o que estava escrito continua lá. Quem fecha é o host —
    // pelo botão que **ele** monta —, e o MOD é avisado.
    c.fire({ nome: 'fechar', superficie: 'perfis-editor', porque: 'saida-do-produto' });
    await assentar();
    c.agir('abrir-editor'); await assentar();
    assert.equal(
      c.controlesDe('perfis-editor').get('bio').valor,
      'Uma biografia longa que custou a ser escrita.',
      'fechar o editor apagou o que tinha sido escrito e não gravado',
    );

    // E descartar não joga fora no primeiro toque: ele pergunta.
    c.fire({ nome: 'botao', chave: 'descartar' }); await assentar();
    assert.match(JSON.stringify(c.superficie('perfis-editor')), /Aperte de novo para confirmar/,
      'descartar apagou sem perguntar');
    assert.equal(
      c.controlesDe('perfis-editor').get('bio').valor,
      'Uma biografia longa que custou a ser escrita.',
      'o primeiro DESCARTAR já apagou o rascunho',
    );

    // No segundo, sim.
    c.fire({ nome: 'botao', chave: 'descartar' }); await assentar();
    assert.equal(c.controlesDe('perfis-editor').get('bio').valor, '',
      'confirmar o descarte não apagou');
  });

  // ---- o arquivo volta mesmo quando o envio falha ----
  //
  // Um dos riscos que a auditoria de 20/09/2026 mandou reproduzir: «MESA chama
  // `soltar` apenas depois do laço bem-sucedido. Verificar liberação em
  // `finally`.» O mesmo valia aqui.
  //
  // Sem ele, um envio que falha no meio — fragmento recusado, revisão trocada,
  // disco cheio do outro lado — deixava os bytes presos no produto até a saída
  // da sessão. Dez megabytes segurados por um caminho de erro que ninguém
  // percorre de propósito.
  test('PERFIS: um envio que falha no meio devolve o arquivo assim mesmo', async () => {
    const w = world();
    let quantos = 0;
    const c = client(w, {
      request: (_id, canal, corpo) => {
        // O primeiro `upload-part` falha. O `upload-start` antes dele passa,
        // então o envio já começou quando o erro chega — que é o caso.
        if (corpo.op === 'upload-part') {
          quantos += 1;
          if (quantos === 1) return Promise.reject(new Error('disco-cheio'));
        }
        return w.call(corpo, '2', canal);
      },
    });
    await settle();
    c.agir('abrir-editor'); await assentar();

    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(20000, 3),
    ]);
    const id = c.escolher('avatar', png);
    await assentar(60);

    assert.deepEqual(c.soltos, [id],
      'o envio falhou e o arquivo ficou preso no produto até a saída da sessão');
    assert.match(JSON.stringify(c.superficie('perfis-editor')), /disco-cheio/,
      'a falha do envio não chegou a quem apertou');
  });

  test('PERFIS: cancelar o seletor é neutro; falhar é dito', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();
    const antes = c.requests.length;

    // Cancelou: não vai ao servidor e não acusa nada na tela.
    c.fire({ nome: 'arquivo', chave: 'avatar', arquivo: null, resultado: 'cancelado' });
    await assentar();
    assert.equal(c.requests.length, antes, 'cancelar foi ao servidor');
    assert.doesNotMatch(JSON.stringify(c.superficie('perfis-editor')), /nenhum arquivo escolhido/,
      'cancelar continua deixando um aviso onde não há nada errado');

    // Falhou: o motivo do produto aparece onde a pessoa apertou.
    c.fire({
      nome: 'arquivo', chave: 'avatar', arquivo: null,
      resultado: 'falhou', porque: 'papel-nao-serve:som',
    });
    await assentar();
    assert.equal(c.requests.length, antes, 'uma falha foi ao servidor');
    assert.match(JSON.stringify(c.superficie('perfis-editor')), /papel-nao-serve:som/,
      'a falha do seletor não chegou a quem apertou');
  });

  test('PERFIS: um som escolhido no lugar de uma imagem é recusado pelo nome', async () => {
    const w = world();
    const c = client(w); await settle();
    c.agir('abrir-editor'); await assentar();
    const id = c.escolhidos.size + 1;
    c.escolhidos.set(id, Buffer.alloc(16));
    c.fire({
      nome: 'arquivo', chave: 'avatar',
      arquivo: { id, tipo: 'audio/wav', papel: 'som', bytes: 16 },
    });
    for (let i = 0; i < 12; i++) await settle();
    assert.match(JSON.stringify(c.superficie('perfis-editor')), /Escolha uma imagem/);
  });

  test('PERFIS: consulta pessoas em lotes de no máximo 32', async () => {
    const c = client(world()); await settle();
    c.snapshot.presentes = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, nickname: 'Mesmo nome' }));
    c.requests.length = 0; c.tick(); await settle();
    assert.deepEqual(c.requests.map(r => r.body.people.length), [32, 32, 6]);
    assert.match(content(c), /70 pessoa\(s\)/);
  });

  // ---- a degradação é explícita, e ela é testada ----
  //
  // Um SEELE de API 3 não oferece superfícies. O MOD não pode falhar nele: ele
  // volta a desenhar a lista inteira na faixa, que era tudo o que havia.
  test('PERFIS: sem superfícies, a faixa volta a ser o diretório', async () => {
    const w = world();
    const c = client(w, { semApi4: true }); await settle();
    assert.equal(c.errors.length, 0, 'o MOD falhou num SEELE sem superfícies: ' + JSON.stringify(c.errors));
    assert.match(content(c), /ID 2/, 'a faixa não voltou a listar as pessoas');
    assert.equal(c.contribuicoes.length, 0, 'registrou contribuição num SEELE que não as tem');
  });
}
if (manifest.id === 'seele/estilo') {
  /** Abre a página de aparência e espera ela assentar. */
  const abrir = async c => { c.agir('abrir-aparencia'); await assentar(); };
  /** Os controles da página, e não os da faixa. */
  const naPagina = c => c.controlesDe('estilo-aparencia');
  const oQueAPaginaDiz = c => JSON.stringify(c.superficie('estilo-aparencia'));

  test('ESTILO: os seis tokens, densidade, fonte, raio e brilho; reset libera a camada', async () => {
    const w = world(), initial = w.call({ op: 'view' });
    assert.equal(w.escritaDireta({ op: 'save', theme: initial.theme, revision: 0 }).ok, true);
    const before = JSON.stringify(w.data), c = client(w); await settle();
    assert.deepEqual(c.themes[0], {
      acento: initial.theme.accent, fundo: initial.theme.background,
      painel: initial.theme.panel, texto: initial.theme.text,
      apagado: initial.theme.muted, borda: initial.theme.border,
      densidade: initial.theme.density === 'comfortable' ? 'confortavel' : 'compacta',
      fonte: initial.theme.font === 'sans' ? 'sans' : 'mono',
      // Número e booleano, e não texto: a API confere o tipo, escreve o `px` e
      // monta a sombra. Um `'0px'` aqui seria este MOD escrevendo CSS.
      arredondamento: initial.theme.radius,
      brilho: initial.theme.glow,
    });
    assert.equal(typeof initial.theme.radius, 'number', 'o raio deixou de ser número');
    assert.equal(typeof initial.theme.glow, 'boolean', 'o brilho deixou de ser booleano');
    assert.equal(JSON.stringify(w.data), before);
    c.tick(); await settle(); assert.equal(c.themes.length, 1);
    assert.equal(w.escritaDireta({ op: 'reset', revision: 1 }).ok, true);
    c.tick(); await settle(); assert.deepEqual(c.themes.at(-1), {});
  });

  test('ESTILO: recusa do produto é mostrada e não confirma aplicação', async () => {
    const w = world(), initial = w.call({ op: 'view' }); w.escritaDireta({ op: 'save', theme: initial.theme, revision: 0 });
    let fail = true;
    const c = client(w, { tema: async () => { if (fail) throw Error('acento já é do MOD outro/tema'); } });
    await settle();
    assert.match(content(c), /outro\/tema/); assert.equal(c.themes.length, 0);
    fail = false; c.tick(); await settle();
    assert.equal(c.themes.length, 1,
      'a segunda tentativa não aplicou depois de o produto voltar a aceitar');
  });

  // ---- a aparência virou uma página (U01, U23) ----
  //
  // A auditoria mediu seis campos de hexadecimal num rodapé de 240px, sem
  // seletor e sem amostra, para uma decisão que vale para todo mundo no
  // servidor. Agora a faixa diz o estado e abre a porta; a decisão acontece
  // numa página com seletores, amostras e presets.
  test('ESTILO: a faixa vira uma linha, e a aparência é uma página', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();

    assert.ok(c.controles().has('abrir-aparencia'), 'a faixa não tem porta para a aparência');
    const entradas = c.entradas();
    assert.equal(entradas.length, 1, 'o MOD não registrou entrada de navegação');
    assert.equal(entradas[0].rotulo, 'Aparência do servidor');

    await abrir(c);
    const controles = naPagina(c);
    // U23: «ESTILO usa inputs de hexadecimal em vez de seletor e amostra.»
    assert.equal(controles.get('accent')?.forma, 'cor',
      'o destaque voltou a ser um campo de texto hexadecimal');
    assert.ok(controles.has('density'), 'não há escolha de densidade');
    // As abas existem, e a de conjuntos também: U04 pediu grupos, e o §2 do
    // plano pediu presets pelo nome.
    assert.match(oQueAPaginaDiz(c), /"forma":"abas"/);
    assert.match(oQueAPaginaDiz(c), /CONJUNTOS/);
  });

  test('ESTILO: quem administra edita e publica, e o que o MOD não edita é preservado', async () => {
    const w = world(); const inicial = w.call({ op: 'view' });
    // `world()` faz a pessoa 1 ser administradora, e o cliente entra como 2.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    assert.equal(naPagina(c).get('gravar').desligado, true, 'PUBLICAR começa ligado sem nada mudado');

    // A pessoa escolhe uma cor nova. A tela acompanha **sem** ir ao servidor.
    const pedidosAntes = c.requests.length;
    c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' });
    await assentar();
    assert.equal(c.requests.length, pedidosAntes, 'escolher uma cor foi ao servidor');
    assert.equal(naPagina(c).get('accent').valor, '#6bffb6');
    assert.equal(naPagina(c).get('gravar').desligado, false, 'PUBLICAR não ligou com a mudança');

    // **A prévia é local.** O tema aplicado nesta sessão já é o rascunho, e
    // nada disso saiu daqui: é o que U23 chamou de «prévia local separada de
    // publicar para o servidor».
    assert.equal(c.themes.at(-1).acento, '#6bffb6',
      'a prévia não aplicou a cor escolhida na sessão de quem edita');
    assert.equal(w.call({ op: 'view' }).theme.accent, inicial.theme.accent,
      'a prévia escreveu no servidor');

    // E as escolhas de forma entram no mesmo rascunho, na aba de forma.
    c.fire({ nome: 'aba', chave: 'aba', valor: 'forma' });
    await assentar();
    c.fire({ nome: 'escolha', chave: 'density', valor: 'comfortable' });
    c.fire({ nome: 'escolha', chave: 'font', valor: 'sans' });
    await assentar();
    assert.equal(naPagina(c).get('density').valor, 'comfortable');
    assert.equal(naPagina(c).get('font').valor, 'sans');

    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);
    const gravado = w.call({ op: 'view' }).theme;
    assert.equal(gravado.accent, '#6bffb6');
    assert.equal(gravado.density, 'comfortable');
    // **A fonte deixou de ser preservada-e-ignorada: ela é editada.**
    assert.equal(gravado.font, 'sans');
    assert.equal(c.themes.at(-1).fonte, 'sans');
    // **O que este MOD não edita foi de volta como veio.** Zerá-lo seria apagar
    // a escolha de outra pessoa por não saber mostrá-la.
    assert.equal(gravado.radius, inicial.theme.radius);
    assert.equal(gravado.glow, inicial.theme.glow);
    assert.equal(c.themes.at(-1).acento, '#6bffb6');
  });

  // ---- a prévia é reversível, e é ela que U23 pediu ----
  //
  // «A cor muda após gravar, sem prévia reversível explícita.» Antes o único
  // jeito de ver uma cor era publicá-la para todo mundo. Agora desligar a
  // prévia devolve o tema do servidor **sem** desfazer o rascunho.
  test('ESTILO: desligar a prévia devolve o tema publicado e guarda o rascunho', async () => {
    const w = world(); const inicial = w.call({ op: 'view' });
    w.escritaDireta({ op: 'save', theme: inicial.theme, revision: 0 });
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);

    c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' });
    await assentar();
    assert.equal(c.themes.at(-1).acento, '#6bffb6', 'a prévia não aplicou');

    c.fire({ nome: 'marca', chave: 'previa', valor: false });
    await assentar();
    assert.equal(c.themes.at(-1).acento, inicial.theme.accent,
      'desligar a prévia não devolveu o tema publicado');
    assert.equal(naPagina(c).get('accent').valor, '#6bffb6',
      'desligar a prévia jogou fora o rascunho');

    c.fire({ nome: 'marca', chave: 'previa', valor: true });
    await assentar();
    assert.equal(c.themes.at(-1).acento, '#6bffb6', 'religar a prévia não a devolveu');
  });

  test('ESTILO: um conjunto pronto preenche tudo, e continua editável', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    c.fire({ nome: 'aba', chave: 'aba', valor: 'presets' });
    await assentar();
    // **Um conjunto diferente do que está de pé.** O tema padrão deste mundo é
    // o do próprio SEELE, e o botão daquele conjunto nasce desligado — que é o
    // certo: «usar o que já está usado» não é uma ação.
    const prontos = [...naPagina(c).entries()]
      .filter(([k, no]) => k.startsWith('preset-') && no.desligado === false);
    assert.ok(prontos.length, 'nenhum conjunto pronto está disponível: ' + oQueAPaginaDiz(c));
    const usar = prontos[0][0];

    c.fire({ nome: 'botao', chave: usar });
    await assentar();
    assert.equal(naPagina(c).get('gravar').desligado, false,
      'escolher um conjunto não marcou nada por publicar');

    // E ele continua editável: é um ponto de partida, e não um modo.
    c.fire({ nome: 'aba', chave: 'aba', valor: 'cores' });
    await assentar();
    c.fire({ nome: 'cor', chave: 'accent', valor: '#123456' });
    await assentar();
    assert.equal(naPagina(c).get('accent').valor, '#123456');
  });

  test('ESTILO: a consulta de quatro segundos não apaga o que está sendo editado', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    c.fire({ nome: 'cor', chave: 'accent', valor: '#123456' });
    await assentar();
    // O relógio bate no meio da edição, como bate a cada quatro segundos.
    c.tick(); await assentar();
    assert.equal(
      naPagina(c).get('accent').valor, '#123456',
      'a consulta ao servidor apagou o que estava sendo escolhido',
    );
    // E DESCARTAR devolve o que o servidor tem.
    c.fire({ nome: 'botao', chave: 'descartar' });
    await assentar();
    assert.notEqual(naPagina(c).get('accent').valor, '#123456');
  });

  test('ESTILO: a recusa do servidor vira frase na página, e não silêncio', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    // Contraste impossível: texto igual ao fundo. O servidor recusa.
    c.fire({ nome: 'cor', chave: 'text', valor: '#050403' });
    await assentar();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);
    assert.match(oQueAPaginaDiz(c), /[Cc]ontraste/);
    // E o que estava sendo editado continua lá para ser corrigido.
    assert.equal(naPagina(c).get('text').valor, '#050403');
  });

  test('ESTILO: arredondamento e brilho se escolhem, gravam e aplicam', async () => {
    const w = world();
    // `world()` faz a pessoa 1 ser administradora, e o cliente entra como 2.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    c.fire({ nome: 'aba', chave: 'aba', valor: 'forma' });
    await assentar();

    // Os dois são controles de verdade, e não texto de leitura.
    const antes = naPagina(c);
    assert.ok(antes.has('radius'), 'não há como escolher o arredondamento: ' + oQueAPaginaDiz(c));
    assert.ok(antes.has('glow'), 'não há como escolher o brilho: ' + oQueAPaginaDiz(c));

    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    c.fire({ nome: 'escolha', chave: 'glow', valor: 'sim' });
    await assentar();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);

    // **Gravado no servidor**, com os tipos que ele confere.
    const guardado = w.call({ op: 'view' }).theme;
    assert.equal(guardado.radius, 8, 'o arredondamento não chegou ao servidor');
    assert.equal(guardado.glow, true, 'o brilho não chegou ao servidor');

    // **E aplicado na sessão**, como número e booleano — nunca como CSS. Uma
    // string aqui seria este MOD escrevendo `border-radius` na tela de quem
    // conversa, que é o que a API existe para não permitir.
    const aplicado = c.themes.at(-1);
    assert.equal(aplicado.arredondamento, 8, 'o produto não recebeu o raio: ' + JSON.stringify(aplicado));
    assert.equal(aplicado.brilho, true, 'o produto não recebeu o brilho: ' + JSON.stringify(aplicado));
    assert.equal(typeof aplicado.arredondamento, 'number');
    assert.equal(typeof aplicado.brilho, 'boolean');

    // A escolha devolve texto; o que sai daqui é número. Sem a conversão, o
    // rascunho ficaria com '8' e a tela diria «mudou» para sempre.
    await assentar();
    assert.equal(naPagina(c).get('gravar')?.desligado, true,
      'ficou dizendo que ainda há mudança por publicar');
  });

  // ---- o guarda da afirmação obsoleta (U24) ----
  //
  // A região dizia, depois de gravar arredondamento 8 com sucesso, que «a API
  // de tema recusa os dois». Não recusava: `NUMEROS_DA_API` e
  // `BANDEIRAS_DA_API` aplicam raio e brilho, e o caso acima prova que os dois
  // chegam ao produto como número e booleano.
  //
  // Duas descrições concorrentes do mesmo recurso foi o que produziu a
  // regressão. Este caso fixa a que fica: o **resultado** da aplicação.
  test('ESTILO: depois de aplicar, a página diz o que foi desenhado — e não uma recusa inventada', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    await abrir(c);
    c.fire({ nome: 'aba', chave: 'aba', valor: 'forma' });
    await assentar();
    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    c.fire({ nome: 'escolha', chave: 'glow', valor: 'sim' });
    await assentar();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await assentar(20);

    const dito = oQueAPaginaDiz(c);
    assert.doesNotMatch(dito, /recusa os dois/,
      'a afirmação obsoleta de recusa voltou depois de o produto ter aplicado');
    assert.doesNotMatch(dito, /não desenhado aqui/,
      'a página continua dizendo que o que foi aplicado não é desenhado');
    assert.match(dito, /Desenhado nesta sessão/,
      'a página não disse o resultado real da aplicação');
    assert.match(dito, /arredondamento 8 px/);
    assert.match(dito, /com brilho/);
  });

  // E a outra metade da mesma regra: quando a API **recusa de verdade**, é a
  // recusa dela que aparece — com o motivo que ela deu, e não um texto fixo.
  test('ESTILO: uma recusa real do produto é dita com o motivo que o produto deu', async () => {
    const w = world();
    const c = client(w, {
      request: (_id, canal, corpo) => w.call(corpo, '1', canal),
      tema: async valores => {
        if (valores && valores.arredondamento === 8) {
          throw new Error('arredondamento fora do intervalo aceito');
        }
      },
    });
    await settle();
    await abrir(c);
    c.fire({ nome: 'aba', chave: 'aba', valor: 'forma' });
    await assentar();
    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    await assentar(20);

    assert.match(oQueAPaginaDiz(c), /arredondamento fora do intervalo aceito/,
      'a recusa do produto não chegou a quem estava editando: ' + oQueAPaginaDiz(c));
  });

  // **Quem não administra recebe o tema, e não um formulário** — §2 do plano.
  test('ESTILO: quem não administra vê a aparência e não recebe controles de edição', async () => {
    const w = world();
    // A pessoa 2 não é administradora neste mundo.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '2', canal) });
    await settle();
    // A faixa só tem a porta, e ela diz «ver» e não «editar».
    const naFaixa = c.controles();
    assert.equal(naFaixa.size, 1, 'apareceu controle de edição na faixa de quem não administra');
    assert.equal(naFaixa.get('abrir-aparencia').dentro, 'VER APARÊNCIA');

    await abrir(c);
    const controles = naPagina(c);
    assert.equal(controles.size, 0,
      'apareceu controle de edição para quem não administra: ' + oQueAPaginaDiz(c));
    assert.match(oQueAPaginaDiz(c), /administra/);
  });

  // ---- a degradação é explícita, e ela é testada ----
  test('ESTILO: sem superfícies, a faixa volta a ser o formulário', async () => {
    const w = world();
    const c = client(w, {
      semApi4: true,
      request: (_id, canal, corpo) => w.call(corpo, '1', canal),
    });
    await settle();
    assert.equal(c.errors.length, 0,
      'o MOD falhou num SEELE sem superfícies: ' + JSON.stringify(c.errors));
    assert.ok(c.controles().has('accent'), 'a faixa não voltou a oferecer as cores');
    assert.equal(c.contribuicoes.length, 0, 'registrou contribuição num SEELE que não as tem');
  });
}
