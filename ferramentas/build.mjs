import { readFileSync, writeFileSync } from 'node:fs';
const fontes = ['interface.js', 'perfis.js'];
const codigo = fontes.map(nome => readFileSync(new URL(nome, import.meta.url), 'utf8')).join('\n');
writeFileSync(new URL('../cliente/main.js', import.meta.url), '/* Gerado por ferramentas/build.mjs. API 3. */\n(() => {\n"use strict";\n' + codigo + '\n})();\n');
