/* Local development harness only: identities are selectable, not authenticated. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),worlds=new Map();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self';img-src 'self' data:;connect-src 'self'");
  if(url.pathname==='/native/tokens.css' || url.pathname==='/native/fontes.css' || /^\/native\/fontes\/[a-z0-9-]+\.woff2$/.test(url.pathname)){
    const asset=path.join(root,'ferramentas/native',url.pathname.slice('/native/'.length));
    if(!fs.existsSync(asset)){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',asset.endsWith('.woff2')?'font/woff2':'text/css');res.end(fs.readFileSync(asset));return;
  }
  if(url.pathname==='/request' && req.method==='POST'){
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('request-too-large');}
      const q=JSON.parse(body),mod=q.mod;if(!['perfis'].includes(mod))throw Error('unknown-mod');
      const key=String(q.server)+'/'+mod;if(!worlds.has(key))worlds.set(key,{data:{},files:{}});const world=worlds.get(key);
      const ctx=vm.createContext({dados:world.data,arquivos:{ler:p=>world.files[p]??null,escrever:(p,v)=>{world.files[p]=v;return true;},apagar:p=>{delete world.files[p];return true;}},mundo:{agora:()=>Math.floor(Date.now()/1000)}});
      vm.runInContext(fs.readFileSync(path.join(root,'servidor/main.js'),'utf8'),ctx,{timeout:250});
      const result=ctx.aoPedir(JSON.stringify({person:q.person==='2'?'2':'1',channel:1,admin:q.person!=='2',write:true}),JSON.stringify(q.request));
      res.setHeader('Content-Type','application/json');res.end(result);
    }catch(e){res.statusCode=400;res.end(JSON.stringify({ok:false,error:e.message}));}return;
  }
  const routes={'/perfis.js':'cliente/main.js','/preview.js':'ferramentas/preview.js','/preview.css':'ferramentas/preview.css'};
  if(routes[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(root,routes[url.pathname])));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEELE · Laboratório de MODs</title><link rel="stylesheet" href="/native/fontes.css"><link rel="stylesheet" href="/native/tokens.css"><link rel="stylesheet" href="/preview.css"></head><body><header class="lab"><strong>Laboratório local · API simulada</strong><span id="identity"></span><a href="/?person=1">Host</a><a href="/?person=2">Participante</a><a href="/?person=1&server=b">Outro servidor</a><button id="unload">Descarregar os MODs</button></header><main id="tela-sessao"><aside class="painel-canais"><h1>JARDIM NOTURNO</h1><p>Uma comunidade para criar.</p><div class="canais-rolagem"><h2>Canais</h2><p># geral</p><p># inspirações</p><h2>Personalizar</h2></div></aside><section class="conversation"><h2># geral</h2><p>Boas-vindas ao seu espaço.</p><article><strong>Mika</strong><p>Vamos deixar este servidor com a nossa cara?</p></article></section><aside class="painel-pessoas"><h2>Pessoas</h2><div class="pessoa"><span class="pessoa-nome">Alex</span></div><div class="pessoa"><span class="pessoa-nome">Mika</span></div></aside></main><script src="/preview.js"></script><script src="/perfis.js"></script></body></html>`);
});
server.listen(8795,'127.0.0.1',()=>console.log('Preview local: http://127.0.0.1:8795'));
