// A metade de servidor pelo caminho real: o volume (ADR 0048).
//
// Até a 3.3.1, todos os testes de envio do servidor usavam `upload-part`, o
// envio em fragmentos que o cliente da API 5 em diante não percorre. O caminho
// do volume (`upload-start` com `transporte: 'volume'`, `upload-finish` e a
// coleta dos arquivos de `volume:`) não tinha teste próprio.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mundo } = require('./laboratorio.cjs');

const membro = { pessoa: '2', escrita: true };

test('Perfis: volume com token de outra pessoa ou tamanho divergente não publica', () => {
  const m = mundo();
  const inicio = m.chamar({ op: 'upload-start', slot: 'banner', transporte: 'volume', bytes: 16 }, membro);
  assert.equal(inicio.ok, true, inicio.error);
  assert.throws(() => m.enviar(inicio.token, Buffer.alloc(16), '3'), /token-desconhecido/);
  m.enviar(inicio.token, Buffer.alloc(15), '2');
  const fim = m.chamar({ op: 'upload-finish', token: inicio.token }, membro);
  assert.equal(fim.ok, false);
  assert.match(fim.error, /incompleta/);
  assert.equal(m.chamar({ op: 'view', people: ['2'] }, membro).profiles['2'].banner, null);
});

test('Perfis: substituir pelo volume apaga o arquivo anterior na coleta', () => {
  const m = mundo();
  const subir = () => {
    const i = m.chamar({ op: 'upload-start', slot: 'avatar', transporte: 'volume', bytes: 8 }, membro);
    m.enviar(i.token, Buffer.alloc(8, 1), '2');
    return m.chamar({ op: 'upload-finish', token: i.token }, membro).profile.avatar;
  };
  const primeira = subir();
  subir();
  m.chamar({ op: 'view' }, membro);
  assert.equal(m.volumes.has(primeira.slice(7)), false, 'o arquivo substituído ficou no volume');
});

