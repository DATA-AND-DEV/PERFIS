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
// O que ele faz, na API 6:
//
// - **o prelúdio vem de onde ele mora agora**: `crates/seele-motor/src/preludio.rs`,
//   recortado da constante `PRELUDIO` (desde 09/10/2026 um texto só para o
//   desktop e o celular). Um prelúdio que não for encontrado é um erro com o
//   caminho, e não um `undefined` que roda o MOD sem API;
// - **o código do MOD roda num contexto sem DOM e sem Node**, com a mesma
//   fachada de mensagens que o executor oferece, e com os relógios do
//   prelúdio: ele troca `setTimeout` por um vetor que o anfitrião recolhe, e
//   este laboratório recolhe como o executor. Não é QuickJS — é o `vm` do
//   Node, que tem `Promise`, `Map` e o resto do JavaScript moderno, como o
//   QuickJS tem. Um MOD que dependesse de algo do V8 que o QuickJS não tem
//   passaria aqui e falharia no produto, e é para isso que existe
//   `ferramentas/quickjs-check`;
// - **o renderer é o do produto**, servido dos arquivos reais:
//   `mods-estilos.js`, `mods-regiao.js`, `mods-superficies.js` e
//   `mods-contribuicoes.js`, com as folhas deles. Não há cópia;
// - **as regras do anfitrião também são do produto**, recortadas de `base.js`
//   pelo nome: as capacidades por API e o que cada mensagem exige
//   (`podePedir`), o retrato por lista branca (`projetarORetrato`), a recusa
//   pelo nome (`recusaParaOMod`), a montagem de uma contribuição
//   (`montarContribuicao`), a carga da foto e da capa de pessoa
//   (`imagemContribuida`), a citação `daPessoa` (`imagemCitada`) e o quadro
//   parado da capa (`quadroEstatico`). Um nome que sumir quebra o laboratório
//   com o nome, como o prelúdio; e um conserto do produto nelas chega aqui sem
//   ninguém reescrever o laboratório.
//
// O que é **escrito aqui**, porque no produto mora no meio da sessão inteira:
// a lista de pessoas (simulada, `?pessoas=N`), o desenho da linha de cada uma,
// o dono das regiões e o roteador das mensagens. Eles seguem `tela-sessao.js` e
// `base.js` onde importa: o apelido verificado fica à vista ao lado do cartão,
// e o clique leva o `id` real.
//
// O que ele **não** prova: o executor real, os limites de memória e tempo dele,
// a supervisão nativa, a revogação por geração, o descarte, a chamada e a barra
// do operador. Isso é o produto, e a auditoria pede observação nativa para dar
// qualquer fluxo por homologado.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.MOD_PACKAGE || path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const seele = process.env.SEELE_RAIZ || path.resolve(__dirname, '../../SEELE');
const produto = process.env.SEELE_UI || path.join(seele, 'apps/seele-app/ui');

/** Quantas pessoas a lista simulada pode ter: as identidades de mentira são 1 a 64. */
const PESSOAS_DE_MENTIRA = 64;

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
 * Um trecho de um arquivo do produto, do começo dado até o primeiro fim dado.
 *
 * **Pelo nome, e ruidoso.** É a mesma regra do prelúdio: um trecho que mudou de
 * forma tem de quebrar o laboratório dizendo qual, e não virar uma função que
 * falta e faz o MOD falhar por outro motivo.
 */
function trechoDoProduto(arquivo, inicio, fim) {
  const texto = doProduto(arquivo);
  const de = texto.indexOf(inicio);
  const ate = de < 0 ? -1 : texto.indexOf(fim, de);
  if (de < 0 || ate < 0) {
    throw new Error(`«${inicio.trim()}» não foi encontrado em ${arquivo}. `
      + 'Ele mudou de nome ou de forma, e este laboratório precisa acompanhar.');
  }
  return texto.slice(de, ate + fim.length);
}
/** Uma função de nível zero, até a chave que a fecha na coluna zero. */
const funcaoDoProduto = (arquivo, nome) => trechoDoProduto(arquivo, `\nfunction ${nome}(`, '\n}\n');
/** Uma tabela `const NOME = Object.freeze({ … });` de nível zero. */
const tabelaDoProduto = (arquivo, nome) => trechoDoProduto(arquivo, `\nconst ${nome} = `, '\n});\n');

