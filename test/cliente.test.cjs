// O cliente do PERFIS na API 6, contra o laboratório (`laboratorio.cjs`).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mundo, janela, semearPerfis, trocarImagem, gravarDireto, assentar, entregarAvisos, TETO_EM_VOO } = require('./laboratorio.cjs');

/** O que o formulário do editor manda no `submeter`. */
const VALORES = (campos = {}) => ({ displayName: '', pronouns: '', status: '', bio: '', accent: '#f2521f', effect: 'none', ...campos });
const gravarPeloEditor = (j, campos) => j.evento({ nome: 'submeter', chave: 'perfil', valores: VALORES(campos) });

const PNG = (resto = 16, byte = 7) => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(resto, byte)]);

// ---- o laboratório ----
//
// Um laboratório que discorda do produto ensina a coisa errada. Estes três
// casos provam que ele tem o que a API 6 tem, e só isso.

test('laboratório: a janela da API 6 não tem o que saiu', async () => {
  const j = janela(mundo(), { carregarCliente: false });
  assert.equal(typeof j.sandbox.SeeleMods.snapshot, 'undefined');
  assert.equal(typeof j.sandbox.SeeleUI.regiao, 'undefined');
  assert.equal(typeof j.sandbox.SeeleUI.cartoes, 'undefined');
  assert.equal(typeof j.sandbox.SeeleUI.retrato, 'function');
});

test('laboratório: uma mensagem acima de 12 KiB é recusada como no prelúdio', async () => {
  const j = janela(mundo(), { carregarCliente: false });
  const grande = { forma: 'texto', dentro: 'x'.repeat(13000) };
  const s = await j.sandbox.SeeleUI.superficies.criar({ id: 'p', tipo: 'pagina', titulo: 'P' });
  await assert.rejects(s.montar([grande]), /mensagem-grande: superficie-montar/);
});

test('laboratório: painel e tipo desconhecido são recusados pelo nome', async () => {
  const j = janela(mundo(), { carregarCliente: false });
  for (const tipo of ['painel', 'janela']) {
    await assert.rejects(j.sandbox.SeeleUI.superficies.criar({ id: tipo, tipo }), falha => {
      assert.equal(falha.erro, 'tipo-desconhecido');
      assert.equal(falha.tipoPedido, tipo);
      assert.ok(falha.tipos.includes('folha'));
      return true;
    });
  }
});

// ---- o cliente na janela da 6 ----
//
// O cliente da 3.x chamava `SeeleMods.snapshot()` na primeira volta. Na API 6
// ele não existe (o retrato é `SeeleUI.retrato()`), e o MOD morria antes de
// registrar a entrada «Perfis».
test('laboratório: o nono pedido em voo é recusado, como no prelúdio', async () => {
  const j = janela(mundo(), { carregarCliente: false, latencia: 2 });
  const pedidos = Array.from({ length: TETO_EM_VOO + 1 }, () => j.sandbox.SeeleUI.retrato());
  const resultados = await Promise.allSettled(pedidos);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, TETO_EM_VOO);
  assert.equal(resultados.at(-1).reason?.erro, 'too-many-requests');
});

test('laboratório: acima de quatro por segundo, sai só o aviso mais novo de cada canal', async () => {
  const m = mundo();
  for (let n = 1; n <= 6; n += 1) m.avisos.push({ carga: { n } });
  const recebidos = [];
  entregarAvisos(m, [{ avisoDoServidor: carga => recebidos.push(carga.n) }]);
  assert.deepEqual(recebidos, [1, 2, 3, 4, 6]);
  assert.equal(m.avisos.length, 0);
});

test('laboratório: sem a capacidade arquivo, pedaco e soltar faltam; erros de uma chave que não é campo são recusados', async () => {
  const j = janela(mundo(), { carregarCliente: false, semArquivo: true, semEnviar: true });
  assert.equal(typeof j.sandbox.SeeleUI.pedaco, 'undefined');
  assert.equal(typeof j.sandbox.SeeleUI.soltar, 'undefined');
  const s = await j.sandbox.SeeleUI.superficies.criar({ id: 'f', tipo: 'dialogo', titulo: 'F' });
  await s.montar([{ forma: 'formulario', chave: 'form', dentro: [{ forma: 'campo', chave: 'nome', rotulo: 'NOME', valor: '' }] }]);
  await s.formulario.erros({ nome: 'curto' });
  await assert.rejects(s.formulario.erros({ form: 'não é campo' }), falha => falha.erro === 'chave-desconhecida');
});

test('PERFIS: o cliente sobe na janela da API 6 sem chamar o que saiu', async () => {
  const j = janela(mundo());
  await assentar();
  assert.deepEqual(j.registro.filter(l => /is not a function|undefined/.test(l)), []);
  assert.deepEqual(j.toasts.filter(t => /is not a function|undefined/.test(t.mensagem)), []);
  assert.equal(j.contribuicoesDe('servidor.navegacao').length, 1, 'a entrada «Perfis» não foi registrada');
});

