const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function server(mod){
  const source=fs.readFileSync(path.join(__dirname,'../servidor/main.js'),'utf8');
  const data={},files={};let now=1789694000,failWrite=false;
  return {data,files,setFailWrite(v){failWrite=v;},advance(n){now+=n;},call(request,ctx={person:'1',channel:1,admin:true,write:true}){
    // API 2 instantiates a fresh JS context for each authenticated request.
    const context=vm.createContext({dados:data,arquivos:{ler:p=>files[p]??null,escrever:(p,v)=>{if(failWrite)return false;files[p]=v;return true;},apagar:p=>{delete files[p];return true;}},mundo:{agora:()=>now},Math});
    vm.runInContext(source,context,{timeout:250});
    return JSON.parse(context.aoPedir(JSON.stringify(ctx),JSON.stringify(request)));
  }};
}
const member={person:'2',channel:1,admin:false,write:true};
const profile={displayName:'Mika ✨',pronouns:'ela/dela',bio:'Mestra de RPG\nCafé e aventuras.',status:'Preparando a sessão',accent:'#a78bfa',effect:'aurora'};
test('Perfis: identidade autenticada, persistência entre canais e isolamento entre servidores',()=>{
  const s=server('perfis');
  assert.equal(s.call({op:'save',revision:0,profile},member).ok,true);
  assert.equal(s.call({op:'view',people:['2']}).profiles['2'].displayName,profile.displayName);
  assert.equal(s.call({op:'view'}, {...member,channel:2}).profiles['2'].bio,profile.bio);
  assert.equal(s.call({op:'save',person:'1',admin:true,revision:1,profile},member).ok,false);
  assert.equal(server('perfis').call({op:'view'},member).profiles['2'].displayName,'');
  assert.equal(s.call({op:'save',revision:0,profile},member).ok,false);
  assert.equal(s.call({op:'save',revision:1,profile},{...member,write:false}).ok,false);
});
// A recusa de um campo diz qual campo e por quê, na forma combinada entre os
// MODs oficiais: `erros` mapeia a chave do controle do editor para um motivo
// curto, e vai direto ao `formulario.erros` da API 6. `error` continua a frase
// de hoje, que é o que o cliente da 3.x mostra.
test('Perfis: a recusa de campo diz o campo e o motivo, e a frase de sempre continua',()=>{
  const s=server('perfis');
  const texto=s.call({op:'save',revision:0,profile:{...profile,displayName:'a'.repeat(41),bio:'b'.repeat(281)}},member);
  assert.equal(texto.ok,false);
  assert.equal(texto.error,'Texto maior que o permitido.');
  assert.deepEqual(texto.erros,{displayName:'até 40 caracteres',bio:'até 280 caracteres'});
  const cor=s.call({op:'save',revision:0,profile:{...profile,accent:'roxo',effect:'url(evil)',status:'s'.repeat(61),pronouns:7}},member);
  assert.equal(cor.error,'Efeito ou cor inválidos.');
  assert.deepEqual(cor.erros,{accent:'uma cor #rrggbb',effect:'um dos efeitos da lista',pronouns:'um texto',status:'até 60 caracteres'});
  // Uma recusa que não é de campo não ganha `erros`.
  const revisao=s.call({op:'save',revision:7,profile},member);
  assert.equal(revisao.ok,false);
  assert.equal('erros' in revisao,false);
  assert.equal(s.call({op:'view'},member).profiles['2'].revision,0,'uma recusa gravou');
});
test('Perfis: rejeita opções inválidas sem modificar o perfil salvo',()=>{
  const s=server('perfis');
  for(const changed of [{displayName:'a'.repeat(41)},{bio:'a'.repeat(281)},{effect:'url(evil)'},{accent:'#fff;'}])assert.equal(s.call({op:'save',revision:0,profile:{...profile,...changed}}).ok,false);
  assert.equal(s.call({op:'view'}).profiles['1'].revision,0);
});
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const { mundo } = require('./laboratorio.cjs');
const doMembro={pessoa:'2',escrita:true};
/** Uma imagem pelo volume, do jeito que o cliente da 6 a manda. */
function subir(m,slot,bytes,ctx=doMembro){
  const inicio=m.chamar({op:'upload-start',slot,transporte:'volume',bytes:bytes.length},ctx);
  if(!inicio.ok)return inicio;
  m.enviar(inicio.token,bytes,ctx.pessoa);
  return m.chamar({op:'upload-finish',token:inicio.token},ctx);
}
/** Uma imagem antiga em fragmentos, como a 3.1 gravava, semeada direto no disco. */
function semearLegado(m,caminho,uri){
  let n=0;for(let i=0;i<uri.length;i+=6000,n++)m.arquivos.set(caminho+'.'+n,uri.slice(i,i+6000));
  m.arquivos.set(caminho,JSON.stringify({format:1,parts:n,length:uri.length}));
}
test('Perfis: banner GIF pelo volume fica público, e tirá-lo o tira',()=>{
  const m=mundo(),bytes=Buffer.from(gif.slice(gif.indexOf(',')+1),'base64');
  assert.equal(subir(m,'banner',bytes).ok,true);
  const caminho=m.chamar({op:'view',people:['2']},doMembro).profiles['2'].banner;
  assert.ok(caminho.startsWith('volume:'));
  assert.deepEqual(m.chamar({op:'asset',person:'2',slot:'banner'},{pessoa:'3'}),{ok:true,volume:caminho.slice(7)});
  assert.equal(m.chamar({op:'asset',person:'1',slot:'banner'}).image,null);
  assert.equal(m.chamar({op:'asset',person:'../../identity',slot:'banner'}).ok,false);
  assert.equal(m.chamar({op:'clear-image',slot:'banner',revision:1},doMembro).profile.banner,null);
});
test('Perfis: 10 MiB pelo volume publicam, 10 MiB mais um byte nem começam, e o token é de quem pediu',()=>{
  const m=mundo();
  for(const slot of ['avatar','banner'])assert.equal(subir(m,slot,Buffer.alloc(10*1024*1024,7)).ok,true,slot);
  const grande=m.chamar({op:'upload-start',slot:'banner',transporte:'volume',bytes:10*1024*1024+1},doMembro);
  assert.equal(grande.ok,false);assert.match(grande.error,/10 MiB/);
  const meu=m.chamar({op:'upload-start',slot:'avatar',transporte:'volume',bytes:8},doMembro);
  m.enviar(meu.token,Buffer.alloc(8),'2');
  assert.equal(m.chamar({op:'upload-finish',token:meu.token},{pessoa:'3'}).ok,false,'outra pessoa terminou o envio de quem pediu');
});
test('Perfis: o volume que não aceita a espera não publica',()=>{
  const m=mundo({esperarRecusa:true});
  const r=m.chamar({op:'upload-start',slot:'avatar',transporte:'volume',bytes:8},doMembro);
  assert.equal(r.ok,false);assert.match(r.error,/iniciar o envio/);
  assert.equal(m.chamar({op:'view',people:['2']},doMembro).profiles['2'].avatar,null);
});
test('Perfis: o volume só espera PNG, JPEG, WebP e GIF',()=>{
  const m=mundo();
  const r=m.chamar({op:'upload-start',slot:'avatar',transporte:'volume',bytes:8},doMembro);
  assert.deepEqual([...m.esperas.get(r.token).tipos],['png','jpeg','webp','gif']);
});
test('Perfis: imagens antigas em fragmentos continuam legíveis, paginadas, e saem quando substituídas',()=>{
  const m=mundo();
  const binario=Buffer.alloc(200000);binario.write('GIF89a');
  const uri='data:image/gif;base64,'+binario.toString('base64');
  semearLegado(m,'uploads/2-antigo.parts',uri);
  m.dados.profiles=JSON.stringify({'2':{revision:1,displayName:'',pronouns:'',bio:'',status:'',accent:'#f2521f',effect:'none',avatar:'uploads/2-antigo.parts',banner:null}});
  const primeiro=m.chamar({op:'asset',person:'2',slot:'avatar'});
  assert.equal(primeiro.paged,true);assert.ok(primeiro.image.length<=65536);
  let lido=primeiro.image;
  while(lido.length<primeiro.total){
    const parte=m.chamar({op:'asset',person:'2',slot:'avatar',path:primeiro.path,offset:lido.length});
    assert.equal(parte.ok,true);assert.ok(parte.image.length<=65536);lido+=parte.image;
  }
  assert.equal(lido,uri);
  assert.equal(m.chamar({op:'asset',person:'2',slot:'avatar',path:'outro',offset:0}).ok,false);
  assert.equal(subir(m,'avatar',Buffer.alloc(8,1)).ok,true);
  for(let i=0;i<20;i++)m.chamar({op:'view'},doMembro);
  assert.equal([...m.arquivos.keys()].filter(k=>k.startsWith('uploads/2-antigo')).length,0,'os fragmentos substituídos ficaram no disco');
});
test('Perfis: uma imagem pelo volume preserva o texto e sobe a revisão',()=>{
  const m=mundo();
  assert.equal(m.chamar({op:'save',revision:0,profile},doMembro).ok,true);
  assert.equal(subir(m,'banner',Buffer.alloc(8,2)).ok,true);
  assert.equal(m.chamar({op:'view',people:['2']},doMembro).profiles['2'].displayName,profile.displayName);
  assert.equal(m.chamar({op:'save',revision:1,profile},doMembro).ok,false);
  assert.equal(m.chamar({op:'save',revision:2,profile},doMembro).ok,true);
});
test('Distribuição: manifestos e JavaScript válidos, pacote independente',()=>{
  for(const mod of ['perfis']){
    const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
    // A API que este pacote declara e o produto executa — ver `APIS_ACEITAS`.
    // A 5.0.0 é da API 7 (a linha do Servidor 2.0); a 4.0.0 é da API 6, do app 0.16.
    assert.equal(manifest.api,7,'API declarada: '+manifest.api);
    assert.equal(manifest.permissoes,undefined,'o PERFIS não declara ação: as permissões só existem a partir da API 7 e ele não tem operação protegida por cargo');assert.equal(manifest.id,'seele/'+mod);
    // **O alcance diz o que o MOD toca na 6.** A região saiu da API, e um
    // alcance que a cite promete a quem instala um lugar que não existe.
    assert.ok(Array.isArray(manifest.reach)&&manifest.reach.length>0&&manifest.reach.length<=16,'O alcance tem de 1 a 16 itens.');
    assert.ok(!manifest.reach.includes('regiao'),'O alcance ainda cita a região, que saiu na API 6.');
    for(const reach of manifest.reach)assert.ok(Buffer.byteLength(reach,'utf8')<=32,'Cada alcance deve caber no limite do protocolo.');
    new vm.Script(fs.readFileSync(path.join(dir,manifest.client),'utf8'));
    new vm.Script(fs.readFileSync(path.join(dir,manifest.server),'utf8'));
  }
});
// O README é o que quem instala lê antes do código. Na 3.3.0 ele ainda abria
// com «2.0.0» e «Requer API de MOD 3» e dizia que a API não permitia avatar
// nem banner, com o manifesto na 3.3.0 e na API 5.
test('Distribuição: o README abre com a versão e a API do manifesto',()=>{
  const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
  const readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');
  const [titulo,...resto]=readme.split('\n');
  assert.ok(titulo.endsWith('— '+manifest.version),'o título do README não diz a versão do manifesto: '+titulo);
  assert.ok(resto.slice(0,4).join('\n').includes('API de MOD '+manifest.api),'o README não abre com a API do manifesto');
});
module.exports={server};