/**
 * O prelúdio, recortado de onde ele mora: o motor em Rust.
 *
 * Recortar texto de outro arquivo é frágil, e é de propósito que a falha seja
 * ruidosa: um prelúdio que mudou de forma tem de quebrar o laboratório, e não
 * virar um `undefined` que roda o MOD sem API nenhuma e o faz falhar por outro
 * motivo.
 */
function preludioDoMotor() {
  const fonte = path.join(seele, 'crates/seele-motor/src/preludio.rs');
  if (!fs.existsSync(fonte)) {
    throw new Error(`O laboratório precisa de ${fonte}. `
      + 'Aponte SEELE_RAIZ para um checkout do SEELE.');
  }
  const texto = fs.readFileSync(fonte, 'utf8');
  const marca = 'const PRELUDIO: &str = r#"';
  const inicio = texto.indexOf(marca);
  const fim = texto.indexOf('"#;', inicio);
  if (inicio < 0 || fim < 0) {
    throw new Error('`PRELUDIO` não foi encontrado em preludio.rs. '
      + 'Ele mudou de nome ou de forma, e este laboratório precisa acompanhar.');
  }
  return texto.slice(inicio + marca.length, fim);
}

const preludio = preludioDoMotor();

// As regras do anfitrião, do produto: servidas à janela e lidas aqui também.
const regrasDoAnfitriao = [
  tabelaDoProduto('base.js', 'CAPACIDADES_POR_API'),
  tabelaDoProduto('base.js', 'CAPACIDADE_DA_MENSAGEM'),
  funcaoDoProduto('base.js', 'podePedir'),
  funcaoDoProduto('base.js', 'projetarORetrato'),
  funcaoDoProduto('base.js', 'recusaParaOMod'),
  funcaoDoProduto('base.js', 'quadroEstatico'),
  // A foto e a capa de pessoa, a citação e a montagem de uma contribuição.
  trechoDoProduto('base.js', '\nlet midiaMudouAgendada = ', '\n}\n'),
  trechoDoProduto('base.js', '\nconst LIMITES_DA_CAPA = ', '});\n'),
  tabelaDoProduto('base.js', 'IMAGENS_DE_PESSOA'),
  funcaoDoProduto('base.js', 'imagemCitada'),
  funcaoDoProduto('base.js', 'imagemContribuida'),
  funcaoDoProduto('base.js', 'aplicarAContribuicao'),
  funcaoDoProduto('base.js', 'montarContribuicao'),
  funcaoDoProduto('base.js', 'conteudoDasContribuicoes'),
].join('\n');

/**
 * As capacidades deste manifesto — **as do produto**, da tabela dele. Uma API
 * que o produto não executa não tem capacidade nenhuma, e o MOD dela sobe sem
 * API, que é o que o produto faz antes de recusá-lo ao carregar.
 */
const CAPACIDADES_POR_API = vm.runInNewContext(`${tabelaDoProduto('base.js', 'CAPACIDADES_POR_API')}\nCAPACIDADES_POR_API`);
const capacidadesDaApi = api => [...(CAPACIDADES_POR_API[api] ?? [])];
if (!Object.hasOwn(CAPACIDADES_POR_API, String(manifest.api))) {
  throw new Error(`Este SEELE executa a API ${Object.keys(CAPACIDADES_POR_API).join(', ')}, e o pacote declara a `
    + `${manifest.api}. O produto recusa o pacote ao carregar; o laboratório também.`);
}

// **O MOD que rejeita sem tratar não derruba o laboratório.** No produto, a
// rejeição fica no executor do MOD; aqui o `vm` divide o processo com o
// servidor, e uma rejeição solta o encerraria com a janela aberta.
process.on('unhandledRejection', erro => {
  console.log(`[${manifest.id}] rejeição sem tratamento no MOD: ${erro?.message ?? erro}`);
});

/** O tipo que os bytes provam ser, pelos primeiros deles — como o produto confere. */
function tipoDosBytes(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp'
    && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.subarray(8, 12).toString('latin1'))) return 'heic';
  return null;
}

// ------------------------------------------------------- o mundo de mentira

const mundos = new Map();

/** O estado de um servidor simulado, criado na primeira vez que alguém fala. */
function mundoDe(chave) {
  if (!mundos.has(chave)) mundos.set(chave, { data: {}, files: new Map(), volumes: new Map(), esperas: new Map() });
  return mundos.get(chave);
}