// ---- a casca: uma atualização em voo, e só o estado mais novo esperando ----
function agrupar() {
  const ctx = vm.createContext({ SeeleUI: {}, SeeleMods: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ferramentas/interface.js'), 'utf8'), ctx);
  return ctx.interfaceMod('teste/visual', 'Teste').agruparAtualizacoes;
}
test('casca: uma rajada retém só o último estado e não sobrepõe montagens', async () => {
  let liberar, comecou;
  const inicio = new Promise(r => { comecou = r; });
  const barreira = new Promise(r => { liberar = r; });
  const estados = [];
  let emVoo = 0, pico = 0;
  const pintar = agrupar()(async estado => {
    emVoo += 1; pico = Math.max(pico, emVoo); estados.push(estado);
    if (estado === 0) { comecou(); await barreira; }
    emVoo -= 1;
  });
  const fim = pintar(0);
  await inicio;
  for (let n = 1; n <= 200; n++) assert.equal(pintar(n), fim);
  liberar(); await fim;
  assert.deepEqual(estados, [0, 200]);
  assert.equal(pico, 1);
});
test('casca: uma recusa é propagada e a atualização seguinte pode recuperar', async () => {
  const pintar = agrupar()(async estado => { if (estado === 0) throw Error('recusa'); });
  await assert.rejects(pintar(0), /recusa/);
  await pintar(1);
});

// ---- a consulta ----
test('PERFIS: sem o aviso do servidor, uma consulta lenta não agenda outra em paralelo', async () => {
  let soltar;
  const j = janela(mundo(), { semAvisoDoServidor: true, aoPedir: (_corpo, padrao) => new Promise(r => { soltar = () => r(padrao()); }) });
  await assentar();
  assert.equal(j.pedidos.length, 1);
  assert.equal(j.relogios.length, 0);
  soltar(); await assentar();
  assert.equal(j.relogios.length, 1);
  assert.equal(j.pedidos.length, 1);
});

test('PERFIS: uma consulta que falha é dita e tentada de novo, mesmo com o aviso do servidor', async () => {
  let falhar = true;
  const j = janela(mundo(), { aoPedir: (_corpo, padrao) => (falhar ? Promise.reject(new Error('timeout')) : padrao()) });
  await assentar();
  assert.ok(j.toasts.some(t => /timeout/.test(t.mensagem)), JSON.stringify(j.toasts));
  assert.equal(j.relogios.length, 1, 'a falha não agendou uma nova tentativa');
  const ditos = j.toasts.length;
  falhar = false; j.tick(); await assentar();
  assert.ok(!j.toasts.slice(ditos).some(t => /timeout/.test(t.mensagem)));
  assert.equal(j.contribuicoesDe('servidor.navegacao').length, 1, 'a nova tentativa não carregou o PERFIS');
  assert.equal(j.relogios.length, 0, 'depois de carregar, o PERFIS voltou ao laço');
});

test('PERFIS: consulta pessoas em lotes de no máximo 32', async () => {
  const pessoas = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, apelido: 'Mesmo nome' }));
  const j = janela(mundo(), { pessoas, eu: 2 });
  await assentar(30);
  assert.deepEqual(j.pedidos.map(p => p.corpo.people.length), [32, 32, 6]);
  j.agir('abrir-diretorio'); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-diretorio')), /70 pessoa\(s\)/);
});

// ---- as superfícies ----
test('PERFIS: o diretório é uma página, e abri-lo não vai ao servidor nem escreve', async () => {
  const m = mundo();
  gravarDireto(m, '2', { displayName: '<img src=x>', pronouns: 'ela/dela', bio: 'Minha bio', status: 'Presente', effect: 'aurora' });
  const j = janela(m);
  await assentar();
  assert.equal(j.contribuicoesDe('servidor.navegacao')[0].rotulo, 'Perfis');
  const dados = JSON.stringify(m.dados), antes = j.pedidos.length;
  j.agir('abrir-diretorio'); await assentar();
  assert.equal(j.pedidos.length, antes, 'abrir o diretório foi ao servidor');
  assert.equal(j.superficies.get('perfis-diretorio').descricao.tipo, 'pagina');
  assert.match(JSON.stringify(j.superficie('perfis-diretorio')), /<img src=x>/);
  assert.equal(JSON.stringify(m.dados), dados, 'abrir o diretório escreveu no servidor');
});

test('PERFIS: clicar no próprio cartão abre o editor, que é um diálogo com bio multilinha, cor e prévia', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const tela = j.superficies.get('perfis-editor');
  assert.ok(tela, 'o próprio cartão não abriu o editor');
  assert.equal(tela.descricao.tipo, 'dialogo');
  // A pergunta antes de fechar é do produto, pelo sujo derivado; a opção que a
  // pedia nunca esteve no contrato, e o produto a tirou.
  assert.ok(!('fecharComAlteracoes' in tela.descricao), 'o editor declara uma opção que o contrato não tem');
  const c = j.controlesDe('perfis-editor');
  assert.equal(c.get('bio').forma, 'textoLongo');
  assert.equal(c.get('accent').forma, 'cor');
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /Seu cartão na lista de pessoas/);
  assert.equal(tela.sujo, false, 'nasceu sujo sem ninguém ter editado');
  j.evento({ nome: 'campo', chave: 'bio', valor: 'Escrito agora.' }); await assentar();
  assert.equal(tela.sujo, true, 'editar não sujou o editor');
});

test('PERFIS: editar e gravar muda o perfil, e a recusa do servidor é dita sem perder o texto', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  gravarPeloEditor(j, { displayName: 'Lia', bio: 'Joga de longe.', effect: 'sparkle' }); await assentar(20);
  const salvo = m.chamar({ op: 'view', people: ['2'] }, { pessoa: '2' }).profiles['2'];
  assert.equal(salvo.displayName, 'Lia');
  assert.equal(salvo.effect, 'sparkle');
  gravarDireto(m, '2', { displayName: 'Outra' });
  gravarPeloEditor(j, { displayName: 'Lia', bio: 'Um texto que vale a pena não perder.' }); await assentar(20);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /outra janela/i);
  assert.equal(j.controlesDe('perfis-editor').get('bio').valor, 'Um texto que vale a pena não perder.');
});

