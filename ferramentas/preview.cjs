// Laboratório local, com identidades simuladas. Nunca use como servidor público.
//
// # O que este laboratório prova, e o que ele não prova
//
// A versão anterior estava **obsoleta e não dizia**: ela procurava
// `PRELUDIO_DO_MOD` dentro de `base.js`, que mudou de arquivo quando o ADR 0049
// levou a execução para o QuickJS nativo; recortava `desenharARegiaoDoMod` por
// índice de string, com uma assinatura que também mudou; e montava um `Worker`
// de navegador, que é precisamente o ambiente que o ADR tirou. A auditoria de
// 20/09/2026 encontrou os três, e observou que «corrigir o laboratório é parte
// da entrega da API, pois é o que o criador de MOD usa para aprender».
//
// O que ele passa a fazer:
//
// - **o prelúdio vem de onde ele mora agora**: `apps/seele-app/src/executor.rs`,
//   recortado da constante `PRELUDIO`. Um prelúdio que não for encontrado é um
//   erro com o caminho, e não um `undefined` que vira `Worker` sem API;
// - **o código do MOD roda num contexto sem DOM e sem Node**, com a mesma
//   fachada de mensagens que o executor oferece. Não é QuickJS — é o `vm` do
//   Node, que tem `Promise`, `Map` e o resto do JavaScript moderno, como o
//   QuickJS tem. Um MOD que dependesse de algo do V8 que o QuickJS não tem
//   passaria aqui e falharia no produto, e é para isso que existe
//   `ferramentas/quickjs-check`;
// - **o renderer é o do produto**, servido dos arquivos reais:
//   `mods-estilos.js`, `mods-regiao.js`, `mods-superficies.js` e
//   `mods-contribuicoes.js`, com as folhas deles. Não há cópia nem recorte.
//
// O que ele **não** prova: o executor real, os limites de memória e tempo dele,
// a supervisão nativa, a revogação por geração e o descarte. Isso é o produto,
// e a auditoria pede observação nativa para dar qualquer fluxo por homologado.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.MOD_PACKAGE || path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const seele = process.env.SEELE_RAIZ || path.resolve(__dirname, '../../SEELE');
const produto = process.env.SEELE_UI || path.join(seele, 'apps/seele-app/ui');

/** Lê um arquivo do produto, dizendo o caminho quando ele não está lá. */
function doProduto(relativo) {
  const caminho = path.join(produto, relativo);
  if (!fs.existsSync(caminho)) {
    throw new Error(`O laboratório precisa de ${caminho}. `
      + 'Aponte SEELE_UI para a pasta `apps/seele-app/ui` de um checkout do SEELE.');
  }
  return fs.readFileSync(caminho, 'utf8');
}

/**
 * O prelúdio, recortado de onde ele mora: o executor em Rust.
 *
 * Recortar texto de outro arquivo é frágil, e é de propósito que a falha seja
 * ruidosa: um prelúdio que mudou de forma tem de quebrar o laboratório, e não
 * virar um `undefined` que roda o MOD sem API nenhuma e o faz falhar por outro
 * motivo.
 */
function preludioDoExecutor() {
  const fonte = path.join(seele, 'apps/seele-app/src/executor.rs');
  if (!fs.existsSync(fonte)) {
    throw new Error(`O laboratório precisa de ${fonte}. `
      + 'Aponte SEELE_RAIZ para um checkout do SEELE.');
  }
  const texto = fs.readFileSync(fonte, 'utf8');
  const marca = 'const PRELUDIO: &str = r#"';
  const inicio = texto.indexOf(marca);
  const fim = texto.indexOf('"#;', inicio);
  if (inicio < 0 || fim < 0) {
    throw new Error('`PRELUDIO` não foi encontrado em executor.rs. '
      + 'Ele mudou de nome ou de forma, e este laboratório precisa acompanhar.');
  }
  return texto.slice(inicio + marca.length, fim);
}

const preludio = preludioDoExecutor();

/** As capacidades que este manifesto declara — as mesmas do produto. */
function capacidadesDaApi(api) {
  if (api >= 4) {
    return ['regiao', 'tema', 'cartoes', 'arquivo',
      'superficies', 'contribuicoes', 'estilos', 'classes'];
  }
  if (api === 3) return ['regiao', 'tema', 'cartoes', 'arquivo'];
  return [];
}

// ------------------------------------------------------- o mundo de mentira

