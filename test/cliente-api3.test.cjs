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
      cartoes: async pedidos => {
        const entradas = Object.entries(pedidos ?? {});
        if (entradas.length > 64) throw new Error('um MOD dá cartão a até 64 pessoas, e vieram ' + entradas.length);
        const DENTRO = new Set(['texto', 'titulo', 'linha', 'lista', 'item', 'midia']);
        const montados = {};
        let recusados = 0;
        const andar = (no, fundura) => {
          if (fundura > 4 || no == null) return [];
          if (Array.isArray(no)) return no.flatMap(um => andar(um, fundura));
          if (typeof no === 'string') return [{ texto: no }];
          if (typeof no !== 'object' || !no.forma) return [];
          if (!DENTRO.has(no.forma)) { recusados += 1; return []; }
          return [{ ...no, dentro: andar(no.dentro, fundura + 1) }];
        };
        for (const [pessoa, declaracao] of entradas) {
          const partes = andar(declaracao, 0);
          if (!partes.length) continue;
          if (partes.length > 24) throw new Error('um cartão cabe em 24 nós');
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
  vm.runInContext(source, sandbox, { timeout: 1000 });
  return {
    regions, themes, requests, timers, errors, snapshot,
    /** Os cartões que o produto montou na lista de pessoas, por último. */
    cartoes: () => cartoes.at(-1) ?? {},
    /** O que o MOD **pediu**, antes da regra do produto. */
    cartoesPedidos: () => pedidosDeCartao.at(-1) ?? {},
    tick: () => { assert.equal(timers.length, 1); timers.shift()(); },
    // O que a pessoa fez. Quem monta o elemento é o produto, então o teste
    // manda o **evento** dele, e não um clique num DOM que não existe aqui.
    fire: evento => { assert.ok(listener, 'o MOD não registrou ouvinte de evento'); listener(evento); },
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
const CHAVES_DA_FORMA = {
  titulo: ['dentro'], texto: ['dentro'], linha: ['dentro'],
  lista: ['dentro'], item: ['dentro'],
  campo: ['chave', 'rotulo', 'valor'],
  escolha: ['chave', 'rotulo', 'valor', 'opcoes'],
  botao: ['chave', 'dentro', 'desligado'],
  // `finalidade`, `tipos` e `limiteDeBytes` chegaram com o conserto de U21/U22:
  // o botão de arquivo não tinha nome acessível nenhum, e o seletor do sistema
  // abria dizendo «Escolha um arquivo para este MOD» com JSONs na lista.
  arquivo: ['chave', 'dentro', 'rotulo', 'desligado', 'finalidade', 'tipos', 'limiteDeBytes'],
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
  test('MESA: a mesa se cria daqui, e cena, ficha e peça também', async () => {
    const w = world();
    // Sem campanha: o único caminho é criar uma, e ele está na região.
    const c = client(w, { request: (_i, canal, corpo) => w.call(corpo, '1', canal) });
    // Quem cria a mesa é quem administra: o retrato precisa dizer que é ela,
    // porque é esse nome que vai no `gm` do pedido.
    await settle();
    c.snapshot.me = 1;
    c.tick(); await settle();
    assert.ok(c.controles().has('criar-campanha'), 'não há como criar a mesa: ' + content(c));
    assert.equal(c.controles().get('criar-campanha').desligado, true, 'CRIAR MESA começa ligado sem nome');

    c.fire({ nome: 'campo', chave: 'nova-campanha', valor: 'A Casa' }); await settle();
    assert.equal(c.controles().get('criar-campanha').desligado, false);
    c.fire({ nome: 'botao', chave: 'criar-campanha' }); await settle(); await settle();
    assert.ok(w.call({ op: 'view' }, '1').campaign, 'a mesa não foi criada: ' + content(c));
    assert.equal(w.call({ op: 'view' }, '1').campaign.name, 'A Casa');
    // O rascunho esvaziou: deixá-lo cheio repetiria o nome na criação seguinte.
    assert.equal(c.controles().get('nova-cena').valor, '');

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
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);

    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();
    assert.ok(c.controles().has('ferir'), 'a ficha aberta não trouxe os controles de vida');

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

    // Maior que um fragmento e que um pedaço: é o que prova a junção.
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(70000, 3),
    ]);
    const arquivo = c.escolher('mapa', png);
    for (let i = 0; i < 120; i++) await settle();

    const guardada = w.call({ op: 'view' }, '1').campaign.scenes.find(s => s.id === id);
    assert.ok(guardada.asset, 'o mapa não foi publicado: ' + content(c));
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
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    for (const chave of ['f-name', 'f-className', 'f-level', 'f-ac', 'a-str', 'f-inventory']) {
      assert.ok(c.controles().has(chave), `a ficha não trouxe «${chave}»`);
    }
    c.fire({ nome: 'campo', chave: 'f-className', valor: 'Ladina' });
    c.fire({ nome: 'campo', chave: 'f-level', valor: '3' });
    c.fire({ nome: 'campo', chave: 'a-dex', valor: '17' });
    c.fire({ nome: 'campo', chave: 'f-inventory', valor: 'Corda, gazua' });
    await settle();

    // O relógio bate no meio da edição, a cada dois segundos.
    c.tick(); await settle();
    assert.equal(c.controles().get('f-className').valor, 'Ladina', 'a consulta apagou a edição');

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
    const tela = [...c.controles().values()].find(n => n.forma === 'tela');
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
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(9000, 5),
    ]);
    const arquivo = c.escolher('retrato', png);
    for (let i = 0; i < 60; i++) await settle();

    const comRetrato = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    assert.ok(comRetrato.portrait, 'o retrato não foi publicado: ' + content(c));
    const lido = w.call({ op: 'portrait-asset', sheet: ficha.id }, '1');
    const base64 = lido.image.slice(lido.image.indexOf(',') + 1);
    assert.deepEqual(Buffer.from(base64, 'base64'), png, 'o retrato chegou diferente');
    assert.deepEqual(c.soltos, [arquivo], 'o arquivo escolhido não foi devolvido');

    // E ele aparece na ficha, vindo do servidor deste MOD.
    c.tick(); await settle();
    const midia = [...c.controles().values()].find(n => n.forma === 'midia' && String(n.chave).startsWith('retrato:'));
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
    const ficha = w.call({ op: 'view' }, '1').campaign.sheets.at(-1);
    const magia = w.call({ op: 'view' }, '1').campaign.entries.at(-1);
    c.fire({ nome: 'botao', chave: 'abrir-ficha-' + ficha.id }); await settle();

    // Os espaços são editáveis, nível a nível.
    assert.ok(c.controles().has('s-0'), 'não há campo de espaços de nível 1');
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
    assert.equal(c.controles().get('v-name').valor, 'Poção');
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

    assert.ok(c.controles().has('c-cols'), 'não há ajuste de grade');
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
    const tela = [...c.controles().values()].find(n => n.forma === 'tela');
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
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    w.escritaDireta({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
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
  test('MESA: rolar dados vai ao servidor com a fórmula digitada', async () => {
    const w = world();
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
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
    w.escritaDireta({ op: 'setup', name: 'Casa', system: 'free', gm: '1' });
    const cena = w.escritaDireta({ op: 'scene-create', name: 'Salão', kind: 'map' });
    const id = cena.campaign.scenes.at(-1).id;
    w.escritaDireta({ op: 'scene-show', id });
    w.escritaDireta({ op: 'token-add', scene: id, name: 'Chefe', x: 1, y: 1 });
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
    const w = world(); assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: '<img src=x>', pronouns: 'ela/dela', bio: 'Minha bio', status: 'Presente', accent: '#a78bfa', effect: 'aurora' } }, '2').ok, true);
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
  test('PERFIS: o cartão de quem escreveu algo aparece na lista do produto', async () => {
    const w = world();
    // Duas pessoas: uma escreveu perfil, a outra não escreveu nada.
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: 'Lia da Torre', pronouns: 'ela/dela', status: 'jogando', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    const c = client(w); await settle();

    const cartoes = c.cartoes();
    const meu = cartoes['2'];
    assert.ok(meu, 'a pessoa 2 não ganhou cartão: ' + JSON.stringify(cartoes));
    const textos = JSON.stringify(meu);
    assert.match(textos, /Lia da Torre/, 'o nome exibido não entrou: ' + textos);
    assert.match(textos, /ela\/dela/, 'o pronome não entrou: ' + textos);
    assert.match(textos, /jogando/, 'o status não entrou: ' + textos);

    // **Quem não escreveu nada não ganha cartão.** Uma moldura vazia ao lado
    // de um nome é o produto anunciando uma ausência que ninguém pediu.
    assert.equal(cartoes['1'], undefined, 'quem não tem perfil ganhou um cartão vazio');
    // E o MOD **não pede** um cartão para essa pessoa: olhar só o resultado
    // não provaria nada, porque o produto já descarta declaração vazia.
    assert.equal(c.cartoesPedidos()['1'], undefined, 'o MOD pediu cartão para quem não escreveu nada');
  });

  test('PERFIS: o cartão é declaração, e nada dentro dele recebe clique', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: 'Lia', pronouns: 'ela/dela', status: '', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    const c = client(w); await settle();

    // **Nada que receba foco ou clique.** A linha do roster já tem um botão do
    // produto, e dividir foco e área de toque com um terceiro é o tipo de
    // coisa que ninguém consegue depurar depois.
    const pedido = JSON.stringify(c.cartoesPedidos());
    for (const proibida of ['"botao"', '"campo"', '"escolha"', '"arquivo"', '"tela"']) {
      assert.ok(!pedido.includes(proibida), `o cartão declarou ${proibida}: ` + pedido);
    }
    // E nenhuma medida: o tamanho é do produto.
    for (const medida of ['largura', 'altura', 'cor', 'estilo']) {
      assert.ok(!pedido.includes('"' + medida + '"'), `o cartão tentou escolher ${medida}: ` + pedido);
    }
    // **O nome exibido igual ao apelido não vira título**: a linha do roster já
    // escreve um nome, e dois nomes iguais na mesma linha é a linha dizendo
    // duas vezes a mesma coisa. A pessoa 2 se chama «Lia» no retrato, e foi
    // «Lia» que ela pôs no perfil.
    assert.equal(c.snapshot.presentes.find(p => p.id === 2).nickname, 'Lia', 'o retrato mudou de apelido');
    const partes = c.cartoesPedidos()['2'] ?? [];
    assert.ok(!partes.some(parte => parte.forma === 'titulo'), 'o nome repetido virou título: ' + JSON.stringify(partes));
    assert.ok(partes.some(parte => parte.chave === 'pronome'), 'e o cartão ficou sem o que ele tem a dizer: ' + JSON.stringify(partes));
  });

  test('PERFIS: o retrato do cartão vem do servidor deste MOD, e nunca de um endereço', async () => {
    const w = world();
    assert.equal(w.escritaDireta({ op: 'save', revision: 0, profile: { displayName: '', pronouns: 'elu/delu', status: '', bio: '', accent: '#a78bfa', effect: 'none' } }, '2').ok, true);
    // Sem retrato guardado, o cartão não declara mídia nenhuma.
    let c = client(w); await settle();
    assert.ok(!JSON.stringify(c.cartoesPedidos()).includes('midia'), 'declarou retrato sem haver retrato');

    // Com retrato, ele vem por `doServidor` — a única origem que a API aceita.
    const store = JSON.parse(w.data.profiles);
    store['2'].avatar = 'perfis/2/avatar';
    w.data.profiles = JSON.stringify(store);
    c = client(w); await settle();
    const midia = (c.cartoesPedidos()['2'] ?? []).find(parte => parte.forma === 'midia');
    assert.ok(midia, 'o retrato não entrou no cartão: ' + JSON.stringify(c.cartoesPedidos()));
    assert.ok(midia.doServidor, 'o retrato não veio do servidor deste MOD');
    assert.equal(midia.doServidor.pedido.op, 'asset');
    assert.equal(midia.doServidor.pedido.slot, 'avatar');
    assert.ok(!('fonte' in midia) && !('url' in midia) && !('src' in midia), 'o retrato ganhou uma segunda origem: ' + JSON.stringify(midia));
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
    const inicio = w.escritaDireta({ op: 'upload-start', slot: 'avatar', length: png.length }, '2');
    assert.equal(inicio.ok, true, inicio.error);
    const parte = w.escritaDireta({ op: 'upload-part', slot: 'avatar', token: inicio.token, index: 0, part: png }, '2');
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
  test('PERFIS: a pessoa escolhe uma imagem e ela chega inteira ao servidor', async () => {
    const w = world();
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();

    // Um PNG de verdade, maior que um fragmento e que um pedaço do produto:
    // é o único jeito de provar que a junção dos pedaços não perde nada.
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      Buffer.alloc(70000, 7),
    ]);
    const id = c.escolher('avatar', png);
    for (let i = 0; i < 80; i++) await settle();

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
  // **Cancelar é uma resposta, e agora é uma resposta com nome.**
  //
  // Antes, fechar o seletor e o seletor falhar chegavam iguais — os dois como
  // `arquivo: null` — e o MOD respondia aos dois com o mesmo aviso. A auditoria
  // de 20/09/2026 pediu «cancelamento neutro e silencioso quando apropriado»,
  // e isso só é possível quando o MOD consegue distinguir os dois casos:
  // `resultado` é o campo que os separa.
  // ---- o rascunho pertence à pessoa, e não ao momento (U26) ----
  //
  // `FECHAR` apagava `rascunho`. Quem escrevesse a biografia e fechasse a
  // ficha — de propósito ou sem querer — perdia o que escreveu, em silêncio.
  // O conserto amarra o rascunho à entidade: fechar guarda, e só `DESCARTAR`
  // — explícito e confirmado — joga fora.
  test('PERFIS: fechar a ficha não apaga o que foi escrito; descartar pede confirmação', async () => {
    const w = world();
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();

    c.fire({ nome: 'campo', chave: 'bio', valor: 'Uma biografia longa que custou a ser escrita.' });
    await settle();
    assert.equal(c.controles().get('bio').valor, 'Uma biografia longa que custou a ser escrita.');

    // Fecha e reabre: o que estava escrito continua lá.
    c.fire({ nome: 'botao', chave: 'fechar' }); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    assert.equal(
      c.controles().get('bio').valor,
      'Uma biografia longa que custou a ser escrita.',
      'fechar a ficha apagou o que tinha sido escrito e não gravado',
    );

    // E descartar não joga fora no primeiro toque: ele pergunta.
    c.fire({ nome: 'botao', chave: 'descartar' }); await settle();
    assert.match(content(c), /Aperte DESCARTAR de novo/,
      'descartar apagou sem perguntar');
    assert.equal(
      c.controles().get('bio').valor,
      'Uma biografia longa que custou a ser escrita.',
      'o primeiro DESCARTAR já apagou o rascunho',
    );

    // No segundo, sim.
    c.fire({ nome: 'botao', chave: 'descartar' }); await settle();
    assert.equal(c.controles().get('bio').valor, '', 'confirmar o descarte não apagou');
  });

  test('PERFIS: cancelar o seletor é neutro; falhar é dito', async () => {
    const w = world();
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    const antes = c.requests.length;

    // Cancelou: não vai ao servidor e não acusa nada na tela.
    c.fire({ nome: 'arquivo', chave: 'avatar', arquivo: null, resultado: 'cancelado' });
    await settle();
    assert.equal(c.requests.length, antes, 'cancelar foi ao servidor');
    assert.doesNotMatch(content(c), /nenhum arquivo escolhido/,
      'cancelar continua deixando um aviso onde não há nada errado');

    // Falhou: o motivo do produto aparece onde a pessoa apertou.
    c.fire({
      nome: 'arquivo', chave: 'avatar', arquivo: null,
      resultado: 'falhou', porque: 'papel-nao-serve:som',
    });
    await settle();
    assert.equal(c.requests.length, antes, 'uma falha foi ao servidor');
    assert.match(content(c), /papel-nao-serve:som/,
      'a falha do seletor não chegou a quem apertou');
  });
  test('PERFIS: um som escolhido no lugar de uma imagem é recusado pelo nome', async () => {
    const w = world();
    const c = client(w); await settle();
    c.fire({ nome: 'botao', chave: 'abrir-2' }); await settle();
    const id = c.escolhidos.size + 1;
    c.escolhidos.set(id, Buffer.alloc(16));
    c.fire({
      nome: 'arquivo', chave: 'avatar',
      arquivo: { id, tipo: 'audio/wav', papel: 'som', bytes: 16 },
    });
    for (let i = 0; i < 10; i++) await settle();
    assert.match(content(c), /Escolha uma imagem/);
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

    // E as escolhas entram no mesmo rascunho.
    c.fire({ nome: 'escolha', chave: 'density', valor: 'comfortable' });
    c.fire({ nome: 'escolha', chave: 'font', valor: 'sans' });
    await settle();
    assert.equal(c.controles().get('density').valor, 'comfortable');
    assert.equal(c.controles().get('font').valor, 'sans');

    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle();
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

  test('ESTILO: arredondamento e brilho se escolhem, gravam e aplicam', async () => {
    const w = world();
    // `world()` faz a pessoa 1 ser administradora, e o cliente entra como 2.
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();

    // Os dois são controles de verdade, e não texto de leitura.
    const antes = c.controles();
    assert.ok(antes.has('radius'), 'não há como escolher o arredondamento: ' + content(c));
    assert.ok(antes.has('glow'), 'não há como escolher o brilho: ' + content(c));

    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    c.fire({ nome: 'escolha', chave: 'glow', valor: 'sim' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle();

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
    await settle();
    assert.equal(c.controles().get('gravar')?.desligado, true, 'ficou dizendo que ainda há mudança por gravar');
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
  test('ESTILO: depois de aplicar, a região diz o que foi desenhado — e não uma recusa inventada', async () => {
    const w = world();
    const c = client(w, { request: (_id, canal, corpo) => w.call(corpo, '1', canal) });
    await settle();
    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    c.fire({ nome: 'escolha', chave: 'glow', valor: 'sim' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle(); await settle();

    const dito = content(c);
    assert.doesNotMatch(dito, /recusa os dois/,
      'a afirmação obsoleta de recusa voltou depois de o produto ter aplicado');
    assert.doesNotMatch(dito, /não desenhado aqui/,
      'a região continua dizendo que o que foi aplicado não é desenhado');
    assert.match(dito, /Desenhado nesta sessão/,
      'a região não disse o resultado real da aplicação');
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
    c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
    await settle();
    c.fire({ nome: 'botao', chave: 'gravar' });
    await settle(); await settle(); await settle();

    const dito = content(c);
    assert.match(dito, /arredondamento fora do intervalo aceito/,
      'a recusa do produto não chegou a quem estava editando: ' + dito);
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