// ---- o rascunho (U26) e o descarte ----
test('PERFIS: fechar o editor não apaga o que foi escrito; descartar pede confirmação', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'campo', chave: 'bio', valor: 'Uma biografia longa que custou a ser escrita.' }); await assentar();
  j.evento({ nome: 'fechar', superficie: 'perfis-editor', porque: 'saida-do-produto' }); await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  assert.equal(j.controlesDe('perfis-editor').get('bio').valor, 'Uma biografia longa que custou a ser escrita.');
  j.evento({ nome: 'botao', chave: 'descartar' }); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /Aperte de novo para confirmar/);
  assert.equal(j.controlesDe('perfis-editor').get('bio').valor, 'Uma biografia longa que custou a ser escrita.');
  j.evento({ nome: 'botao', chave: 'descartar' }); await assentar();
  assert.equal(j.controlesDe('perfis-editor').get('bio').valor, '');
});

test('PERFIS: descartar na confirmação do produto apaga o rascunho', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'campo', chave: 'bio', valor: 'Escrito e descartado.' }); await assentar();
  j.evento({ nome: 'fechar-pedido', superficie: 'perfis-editor', porque: 'saida-do-produto', temAlteracoes: true });
  j.evento({ nome: 'fechar', superficie: 'perfis-editor', porque: 'saida-do-produto', descartou: true });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  assert.equal(j.controlesDe('perfis-editor').get('bio').valor, '');
  assert.equal(j.superficies.get('perfis-editor').sujo, false, 'o editor reabriu sujo');
});

// ---- as imagens ----
test('PERFIS: a imagem vem do servidor deste MOD pelo volume, e nunca de um endereço', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const arvore = JSON.stringify(j.superficie('perfis-editor'));
  assert.match(arvore, /"doServidor"/);
  assert.match(arvore, /"op":"asset"/);
  assert.match(arvore, /"transporte":"volume"/);
  assert.doesNotMatch(arvore, /https?:/);
});

test('PERFIS: o avatar é publicado, reaproveitado, trocado e revogado', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  const doDois = () => j.contribuicoesDe('pessoa.avatar').filter(c => c.alvo === '2');
  assert.equal(doDois().length, 1);
  const primeira = doDois()[0];
  assert.equal(primeira.conteudo.doServidor.pedido.slot, 'avatar');
  gravarDireto(m, '1', { status: 'outra pessoa mudou' });
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(doDois()[0].handle, primeira.handle, 'um aviso sem mudança do avatar recriou a contribuição');
  const segunda = trocarImagem(m, '2', 'avatar');
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(doDois().length, 1);
  assert.equal(doDois()[0].conteudo.doServidor.pedido.path, segunda);
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'botao', chave: 'tirar-avatar' }); await assentar(20);
  assert.equal(doDois().length, 0, 'tirar a foto deixou o avatar nas outras superfícies');
  trocarImagem(m, '2', 'avatar');
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(doDois().length, 1);
});

test('PERFIS: a imagem escolhida chega inteira ao servidor, e o arquivo é devolvido', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const png = PNG(70000);
  const id = j.escolher('avatar', png);
  await assentar(40);
  const perfil = m.chamar({ op: 'view', people: ['2'] }, { pessoa: '2' }).profiles['2'];
  assert.ok(perfil.avatar?.startsWith('volume:'), 'o retrato não foi publicado pelo volume');
  assert.deepEqual(m.volumes.get(perfil.avatar.slice(7)), png);
  assert.deepEqual(j.soltos, [id]);
});

test('PERFIS: foto e faixa atualizam a prévia com texto ainda não gravado', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'campo', chave: 'bio', valor: 'Rascunho preservado' }); await assentar();
  for (const slot of ['avatar', 'banner', 'avatar']) {
    const anterior = m.chamar({ op: 'view' }, { pessoa: '2' }).profiles['2'][slot];
    j.escolher(slot, PNG(30, slot.length));
    await assentar(40);
    const perfil = m.chamar({ op: 'view' }, { pessoa: '2' }).profiles['2'];
    assert.ok(perfil[slot]);
    assert.notEqual(perfil[slot], anterior);
    assert.ok(JSON.stringify(j.superficie('perfis-editor')).includes(perfil[slot]), 'a prévia não mostra a imagem nova');
    assert.equal(j.controlesDe('perfis-editor').get('bio').valor, 'Rascunho preservado');
  }
});

test('PERFIS: um envio pelo volume que falha devolve o arquivo e diz o motivo', async () => {
  const m = mundo();
  const j = janela(m, { falharEnvio: { nome: 'nao-gravei' } });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const id = j.escolher('avatar', PNG(64));
  await assentar(40);
  assert.deepEqual(j.soltos, [id]);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /O servidor não conseguiu gravar a imagem/);
  assert.equal(m.chamar({ op: 'view', people: ['2'] }, { pessoa: '2' }).profiles['2'].avatar, null);
});

test('PERFIS: cancelar o seletor é neutro; falhar é dito', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const antes = j.pedidos.length;
  j.evento({ nome: 'arquivo', chave: 'avatar', arquivo: null, resultado: 'cancelado' }); await assentar();
  assert.equal(j.pedidos.length, antes);
  j.evento({ nome: 'arquivo', chave: 'avatar', arquivo: null, resultado: 'falhou', porque: 'papel-nao-serve:som' }); await assentar();
  assert.equal(j.pedidos.length, antes);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /papel-nao-serve:som/);
});

test('PERFIS: um som escolhido no lugar de uma imagem é recusado pelo nome', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.escolher('avatar', Buffer.alloc(16), 'audio/wav');
  await assentar(20);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /Escolha uma imagem/);
});