const mundos = new Map();

/** O estado de um servidor simulado, criado na primeira vez que alguém fala. */
function mundoDe(chave) {
  if (!mundos.has(chave)) mundos.set(chave, { data: {}, files: new Map() });
  return mundos.get(chave);
}

/** Uma volta ao servidor deste MOD, no `vm`, com o disco de mentira. */
function aoPedir(chaveDoMundo, contexto, pedido) {
  const mundo = mundoDe(chaveDoMundo);
  const dados = structuredClone(mundo.data);
  const arquivos = mundo.files;
  const ctx = vm.createContext({
    dados,
    mundo: { agora: () => Math.floor(Date.now() / 1000) },
    arquivos: {
      ler: p => arquivos.get(p) ?? null,
      escrever: (p, v) => (arquivos.set(p, v), true),
      apagar: p => arquivos.delete(p),
      listar: () => [...arquivos.keys()],
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, manifest.server), 'utf8'), ctx, { timeout: 1000 });
  ctx.contextoJSON = JSON.stringify(contexto);
  ctx.pedidoJSON = JSON.stringify(pedido);
  const resposta = vm.runInContext('aoPedir(contextoJSON,pedidoJSON)', ctx, { timeout: 1000 });
  if (Buffer.byteLength(JSON.stringify(dados)) > 256 * 1024) throw new Error('state-quota');
  mundo.data = dados;
  return resposta;
}

// ------------------------------------------------- o executor de mentira
//
// Um contexto por sessão do laboratório. O prelúdio primeiro, o MOD depois —
// a mesma ordem do executor, e pelo mesmo motivo: se o prelúdio não subir, o
// MOD não deve subir.

const sessoes = new Map();

function sessaoDe(chave, mandarParaAJanela) {
  if (sessoes.has(chave)) return sessoes.get(chave);
  const pendentes = [];
  const contexto = vm.createContext({
    // **Sem DOM e sem Node.** O que existe aqui é o que o executor oferece: a
    // ponte, o console e os temporizadores do anfitrião.
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms) || 0, 60000)),
    clearTimeout,
    setInterval: (fn, ms) => setInterval(fn, Math.max(Number(ms) || 0, 50)),
    clearInterval,
    seele: {
      postar: texto => {
        // O teto de mensagem do executor, para o MOD bater nele aqui também.
        if (texto.length > 12 * 1024) return false;
        pendentes.push(texto);
        queueMicrotask(() => {
          while (pendentes.length) mandarParaAJanela(pendentes.shift());
        });
        return true;
      },
    },
  });
  vm.runInContext(
    `globalThis.__seeleCapacidades = ${JSON.stringify(capacidadesDaApi(manifest.api))};`,
    contexto,
  );
  vm.runInContext(preludio, contexto, { timeout: 2000 });
  vm.runInContext(fs.readFileSync(path.join(root, manifest.client), 'utf8'), contexto, { timeout: 2000 });
  const sessao = {
    contexto,
    entregar: json => {
      try {
        contexto.__entrada = json;
        vm.runInContext('aoResponder(__entrada)', contexto, { timeout: 2000 });
      } catch (erro) {
        console.error('o MOD falhou ao receber:', erro.message);
      }
    },
  };
  sessoes.set(chave, sessao);
  return sessao;
}

// ------------------------------------------------------------- a janela

const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${manifest.id} · laboratório API ${manifest.api}</title>
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/mods-superficies.css">
<link rel="stylesheet" href="/mods-controles.css">
<link rel="stylesheet" href="/lab.css">
</head><body>
<header>
  <h1>${manifest.id} · laboratório API ${manifest.api}</h1>
  <p>Identidades e transporte simulados; renderer e prelúdio reais. Dados temporários.
     O executor de verdade é o QuickJS do produto — este é o <code>vm</code> do Node.</p>
  <a href="/?pessoa=1">Host</a> · <a href="/?pessoa=2">Participante</a> ·
  <a href="/?pessoa=3">Terceira pessoa</a> · <a href="/?servidor=b">Outro servidor</a>
  <label> Canal <select id="canal"><option value="1">geral</option><option value="2">outro</option></select></label>
  <button id="sair" type="button">Sair da sessão</button>
