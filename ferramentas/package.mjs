// Package only reviewed runtime files. Never overwrite an existing installation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination))throw new Error('Uso: node ferramentas/package.mjs /caminho/absoluto/novo/mods/autor/nome');
if(fs.existsSync(destination))throw new Error('Destino já existe. Escolha uma pasta nova para preservar a instalação e os dados.');
// **Os arquivos que o manifesto declara vão junto.**
//
// Sem esta linha, um pacote com trilha sonora era publicado sem a trilha: o
// `mod.json` nomeava `som/*.wav`, o produto servia o que o manifesto declara, e
// o arquivo não estava lá. O MOD tocaria silêncio e ninguém saberia por quê —
// o defeito que o CLAUDE.md deste repositório nomeia como o mais caro.
const manifest=JSON.parse(fs.readFileSync(path.join(root,'mod.json'),'utf8'));
const files=['mod.json','cliente/main.js','servidor/main.js',...(manifest.arquivos??[])];
for(const file of files){
  const origem=path.join(root,file);
  if(!fs.existsSync(origem))throw new Error('O manifesto declara «'+file+'» e ele não está no repositório.');
  const out=path.join(destination,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(origem,out);
}
console.log(destination);