// ---- um executor sem `console` ----
//
// Nos apps 0.14.2 e 0.15.0 o `console.warn` do caminho de erro virava
// `ReferenceError`, e a recusa derrubava a consulta antes da entrada «Perfis».
test('PERFIS: sem console no executor, uma recusa não derruba o MOD', async () => {
  const m = mundo();
  const j = janela(m, { semConsole: true, recusar: { 'pessoa.avatar': 'teto-de-alvos' }, pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  assert.equal(j.contribuicoesDe('servidor.navegacao').length, 1, 'a entrada de navegação não foi registrada: ' + JSON.stringify(j.toasts));
  assert.ok(!JSON.stringify(j.toasts).includes('console'), JSON.stringify(j.toasts));
});

// ---- o perfil é do servidor ----
//
// Todo pedido do PERFIS vai sem canal: o `0` quer dizer «nenhum canal», e o
// servidor do MOD recebe `channel: null`. Num servidor só de voz, a 3.x dizia
// «Entre em um servidor com um canal de texto» e não mostrava nada.
test('PERFIS: num servidor só de voz, os perfis aparecem', async () => {
  const m = mundo();
  gravarDireto(m, '2', { displayName: 'Lia' });
  const j = janela(m, { canais: [] });
  await assentar();
  assert.ok(j.pedidos.length, 'nenhum pedido saiu');
  assert.ok(j.pedidos.every(p => p.canal === 0), 'um pedido saiu com canal: ' + JSON.stringify(j.pedidos.map(p => p.canal)));
  j.agir('abrir-diretorio'); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-diretorio')), /Lia/);
});

test('PERFIS: quem entra é consultado sozinho, e quem sai perde o que o MOD apresentava dela', async () => {
  const m = mundo();
  const pessoas = semearPerfis(m, 3, { comImagens: true });
  const j = janela(m, { pessoas: pessoas.slice(0, 2) });
  await assentar();
  const antes = j.pedidos.length;
  j.entrou(3, 'Pessoa 3'); await assentar();
  assert.deepEqual(j.pedidos.slice(antes).map(p => p.corpo.people), [['3']]);
  assert.ok(j.contribuicoesDe('pessoa.avatar').some(c => c.alvo === '3'), 'quem entrou não ganhou o avatar');
  j.saiu(3); await assentar();
  assert.ok(!j.contribuicoesDe('pessoa.avatar').some(c => c.alvo === '3'), 'quem saiu manteve o avatar');
});

// ---- o aviso do servidor no lugar do laço ----
test('PERFIS: com o aviso do servidor não há laço, e o aviso traz o perfil novo', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  assert.equal(j.relogios.length, 0, 'o PERFIS ainda consulta em laço');
  gravarDireto(m, '1', { displayName: 'Ana' });
  const antes = j.pedidos.length;
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.deepEqual(j.pedidos.slice(antes).map(p => p.corpo.people), [['1']]);
  j.agir('abrir-diretorio'); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-diretorio')), /Ana/);
});

test('PERFIS: o aviso da própria gravação não pede o perfil de novo', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  gravarPeloEditor(j, { displayName: 'Lia' }); await assentar(20);
  const antes = j.pedidos.length;
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(j.pedidos.length, antes, 'a janela que gravou pediu de novo o que a resposta do save já trouxe');
});

test('PERFIS: sem o aviso do servidor, o laço de 4 s continua', async () => {
  const j = janela(mundo(), { semAvisoDoServidor: true });
  await assentar();
  assert.deepEqual(j.relogios.map(r => r.ms), [4000]);
});

// ---- o cartão por pessoa ----
//
// Na 3.x o conjunto inteiro de cartões ia numa mensagem de 12 KiB, e a lista
// congelava a partir de umas 14 pessoas com foto e faixa. Na 6, cada pessoa é
// uma contribuição `pessoa.cartao` com `alvo`, numa mensagem própria, e o
// cartão cita a foto e a capa já carregadas em vez de repetir o pedido delas.
const cartaoDe = (j, alvo) => j.contribuicoesDe('pessoa.cartao').find(c => c.alvo === String(alvo));

test('PERFIS: 64 pessoas com foto e capa ganham cartão, um por mensagem, citando a imagem', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 64, { comImagens: true }) });
  await assentar(40);
  const cartoes = j.contribuicoesDe('pessoa.cartao');
  assert.equal(new Set(cartoes.map(c => c.alvo)).size, 64);
  for (const c of cartoes) {
    assert.equal(c.modo, 'substituir');
    assert.equal(c.acaoPrincipal, 'abrir-perfil');
    const texto = JSON.stringify(c.conteudo);
    assert.match(texto, /"fundoDeMidia":\{"daPessoa":"capa"\}/);
    assert.match(texto, /"daPessoa":"avatar"/);
    assert.doesNotMatch(texto, /doServidor/, 'o cartão repete o pedido da imagem');
  }
});