</header>
<main id="tela-sessao">
  <div id="palco-de-paginas" class="palco-de-paginas" hidden></div>
  <div id="palco-de-paineis" class="palco-de-paineis" hidden></div>
  <aside id="regioes-dos-mods" class="regioes-dos-mods" hidden></aside>
  <ul id="lista-roster" class="roster"></ul>
  <ul id="lista-mods-navegacao" class="canais" hidden></ul>
  <!--
    **Dentro da tela, como no produto.** No \`index.html\` do SEELE os dois
    palcos são filhos de \`section#tela-sessao\`, e não do \`<body>\`. Aqui eles
    ficavam no \`<body>\`, e a diferença não era cosmética: \`prenderFoco\`
    percorre os ancestrais do diálogo tornando os **irmãos** inertes, e a
    revisão de 20/09/2026 encontrou um defeito que só aparecia com a hierarquia
    do produto — o palco dentro de uma seção que virava inerte, levando o
    próprio diálogo junto.

    Um laboratório com estrutura diferente do produto não é um laboratório mais
    simples: é um que aprova o que o produto recusa, e o criador de MOD aprende
    nele.
  -->
  <div id="palco-de-camadas" class="palco-de-camadas" hidden></div>
  <div id="avisos-de-mod" class="avisos-de-mod" hidden></div>
</main>
<script src="/mods-estilos.js"></script>
<script src="/mods-regiao.js"></script>
<script src="/mods-superficies.js"></script>
<script src="/mods-contribuicoes.js"></script>
<script src="/ponte.js"></script>
</body></html>`;

/**
 * A ponte da janela: o mínimo de `base.js` que o renderer exige.
 *
 * **O mínimo, e ele é dito.** `base.js` inteiro carrega o Tauri, a sessão, o
 * tema e a supervisão; nada disso existe aqui. O que o renderer precisa são
 * quatro funções — `$`, `elemento`, `repovoar` e `invoke` —, e elas estão
 * escritas aqui em vez de recortadas de lá: recortar por índice de string foi
 * exatamente o que deixou este laboratório obsoleto sem ninguém perceber.
 */