test('Perfis: o fragmento antigo continua legível, e o envio em fragmentos é recusado', () => {
  const m = mundo();
  m.arquivos.set('old.txt', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  m.dados.profiles = JSON.stringify({ '1': { revision: 1, avatar: 'old.txt' } });
  assert.match(m.chamar({ op: 'asset', person: '1', slot: 'avatar' }).image, /^data:image\/gif/);
  assert.equal(m.chamar({ op: 'upload-start', slot: 'avatar', length: 100 }, membro).ok, false);
  assert.equal(m.chamar({ op: 'upload-part', token: 'x', index: 0, part: 'x' }, membro).ok, false);
});

// Os dados de um servidor que rodava a 3.3.1: a metade de servidor da 4.0.0
// lê o que a anterior gravou, sem migração.
test('Perfis: os dados gravados pela 3.3.1 continuam legíveis', () => {
  const m = mundo();
  m.volumes.set('images/2-1759900000-abc', Buffer.from('foto'));
  m.arquivos.set('uploads/3-antigo.parts.0', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  m.arquivos.set('uploads/3-antigo.parts', JSON.stringify({ format: 1, parts: 1, length: 78 }));
  m.dados.profiles = JSON.stringify({
    '2': { revision: 4, displayName: 'Lia', pronouns: 'ela/dela', bio: 'Bio', status: '', accent: '#a78bfa', effect: 'aurora', avatar: 'volume:images/2-1759900000-abc', banner: null },
    '3': { revision: 2, displayName: 'Ana', pronouns: '', bio: '', status: '', accent: '#f2521f', effect: 'none', avatar: null, banner: 'uploads/3-antigo.parts' },
  });
  m.dados['upload-2'] = JSON.stringify({ transport: 'volume', token: 't', path: 'volume:images/2-pendente', slot: 'banner', bytes: 8 });
  m.dados.garbage = JSON.stringify([{ path: 'volume:images/2-velho', next: 0 }]);
  const visto = m.chamar({ op: 'view', people: ['2', '3'] }, membro);
  assert.equal(visto.ok, true, visto.error);
  assert.equal(visto.profiles['2'].displayName, 'Lia');
  assert.equal(visto.profiles['3'].banner, 'uploads/3-antigo.parts');
  assert.deepEqual(m.chamar({ op: 'asset', person: '2', slot: 'avatar' }, membro), { ok: true, volume: 'images/2-1759900000-abc' });
  assert.match(m.chamar({ op: 'asset', person: '3', slot: 'banner' }, membro).image, /^data:image\/gif/);
  const gravado = m.chamar({ op: 'save', revision: 4, profile: { displayName: 'Lia 2', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'aurora' } }, membro);
  assert.equal(gravado.ok, true, gravado.error);
  assert.equal(gravado.profile.avatar, 'volume:images/2-1759900000-abc', 'gravar o texto perdeu a foto da 3.3.1');
});

// ---- o aviso às janelas ----
//
// As janelas deste MOD ficam sabendo que um perfil mudou, em vez de perguntar
// a cada 4 s. A carga é um valor JSON, e o aviso não leva canal: o perfil é do
// servidor inteiro.
test('Perfis: gravar avisa as janelas, sem canal e abaixo de 1 KiB; ler e recusar não avisam', () => {
  const m = mundo();
  const perfil = { displayName: 'Lia', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'none' };
  m.chamar({ op: 'view' }, membro);
  m.chamar({ op: 'save', revision: 9, profile: perfil }, membro);
  assert.equal(m.avisos.length, 0, 'uma gravação recusada avisou');
  m.chamar({ op: 'save', revision: 0, profile: perfil }, membro);
  assert.equal(m.avisos.length, 1);
  assert.equal(m.avisos[0].canal, undefined);
  assert.deepEqual(m.avisos[0].carga, { pessoa: '2', revisao: 1, serie: 1 });
  assert.ok(Buffer.byteLength(JSON.stringify(m.avisos[0].carga)) <= 1024);
  const i = m.chamar({ op: 'upload-start', slot: 'avatar', transporte: 'volume', bytes: 8 }, membro);
  m.enviar(i.token, Buffer.alloc(8), '2');
  m.chamar({ op: 'upload-finish', token: i.token }, membro);
  m.chamar({ op: 'clear-image', slot: 'avatar', revision: 2 }, membro);
  m.chamar({ op: 'reset', revision: 3 }, membro);
  assert.deepEqual(m.avisos.map(a => a.carga.revisao), [1, 2, 3, 4], 'imagem, tirar a imagem e recomeçar também avisam');
});

// **A série dos avisos.** O Servidor 1.0 junta os avisos acima de quatro por
// segundo e entrega só o mais novo; com a série, a janela sabe que pulou algum
// e relê todo mundo. A consulta diz a série de agora, que é de onde a janela
// conta.
test('Perfis: cada mudança avisada sobe a série, de todas as pessoas, e a consulta a diz', () => {
  const m = mundo();
  const perfil = { displayName: 'Lia', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'none' };
  assert.equal(m.chamar({ op: 'view' }, membro).serie, 0);
  m.chamar({ op: 'save', revision: 0, profile: perfil }, membro);
  m.chamar({ op: 'save', revision: 0, profile: perfil }, { pessoa: '3' });
  m.chamar({ op: 'save', revision: 9, profile: perfil }, { pessoa: '3' });
  assert.deepEqual(m.avisos.map(a => [a.carga.pessoa, a.carga.serie]), [['2', 1], ['3', 2]]);
  assert.equal(m.chamar({ op: 'view', people: ['2', '3'] }, membro).serie, 2);
});

// ---- o texto do perfil ----
//
// Num nome, os caracteres de controle e os de direção (U+202A–U+202E,
// U+2066–U+2069) servem para desenhar um texto que se lê como outro. A 3.x só
// conferia o tamanho.
test('Perfis: nome, pronomes e status recusam controles e bidi; a bio aceita quebra de linha', () => {
  const m = mundo();
  const base = { displayName: 'Lia', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'none' };
  for (const [campo, valor] of [['displayName', 'Lia‮aila'], ['displayName', 'Li\na'], ['status', 'x\u0007'], ['pronouns', '⁦ela'], ['bio', 'texto‮oculto'],
    // As marcas de direção também (LRM, RLM e ALM): reordenam números e pontuação.
    ['displayName', 'Lia\u200f'], ['status', 'x\u200e'], ['pronouns', '\u061cela']]) {
    const r = m.chamar({ op: 'save', revision: 0, profile: { ...base, [campo]: valor } }, membro);
    assert.equal(r.ok, false, campo + ' aceitou ' + JSON.stringify(valor));
    assert.ok(r.erros?.[campo], 'a recusa não diz o campo: ' + JSON.stringify(r));
  }
  assert.equal(m.chamar({ op: 'save', revision: 0, profile: { ...base, bio: 'linha 1\nlinha 2' } }, membro).ok, true);
});

// **O limite conta caracteres como o produto** (`tamanhoMaximo` conta pontos de
// código). Contando unidades de UTF-16, um nome com emoji que o contador do
// editor aprovava era recusado pelo servidor.
test('Perfis: o limite do texto conta caracteres, e não unidades de UTF-16', () => {
  const m = mundo();
  const base = { displayName: 'Lia', pronouns: '', bio: '', status: '', accent: '#a78bfa', effect: 'none' };
  const comEmoji = m.chamar({ op: 'save', revision: 0, profile: { ...base, displayName: 'Lia ' + '🌸'.repeat(20) } }, membro);
  assert.equal(comEmoji.ok, true, comEmoji.error);
  const passou = m.chamar({ op: 'save', revision: 1, profile: { ...base, status: 'x'.repeat(59) + '🌸🌸' } }, membro);
  assert.equal(passou.ok, false);
  assert.ok(passou.erros?.status);
});

// ---- os órfãos do volume ----
//
// Um `upload-start` novo aposenta o envio anterior da mesma pessoa. Se a coleta
// achava o caminho aposentado ainda vazio, ela o tirava da lista, e os bytes
// que chegassem depois ficavam no volume para sempre.
test('Perfis: os bytes de um envio aposentado que chegam depois da coleta também saem', () => {
  const m = mundo();
  const a = m.chamar({ op: 'upload-start', slot: 'avatar', transporte: 'volume', bytes: 8 }, membro);
  m.chamar({ op: 'upload-start', slot: 'avatar', transporte: 'volume', bytes: 8 }, membro);
  m.chamar({ op: 'view' }, membro);          // a coleta acha o caminho de A ainda vazio
  m.enviar(a.token, Buffer.alloc(8), '2');    // os bytes de A chegam depois
  m.chamar({ op: 'view' }, membro);
  assert.equal([...m.volumes.keys()].length, 0, 'o arquivo do envio aposentado ficou no volume');
});
