// Laboratório local, com identidades simuladas. Nunca use como servidor público.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.MOD_PACKAGE || path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const produto = process.env.SEELE_UI || path.resolve(__dirname, '../../SEELE/apps/seele-app/ui');
const base = fs.readFileSync(path.join(produto, 'base.js'), 'utf8');
// Use o mesmo prelúdio, renderer e validação de tema do produto, sem um segundo contrato.
const preludio = base.match(/const PRELUDIO_DO_MOD = `([\s\S]*?)`;/)?.[1];
const inicio = base.indexOf('function desenharARegiaoDoMod(');
const fim = base.indexOf('async function atenderOMod(', inicio);
if (!preludio || inicio < 0 || fim < 0) throw new Error('SEELE_UI precisa conter o runtime da API 3.');
const render = base.slice(inicio, fim);
const worlds = new Map();
const page = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${manifest.id} · API 3</title><link rel="stylesheet" href="/lab.css"></head><body><header><h1>${manifest.id} · laboratório API 3</h1><p>Identidades e transporte simulados; Worker e renderer reais. Dados temporários.</p><a href="/?person=1">Host</a> · <a href="/?person=2">Participante</a> · <a href="/?person=3">Terceira pessoa</a> · <a href="/?server=b">Outro servidor</a><label> Canal <select id="channel"><option value="1">geral</option><option value="2">outro</option></select></label><button id="unload">Sair da sessão</button></header><main id="tela-sessao"><div id="regioes-dos-mods" hidden></div></main><script src="/bridge.js"></script></body></html>`;
const bridge = `const id=${JSON.stringify(manifest.id)};
const $=id=>document.getElementById(id);
const elemento=(tag,classe)=>{const no=document.createElement(tag);no.className=classe;return no;};
const repovoar=(no,filhos)=>no.replaceChildren(...filhos);
${render}
const params=new URLSearchParams(location.search), person=params.get('person')||'1', server=params.get('server')||'a';
let worker;
async function montar(){
  const codigo=await (await fetch('/client.js')).text();
  const fonte=new Blob([${JSON.stringify(preludio)},'\\n',codigo],{type:'text/javascript'});
  const url=URL.createObjectURL(fonte);worker=new Worker(url);URL.revokeObjectURL(url);
  const atual=worker;
  worker.onerror=e=>console.error(e.message);
  worker.onmessage=async({data:m})=>{
    try {
      if(worker!==atual)return;
      let valor=null;
      if(m.tipo==='snapshot')valor={server,me:Number(person),open_channel:Number($('channel').value),channels:[{id:1,name:'geral'},{id:2,name:'outro'}],presentes:[{id:1,nickname:'Alex'},{id:2,nickname:'Lia'},{id:3,nickname:'Rafa'}]};
      else if(m.tipo==='pedido')valor=await (await fetch('/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server,person,channel:m.canal,body:m.valor})})).json();
      else if(m.tipo==='regiao')desenharARegiaoDoMod(id,m.conteudo);
      else if(m.tipo==='tema')aplicarOTemaDoMod(id,m.valores);
      else throw Error('Operação desconhecida: '+m.tipo);
      if(worker===atual)worker.postMessage({tipo:'resposta',n:m.n,ok:true,valor});
    }catch(e){if(worker===atual)worker.postMessage({tipo:'resposta',n:m.n,ok:false,erro:e.message});}
  };
}
$('unload').onclick=()=>{worker?.terminate();worker=null;limparARegiaoDoMod(id);$('tela-sessao').hidden=true;};
void montar();`;
const css = ':root{--seele-negro-absoluto:#050403;--seele-osso:#eae3cf;--seele-laranja-nerv:#f2521f;--seele-linha:#241f19}body{margin:24px;background:var(--seele-negro-absoluto);color:var(--seele-osso);font:14px/1.6 monospace}a{color:inherit}header{margin-bottom:24px}main{background:var(--seele-negro-absoluto);color:var(--seele-osso);padding:16px;border:1px solid var(--seele-linha)}h3{color:var(--seele-laranja-nerv)}p,li{white-space:pre-wrap;overflow-wrap:anywhere}';
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src blob:; style-src 'self'; connect-src 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/request' && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16384) throw Error('request-too-large'); }
      const q = JSON.parse(raw);
      if (!['1', '2', '3'].includes(String(q.person))) throw Error('identity');
      const key = q.server || 'a';
      if (!worlds.has(key)) worlds.set(key, { data: {}, files: new Map() });
      const world = worlds.get(key), data = structuredClone(world.data), files = world.files;
      const ctx = vm.createContext({ dados: data, mundo: { agora: () => Math.floor(Date.now() / 1000) }, arquivos: {
        ler: p => files.get(p) ?? null, escrever: (p, v) => (files.set(p, v), true), apagar: p => files.delete(p), listar: () => [...files.keys()],
      } });
      vm.runInContext(fs.readFileSync(path.join(root, 'servidor/main.js'), 'utf8'), ctx, { timeout: 1000 });
      ctx.contextJSON = JSON.stringify({ person: String(q.person), channel: Number(q.channel || 1), admin: String(q.person) === '1', write: true });
      ctx.requestJSON = JSON.stringify(q.body);
      const reply = vm.runInContext('aoPedir(contextJSON,requestJSON)', ctx, { timeout: 1000 });
      if (Buffer.byteLength(JSON.stringify(data)) > 256 * 1024) throw Error('state-quota');
      world.data = data;
      res.setHeader('Content-Type', 'application/json'); res.end(reply); return;
    }
    const routes = { '/': ['text/html; charset=utf-8', page], '/lab.css': ['text/css', css], '/bridge.js': ['text/javascript', bridge], '/client.js': ['text/javascript', fs.readFileSync(path.join(root, 'cliente/main.js'))] };
    if (!routes[url.pathname]) { res.statusCode = 404; res.end(); return; }
    const [type, body] = routes[url.pathname]; res.setHeader('Content-Type', type); res.end(body);
  } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: e.message })); }
});
server.listen(Number(process.env.MOD_PORT || process.env.MESA_PORT || 8795), '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + server.address().port));