const ponte = `const id=${JSON.stringify(manifest.id)};
const $=n=>document.getElementById(n);
const elemento=(tag,classe,dentro)=>{const no=document.createElement(tag);if(classe)no.className=classe;if(dentro!==undefined)no.textContent=dentro;return no;};
const repovoar=(no,filhos)=>no.replaceChildren(...filhos);
const params=new URLSearchParams(location.search);
const pessoa=params.get('pessoa')||'1', servidor=params.get('servidor')||'a';

// A instância de mentira: o renderer registra recursos nela, e sair os solta.
//
// **A funcao 'registrar' devolve o descartador**, como a do produto. Ela
// devolvia o tamanho do vetor — o retorno de 'push' —, e um numero e truthy:
// quem guardava esse retorno para esquecer o recurso depois guardava um 1, e
// chama-lo era 'esquecer is not a function'. O laboratorio continuava verde
// porque a saida da sessao nao era exercitada ate o fim.
//
// Idempotente e removendo a entrada, como 'InstanciaDeMod.registrar': um
// recurso que sai antes da sessao nao pode ficar retido ate ela acabar, que e
// o R4 da revisao de 20/09/2026.
const recursos=[];
const instancia={
  geracao:1,
  admite:()=>true,
  registrar:(porque,soltar)=>{
    let saiu=false;
    const entrada={porque,soltar};
    recursos.push(entrada);
    // As duas metades, como as do produto: 'esquecer' tira da lista e devolve
    // se havia o que tirar; chamar o descartador faz as duas coisas. Quem se
    // descarta sozinho — uma superficie, por exemplo — chama so 'esquecer',
    // para nao pedir de volta o descarte que ja esta acontecendo.
    const esquecer=()=>{
      if(saiu)return false;
      saiu=true;
      const onde=recursos.indexOf(entrada);
      if(onde>=0)recursos.splice(onde,1);
      return true;
    };
    const soltarRecurso=()=>{
      if(!esquecer())return;
      try{soltar();}catch(e){console.warn(porque,e);}
    };
    soltarRecurso.esquecer=esquecer;
    return soltarRecurso;
  },
};

const dono={
  instancia,
  geracao:1,
  podeFalar:()=>true,
  falar:dados=>enviar({tipo:'evento',...dados}),
  abrirEndereco:url=>{console.log('abriria fora da janela:',url);},
  escolherArquivo:async pedido=>{
    // O seletor do sistema não existe aqui; o laboratório usa o do navegador,
    // e diz para quê — que é o conserto de U22 sendo exercitado.
    return new Promise(resolve=>{
      const entrada=document.createElement('input');
      entrada.type='file';
      if(pedido&&pedido.extensoes&&pedido.extensoes.length)entrada.accept=pedido.extensoes.map(e=>'.'+e).join(',');
      entrada.onchange=async()=>{
        const arquivo=entrada.files[0];
        if(!arquivo){resolve(null);return;}
        const bytes=new Uint8Array(await arquivo.arrayBuffer());
        const numero=escolhidos.push(bytes);
        resolve({id:numero,tipo:arquivo.type||'application/octet-stream',papel:arquivo.type.startsWith('audio/')?'som':'imagem',bytes:bytes.length});
      };
      entrada.oncancel=()=>resolve(null);
      entrada.click();
    });
  },
  carregarMidia:async caminho=>{
    const r=await fetch('/arquivo?nome='+encodeURIComponent(caminho));
    if(!r.ok)throw new Error('arquivo-do-pacote-nao-servido');
    const {uri,papel,bytes}=await r.json();
    return {uri,papel,bytes};
  },
  carregarMidiaDoServidor:async(canal,pedido,campo)=>{
    const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({servidor,pessoa,canal,corpo:pedido})});
    const resposta=await r.json();
    const texto=resposta[campo];
    if(typeof texto!=='string')throw new Error('sem-bytes');
    const papel=texto.startsWith('data:audio')?'som':'imagem';
    return {uri:texto,papel,bytes:texto.length};
  },
};
const escolhidos=[];

// A raiz da regiao leva o 'data-mod' que o produto poe nela — e nao e detalhe:
// e por ele que o teste do navegador encontra o que este MOD desenhou. Sem
// ele, um MOD que nao declare cartao nenhum nao tem elemento nenhum marcado, e
// o teste espera para sempre por algo que existe e nao esta nomeado.
$('regioes-dos-mods').dataset.mod=id;
const regiao=new RegiaoDeMod(id,dono,$('regioes-dos-mods'),PERFIS_DE_RENDER.regiao);
const contribuicoes=new RegistroDeContribuicoes();
const superficies=new SuperficiesDoMod(id,dono,{
  paginas:$('palco-de-paginas'),paineis:$('palco-de-paineis'),
  camadas:$('palco-de-camadas'),avisos:$('avisos-de-mod'),
});

contribuicoes.aoMudar(()=>{
  const lista=$('lista-mods-navegacao');
  const entradas=contribuicoes.para('servidor.navegacao');
  lista.hidden=entradas.length===0;
  repovoar(lista,entradas.map(e=>{
    const item=elemento('li');
    const b=elemento('button','linha entrada-de-mod');
    b.type='button';
    b.append(elemento('span','linha-rotulo',e.rotulo||e.mod),elemento('span','entrada-de-mod-origem',e.mod));
    b.onclick=()=>dono.falar({nome:'acao',acao:e.acaoPrincipal||'abrir',pessoa:'',canal:''});
    item.append(b);return item;
  }));
});

let fonte=null;
function enviar(m){fetch('/para-o-mod',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({servidor,pessoa,m})});}

function responder(n,ok,carga){enviar({tipo:'resposta',n,ok,...carga});}

async function atender(m){
  try{
    if(m.tipo==='snapshot'){
      responder(m.n,true,{valor:{servidor,me:Number(pessoa),open_channel:Number($('canal').value),
        channels:[{id:1,name:'geral'},{id:2,name:'outro'}],
        presentes:[{id:1,nickname:'Alex'},{id:2,nickname:'Lia'},{id:3,nickname:'Rafa'}]}});
      return;
    }
    if(m.tipo==='pedido'){
      const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({servidor,pessoa,canal:m.canal,corpo:m.valor})});
      responder(m.n,true,{valor:await r.json()});
      return;
    }
    if(m.tipo==='regiao'){
      $('regioes-dos-mods').hidden=false;
      const recusados=regiao.aplicar(m.conteudo);
      if(recusados>0)throw new Error(recusados+' nó(s) não couberam nos limites da região');
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='tema'){responder(m.n,true,{valor:null});return;}
    if(m.tipo==='cartoes'){
      const recusados=regiao.declararCartoes(m.cartoes);
      desenharRoster();
      responder(m.n,true,{valor:recusados});return;
    }
    if(m.tipo==='pedaco'){
      const bytes=escolhidos[m.arquivo-1];
      if(!bytes)throw new Error('arquivo-nao-esta-de-pe');
      const fatia=bytes.subarray(m.inicio,m.inicio+65535);
      let bruto='';for(const b of fatia)bruto+=String.fromCharCode(b);
      responder(m.n,true,{valor:btoa(bruto)});return;
    }
    if(m.tipo==='soltar-arquivo'){responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-criar'){responder(m.n,true,{valor:superficies.criar(m.descricao)});return;}
    if(m.tipo==='superficie-montar'){
      const recusados=superficies.de(m.superficie).montar(m.arvore);
      if(recusados>0)throw new Error(recusados+' nó(s) não couberam nos limites da superfície');
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-classes'){
      superficies.de(m.superficie).declararClasses(m.classes);
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-mostrar'){superficies.de(m.superficie).mostrar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-ocultar'){superficies.de(m.superficie).ocultar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-suja'){superficies.de(m.superficie).marcarSuja(m.suja);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-titulo'){
      const s=superficies.de(m.superficie);s.titulo=String(m.titulo||'');
      if(s.tituloNo)s.tituloNo.textContent=s.titulo;
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-fechar'){superficies.fechar(m.superficie,m.motivo);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-descartar'){superficies.descartar(m.superficie);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='contribuir'){responder(m.n,true,{valor:contribuicoes.registrar({id},instancia,m.pedido)});return;}
    // Com o dono, como o roteador do produto: sem ele, o laboratório aceitaria
    // uma revogação que o SEELE recusa, e ensinaria o contrário do contrato.
    if(m.tipo==='revogar-contribuicao'){responder(m.n,true,{valor:contribuicoes.revogar(m.handle,{id,instancia})});return;}
    throw new Error('a API de MODs não conhece «'+m.tipo+'»');
  }catch(erro){responder(m.n,false,{erro:erro.message});}
}

/** A lista de pessoas, com os cartões que o MOD declarou. */
function desenharRoster(){
  const lista=$('lista-roster');
  const pessoas=[{id:1,nickname:'Alex'},{id:2,nickname:'Lia'},{id:3,nickname:'Rafa'}];
  repovoar(lista,pessoas.map(p=>{
    const item=elemento('li','pessoa');
    const substituicao=contribuicoes.escolherSubstituicao('pessoa.cartao',String(p.id)).escolhida;
    const cartao=regiao.cartaoDe(p.id);
    if(substituicao&&cartao){
      const porta=elemento('button','pessoa-apresentada-porta');
      porta.type='button';
      porta.setAttribute('aria-label',p.nickname+' — abrir em '+substituicao.mod);
      porta.onclick=()=>dono.falar({nome:'acao',acao:substituicao.acaoPrincipal,pessoa:String(p.id),canal:''});
      porta.append(cartao);
      item.append(porta);
    }else{
      item.append(elemento('span','pessoa-nome',p.nickname));
      if(cartao)item.append(cartao);
    }
    return item;
  }));
}
desenharRoster();

$('sair').onclick=async()=>{
  await fetch('/sair',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({servidor,pessoa})});
  superficies.soltarTudo();contribuicoes.limpar();regiao.soltar();
  for(const r of recursos.splice(0)){try{r.soltar();}catch(e){console.warn(r.porque,e);}}
  $('tela-sessao').hidden=true;
};

// A fita do executor chega por eventos do servidor: um MOD fala sem que a
// janela tenha perguntado, e é isso que 'text/event-stream' modela.
fonte=new EventSource('/do-mod?servidor='+servidor+'&pessoa='+pessoa);
fonte.onmessage=e=>{void atender(JSON.parse(e.data));};
`;

