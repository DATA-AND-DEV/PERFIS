const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const source = fs.readFileSync(path.join(root, manifest.client), 'utf8');
const serverSource = fs.readFileSync(path.join(root, manifest.server), 'utf8');
function world() {
  const data = {}, files = new Map(); let revision = 0, serial = 0;
  const call = (body, person = '1', channel = 1) => {
    const sandbox = vm.createContext({ dados: data, mundo: { agora: () => 100 }, arquivos: { ler: p => files.get(p) ?? null, escrever: (p, v) => (files.set(p, v), true), apagar: p => files.delete(p), listar: () => [...files.keys()] } });
    vm.runInContext(serverSource, sandbox);
    const result = JSON.parse(sandbox.aoPedir(JSON.stringify({ person, channel, admin: person === '1', write: true }), JSON.stringify({ revision, nonce: 'teste-' + (++serial), ...body })));
    if (result.campaign) revision = result.campaign.revision;
    return result;
  };
  return { data, call };
}
function client(w, options = {}) {
  const regions = [], themes = [], requests = [], timers = [], errors = [];
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
    },
  });
  let listener = null;
  vm.runInContext(source, sandbox, { timeout: 1000 });
  return {
    regions, themes, requests, timers, errors, snapshot,
    tick: () => { assert.equal(timers.length, 1); timers.shift()(); },
    // O que a pessoa fez. Quem monta o elemento é o produto, então o teste
    // manda o **evento** dele, e não um clique num DOM que não existe aqui.
    fire: evento => { assert.ok(listener, 'o MOD não registrou ouvinte de evento'); listener(evento); },
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
const CHAVES_DA_FORMA = {
  titulo: ['dentro'], texto: ['dentro'], linha: ['dentro'],
  lista: ['dentro'], item: ['dentro'],
  campo: ['chave', 'rotulo', 'valor'],
  escolha: ['chave', 'rotulo', 'valor', 'opcoes'],
  botao: ['chave', 'dentro', 'desligado'],
  tela: ['chave', 'largura', 'altura', 'figuras', 'tracos'],
  midia: ['chave', 'fonte', 'doServidor', 'descricao', 'tocando'],
};
function checkTree(tree, depth = 0) {
  assert.ok(depth <= 8, 'o renderer do produto cortaria este conteúdo');
  if (tree === null || tree === undefined) return;
  if (typeof tree === 'string') return;
  if (Array.isArray(tree)) { tree.forEach(n => checkTree(n, depth + 1)); return; }
  const aceitas = CHAVES_DA_FORMA[tree.forma];
  assert.ok(aceitas, 'forma que a API 3 não conhece: ' + tree.forma);
  for (const chave of Object.keys(tree)) {
    if (chave === 'forma') continue;
    assert.ok(aceitas.includes(chave), `«${chave}» não existe em «${tree.forma}»`);
  }
  if ('dentro' in tree) checkTree(tree.dentro, depth + 1);
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const content = c => JSON.stringify(c.regions.at(-1));
test('API 3: cliente final executa sem DOM e só consulta o próprio servidor', async () => {
  const c = client(world()); await settle();
  assert.equal(manifest.api, 3); assert.ok(c.regions.length); assert.equal(c.errors.length, 0);
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
  test('MESA: o tabuleiro é figura declarada, e arrastar uma peça a move no servidor', async () => {
    const w = world();
    assert.equal(w.call({ op: 'setup', name: 'Casa', system: 'free', gm: '1' }).ok, true);
    assert.equal(w.call({ op: 'sheet-create', name: 'Iria', owner: '2' }).ok, true);
    const cena = w.call({ op: 'scene-create', name: 'Salão', kind: 'map' });
    assert.equal(cena.ok, true);
    const id = cena.campaign.scenes.at(-1).id;
    const ficha = cena.campaign.sheets.at(-1).id;
    assert.equal(w.call({ op: 'scene-show', id }).ok, true);
    assert.equal(w.call({ op: 'token-add', scene: id, name: 'Iria', sheet: ficha, x: 2, y: 3 }).ok, true);
    // **Duas peças na mesma casa.** É aqui que `alvo` importa: sem ele, este
    // lado teria de adivinhar qual das duas o dedo pegou, e adivinharia pela
    // posição — que é igual para as duas. A que está por cima é a última
    // declarada, e é a que o produto entrega.
    assert.equal(w.call({ op: 'token-add', scene: id, name: 'Sombra', x: 2, y: 3 }).ok, true);

    // O GM é a pessoa 1, e o cliente entra como ela: o GM move qualquer peça,
    // então a permissão de jogador não entra neste caso.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();

    const tela = [...c.controles().values()].find(n => n.forma === 'tela');
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
    const durante = [...c.controles().values()].find(n => n.forma === 'tela')
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
    w.call({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.call({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.call({ op: 'scene-show', id });
    w.call({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
    // Quem entra é a pessoa 2, que não é GM e não tem ficha nesta peça.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '2', canal) });
    await settle();
    const tela = [...c.controles().values()].find(n => n.forma === 'tela');
    const peca = tela.figuras.find(f => typeof f.chave === 'string' && f.chave.startsWith('peca:'));
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: peca.x, y: peca.y, alvo: peca.chave });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 26 * 9, y: 26 * 9, alvo: peca.chave });
    await settle(); await settle();
    assert.match(content(c), /a peça não se move/);
    const gravada = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id).tokens[0];
    assert.equal(gravada.x, 1, 'o servidor moveu uma peça que não era de quem arrastou');
  });
  test('MESA: rolar dados vai ao servidor com a fórmula digitada', async () => {
    const w = world();
    w.call({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    c.fire({ nome: 'campo', chave: 'formula', valor: '2d6+3' });
    c.fire({ nome: 'botao', chave: 'rolar' });
    await settle(); await settle();
    const rolagem = c.requests.find(r => r.body.op === 'roll');
    assert.ok(rolagem, 'ROLAR não foi ao servidor');
    assert.equal(rolagem.body.formula, '2d6+3');
    assert.match(content(c), /Dados/);
  });
  test('MESA: um toque no vazio do tabuleiro não move peça nenhuma', async () => {
    const w = world();
    w.call({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.call({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.call({ op: 'scene-show', id });
    w.call({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    const antes = c.requests.length;
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'comecou', x: 300, y: 300, alvo: null });
    c.fire({ nome: 'traco', chave: 'tabuleiro', fase: 'terminou', x: 300, y: 300, alvo: null });
    await settle(); await settle();
    assert.equal(c.requests.length, antes, 'um toque no vazio mandou pedido ao servidor');
  });
}
if (manifest.id === 'seele/perfis') {
  test('PERFIS: a lista traz cada pessoa por ID, e abrir mostra a ficha dela', async () => {
    const w = world(); assert.equal(w.call({ op: 'save', revision: 0, profile: { displayName: '<img src=x>', pronouns: 'ela/dela', bio: 'Minha bio', status: 'Presente', accent: '#a78bfa', effect: 'aurora' } }, '2').ok, true);
    const before = JSON.stringify(w.data), c = client(w); await settle();
    // A lista: nome e ID de cada um, e o botão que abre.
    assert.match(content(c), /<img src=x>/); assert.match(content(c), /ID 2/);
    assert.equal(JSON.stringify(w.data), before);

    // Abrir a ficha **não** vai ao servidor: o retrato já está na mão.
    const antes = c.requests.length;
    c.fire({ nome: 'botao', chave: 'abrir-1' }); await settle();
    assert.equal(c.requests.length, antes, 'abrir uma ficha foi ao servidor');
    assert.match(content(c), /ID 1/);

    // E a minha traz os campos editáveis.
    c.fire({ nome: 'botao', chave: 'fechar' }); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    const controles = c.controles();
    assert.ok(controles.has('bio'), 'a minha ficha não trouxe o campo de bio');
    assert.equal(controles.get('bio').valor, 'Minha bio');
    assert.ok(controles.has('effect'), 'a minha ficha não trouxe a escolha de efeito');
    assert.equal(JSON.stringify(w.data), before, 'abrir a ficha escreveu no servidor');
  });
  test('PERFIS: editar e gravar muda o perfil, e a recusa do servidor é dita', async () => {
    const w = world();
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    c.fire({ nome: 'campo', chave: 'displayName', valor: 'Lia' });
    c.fire({ nome: 'campo', chave: 'bio', valor: 'Joga de longe.' });
    c.fire({ nome: 'escolha', chave: 'effect', valor: 'sparkle' });
    await settle();
    assert.equal(c.controles().get('displayName').valor, 'Lia');
    assert.equal(c.controles().get('gravar').desligado, false);

    c.fire({ nome: 'botao', chave: 'gravar' }); await settle(); await settle();
    const salvo = w.call({ op: 'view', people: ['2'] }, '2').profiles['2'];
    assert.equal(salvo.displayName, 'Lia');
    assert.equal(salvo.effect, 'sparkle');

    // Uma cor que o servidor não aceita é recusada, e a recusa vira frase.
    c.fire({ nome: 'campo', chave: 'accent', valor: 'roxo' }); await settle();
    c.fire({ nome: 'botao', chave: 'gravar' }); await settle(); await settle();
    assert.match(content(c), /[Ee]feito ou cor/);
    assert.equal(c.controles().get('accent').valor, 'roxo', 'o que foi digitado sumiu com a recusa');
  });
  test('PERFIS: a imagem vem do servidor deste MOD, e nunca de um endereço', async () => {
    const w = world();
    // Um PNG mínimo, pelo caminho de sempre do servidor: `upload-start` e um
    // fragmento só, com o prefixo que o servidor exige ver no primeiro.
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const inicio = w.call({ op: 'upload-start', slot: 'avatar', length: png.length }, '2');
    assert.equal(inicio.ok, true, inicio.error);
    const parte = w.call({ op: 'upload-part', slot: 'avatar', token: inicio.token, index: 0, part: png }, '2');
    assert.equal(parte.ok, true, parte.error);
    assert.equal(parte.finished, true, 'o upload do vetor não completou');
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    const midia = [...c.controles().values()].find(n => n.forma === 'midia');
    assert.ok(midia, 'a ficha não montou a imagem');
    assert.ok(midia.doServidor, 'a imagem não veio da metade de servidor deste MOD');
    assert.equal(midia.doServidor.pedido.op, 'asset');
    assert.equal(midia.doServidor.campo, 'image');
    // Nenhuma forma da API carrega endereço, e é isso que impede a janela de
    // quem conversa de buscar bytes na rede de um estranho.
    assert.doesNotMatch(content(c), /https?:/);
  });
  test('PERFIS: consulta pessoas em lotes de no máximo 32', async () => {
    const c = client(world()); await settle();
    c.snapshot.presentes = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, nickname: 'Mesmo nome' }));
    c.requests.length = 0; c.tick(); await settle();
    assert.deepEqual(c.requests.map(r => r.body.people.length), [32, 32, 6]);
    assert.match(content(c), /ID 70/);
  });
}
if (manifest.id === 'seele/estilo') {
  test('ESTILO: os seis tokens e a densidade, sem perder opções legadas; reset libera a camada', async () => {
    const w = world(), initial = w.call({ op: 'view' });
    assert.equal(w.call({ op: 'save', theme: initial.theme, revision: 0 }).ok, true);
    const before = JSON.stringify(w.data), c = client(w); await settle();
    assert.deepEqual(c.themes[0], {
      acento: initial.theme.accent, fundo: initial.theme.background,
      painel: initial.theme.panel, texto: initial.theme.text,
      apagado: initial.theme.muted, borda: initial.theme.border,
      densidade: initial.theme.density === 'comfortable' ? 'confortavel' : 'compacta',
    });
    assert.equal(JSON.stringify(w.data), before);
    c.tick(); await settle(); assert.equal(c.themes.length, 1);
    assert.equal(w.call({ op: 'reset', revision: 1 }).ok, true);
    c.tick(); await settle(); assert.deepEqual(c.themes.at(-1), {});
  });
  test('ESTILO: recusa do produto é mostrada e não confirma aplicação', async () => {
    const w = world(), initial = w.call({ op: 'view' }); w.call({ op: 'save', theme: initial.theme, revision: 0 });
    let fail = true;
    const c = client(w, { tema: async () => { if (fail) throw Error('acento já é do MOD outro/tema'); } });
    await settle(); assert.match(content(c), /outro\/tema/); assert.equal(c.themes.length, 0);
    fail = false; c.tick(); await settle(); assert.equal(c.themes.length, 1); assert.match(content(c), /aplicad/);
  });

  // ---- o que a API 3 completa devolveu -------------------------------------

  test('ESTILO: quem administra edita e grava, e o que o MOD não edita é preservado', async () => {
    const w = world(); const inicial = w.call({ op: 'view' });
    // `world()` faz a pessoa 1 ser administradora, e o cliente entra como 2.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();

    const controles = c.controles();
    assert.ok(controles.has('accent'), 'não há campo para o destaque');
    assert.ok(controles.has('density'), 'não há escolha de densidade');
    assert.equal(controles.get('gravar').desligado, true, 'GRAVAR começa ligado sem nada mudado');

    // A pessoa digita uma cor nova. A tela acompanha **sem** ir ao servidor.
    const pedidosAntes = c.requests.length;
    c.fire({ nome: 'campo', chave: 'accent', valor: '#6bffb6' });
    await settle();
    assert.equal(c.requests.length, pedidosAntes, 'digitar foi ao servidor');
    assert.equal(c.controles().get('accent').valor, '#6bffb6');
    assert.equal(c.controles().get('gravar').desligado, false, 'GRAVAR não ligou com a mudança');

    // E a escolha de densidade entra no mesmo rascunho.
    c.fire({ nome: 'escolha', chave: 'density', valor: 'comfortable' });
    await settle();
    assert.equal(c.controles().get('density').valor, 'comfortable');

    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle();
    const gravado = w.call({ op: 'view' }).theme;
    assert.equal(gravado.accent, '#6bffb6');
    assert.equal(gravado.density, 'comfortable');
    // **O que este MOD não edita foi de volta como veio.** Zerá-lo seria apagar
    // a escolha de outra pessoa por não saber mostrá-la.
    assert.equal(gravado.radius, inicial.theme.radius);
    assert.equal(gravado.font, inicial.theme.font);
    assert.equal(gravado.glow, inicial.theme.glow);
    assert.equal(c.themes.at(-1).acento, '#6bffb6');
  });

  test('ESTILO: a consulta de quatro segundos não apaga o que está sendo editado', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    c.fire({ nome: 'campo', chave: 'accent', valor: '#123456' });
    await settle();
    // O relógio bate no meio da edição, como bate a cada quatro segundos.
    c.tick(); await settle();
    assert.equal(
      c.controles().get('accent').valor, '#123456',
      'a consulta ao servidor apagou o que estava sendo digitado',
    );
    // E DESCARTAR devolve o que o servidor tem.
    c.fire({ nome: 'botao', chave: 'descartar' });
    await settle();
    assert.notEqual(c.controles().get('accent').valor, '#123456');
  });

  test('ESTILO: a recusa do servidor vira frase na região, e não silêncio', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    // Contraste impossível: texto igual ao fundo. O servidor recusa.
    c.fire({ nome: 'campo', chave: 'text', valor: '#050403' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle();
    assert.match(content(c), /[Cc]ontraste/);
    // E o que estava sendo editado continua lá para ser corrigido.
    assert.equal(c.controles().get('text').valor, '#050403');
  });

  test('ESTILO: quem não administra vê o tema e não recebe controles de edição', async () => {
    const w = world();
    // A pessoa 2 não é administradora neste mundo.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '2', canal) });
    await settle();
    const controles = c.controles();
    assert.equal(controles.size, 0, 'apareceu controle de edição para quem não administra');
    assert.match(content(c), /administra/);
  });
}
