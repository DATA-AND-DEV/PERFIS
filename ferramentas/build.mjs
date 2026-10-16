import { readFileSync, writeFileSync } from 'node:fs';
const fontes = ['interface.js', 'perfis.js'];
const codigo = fontes.map(nome => readFileSync(new URL(nome, import.meta.url), 'utf8')).join('\n');
// O cabeçalho diz a API do manifesto, e não uma que ficou escrita aqui: ele
// dizia «API 3» num pacote da 5.
const manifesto = JSON.parse(readFileSync(new URL('../mod.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../cliente/main.js', import.meta.url), '/* Gerado por ferramentas/build.mjs. API ' + manifesto.api + '. */\n(() => {\n"use strict";\n' + codigo + '\n})();\n');