test('PERFIS: o cartão apresenta o nome exibido e a cor, e não pronome nem status', async () => {
  const m = mundo();
  gravarDireto(m, '2', { displayName: 'Lia da Torre', pronouns: 'ela/dela', status: 'jogando', accent: '#a78bfa', effect: 'aurora' });
  const j = janela(m);
  await assentar();
  const texto = JSON.stringify(cartaoDe(j, 2)?.conteudo);
  assert.match(texto, /Lia da Torre/);
  assert.match(texto, /#a78bfa/);
  assert.match(texto, /"retrato"/);
  assert.doesNotMatch(texto, /ela\/dela/);
  assert.doesNotMatch(texto, /jogando/);
  assert.equal(cartaoDe(j, 2).conteudo[0].estilo.altura, 44, 'o cartão deixou de ser compacto');
  assert.equal(cartaoDe(j, 1), undefined, 'quem não escreveu nada ganhou um cartão vazio');
  for (const proibida of ['"botao"', '"campo"', '"escolha"', '"arquivo"', '"tela"', '"link"']) {
    assert.ok(!texto.includes(proibida), `o cartão declarou ${proibida}`);
  }
  assert.deepEqual(j.recusadosDeCartao, []);
});

test('PERFIS: o clique no cartão de outra pessoa chega com o id que o produto escreveu', async () => {
  const m = mundo();
  gravarDireto(m, '1', { displayName: 'Ana' });
  const j = janela(m);
  await assentar();
  j.agir(cartaoDe(j, 1).acaoPrincipal, '1'); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-detalhes')), /ID 1/);
});

test('PERFIS: mudar o nome atualiza o cartão sem revogar', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2) });
  await assentar();
  const antes = cartaoDe(j, 2).handle;
  gravarDireto(m, '2', { displayName: 'Outro' });
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(cartaoDe(j, 2).handle, antes);
  assert.match(JSON.stringify(cartaoDe(j, 2).conteudo), /Outro/);
  assert.ok(!j.historico.some(h => h.acao === 'revogar' && h.handle === antes));
});

test('PERFIS: 128 pessoas com foto, o máximo do servidor, cabem no modelo da 6', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 128, { comImagens: true }) });
  await assentar(80);
  for (const ponto of ['pessoa.cartao', 'pessoa.avatar']) assert.equal(j.contribuicoesDe(ponto).length, 128, ponto);
  assert.ok(!j.registro.some(l => /ficaram com a apresentação do SEELE/.test(l)));
});

test('PERFIS: nunca registra duas vezes o mesmo ponto para a mesma pessoa', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 3, { comImagens: true }) });
  await assentar();
  for (let n = 0; n < 3; n += 1) {
    gravarDireto(m, '2', { displayName: 'Volta ' + n });
    j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  }
  const registros = j.historico.filter(h => h.acao === 'registrar').map(h => h.pedido.ponto + ':' + h.pedido.alvo);
  assert.equal(new Set(registros).size, registros.length, 'um ponto foi registrado duas vezes para a mesma pessoa');
  assert.ok(!j.registro.some(l => /contribuicao-ja-existe/.test(l)), 'o MOD tentou registrar de novo: ' + JSON.stringify(j.registro));
});

test('PERFIS: no teto de alvos, o próprio cartão fica e o registro diz quantos faltaram', async () => {
  const m = mundo();
  // Quem usa é a pessoa 50: sem a prioridade, ela ficaria fora dos 40.
  const j = janela(m, { pessoas: semearPerfis(m, 64, { comImagens: true }), tetoDeAlvos: 40, eu: 50 });
  await assentar(40);
  assert.ok(cartaoDe(j, 50), 'o próprio cartão ficou de fora');
  assert.ok(j.registro.some(l => /24 pessoa\(s\) ficaram com a apresentação do SEELE/.test(l)), JSON.stringify(j.registro));
});

// ---- a capa da pessoa ----
//
// O PERFIS registra `pessoa.capa` para quem tem faixa; o produto a aplica no
// cartão da chamada, no fundo da barra do operador (no computador) e no «SEU
// PERFIL». A foto e a capa trocam pelo `atualizar`, sem revogar.
const capaDe = (j, alvo) => j.contribuicoesDe('pessoa.capa').find(c => c.alvo === String(alvo));

test('PERFIS: quem tem faixa ganha pessoa.capa, e trocar a faixa atualiza o mesmo handle', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  const capa = capaDe(j, 2);
  assert.ok(capa, 'a pessoa com faixa não ganhou capa');
  assert.equal(capa.modo, 'substituir');
  assert.equal(capa.conteudo.doServidor.canal, 0);
  assert.equal(capa.conteudo.doServidor.pedido.slot, 'banner');
  const handle = capa.handle, caminho = capa.conteudo.doServidor.pedido.path;
  trocarImagem(m, '2', 'banner');
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  assert.equal(capaDe(j, 2).handle, handle);
  assert.notEqual(capaDe(j, 2).conteudo.doServidor.pedido.path, caminho);
});

test('PERFIS: a foto e a capa trocam pelo atualizar, sem registrar de novo', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 3, { comImagens: true }) });
  await assentar();
  for (const slot of ['avatar', 'banner', 'avatar']) {
    trocarImagem(m, '2', slot);
    j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  }
  const registros = j.historico.filter(h => h.acao === 'registrar').map(h => h.pedido.ponto + ':' + h.pedido.alvo);
  assert.equal(new Set(registros).size, registros.length, 'uma imagem foi registrada duas vezes para a mesma pessoa');
  assert.ok(!j.historico.some(h => h.acao === 'revogar'), 'trocar uma imagem revogou a contribuição');
  assert.ok(!j.registro.some(l => /contribuicao-ja-existe/.test(l)), JSON.stringify(j.registro));
});

test('PERFIS: tirar a faixa revoga a capa; quem não tem faixa não ganha', async () => {
  const m = mundo();
  gravarDireto(m, '1', { displayName: 'Sem imagem' });
  const j = janela(m, { pessoas: [{ id: 1, apelido: 'Alex' }, { id: 2, apelido: 'Lia' }] });
  await assentar();
  trocarImagem(m, '2', 'banner');
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar();
  await assentar();
  assert.ok(capaDe(j, 2), 'quem pôs faixa não ganhou capa');
  assert.equal(capaDe(j, 1), undefined, 'quem não tem faixa ganhou capa');
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'botao', chave: 'tirar-banner' }); await assentar(20);
  assert.equal(capaDe(j, 2), undefined, 'tirar a faixa deixou a capa');
});

