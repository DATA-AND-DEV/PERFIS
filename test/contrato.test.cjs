// A tabela do laboratório contra o contrato do SEELE.
//
// O laboratório da 3.x divergia do produto em pontos e modos, e um laboratório
// que discorda do produto ensina a coisa errada. Aqui a cópia é conferida
// contra o `api/v6.json` congelado. Sem `SEELE_RAIZ`, o teste diz por que não
// rodou, em vez de passar calado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CONTRATO } = require('./laboratorio.cjs');

const raiz = process.env.SEELE_RAIZ;
const fonte = raiz ? path.join(raiz, 'api/v6.json') : null;
const existe = fonte && fs.existsSync(fonte);

test('contrato: a tabela do laboratório é a do api/v6.json do SEELE',
  { skip: existe ? false : 'defina SEELE_RAIZ com um checkout do SEELE que tenha api/v6.json' }, () => {
    const v6 = JSON.parse(fs.readFileSync(fonte, 'utf8'));
    assert.deepEqual(CONTRATO.capacidades, v6.compatibilidade['capacidades-por-versao']['6']);
    assert.deepEqual(CONTRATO.pontos, v6.contribuicoes.pontos);
    assert.deepEqual(CONTRATO.tipos, v6.superficies.tipos);
    assert.deepEqual(CONTRATO.eventos, v6.eventos);
    assert.deepEqual(CONTRATO.formas, v6.formas);
    assert.equal(CONTRATO.alvosPorPonto, v6.contribuicoes['alvos-por-ponto']);
    assert.equal(CONTRATO.tetoSemAlvo, v6.contribuicoes.teto);
  });
