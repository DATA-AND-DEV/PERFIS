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
test('Perfis: rejeita opções inválidas sem modificar o perfil salvo',()=>{
  const s=server('perfis');
  for(const changed of [{displayName:'a'.repeat(41)},{bio:'a'.repeat(281)},{effect:'url(evil)'},{accent:'#fff;'}])assert.equal(s.call({op:'save',revision:0,profile:{...profile,...changed}}).ok,false);
  assert.equal(s.call({op:'view'}).profiles['1'].revision,0);
});
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
function upload(s,image=gif,ctx,slot='banner'){
  const start=s.call({op:'upload-start',slot,length:image.length},ctx);assert.equal(start.ok,true);
  let result;for(let n=0,i=0;n<image.length;n+=6000,i++){result=s.call({op:'upload-part',token:start.token,index:i,part:image.slice(n,n+6000)},ctx);if(!result.ok)break;}
  return result;
}
test('Perfis: banner GIF mantém bytes, fica público e resiste a runtime novo',()=>{
  const s=server('perfis');assert.equal(upload(s,gif,member).finished,true);
  assert.equal(s.call({op:'asset',person:'2',slot:'banner'}).image,gif);
  assert.equal(s.call({op:'asset',person:'1',slot:'banner'}).image,null);
  assert.equal(s.call({op:'asset',person:'../../identity',slot:'banner'}).ok,false);
  assert.equal(s.call({op:'clear-image',slot:'banner',revision:1},member).profile.banner,null);
});
test('Perfis: limites, ordem de fragmentos, token de outro usuário e expiração',()=>{
  const s=server('perfis');assert.equal(s.call({op:'upload-start',slot:'banner',length:4*Math.ceil(10*1048576/3)+33}).ok,false);
  const start=s.call({op:'upload-start',slot:'banner',length:gif.length});
  const part={op:'upload-part',token:start.token,index:0,part:gif};
  assert.equal(s.call({...part,index:1}).ok,false);
  assert.equal(s.call(part,member).ok,false);
  s.advance(601);assert.equal(s.call(part).ok,false);
});
for(const slot of ['avatar','banner'])test('Perfis: '+slot+' de 10 MiB viaja sem arquivo ou resposta gigante',()=>{
  const s=server();
  const binary=Buffer.alloc(10*1024*1024);binary.write('GIF89a');
  const image='data:image/gif;base64,'+binary.toString('base64');
  assert.equal(upload(s,image,member,slot).finished,true);
  assert.ok(Object.values(s.files).every(v=>v.length<=6000));
  const first=s.call({op:'asset',person:'2',slot});
  assert.equal(first.paged,true);assert.ok(first.image.length<=65536);
  let received=first.image;
  while(received.length<first.total){
    const p=s.call({op:'asset',person:'2',slot,path:first.path,offset:received.length});
    assert.equal(p.ok,true);assert.ok(p.image.length<=65536);received+=p.image;
  }
  assert.equal(received,image);
  assert.equal(s.call({op:'asset',person:'2',slot,path:'old',offset:0}).ok,false);
  assert.equal(s.call({op:'asset',person:'2',slot,path:first.path,offset:-1}).ok,false);
  assert.equal(s.call({op:'clear-image',slot,revision:1},member).ok,true);
  for(let i=0;i<100;i++)s.call({op:'view'});
  assert.equal(Object.keys(s.files).length,0,'limpeza incremental remove os fragmentos');
});
test('Perfis: imagens legadas continuam legíveis e são removidas após substituição',()=>{
  const s=server();s.files['old.txt']=gif;
  s.data.profiles=JSON.stringify({'1':{revision:1,avatar:'old.txt'}});
  assert.equal(s.call({op:'asset',person:'1',slot:'avatar'}).image,gif);
  assert.equal(upload(s,gif,undefined,'avatar').finished,true);
  s.call({op:'view'});assert.equal(s.files['old.txt'],undefined);
});
test('Perfis: 10 MiB mais um byte não publica e nova tentativa limpa o upload abandonado',()=>{
  const s=server();upload(s);
  const original=s.call({op:'view'}).profiles['1'].banner;
  const binary=Buffer.alloc(10*1024*1024+1);binary.write('GIF89a');
  const image='data:image/gif;base64,'+binary.toString('base64');
  assert.equal(upload(s,image).ok,false);
  assert.equal(s.call({op:'view'}).profiles['1'].banner,original);
  assert.equal(upload(s).finished,true);
  for(let i=0;i<100;i++)s.call({op:'view'});
  assert.equal(Object.keys(s.files).length,2,'só índice e fragmento da imagem publicada');
});
test('Perfis: padding no meio e upload incompleto não substituem imagem publicada',()=>{
  const s=server();upload(s);
  const original=s.call({op:'view'}).profiles['1'].banner;
  const up=s.call({op:'upload-start',slot:'banner',length:7000});
  assert.equal(s.call({op:'upload-part',token:up.token,index:0,part:gif+'A'.repeat(6000-gif.length-1)+'='}).ok,false);
  assert.equal(s.call({op:'view'}).profiles['1'].banner,original);
});
test('Perfis: gravação falha não publica imagem e SVG não é aceito',()=>{
  const s=server('perfis');s.setFailWrite(true);assert.equal(upload(s).ok,false);
  assert.equal(s.call({op:'view'}).profiles['1'].banner,null);
  s.setFailWrite(false);assert.equal(upload(s,'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok,false);
});
test('Perfis: upload dividido preserva texto editado e valida revisão após imagem',()=>{
  const s=server('perfis'),large=gif.slice(0,-4)+'AAAA'.repeat(4000)+'RAA7';
  assert.equal(s.call({op:'save',revision:0,profile}).ok,true);
  assert.equal(upload(s,large).finished,true);
  assert.equal(s.call({op:'view'}).profiles['1'].displayName,profile.displayName);
  assert.equal(s.call({op:'save',revision:1,profile}).ok,false);
  assert.equal(s.call({op:'save',revision:2,profile}).ok,true);
});
test('Distribuição: manifestos e JavaScript válidos, pacote independente',()=>{
  for(const mod of ['perfis']){
    const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
    assert.equal(manifest.api,2);assert.equal(manifest.id,'seele/'+mod);
    for(const reach of manifest.reach)assert.ok(Buffer.byteLength(reach,'utf8')<=32,'Cada alcance deve caber no limite do protocolo.');
    new vm.Script(fs.readFileSync(path.join(dir,manifest.client),'utf8'));
    new vm.Script(fs.readFileSync(path.join(dir,manifest.server),'utf8'));
  }
});
module.exports={server};
