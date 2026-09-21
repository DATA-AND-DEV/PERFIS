// Rajadas de digitação não podem multiplicar pedidos de montagem em voo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function agrupar() {
  const ctx = vm.createContext({ SeeleUI: {}, SeeleMods: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ferramentas/interface.js'), 'utf8'), ctx);
  return ctx.interfaceMod('teste/visual', 'Teste').agruparAtualizacoes;
}
test('redesenho: rajada retém só o último estado e não sobrepõe montagens', async () => {
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
test('redesenho: recusa é propagada e a próxima atualização pode recuperar', async () => {
  const pintar = agrupar()(async estado => { if (estado === 0) throw Error('recusa'); });
  await assert.rejects(pintar(0), /recusa/);
  await pintar(1);
});
