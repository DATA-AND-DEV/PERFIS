// A casca comum dos MODs oficiais, fora de qualquer um deles.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** A casca de `interface.js` com uma metade de servidor que responde `resposta`. */
function casca(resposta) {
  const ctx = vm.createContext({
    SeeleUI: {},
    SeeleMods: { request: async () => resposta },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ferramentas/interface.js'), 'utf8'), ctx);
  return ctx.interfaceMod('teste/casca', 'Casca');
}

// **A recusa por campo chega a quem a mostra.** A metade de servidor diz qual
// campo e por quê em `erros` (a forma combinada entre os MODs oficiais), e o
// formulário da API 6 os põe nos campos com `formulario.erros(falha.erros)`.
// Sem esta linha, o `request` lançava só a frase, e o mapa morria na casca.
test('casca: a recusa por campo vai presa no erro que o request lança', async () => {
  const erros = { text: 'texto sobre o fundo dá 1,00:1, e precisa de 4,5:1' };
  const { request } = casca({ ok: false, error: 'Contraste insuficiente.', erros });
  await assert.rejects(request(0, { op: 'save' }), falha => {
    assert.equal(falha.message, 'Contraste insuficiente.');
    assert.deepEqual({ ...falha.erros }, erros);
    return true;
  });
});

test('casca: a recusa que não é de campo continua sem erros', async () => {
  const { request } = casca({ ok: false, error: 'conflict' });
  await assert.rejects(request(0, { op: 'save' }), falha => {
    assert.equal(falha.message, 'conflict');
    assert.equal('erros' in falha, false);
    return true;
  });
  // Um `erros` que não é objeto não é o mapa de campo para motivo, e não vai
  // ao formulário: `formulario.erros('texto')` seria pedir ao produto que
  // adivinhasse.
  const { request: outro } = casca({ ok: false, error: 'conflict', erros: 'texto' });
  await assert.rejects(outro(0, { op: 'save' }), falha => {
    assert.equal('erros' in falha, false);
    return true;
  });
});