test('PERFIS: a capa de quem usa, recusada pelo produto, é dita no editor', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'midia', chave: 'capa', ponto: 'pessoa.capa', alvo: '2', estado: 'falhou', porque: 'passa do teto de quadros' });
  await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /capa não aparece na chamada.*passa do teto de quadros/);
  j.evento({ nome: 'midia', chave: 'capa', ponto: 'pessoa.capa', alvo: '1', estado: 'falhou', porque: 'x' });
  await assentar();
  assert.ok(j.registro.some(l => /capa da pessoa 1/.test(l)), 'a recusa de outra pessoa não foi anotada: ' + JSON.stringify(j.registro));
});

test('PERFIS: 128 pessoas com capa, o máximo do servidor, ganham a capa', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 128, { comImagens: true }) });
  await assentar(80);
  assert.equal(j.contribuicoesDe('pessoa.capa').length, 128);
});

test('PERFIS: no teto de alvos, a própria foto e a própria capa ficam', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 30, { comImagens: true }), tetoDeAlvos: 10, eu: 25 });
  await assentar(40);
  assert.ok(j.contribuicoesDe('pessoa.avatar').some(c => c.alvo === '25'), 'a própria foto ficou de fora');
  assert.ok(capaDe(j, 25), 'a própria capa ficou de fora');
  assert.ok(j.registro.some(l => /20 pessoa\(s\).*pessoa\.capa/.test(l)), JSON.stringify(j.registro));
});

// ---- o perfil numa folha, e o diretório por partes ----
// **A folha cita a capa e a foto da pessoa, com o id dela** (a citação com
// `pessoa`): a imagem é a que a contribuição já carregou, sem pedido novo nem
// bytes a mais no bolso da superfície, e com o movimento reduzido a capa é o
// quadro parado.
test('PERFIS: o perfil de outra pessoa abre numa folha, com a capa e a foto citadas e a identidade do servidor', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 2, { comImagens: true }) });
  await assentar();
  j.agir('abrir-perfil', '1'); await assentar();
  const tela = j.superficies.get('perfis-detalhes');
  assert.equal(tela.descricao.tipo, 'folha');
  const arvore = JSON.stringify(tela.atual);
  assert.match(arvore, /"fundoDeMidia":\{"daPessoa":"capa","pessoa":"1"\}/, 'a folha não cita a capa');
  assert.match(arvore, /"daPessoa":"avatar","pessoa":"1"/, 'a folha não cita a foto');
  assert.doesNotMatch(arvore, /doServidor/, 'a folha ainda pede a imagem ao servidor');
  assert.doesNotMatch(arvore, /[Ff]aixa|[Rr]etrato de/, 'a folha fala em faixa ou retrato');
  assert.match(arvore, /neste servidor: Pessoa 1 · ID 1/);
});

// Na 3.x o diretório tinha páginas de dez só porque a declaração inteira não
// cabia numa mensagem de 12 KiB. Com `superficie.atualizar`, ele monta um
// esqueleto e um cartão por mensagem.
test('PERFIS: o diretório mostra todo mundo, montado por partes e sem páginas', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 64, { comImagens: true }) });
  await assentar(40);
  j.agir('abrir-diretorio'); await assentar(80);
  const tela = j.superficies.get('perfis-diretorio');
  const trocadas = new Set(tela.atualizacoes.map(a => a.chave));
  assert.equal([...trocadas].filter(c => /^dir-\d+$/.test(c)).length, 64, 'um cartão por pessoa');
  assert.equal([...trocadas].filter(c => c.startsWith('dir-bloco-')).length, 3, 'um bloco a cada 24 pessoas');
  assert.ok(!j.controlesDe('perfis-diretorio').has('diretorio-proximas'), 'o diretório ainda tem páginas');
  assert.match(JSON.stringify(tela.atual), /64 pessoa\(s\) neste servidor/);
  assert.match(JSON.stringify(tela.atual), /Nome exibido 64/);
});

test('PERFIS: no diretório aberto, um perfil que muda troca só o cartão dele', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 5) });
  await assentar();
  j.agir('abrir-diretorio'); await assentar(20);
  const tela = j.superficies.get('perfis-diretorio');
  const montagens = tela.arvores.length, partes = tela.atualizacoes.length;
  gravarDireto(m, '3', { displayName: 'Mudou' });
  j.avisoDoServidor(m.avisos.at(-1).carga); await assentar(20);
  assert.equal(tela.arvores.length, montagens, 'um perfil que mudou remontou o diretório inteiro');
  assert.deepEqual(tela.atualizacoes.slice(partes).map(a => a.chave), ['dir-3']);
  assert.match(JSON.stringify(tela.atual), /Mudou/);
});

// ---- o editor como formulário declarado ----
//
// O produto valida o tamanho de cada campo, monta GRAVAR e FECHAR, e deriva o
// `sujo` do valor contra o inicial. A recusa de campo do servidor volta ao
// campo por `formulario.erros`.
test('PERFIS: o editor declara os limites e o primário, e a recusa de campo do servidor volta ao campo', async () => {
  const m = mundo();
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const c = j.controlesDe('perfis-editor');
  assert.equal(c.get('displayName').tamanhoMaximo, 40);
  assert.equal(c.get('pronouns').tamanhoMaximo, 30);
  assert.equal(c.get('status').tamanhoMaximo, 60);
  assert.equal(c.get('bio').tamanhoMaximo, 280);
  assert.equal(c.get('perfil').forma, 'formulario');
  assert.equal(c.get('perfil').primario, 'GRAVAR');
  assert.equal(c.get('gravar'), undefined, 'o editor ainda monta o próprio botão de gravar');
  gravarPeloEditor(j, { displayName: 'x'.repeat(41) }); await assentar(20);
  assert.deepEqual({ ...j.superficies.get('perfis-editor').erros }, { displayName: 'até 40 caracteres' });
  assert.equal(j.controlesDe('perfis-editor').get('displayName').valor, 'x'.repeat(41), 'a recusa apagou o que foi escrito');
});