// ---- API 7: o PERFIS não tem ação, e a regra de `self` continua a mesma ----
test('Perfis (API 7): self continua valendo — a pessoa edita o próprio perfil, e um corpo falsificado não edita o de outra',()=>{
  const s=server('perfis'),contexto={...member,acao:null,permissoes:[]};
  assert.equal(s.call({op:'save',revision:0,profile},contexto).ok,true);
  // O corpo diz ser outra pessoa, ser admin, ter permissão e trazer contexto: nada disso decide.
  const forjado={op:'save',revision:1,profile:{...profile,displayName:'Invasor'},person:'1',admin:true,acao:'editar-perfil',permissoes:['editar-perfil'],contexto:{person:'1',admin:true,acao:'editar-perfil'}};
  assert.equal(s.call(forjado,contexto).ok,false,'o corpo falsificado editou o perfil de outra pessoa');
  assert.equal(s.call({op:'view',people:['1']},contexto).profiles['1'],undefined,'o perfil da pessoa 1 passou a existir');
  assert.equal(s.call({op:'view',people:['2']},contexto).profiles['2'].displayName,profile.displayName);
  // `write` do canal segue sendo a permissão de escrever; sem ela, só lê.
  assert.equal(s.call({op:'save',revision:1,profile},{...contexto,write:false}).ok,false);
});
test('Perfis (API 7): nenhuma ação declarada — o servidor não tem o que conferir, e a ação inventada não chega',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../mod.json'),'utf8'));
  assert.equal(manifest.api,7);assert.equal(manifest.version,'5.0.0');assert.equal('permissoes' in manifest,false);
  const fonte=fs.readFileSync(path.join(__dirname,'../cliente/main.js'),'utf8');
  assert.ok(!/SeeleMods\.acao|api\.acao/.test(fonte),'o cliente usa SeeleMods.acao sem ação declarada');
  const servidor=fs.readFileSync(path.join(__dirname,'../servidor/main.js'),'utf8');
  assert.ok(!/contexto\.acao|ctx\.acao|ctx\.permissoes/.test(servidor),'o servidor guarda por uma ação que o manifesto não declara');
});
test('Perfis: atualizar da 4.0.0 (API 6) para a 5.0.0 mantém perfis, revisões e imagens, e a 5.0.0 segue a partir deles',()=>{
  const velha=path.join(__dirname,'../../../mods-oficiais-017/perfis');
  const m4=JSON.parse(fs.readFileSync(path.join(velha,'mod.json'),'utf8'));
  assert.equal(m4.api,6);assert.equal(m4.version,'4.0.0');
  const fonte4=fs.readFileSync(path.join(velha,'servidor/main.js'),'utf8'),fonte5=fs.readFileSync(path.join(__dirname,'../servidor/main.js'),'utf8');
  const data={},files={};
  const rodar=(fonte,req,ctx)=>{const c=vm.createContext({dados:data,arquivos:{ler:p=>files[p]??null,escrever:(p,v)=>{files[p]=v;return true;},apagar:p=>{delete files[p];return true;}},mundo:{agora:()=>1789694000},Math});vm.runInContext(fonte,c,{timeout:250});return JSON.parse(c.aoPedir(JSON.stringify(ctx),JSON.stringify(req)));};
  assert.equal(rodar(fonte4,{op:'save',revision:0,profile},member).ok,true);
  const antes=JSON.stringify(data);
  // A 5.0.0 lê o MESMO quintal e continua a revisão.
  const visto=rodar(fonte5,{op:'view',people:['2']},member);
  assert.equal(visto.profiles['2'].displayName,profile.displayName);assert.equal(visto.profiles['2'].revision,1);
  assert.equal(JSON.stringify(data),antes,'ler na 5.0.0 mexeu no quintal da 4.0.0');
  assert.equal(rodar(fonte5,{op:'save',revision:1,profile:{...profile,status:'Depois da atualização'}},member).ok,true);
  assert.equal(rodar(fonte5,{op:'view',people:['2']},member).profiles['2'].status,'Depois da atualização');
  assert.equal(rodar(fonte5,{op:'save',revision:1,profile},member).ok,false,'a revisão antiga não bloqueou');
});
