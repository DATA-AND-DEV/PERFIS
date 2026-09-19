// Package only reviewed runtime files. Never overwrite an existing installation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination))throw new Error('Uso: node ferramentas/package.mjs /caminho/absoluto/novo/mods/autor/nome');
if(fs.existsSync(destination))throw new Error('Destino já existe. Escolha uma pasta nova para preservar a instalação e os dados.');
for(const file of ['mod.json','cliente/main.js','servidor/main.js']){
  const out=path.join(destination,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,file),out);
}
console.log(destination);
