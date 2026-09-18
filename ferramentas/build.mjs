import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const common=readFileSync(new URL('./interface.js',import.meta.url),'utf8');
const queue=readFileSync(new URL('./fila.js',import.meta.url),'utf8');
for(const mod of ['perfis']){
  const specific=readFileSync(new URL('./'+mod+'.js',import.meta.url),'utf8');
  const path=new URL('../cliente/main.js',import.meta.url);
  writeFileSync(path,'/* Gerado por ferramentas/build.mjs. Sem dependências. */\n(()=>{\n"use strict";\n'+queue+'\n'+common+'\n'+specific+'\n})();\n');
  console.log(fileURLToPath(path));
}