const css = `body{margin:0;padding:24px;background:var(--seele-negro-absoluto);color:var(--seele-osso);
font:13px/1.6 var(--seele-mono,monospace)}
a{color:var(--seele-laranja-nerv)} header{margin-bottom:24px}
#tela-sessao{display:flex;flex-direction:column;gap:16px;border:1px solid var(--seele-linha);padding:16px;min-height:60vh}
.roster{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:320px}
.pessoa{border-left:3px solid var(--seele-linha);padding-left:8px}
.regioes-dos-mods{display:flex;gap:1px;max-height:240px;overflow:auto;border-top:1px solid var(--seele-linha-forte)}
.palco-de-paginas,.palco-de-paineis{min-height:0}
.canais{list-style:none;margin:0;padding:0}
.linha{display:flex;gap:8px;width:100%;background:none;border:none;color:inherit;font:inherit;
padding:6px 8px;cursor:pointer;text-align:left;border-left:3px solid transparent}
.linha:hover{border-left-color:var(--seele-laranja-nerv)}`;

// ------------------------------------------------------------ o servidor

/** Quem está ouvindo a fita de qual sessão. */
const ouvintes = new Map();

const servidorHttp = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' data:");
  try {
    const url = new URL(req.url, 'http://localhost');
    const corpo = async () => {
      let bruto = '';
      for await (const pedaco of req) {
        bruto += pedaco;
        if (Buffer.byteLength(bruto) > 262144) throw new Error('pedido-grande-demais');
      }
      return JSON.parse(bruto);
    };

    if (url.pathname === '/do-mod') {
      const chave = `${url.searchParams.get('servidor')}:${url.searchParams.get('pessoa')}`;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      ouvintes.set(chave, res);
      sessaoDe(chave, texto => res.write(`data: ${texto}\n\n`));
      req.on('close', () => ouvintes.delete(chave));
      return;
    }

    if (url.pathname === '/para-o-mod' && req.method === 'POST') {
      const q = await corpo();
      const chave = `${q.servidor}:${q.pessoa}`;
      sessoes.get(chave)?.entregar(JSON.stringify(q.m));
      res.end('{}');
      return;
    }

    if (url.pathname === '/sair' && req.method === 'POST') {
      const q = await corpo();
      sessoes.delete(`${q.servidor}:${q.pessoa}`);
      res.end('{}');
      return;
    }

    if (url.pathname === '/pedido' && req.method === 'POST') {
      const q = await corpo();
      if (!['1', '2', '3'].includes(String(q.pessoa))) throw new Error('identidade');
      const resposta = aoPedir(q.servidor || 'a', {
        person: String(q.pessoa),
        channel: Number(q.canal || 1),
        admin: String(q.pessoa) === '1',
        write: true,
      }, q.corpo);
      res.setHeader('Content-Type', 'application/json');
      res.end(resposta);
      return;
    }

    if (url.pathname === '/arquivo') {
      // **Só o que o manifesto declara.** É a mesma regra do produto: um
      // arquivo na pasta que ninguém nomeou não é servido.
      const nome = url.searchParams.get('nome') ?? '';
      if (!(manifest.arquivos ?? []).includes(nome)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'arquivo-nao-declarado' }));
        return;
      }
      const bytes = fs.readFileSync(path.join(root, nome));
      const tipo = nome.endsWith('.wav') ? 'audio/wav'
        : nome.endsWith('.png') ? 'image/png'
          : nome.endsWith('.jpg') || nome.endsWith('.jpeg') ? 'image/jpeg'
            : nome.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        uri: `data:${tipo};base64,${bytes.toString('base64')}`,
        papel: tipo.startsWith('audio/') ? 'som' : 'imagem',
        bytes: bytes.length,
      }));
      return;
    }

    const rotas = {
      '/': ['text/html; charset=utf-8', pagina],
      '/lab.css': ['text/css', css],
      '/ponte.js': ['text/javascript', ponte],
      '/tokens.css': ['text/css', doProduto('tokens.css')],
      '/mods-superficies.css': ['text/css', doProduto('mods-superficies.css')],
      '/mods-controles.css': ['text/css', doProduto('mods-controles.css')],
      '/mods-estilos.js': ['text/javascript', doProduto('mods-estilos.js')],
      '/mods-regiao.js': ['text/javascript', doProduto('mods-regiao.js')],
      '/mods-superficies.js': ['text/javascript', doProduto('mods-superficies.js')],
      '/mods-contribuicoes.js': ['text/javascript', doProduto('mods-contribuicoes.js')],
    };
    if (!rotas[url.pathname]) { res.statusCode = 404; res.end(); return; }
    const [tipo, texto] = rotas[url.pathname];
    res.setHeader('Content-Type', tipo);
    res.end(texto);
  } catch (erro) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: erro.message }));
  }
});

servidorHttp.listen(Number(process.env.MOD_PORT || 4318), '127.0.0.1', () => {
  console.log('Preview: http://127.0.0.1:' + servidorHttp.address().port);
});