/**
 * Uma volta ao servidor deste MOD, no `vm`, com o disco de mentira.
 *
 * **O aviso sai depois do dado guardado**, como no Servidor 1.0: o que a metade
 * de servidor chama de `mundo.avisar` numa volta é entregue às janelas deste
 * servidor só quando a volta terminou e o estado dela foi gravado — a da
 * pessoa que gravou também.
 */
function aoPedir(chaveDoMundo, contexto, pedido) {
  const mundo = mundoDe(chaveDoMundo);
  const dados = structuredClone(mundo.data);
  const arquivos = mundo.files;
  const avisos = [];
  const ctx = vm.createContext({
    dados,
    mundo: {
      agora: () => Math.floor(Date.now() / 1000),
      avisar: aviso => {
        let carga;
        try { carga = JSON.parse(JSON.stringify(aviso?.carga ?? null)); } catch { return { ok: false, erro: 'carga-invalida' }; }
        avisos.push({ canal: aviso?.canal ?? null, carga });
        return { ok: true };
      },
    },
    volume: {
      esperar: (token, nome, tipos) => (mundo.esperas.set(token, {
        nome, pessoa: contexto.person, tipos: Array.isArray(tipos) ? [...tipos] : null,
      }), true),
      tamanho: nome => mundo.volumes.get(nome)?.length ?? null,
      servir: nome => mundo.volumes.has(nome) ? nome : null,
      apagar: nome => mundo.volumes.delete(nome),
    },
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
  for (const aviso of avisos) {
    for (const [chave, sessao] of sessoes) {
      if (!chave.startsWith(chaveDoMundo + ':')) continue;
      sessao.entregar(JSON.stringify({ tipo: 'evento', nome: 'servidor', canal: aviso.canal, carga: aviso.carga }));
    }
  }
  return resposta;
}

/** O contexto de uma volta: o canal 0 é o escopo de servidor, sem canal. */
const contextoDaVolta = (pessoa, canal) => ({
  person: String(pessoa),
  channel: Number(canal) > 0 ? Number(canal) : null,
  admin: String(pessoa) === '1',
  write: true,
});

// ------------------------------------------------- o executor de mentira
//
// Um contexto por conexão da janela. O prelúdio primeiro, o MOD depois — a
// mesma ordem do executor, e pelo mesmo motivo: se o prelúdio não subir, o
// MOD não deve subir. Recarregar a janela é outra instância, como no produto.

const sessoes = new Map();

function novaSessao(chave, mandarParaAJanela) {
  sessoes.get(chave)?.parar();
  const pendentes = [];
  const relogios = new Map();
  let parada = false;
  const contexto = vm.createContext({
    // **Sem DOM e sem Node.** O que existe aqui é o que o executor oferece: a
    // ponte e as duas funções dela. Os temporizadores são os do prelúdio.
    seele: {
      postar: texto => {
        if (parada) return false;
        // O teto de mensagem do executor, para o MOD bater nele aqui também.
        if (Buffer.byteLength(texto) > 12288) return false;
        pendentes.push(texto);
        queueMicrotask(() => {
          while (pendentes.length) mandarParaAJanela(pendentes.shift());
        });
        setImmediate(colher);
        return true;
      },
      // O registro de quem hospeda. Só o que avisa vai à saída do laboratório.
      console: (nivel, texto) => {
        if (nivel === 'warn' || nivel === 'error') console.log(`[${manifest.id} ${chave}] ${nivel}: ${texto}`);
      },
    },
  });
  const rodar = (codigo, prazo = 2000) => vm.runInContext(codigo, contexto, { timeout: prazo });

  /**
   * **Os relógios do prelúdio, recolhidos como o executor recolhe.** O
   * prelúdio troca `setTimeout` por um vetor; sem quem o leia, o temporizador
   * que o MOD marca nunca dispara — e o laboratório aprovaria um MOD que, no
   * produto, nunca tenta de novo.
   */
  function colher() {
    if (parada) return;
    let lista;
    try { lista = JSON.parse(rodar('__seelePedidosDeRelogio()')); } catch { return; }
    for (const pedido of lista) {
      const antes = relogios.get(pedido.id);
      if (pedido.cancelar) {
        if (antes) { clearTimeout(antes); clearInterval(antes); relogios.delete(pedido.id); }
        continue;
      }
      const ms = Math.min(Math.max(Number(pedido.ms) || 0, pedido.repete ? 50 : 0), 60000);
      const disparar = () => {
        if (parada) return;
        if (!pedido.repete) relogios.delete(pedido.id);
        try { rodar(`__seeleRelogio(${Number(pedido.id)})`); } catch (erro) { console.error('o relógio do MOD falhou:', erro.message); }
        setImmediate(colher);
      };
      relogios.set(pedido.id, pedido.repete ? setInterval(disparar, ms) : setTimeout(disparar, ms));
    }
  }

  rodar(`globalThis.__seeleCapacidades = ${JSON.stringify(capacidadesDaApi(manifest.api))};`
    + 'globalThis.__seeleTetoDaMensagem = 12288;');
  rodar(preludio);
  rodar(fs.readFileSync(path.join(root, manifest.client), 'utf8'));
  setImmediate(colher);
  const sessao = {
    entregar: json => {
      if (parada) return;
      try {
        contexto.__entrada = json;
        rodar('aoResponder(__entrada)');
      } catch (erro) {
        console.error('o MOD falhou ao receber:', erro.message);
      }
      setImmediate(colher);
    },
    parar: () => {
      parada = true;
      for (const relogio of relogios.values()) { clearTimeout(relogio); clearInterval(relogio); }
      relogios.clear();
      if (sessoes.get(chave) === sessao) sessoes.delete(chave);
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
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/mods-superficies.css">
<link rel="stylesheet" href="/mods-controles.css">
<link rel="stylesheet" href="/lab.css">
</head><body>
<header>
  <h1>${manifest.id} · laboratório API ${manifest.api}</h1>
  <p>Identidades e transporte simulados; renderer, prelúdio e regras do anfitrião reais. Dados temporários.
     O executor de verdade é o QuickJS do produto — este é o <code>vm</code> do Node.</p>
  <a href="/?pessoa=1">Host</a> · <a href="/?pessoa=2">Participante</a> ·
  <a href="/?pessoa=3">Terceira pessoa</a> · <a href="/?pessoa=2&amp;pessoas=20">Vinte pessoas</a> ·
  <a href="/?servidor=b">Outro servidor</a>
  <label> Canal <select id="canal"><option value="1">geral</option><option value="2">outro</option></select></label>
  <button id="sair" type="button">Sair da sessão</button>
</header>
<main id="tela-sessao">
  <div id="palco-de-paginas" class="palco-de-paginas" hidden></div>
  <div id="palco-de-paineis" class="palco-de-paineis" hidden></div>
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
 * exatamente o que deixou este laboratório obsoleto sem ninguém perceber. O
 * que é regra — e não encanamento — vem recortado pelo nome, acima.
 */
// A paginação usa o laço do produto; a conversão nativa é simulada abaixo
// e tem cobertura própria em Rust. Não devolvemos mais só a primeira página.
const carregarMidiaDoProduto = (() => {
  const texto = doProduto('base.js');
  const cabeca = /carregarMidiaDoServidor: async \(([^)]*)\) => \{/.exec(texto);
  const corpo = cabeca && texto.slice(cabeca.index + cabeca[0].length).split('\n    },')[0];
  if (!corpo) throw new Error('carregarMidiaDoServidor não encontrado no produto');
  return { parametros: cabeca[1], corpo };
})();

const ponte = `const id=${JSON.stringify(manifest.id)};
const API=${Number(manifest.api)};
const mod={id,api:API};
const $=n=>document.getElementById(n);
const elemento=(tag,classe,dentro)=>{const no=document.createElement(tag);if(classe)no.className=classe;if(dentro!==undefined)no.textContent=dentro;return no;};
const repovoar=(no,filhos)=>no.replaceChildren(...filhos);
const params=new URLSearchParams(location.search);
const pessoa=params.get('pessoa')||'1', servidor=params.get('servidor')||'a';

// **A lista de pessoas, simulada.** Três por padrão — o host, quem participa e
// uma terceira pessoa —, e até ${PESSOAS_DE_MENTIRA} com \`?pessoas=N\`.
const NOMES=['Alex','Lia','Rafa'];
const QUANTAS=Math.max(3,Math.min(${PESSOAS_DE_MENTIRA},Number(params.get('pessoas'))||3));
const presentes=Array.from({length:QUANTAS},(_,i)=>({id:i+1,nickname:NOMES[i]||('Pessoa '+(i+1))}));

/** O registro de quem hospeda: no laboratório, o console da janela. */
function registrarNoAnfitriao(fonte,texto){console.warn('['+fonte+'] '+texto);}

// ---- recortado de base.js, pelo nome ----
${regrasDoAnfitriao}

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

/** O tipo que os bytes provam ser, para o \`data:\` dizer a verdade. */
function tipoDoBase64(base64){
  const b=atob(base64.slice(0,24));
  if(b.startsWith('\\x89PNG'))return 'image/png';
  if(b.startsWith('\\xff\\xd8\\xff'))return 'image/jpeg';
  if(b.startsWith('GIF8'))return 'image/gif';
  if(b.startsWith('RIFF')&&b.slice(8,12)==='WEBP')return 'image/webp';
  return 'application/octet-stream';
}

const dono={
  instancia,
  geracao:1,
  // A API do pacote: as superfícies que ele tem dependem dela (a folha na 6).
  api:API,
  podeFalar:()=>true,
  falar:dados=>enviar({tipo:'evento',...dados}),
  recusaParaOMod:falha=>recusaParaOMod(mod,falha),
  aoFecharASuperficie:()=>{},
  anotarRecusa:texto=>registrarNoAnfitriao('recusa-de-mod',id+': '+texto),
  // A imagem que uma pessoa já tem, para a citação \`daPessoa\`. Com todos os
  // argumentos do renderer: a lista pede a capa parada por um terceiro.
  imagemDaPessoa:(...argumentos)=>imagemCitada(...argumentos),
  // A citação com \`pessoa\` só cita quem está na sessão, pelo retrato: aqui,
  // a lista simulada, que é o que o retrato deste laboratório projeta.
  estaNaSessao:pessoaId=>presentes.some(p=>String(p.id)===String(pessoaId)),
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
  carregarMidiaDoServidor:async(${carregarMidiaDoProduto.parametros})=>{
    const geracaoDaSessao=1, daGeracaoDePe=()=>true, meu=()=>true;
    const PEDACOS_DE_MIDIA=256, TETO_DE_MIDIA_BASE64=4*Math.ceil(10*1024*1024/3)+128;
    const pedirAoServidor=async(_id,canal,corpo)=>{
      const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({servidor,pessoa,canal,corpo})});
      return r.json();
    };
    const invoke=async(cmd,opcoes)=>{
      if(cmd==='ler_imagem_mod'){
        const r=await fetch('/ler-volume',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({servidor,pessoa,canal:opcoes.channel,corpo:JSON.parse(opcoes.payload)})});
        const resposta=await r.json(); if(!r.ok)throw new Error(resposta.error); return resposta;
      }
      const {base64}=opcoes;
      const conteudo=base64.startsWith('data:')?base64.slice(base64.indexOf(',')+1):base64;
      const bytes=atob(conteudo).length;
      if(bytes>10*1024*1024)throw new Error('arquivo-grande-demais');
      const uri=base64.startsWith('data:')?base64:'data:'+tipoDoBase64(conteudo)+';base64,'+conteudo;
      return {uri,papel:'imagem',bytes};
    };
    ${carregarMidiaDoProduto.corpo}
  },
};
const escolhidos=[];

const contribuicoes=new RegistroDeContribuicoes();
// **Os calços dos recortes**: os nomes de base.js que eles chamam, com o que o
// laboratório tem. Uma sessão só, de geração 1; o registro desta janela; o dono
// deste MOD; e os avatares nativos, que a lista do laboratório não desenha.
const geracaoDaSessao=1;
const contribuicoesDosMods=contribuicoes;
const donoDaRegiao=()=>dono;
function redesenharAvatares(){}
const superficies=new SuperficiesDoMod(id,dono,{
  paginas:$('palco-de-paginas'),paineis:$('palco-de-paineis'),
  camadas:$('palco-de-camadas'),avisos:$('avisos-de-mod'),
});

/** Uma superfície pelo nome, ou a recusa que diz qual foi pedida — como o produto. */
function superficieDoMod(chave){
  const superficie=superficies.de(chave);
  if(!superficie)throw recusaDaSuperficie('superficie-desconhecida','a superfície «'+chave+'» não está de pé',
    {superficie:String(chave??'').slice(0,64)});
  return superficie;
}

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
  desenharRoster();
});

let fonte=null;
function enviar(m){fetch('/para-o-mod',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({servidor,pessoa,m})});}

function responder(n,ok,carga){enviar({tipo:'resposta',n,ok,...carga});}

/** O \`Snapshot\` de mentira, que o retrato projeta pela lista branca do produto. */
const snapshotDeMentira=()=>({
  me:Number(pessoa),
  server:'laboratório '+servidor,
  presentes:presentes.map(p=>({...p,speaking:false,muted:false})),
  channels:[{id:1,name:'geral',open:$('canal').value==='1'},{id:2,name:'outro',open:$('canal').value==='2'}],
  voice_rooms:[],
});
/** As regiões que este laboratório desenha: a navegação, a lista e as camadas. */
const cascaDoLaboratorio={onde:'computador',regioes:['servidor.navegacao','pessoas.lista','pagina','dialogo','folha','aviso']};

async function atender(m){
  try{
    // **A capacidade é conferida aqui, antes do efeito**, pela regra do
    // produto: o prelúdio omite o método, mas \`seele.postar\` continua lá.
    if(!podePedir(mod,m.tipo)){
      responder(m.n,false,{erro:'«'+m.tipo+'» não existe na API '+API+', que é a que este pacote declara'});
      return;
    }
    switch(m.tipo){
      case 'pedido':{
        const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({servidor,pessoa,canal:m.canal,corpo:m.valor})});
        responder(m.n,true,{valor:await r.json()});
        return;
      }
      case 'retrato':
        responder(m.n,true,{valor:projetarORetrato(snapshotDeMentira(),cascaDoLaboratorio)});
        return;
      case 'tema':responder(m.n,true,{valor:null});return;
      case 'enviar-imagem':{
        const bytes=escolhidos[m.arquivo-1];
        if(!bytes)throw new Error('arquivo-nao-esta-de-pe');
        escolhidos[m.arquivo-1]=null;
        const r=await fetch('/volume?servidor='+servidor+'&pessoa='+pessoa+'&token='+encodeURIComponent(m.token),{method:'POST',body:bytes});
        // A recusa do volume pelo nome, como a do Rust: \`tipo-recusado:heic\`
        // vira \`{ erro: 'tipo-recusado', detectado: 'heic' }\` em recusaParaOMod.
        if(!r.ok){const nome=(await r.json()).error;throw Object.assign(new Error(nome),{recusa:nome});}
        responder(m.n,true,{valor:null});return;
      }
      case 'pedaco':{
        const bytes=escolhidos[m.arquivo-1];
        if(!bytes)throw new Error('arquivo-nao-esta-de-pe');
        const fatia=bytes.subarray(m.inicio,m.inicio+65535);
        let bruto='';for(const b of fatia)bruto+=String.fromCharCode(b);
        responder(m.n,true,{valor:btoa(bruto)});return;
      }
      case 'soltar-arquivo':escolhidos[m.arquivo-1]=null;responder(m.n,true,{valor:null});return;
      case 'superficie-criar':responder(m.n,true,{valor:superficies.criar(m.descricao)});return;
      case 'superficie-montar':{
        const recusados=superficieDoMod(m.superficie).montar(m.arvore);
        if(recusados>0)throw new Error(recusados+' nó(s) não couberam nos limites da superfície');
        responder(m.n,true,{valor:null});return;
      }
      case 'superficie-atualizar':{
        const recusados=superficieDoMod(m.superficie).atualizar(m.chave,m.arvore);
        if(recusados>0)throw new Error(recusados+' nó(s) não couberam nos limites da superfície');
        responder(m.n,true,{valor:null});return;
      }
      case 'formulario-erros':superficieDoMod(m.superficie).marcarErros(m.erros);responder(m.n,true,{valor:null});return;
      case 'superficie-classes':{
        const recusados=superficieDoMod(m.superficie).declararClasses(m.classes);
        if(recusados>0)throw new Error(recusados+' propriedade(s) de estilo não foram reconhecidas');
        responder(m.n,true,{valor:null});return;
      }
      case 'superficie-mostrar':superficieDoMod(m.superficie).mostrar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;
      case 'superficie-ocultar':superficieDoMod(m.superficie).ocultar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;
      case 'superficie-suja':superficieDoMod(m.superficie).marcarSuja(m.suja);responder(m.n,true,{valor:null});return;
      case 'superficie-titulo':{
        const s=superficieDoMod(m.superficie);s.titulo=String(m.titulo??'').slice(0,120);
        if(s.tituloNo)s.tituloNo.textContent=s.titulo;
        responder(m.n,true,{valor:null});return;
      }
      case 'superficie-fechar':superficies.fechar(m.superficie,m.motivo);responder(m.n,true,{valor:null});return;
      case 'superficie-descartar':superficies.descartar(m.superficie);responder(m.n,true,{valor:null});return;
      case 'contribuir':responder(m.n,true,{valor:contribuicoes.registrar(mod,instancia,m.pedido)});return;
      // Com o dono, como o roteador do produto: sem ele, o laboratório aceitaria
      // uma revogação que o SEELE recusa, e ensinaria o contrário do contrato.
      case 'revogar-contribuicao':responder(m.n,true,{valor:contribuicoes.revogar(m.handle,{id,instancia})});return;
      case 'atualizar-contribuicao':responder(m.n,true,{valor:contribuicoes.atualizar(m.handle,{id,instancia},m.conteudo)});return;
      default:responder(m.n,false,{erro:'a API de MODs não conhece «'+m.tipo+'»'});
    }
  }catch(erro){
    registrarNoAnfitriao('atender-mod',id+': «'+m.tipo+'» falhou — '+(erro?.message??erro));
    responder(m.n,false,recusaParaOMod(mod,erro)??{erro:erro.message});
  }
}

/**
 * A lista de pessoas, com o cartão que o MOD declarou para cada uma.
 *
 * Como \`linhaSubstituida\` no produto: o apelido verificado fica à vista, no
 * núcleo, e o cartão do MOD mora ao lado, dentro do alvo de clique do produto,
 * que liga a ação ao \`id\` real. Sem cartão, a linha nativa.
 */
let rosterAgendado=false;
function desenharRoster(){
  if(rosterAgendado)return;
  rosterAgendado=true;
  queueMicrotask(()=>{rosterAgendado=false;pintarRoster();});
}
function pintarRoster(){
  repovoar($('lista-roster'),presentes.map(p=>{
    const escolhida=contribuicoes.escolherSubstituicao('pessoa.cartao',String(p.id)).escolhida;
    const cartao=escolhida?montarContribuicao(escolhida,p.id):null;
    if(!cartao){
      const item=elemento('li','pessoa');
      item.append(elemento('span','pessoa-nome',p.nickname));
      item.append(...conteudoDasContribuicoes('pessoa.cartao',String(p.id)));
      return item;
    }
    const item=elemento('li','pessoa pessoa-apresentada');
    item.dataset.apresentadaPor=escolhida.mod;
    const nucleo=elemento('span','pessoa-nucleo');
    nucleo.append(elemento('span','pessoa-nome',p.nickname));
    const miolo=elemento('div','pessoa-miolo');
    if(escolhida.acaoPrincipal){
      const porta=elemento('button','pessoa-apresentada-porta');
      porta.type='button';
      porta.setAttribute('aria-label',p.nickname+' — '+(escolhida.nomeAcessivel||'abrir')+' em '+escolhida.mod);
      porta.onclick=()=>dono.falar({nome:'acao',acao:escolhida.acaoPrincipal,pessoa:String(p.id),canal:''});
      porta.append(cartao);
      miolo.append(porta);
    }else miolo.append(cartao);
    const faixa=elemento('div','pessoa-apresentada-faixa');
    faixa.append(nucleo,miolo);
    item.append(faixa);
    // O acréscimo de outro MOD (\`pessoa.cartao\` no modo \`adicionar\`), por último.
    item.append(...conteudoDasContribuicoes('pessoa.cartao',String(p.id)));
    return item;
  }));
}
desenharRoster();

$('sair').onclick=async()=>{
  fonte?.close();
  await fetch('/sair',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({servidor,pessoa})});
  superficies.soltarTudo();contribuicoes.limpar();
  for(const r of recursos.splice(0)){try{r.soltar();}catch(e){console.warn(r.porque,e);}}
  $('tela-sessao').hidden=true;
};

// A fita do executor chega por eventos do servidor: um MOD fala sem que a
// janela tenha perguntado, e é isso que 'text/event-stream' modela.
fonte=new EventSource('/do-mod?servidor='+servidor+'&pessoa='+pessoa);
fonte.onmessage=e=>{void atender(JSON.parse(e.data));};
`;

const css = `*, *::before, *::after{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--seele-negro-absoluto);color:var(--seele-osso);
font:13px/1.6 var(--seele-mono,monospace)}
a{color:var(--seele-laranja-nerv)} header{margin-bottom:24px}
#tela-sessao{display:flex;flex-direction:column;gap:16px;border:1px solid var(--seele-linha);padding:16px;min-height:60vh}
.roster{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:320px}
.pessoa{border-left:3px solid var(--seele-linha);padding-left:8px}
.pessoa-apresentada-faixa{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:8px;align-items:center}
.pessoa-apresentada-porta{all:unset;display:block;width:100%;cursor:pointer}
.pessoa-apresentada-porta:focus-visible{outline:2px solid var(--seele-laranja-nerv)}
.palco-de-paginas,.palco-de-paineis{min-height:0}
.canais{list-style:none;margin:0;padding:0}
.linha{display:flex;gap:8px;width:100%;background:none;border:none;color:inherit;font:inherit;
padding:6px 8px;cursor:pointer;text-align:left;border-left:3px solid transparent}
.linha:hover{border-left-color:var(--seele-laranja-nerv)}`;

// ------------------------------------------------------------ o servidor

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
    /** Uma das identidades de mentira, e nenhuma outra. */
    const identidade = valor => {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 1 || n > PESSOAS_DE_MENTIRA || String(n) !== String(valor)) throw new Error('identidade');
      return String(n);
    };

    if (url.pathname === '/do-mod') {
      const chave = `${url.searchParams.get('servidor')}:${identidade(url.searchParams.get('pessoa'))}`;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const sessao = novaSessao(chave, texto => res.write(`data: ${texto}\n\n`));
      // A janela que fechou levou a instância: ninguém mais lê o que ela diria.
      req.on('close', () => sessao.parar());
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
      sessoes.get(`${q.servidor}:${q.pessoa}`)?.parar();
      res.end('{}');
      return;
    }

    if (url.pathname === '/volume' && req.method === 'POST') {
      const mundo = mundoDe(url.searchParams.get('servidor'));
      const token = url.searchParams.get('token');
      const espera = mundo.esperas.get(token);
      if (!espera || espera.pessoa !== identidade(url.searchParams.get('pessoa'))) throw new Error('sem-espera');
      mundo.esperas.delete(token);
      const blocos = []; let tamanho = 0;
      for await (const bloco of req) {
        tamanho += bloco.length;
        if (tamanho > 10 * 1024 * 1024) throw new Error('arquivo-grande-demais');
        blocos.push(bloco);
      }
      const bytes = Buffer.concat(blocos);
      // O tipo que os bytes provam, contra os que a espera aceita: a mesma
      // recusa pelo nome que o Rust dá, com o formato quando ele o reconhece.
      const tipo = tipoDosBytes(bytes);
      if (espera.tipos && !espera.tipos.includes(tipo)) {
        throw new Error(tipo ? 'tipo-recusado:' + tipo : 'formato-desconhecido');
      }
      mundo.volumes.set(espera.nome, bytes);
      res.end('{}'); return;
    }
    if (url.pathname === '/ler-volume' && req.method === 'POST') {
      const q = await corpo();
      const resposta = JSON.parse(aoPedir(q.servidor, contextoDaVolta(identidade(q.pessoa), q.canal), q.corpo));
      if (!resposta.ok || !resposta.volume) throw new Error('leitura-recusada');
      const bytes = mundoDe(q.servidor).volumes.get(resposta.volume);
      if (!bytes) throw new Error('imagem-indisponivel');
      const tipo = tipoDosBytes(bytes) ?? 'png';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ uri: `data:image/${tipo};base64,` + bytes.toString('base64'), papel: 'imagem', bytes: bytes.length }));
      return;
    }

    if (url.pathname === '/pedido' && req.method === 'POST') {
      const q = await corpo();
      const resposta = aoPedir(q.servidor || 'a', contextoDaVolta(identidade(q.pessoa), q.canal), q.corpo);
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
      // Os controles do produto — o \`botao\` e o \`botao-fantasma\` do
      // formulário — moram na folha geral, e não na dos MODs.
      '/base.css': ['text/css', doProduto('base.css')],
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