test('PERFIS: o rascunho guardado reabre o editor sujo, e o valor gravado é o inicial', async () => {
  const m = mundo();
  gravarDireto(m, '2', { bio: 'Gravada' });
  const j = janela(m);
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.evento({ nome: 'campo', chave: 'bio', valor: 'Rascunho guardado' }); await assentar();
  j.evento({ nome: 'fechar', superficie: 'perfis-editor', porque: 'saida-do-produto' }); await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const bio = j.controlesDe('perfis-editor').get('bio');
  assert.equal(bio.valor, 'Rascunho guardado');
  assert.equal(bio.inicial, 'Gravada');
  assert.equal(j.superficies.get('perfis-editor').sujo, true, 'o editor reabriu limpo com um rascunho');
});

test('PERFIS: a prévia acompanha a digitação por atualizar, sem remontar o editor', async () => {
  const j = janela(mundo());
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const tela = j.superficies.get('perfis-editor');
  const montagens = tela.arvores.length;
  j.evento({ nome: 'campo', chave: 'displayName', valor: 'Lia' }); await assentar();
  assert.equal(tela.arvores.length, montagens, 'uma tecla remontou o editor inteiro');
  assert.match(JSON.stringify(tela.atualizacoes.filter(a => a.chave === 'previa').at(-1)), /Lia/);
});

test('PERFIS: uma foto HEIC é recusada pelo nome do formato', async () => {
  const j = janela(mundo(), { falharEnvio: { nome: 'tipo-recusado', detectado: 'heic' } });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  j.escolher('avatar', Buffer.alloc(64, 1), 'image/heic'); await assentar(40);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /HEIC não é aceito.*PNG, JPEG, WebP ou GIF/);
});

test('PERFIS: sem envio de imagem nesta plataforma, o editor diz por quê e não mostra o seletor', async () => {
  const j = janela(mundo(), { semEnviar: true, semArquivo: true, onde: 'celular' });
  await assentar();
  j.agir('abrir-perfil', '2'); await assentar();
  const c = j.controlesDe('perfis-editor');
  assert.equal(c.get('avatar'), undefined);
  assert.equal(c.get('banner'), undefined);
  assert.match(JSON.stringify(j.superficie('perfis-editor')), /foto e capa se trocam pelo computador/);
});

// ---- o efeito ----
//
// O efeito era gravado desde a 1.x e não aparecia em lugar nenhum. A `aurora`
// do produto anima `background-position` com `background-size: 220%`: posta no
// retrato, ela ampliaria a foto. Por isso ela vai numa moldura com gradiente,
// atrás do retrato.
test('PERFIS: o efeito escolhido aparece como a moldura animada do retrato', async () => {
  const m = mundo();
  const j = janela(m, { pessoas: semearPerfis(m, 3, { efeitos: { 1: 'none', 2: 'aurora', 3: 'sparkle' } }) });
  await assentar();
  const doCartao = alvo => JSON.stringify(j.contribuicoesDe('pessoa.cartao').find(c => c.alvo === String(alvo)).conteudo);
  assert.match(doCartao(2), /"animacao":"aurora"/);
  assert.match(doCartao(2), /"gradiente"/);
  assert.match(doCartao(3), /"animacao":"brilho"/, 'sparkle é o brilho do produto');
  assert.doesNotMatch(doCartao(1), /"animacao"/);
  j.agir('abrir-perfil', '3'); await assentar();
  assert.match(JSON.stringify(j.superficie('perfis-detalhes')), /"animacao":"brilho"/, 'o perfil não mostra o efeito');
  j.agir('abrir-diretorio'); await assentar(20);
  assert.match(JSON.stringify(j.superficie('perfis-diretorio')), /"animacao":"aurora"/, 'o diretório não mostra o efeito');
});

// ---- a presença e os avisos, juntados ----
//
// Na 6 não há laço: o PERFIS sabe de quem entra, de quem sai e de quem mudou
// pelos eventos. O produto entrega um evento por pessoa que entrou, recusa o
// nono pedido em voo, e junta os avisos acima de quatro por segundo, ficando
// com o mais novo. Cada evento com o seu pedido perdia gente; os eventos agora
// só marcam o que falta, e uma tarefa só lê.

test('PERFIS: quem entra em rajada ganha cartão, com o teto de oito pedidos em voo', async () => {
  const m = mundo();
  semearPerfis(m, 20);
  const j = janela(m, { pessoas: [{ id: 1, apelido: 'Pessoa 1' }, { id: 2, apelido: 'Pessoa 2' }], latencia: 2 });
  await assentar(60);
  for (let id = 3; id <= 14; id += 1) j.entrou(id, 'Pessoa ' + id);
  await assentar(600);
  const comCartao = new Set(j.contribuicoesDe('pessoa.cartao').map(c => c.alvo));
  const sem = Array.from({ length: 12 }, (_, i) => String(i + 3)).filter(id => !comCartao.has(id));
  assert.deepEqual(sem, [], 'ficaram sem cartão: ' + sem.join(', '));
  assert.ok(j.maiorEmVoo <= TETO_EM_VOO);
});

test('PERFIS: quem entra ou sai durante a primeira consulta não fica de fora nem fica como fantasma', async () => {
  const m = mundo();
  semearPerfis(m, 4);
  let primeira = true;
  const j = janela(m, {
    pessoas: [1, 2, 3].map(id => ({ id, apelido: 'Pessoa ' + id })),
    // Os dois eventos chegam enquanto a primeira consulta está no servidor.
    aoPedir: (corpo, padrao) => {
      if (primeira && corpo.op === 'view') { primeira = false; j.entrou(4, 'Pessoa 4'); j.saiu(3); }
      return padrao();
    },
  });
  await assentar(120);
  assert.deepEqual(j.contribuicoesDe('pessoa.cartao').map(c => c.alvo).sort(), ['1', '2', '4']);
  j.agir('abrir-diretorio'); await assentar(80);
  const diretorio = JSON.stringify(j.superficie('perfis-diretorio'));
  assert.match(diretorio, /Nome exibido 4/);
  assert.doesNotMatch(diretorio, /Nome exibido 3/, 'quem saiu ficou no diretório');
});

test('PERFIS: a consulta de quem entrou que falha é tentada de novo', async () => {
  const m = mundo();
  semearPerfis(m, 3);
  let falhar = true;
  const j = janela(m, {
    pessoas: [{ id: 1, apelido: 'Pessoa 1' }, { id: 2, apelido: 'Pessoa 2' }],
    aoPedir: (corpo, padrao) => {
      if (falhar && corpo.op === 'view' && corpo.people?.includes('3')) { falhar = false; return { ok: false, error: 'O servidor não respondeu.' }; }
      return padrao();
    },
  });
  await assentar(40);
  j.entrou(3, 'Pessoa 3'); await assentar(40);
  assert.equal(cartaoDe(j, 3), undefined);
  assert.ok(j.relogios.length > 0, 'a consulta que falhou não foi agendada de novo');
  j.tick(); await assentar(40);
  assert.ok(cartaoDe(j, 3), 'a pessoa 3 continuou sem cartão');
});

test('PERFIS: avisos juntados pelo produto não deixam perfil velho', async () => {
  const m = mundo();
  const pessoas = semearPerfis(m, 8);
  const j = janela(m, { pessoas });
  await assentar(40);
  // Seis gravações no mesmo segundo: o produto entrega quatro e o mais novo.
  for (let id = 3; id <= 8; id += 1) gravarDireto(m, id, { displayName: 'Novo ' + id });
  entregarAvisos(m, [j]);
  await assentar(120);
  for (let id = 3; id <= 8; id += 1) {
    assert.match(JSON.stringify(cartaoDe(j, id)?.conteudo), new RegExp('Novo ' + id), 'o cartão da pessoa ' + id + ' ficou velho');
  }
});

// ---- o diretório de um servidor cheio ----

test('PERFIS: o diretório de 250 pessoas abre, por partes que cabem numa mensagem', async () => {
  const m = mundo();
  const pessoas = semearPerfis(m, 250);
  const j = janela(m, { pessoas });
  await assentar(200);
  j.agir('abrir-diretorio'); await assentar(800);
  assert.deepEqual(j.toasts.filter(t => t.tom === 'erro').map(t => t.mensagem), []);
  const partes = j.controlesDe('perfis-diretorio');
  const faltam = pessoas.filter(p => !JSON.stringify(partes.get('dir-' + p.id) ?? null).includes('Nome exibido ' + p.id + '"'));
  assert.deepEqual(faltam.map(p => p.id), [], 'o diretório ficou sem estas pessoas');
});

test('PERFIS: um diretório que não montou não repete o erro a cada evento', async () => {
  const m = mundo();
  const pessoas = semearPerfis(m, 4);
  const j = janela(m, { pessoas, recusarMontagem: ['perfis-diretorio'] });
  await assentar(40);
  j.agir('abrir-diretorio'); await assentar(40);
  const erros = () => j.toasts.filter(t => t.tom === 'erro').length;
  assert.equal(erros(), 1, 'a falha de abrir não foi dita');
  gravarDireto(m, 3, { displayName: 'Outro nome' });
  entregarAvisos(m, [j]); await assentar(40);
  j.saiu(4); await assentar(40);
  assert.equal(erros(), 1, 'o erro do diretório se repetiu a cada evento');
});

// ---- o editor ----

test('PERFIS: GRAVAR duas vezes seguidas grava uma vez, sem dizer que o perfil mudou em outra janela', async () => {
  const m = mundo();
  const j = janela(m, { latencia: 1 });
  await assentar(40);
  j.agir('abrir-perfil', '2'); await assentar(40);
  gravarPeloEditor(j, { displayName: 'Lia' });
  gravarPeloEditor(j, { displayName: 'Lia' });
  await assentar(120);
  assert.equal(j.pedidos.filter(p => p.corpo.op === 'save').length, 1);
  assert.doesNotMatch(JSON.stringify(j.superficie('perfis-editor')), /mudou em outra janela/);
});

test('PERFIS: o editor chama as imagens de foto e capa, como o resto do SEELE', async () => {
  const m = mundo();
  trocarImagem(m, 2, 'avatar');
  trocarImagem(m, 2, 'banner');
  const j = janela(m);
  await assentar(40);
  j.agir('abrir-perfil', '2'); await assentar(40);
  const c = j.controlesDe('perfis-editor');
  assert.equal(c.get('avatar').dentro, 'FOTO');
  assert.equal(c.get('banner').dentro, 'CAPA');
  assert.equal(c.get('tirar-avatar').dentro, 'TIRAR FOTO');
  assert.equal(c.get('tirar-banner').dentro, 'TIRAR CAPA');
  assert.doesNotMatch(JSON.stringify(j.superficie('perfis-editor')), /FAIXA|RETRATO|[Ff]aixa|[Rr]etrato de/);
});
