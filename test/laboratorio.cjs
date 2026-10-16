// O simulador da API 6 do SEELE para os testes do PERFIS.
//
// A tabela abaixo é cópia do contrato congelado (`api/v6.json` do SEELE), e
// `contrato.test.cjs` a confere contra ele. As recusas imitam o prelúdio da 6
// (`seele-motor/src/preludio.rs`): um `Error` com o nome em `message` e em
// `erro`, e os campos da resposta como propriedades. A ponte recusa acima de
// 12.288 bytes antes de mandar, e o nono pedido em voo, como o prelúdio. Um
// pedido pode levar voltas para responder (`latencia`), como no produto, onde a
// resposta atravessa a janela.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONTRATO = Object.freeze({
  capacidades: ['superficies', 'contribuicoes', 'estilos', 'classes', 'volume', 'arquivo', 'tema', 'retrato', 'eventos-da-tela', 'aviso-do-servidor'],
  pontos: {
    'chamada.palco': ['substituir', 'adicionar'], 'servidor.aparencia': ['substituir'],
    'pessoa.identidade': ['adicionar'], 'pessoa.cartao': ['substituir', 'adicionar'],
    'pessoa.detalhes': ['adicionar'], 'pessoa.acoes': ['adicionar'], 'pessoa.avatar': ['substituir'],
    'pessoa.capa': ['substituir'], 'canal.item': ['adicionar'], 'canal.cabecalho': ['substituir', 'adicionar'],
    'compositor.ferramentas': ['adicionar'], 'sala.acoes': ['adicionar'],
    'servidor.navegacao': ['substituir', 'adicionar'],
  },
  tipos: ['pagina', 'dialogo', 'aviso', 'folha'],
  eventos: ['campo', 'escolha', 'botao', 'arquivo', 'traco', 'midia', 'numero', 'marca', 'cor', 'aba',
    'submeter', 'acao', 'link', 'tela', 'fechar', 'fechar-pedido', 'contribuicao',
    'canal', 'sala', 'pessoas', 'fala', 'lugar', 'servidor', 'tema'],
  formas: ['titulo', 'texto', 'linha', 'lista', 'item', 'campo', 'escolha', 'botao', 'arquivo', 'tela',
    'midia', 'caixa', 'pilha', 'grade', 'rolagem', 'separador', 'espaco', 'formulario', 'acoes', 'abas',
    'aba', 'textoLongo', 'numero', 'deslizante', 'marca', 'interruptor', 'cor', 'retrato', 'distintivo', 'link'],
  daPessoa: ['capa', 'avatar'],
  alvosPorPonto: 256,
  tetoSemAlvo: 128,
});

/** Os pontos por alvo, que contam fora do teto agregado. */
const PONTOS_POR_ALVO = new Set(['pessoa.identidade', 'pessoa.avatar', 'pessoa.capa', 'pessoa.cartao',
  'pessoa.detalhes', 'pessoa.acoes', 'canal.item', 'canal.cabecalho', 'sala.acoes']);
/** A gramática do cartão: nada que receba foco ou clique (o produto conta e recusa o resto). */
const FORMAS_DO_CARTAO = new Set(['texto', 'titulo', 'linha', 'lista', 'item', 'midia', 'caixa', 'pilha',
  'grade', 'separador', 'espaco', 'retrato', 'distintivo']);
/** As propriedades de estilo que `mods-estilos.js` reconhece. */
const PROPRIEDADES_DE_ESTILO = new Set([
  'cor', 'fundo', 'gradiente', 'opacidade', 'raio', 'borda', 'sombra',
  'familia', 'peso', 'corpo', 'entrelinha', 'espacamento', 'alinhamento', 'transformar',
  'direcao', 'alinhar', 'distribuir', 'quebra', 'crescer', 'encolher', 'base',
  'intervalo', 'preenchimento', 'margem',
  'largura', 'altura', 'larguraMinima', 'larguraMaxima', 'alturaMinima', 'alturaMaxima',
  'colunas', 'posicao', 'recortar', 'proporcao', 'linhasMaximas',
  'girar', 'escalar', 'mover', 'transicao', 'animacao',
]);
const FORMAS_DE_ENTRADA = new Set(['campo', 'textoLongo', 'numero', 'deslizante', 'marca', 'interruptor', 'cor', 'escolha']);
const TETO_DA_MENSAGEM = 12288;
const TETO_DE_NOS = 4096;
/** Os pedidos em voo que o prelúdio admite; o nono é recusado. */
const TETO_EM_VOO = 8;
/** Os avisos de um MOD que saem por segundo; o excedente fica, por canal, só o mais novo. */
const AVISOS_POR_SEGUNDO = 4;

/** O teto do prelúdio, em bytes UTF-8 do envelope inteiro. */
function ponte(tipo, carga) {
  const bytes = Buffer.byteLength(JSON.stringify({ tipo, n: 999999, ...carga }), 'utf8');
  if (bytes > TETO_DA_MENSAGEM) {
    throw new Error(`mensagem-grande: ${tipo} tem ${bytes} bytes e o teto por mensagem é ${TETO_DA_MENSAGEM}`);
  }
}

/** A recusa como o prelúdio da 6 a entrega ao MOD. */
function recusa(nome, campos = {}) {
  return Object.assign(new Error(nome), campos, { erro: nome });
}

/** Quantos nós uma declaração pede, como `planejar` os conta. */
function contarNos(no) {
  if (no === null || no === undefined) return 0;
  if (typeof no === 'string') return 1;
  if (Array.isArray(no)) return no.reduce((n, um) => n + contarNos(um), 0);
  if (typeof no !== 'object') return 0;
  return 1 + contarNos(no.dentro);
}

/** Confere formas, estilos e citações; devolve os nós fora da gramática pedida. */
function conferirArvore(no, formas, fora = []) {
  if (no === null || no === undefined || typeof no === 'string') return fora;
  if (Array.isArray(no)) { no.forEach(um => conferirArvore(um, formas, fora)); return fora; }
  if (!formas.has(no.forma)) fora.push(no.forma);
  for (const chave of Object.keys(no.estilo ?? {})) {
    if (!PROPRIEDADES_DE_ESTILO.has(chave)) throw new Error(`«${chave}» não é uma propriedade de estilo que o SEELE reconhece (em «${no.forma}»)`);
  }
  for (const citacao of [no.daPessoa, no.fundoDeMidia?.daPessoa]) {
    if (citacao !== undefined && !CONTRATO.daPessoa.includes(citacao)) throw new Error(`daPessoa «${citacao}» não existe`);
  }
  conferirArvore(no.dentro, formas, fora);
  return fora;
}

/** Os nós com `chave`, por chave, numa árvore. */
function porChave(arvore, achados = new Map()) {
  if (!arvore || typeof arvore !== 'object') return achados;
  if (Array.isArray(arvore)) { arvore.forEach(no => porChave(no, achados)); return achados; }
  if (arvore.chave) achados.set(arvore.chave, arvore);
  porChave(arvore.dentro, achados);
  return achados;
}

/** Troca, na árvore, o nó de `chave` por `subarvore`; devolve se achou. */
function trocarNo(arvore, chave, subarvore) {
  if (!arvore || typeof arvore !== 'object') return false;
  if (Array.isArray(arvore)) {
    for (let i = 0; i < arvore.length; i += 1) {
      if (arvore[i] && typeof arvore[i] === 'object' && !Array.isArray(arvore[i]) && arvore[i].chave === chave) {
        arvore[i] = subarvore;
        return true;
      }
      if (trocarNo(arvore[i], chave, subarvore)) return true;
    }
    return false;
  }
  if (arvore.dentro && typeof arvore.dentro === 'object' && !Array.isArray(arvore.dentro) && arvore.dentro.chave === chave) {
    arvore.dentro = subarvore;
    return true;
  }
  return trocarNo(arvore.dentro, chave, subarvore);
}

// ------------------------------------------------------- a metade de servidor

function mundo({ esperarRecusa = false } = {}) {
  const dados = {}, arquivos = new Map(), volumes = new Map(), esperas = new Map(), avisos = [];
  const fonte = fs.readFileSync(path.join(__dirname, '../servidor/main.js'), 'utf8');
  const chamar = (corpo, { pessoa = '1', canal = null, admin = false, escrita = true } = {}) => {
    const ctx = vm.createContext({
      dados,
      mundo: {
        agora: () => 100,
        // O servidor serializa a carga; a janela a recebe já lida.
        avisar: a => { avisos.push(JSON.parse(JSON.stringify(a))); return { ok: true }; },
      },
      arquivos: {
        ler: p => arquivos.get(p) ?? null, escrever: (p, v) => (arquivos.set(p, v), true),
        apagar: p => arquivos.delete(p), listar: () => [...arquivos.keys()],
      },
      volume: {
        esperar: (token, caminho, tipos) => {
          if (esperarRecusa) return false;
          esperas.set(token, { pessoa, caminho, tipos });
          return true;
        },
        tamanho: c => volumes.get(c)?.length ?? null,
        servir: c => (volumes.has(c) ? c : null),
        apagar: c => volumes.delete(c),
      },
    });
    vm.runInContext(fonte, ctx);
    return JSON.parse(ctx.aoPedir(JSON.stringify({ person: pessoa, channel: canal, admin, write: escrita }), JSON.stringify(corpo)));
  };
  const enviar = (token, bytes, pessoa) => {
    const espera = esperas.get(token);
    if (!espera || espera.pessoa !== pessoa) throw new Error('token-desconhecido');
    esperas.delete(token);
    volumes.set(espera.caminho.replace(/^volume:/, ''), Buffer.from(bytes));
  };
  return { dados, arquivos, volumes, avisos, esperas, chamar, enviar };
}

/** Grava `quantos` perfis direto no mundo e devolve as pessoas do retrato. */
function semearPerfis(m, quantos, { comImagens = false, efeitos = {} } = {}) {
  const store = m.dados.profiles ? JSON.parse(m.dados.profiles) : {};
  for (let id = 1; id <= quantos; id += 1) {
    const perfil = {
      revision: 1, displayName: 'Nome exibido ' + id, pronouns: '', bio: '', status: '',
      accent: '#a78bfa', effect: efeitos[id] ?? 'none', avatar: null, banner: null,
    };
    if (comImagens) {
      for (const slot of ['avatar', 'banner']) {
        const caminho = 'images/' + id + '-' + slot + '-1759900000';
        m.volumes.set(caminho, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(16, id)]));
        perfil[slot] = 'volume:' + caminho;
      }
    }
    store[String(id)] = perfil;
  }
  m.dados.profiles = JSON.stringify(store);
  return Array.from({ length: quantos }, (_, i) => ({ id: i + 1, apelido: 'Pessoa ' + (i + 1), falando: false, mudo: false }));
}

/** Uma imagem nova pelo volume: upload-start, os bytes e upload-finish. */
function trocarImagem(m, pessoa, slot) {
  const ctx = { pessoa: String(pessoa) };
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(24, Math.floor(Math.random() * 255))]);
  const inicio = m.chamar({ op: 'upload-start', slot, transporte: 'volume', bytes: bytes.length }, ctx);
  if (!inicio.ok) throw new Error(inicio.error);
  m.enviar(inicio.token, bytes, String(pessoa));
  const fim = m.chamar({ op: 'upload-finish', token: inicio.token }, ctx);
  if (!fim.ok) throw new Error(fim.error);
  return fim.profile[slot];
}

/** Uma gravação direta do perfil, com a revisão que o servidor tem agora. */
function gravarDireto(m, pessoa, campos) {
  const ctx = { pessoa: String(pessoa) };
  const atual = m.chamar({ op: 'view', people: [String(pessoa)] }, ctx).profiles[String(pessoa)];
  const base = { displayName: atual.displayName, pronouns: atual.pronouns, bio: atual.bio, status: atual.status, accent: atual.accent, effect: atual.effect };
  const r = m.chamar({ op: 'save', revision: atual.revision, profile: { ...base, ...campos } }, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.profile;
}

// ---------------------------------------------------------------- a janela

const PESSOAS_PADRAO = [{ id: 1, apelido: 'Alex' }, { id: 2, apelido: 'Lia' }];

function janela(m, opcoes = {}) {
  const o = {
    eu: 2, pessoas: PESSOAS_PADRAO, canais: [{ id: 1, nome: 'geral', aberto: true }], onde: 'computador',
    semEnviar: false, falharEnvio: null, semAvisoDoServidor: false, semConsole: false,
    // `recusar: { 'pessoa.avatar': 'teto-de-alvos' }`: o produto recusa o ponto
    // com aquele nome. `aoPedir(corpo, padrao)`: troca a resposta de um pedido
    // (lento, ou que falha); `padrao()` é a do servidor.
    recusar: {}, aoPedir: null,
    tetoDeContribuicoes: CONTRATO.tetoSemAlvo, tetoDeAlvos: CONTRATO.alvosPorPonto, carregarCliente: true,
    // `latencia`: quantas voltas cada pedido leva para responder. `semArquivo`:
    // sem a capacidade `arquivo`, como no navegador. `recusarMontagem`: os ids
    // de superfície cujo `montar` o produto recusa (`falhou`).
    latencia: 0, semArquivo: false, recusarMontagem: [],
    ...opcoes,
  };
  const j = {
    retrato: {
      eu: o.eu, servidor: { nome: 'Servidor de teste' },
      pessoas: o.pessoas.map(p => ({ id: p.id, apelido: p.apelido, falando: p.falando === true, mudo: p.mudo === true })),
      salas: [], canais: o.canais, onde: o.onde,
      regioes: o.onde === 'celular'
        ? ['servidor.navegacao', 'canal.cabecalho', 'conversa.mensagem', 'compositor', 'pessoas.lista', 'pagina', 'dialogo', 'folha', 'aviso']
        : ['redes', 'servidor.navegacao', 'operador.barra', 'canal.cabecalho', 'conversa.mensagem', 'compositor', 'pessoas.lista', 'status.barra', 'chamada.palco', 'pagina', 'dialogo', 'folha', 'aviso'],
    },
    pedidos: [], historico: [], superficies: new Map(), toasts: [], registro: [], soltos: [],
    relogios: [], recusadosDeCartao: [], escolhidos: new Map(), maiorEmVoo: 0,
  };
  const vivas = new Map();
  let serie = 0;
  let ouvinte = null;
  const capacidades = CONTRATO.capacidades.filter(c =>
    !(o.semAvisoDoServidor && c === 'aviso-do-servidor') && !(o.semEnviar && c === 'volume')
    && !(o.semArquivo && c === 'arquivo'));

  /**
   * **Um pedido da ponte**: conta em voo, recusa o nono como o prelúdio
   * (`too-many-requests`, com o teto), e responde depois de `latencia` voltas.
   */
  let emVoo = 0;
  const voo = fazer => async (...argumentos) => {
    if (emVoo >= TETO_EM_VOO) throw recusa('too-many-requests', { teto: TETO_EM_VOO });
    emVoo += 1;
    j.maiorEmVoo = Math.max(j.maiorEmVoo, emVoo);
    try {
      for (let i = 0; i < o.latencia; i += 1) await settle();
      return await fazer(...argumentos);
    } finally {
      emVoo -= 1;
    }
  };

  // ---- as contribuições, no modelo da 6 ----
  const contribuicoes = Object.freeze({
    registrar: voo(async pedido => {
      ponte('contribuir', { pedido });
      const ponto = String(pedido?.ponto ?? '');
      const modos = CONTRATO.pontos[ponto];
      if (!modos) throw recusa('ponto-desconhecido', { ponto });
      const modo = String(pedido?.modo ?? 'adicionar');
      if (!modos.includes(modo)) throw recusa('modo-recusado', { ponto, modo });
      if (o.recusar[ponto]) throw recusa(o.recusar[ponto], { ponto });
      const alvo = PONTOS_POR_ALVO.has(ponto) && pedido.alvo !== undefined && pedido.alvo !== null ? String(pedido.alvo) : '';
      if ((ponto === 'pessoa.avatar' || ponto === 'pessoa.capa') && (!alvo || !pedido.conteudo?.doServidor)) {
        throw recusa(alvo ? 'conteudo-invalido' : 'sem-alvo', { ponto });
      }
      const minhas = [...vivas.values()];
      if (!alvo) {
        if (minhas.filter(c => !c.alvo).length >= o.tetoDeContribuicoes) throw recusa('teto-de-contribuicoes', { teto: o.tetoDeContribuicoes });
      } else {
        if (minhas.some(c => c.ponto === ponto && c.alvo === alvo && c.modo === modo)) throw recusa('contribuicao-ja-existe', { ponto, alvo });
        const alvos = new Set(minhas.filter(c => c.ponto === ponto && c.alvo).map(c => c.alvo));
        if (!alvos.has(alvo) && alvos.size >= o.tetoDeAlvos) throw recusa('teto-de-alvos', { ponto, teto: o.tetoDeAlvos });
      }
      if (ponto === 'pessoa.cartao' && pedido.conteudo) {
        if (contarNos(pedido.conteudo) > 64) throw new Error('um cartão cabe em 64 nós');
        j.recusadosDeCartao.push(...conferirArvore(pedido.conteudo, FORMAS_DO_CARTAO));
      }
      const handle = 'c' + (++serie);
      vivas.set(handle, { ...structuredClone(pedido), modo, alvo: alvo || undefined, handle });
      j.historico.push({ acao: 'registrar', handle, pedido: structuredClone(pedido) });
      return { handle };
    }),
    atualizar: voo(async (handle, conteudo) => {
      ponte('atualizar-contribuicao', { handle, conteudo });
      const viva = vivas.get(handle);
      if (!viva) return false;
      if ((viva.ponto === 'pessoa.avatar' || viva.ponto === 'pessoa.capa') && !conteudo?.doServidor) throw recusa('conteudo-invalido', { ponto: viva.ponto });
      if (viva.ponto === 'pessoa.cartao') j.recusadosDeCartao.push(...conferirArvore(conteudo, FORMAS_DO_CARTAO));
      viva.conteudo = structuredClone(conteudo);
      j.historico.push({ acao: 'atualizar', handle, conteudo: structuredClone(conteudo) });
      return true;
    }),
    revogar: voo(async handle => {
      ponte('revogar-contribuicao', { handle });
      const tinha = vivas.delete(handle);
      if (tinha) j.historico.push({ acao: 'revogar', handle });
      return tinha;
    }),
  });

  // ---- as superfícies ----
  const novaTela = descricao => {
    const tela = {
      descricao: structuredClone(descricao ?? {}), arvores: [], atual: null, atualizacoes: [], erros: null,
      visivel: true, titulo: String(descricao?.titulo ?? ''), classes: null, editados: new Map(),
      // O `suja` que o MOD ainda declara vale junto com o derivado.
      sujaDeclarada: false,
      get sujo() {
        if (this.sujaDeclarada) return true;
        for (const [chave, no] of porChave(this.atual)) {
          if (!FORMAS_DE_ENTRADA.has(no.forma)) continue;
          const inicial = Object.hasOwn(no, 'inicial') ? no.inicial : no.valor;
          const atual = this.editados.has(chave) ? this.editados.get(chave) : no.valor;
          if (String(atual) !== String(inicial)) return true;
        }
        return false;
      },
    };
    return tela;
  };
  const superficies = Object.freeze({
    criar: voo(async descricao => {
      ponte('superficie-criar', { descricao });
      const tipo = String(descricao?.tipo ?? '');
      if (!CONTRATO.tipos.includes(tipo)) throw recusa('tipo-desconhecido', { tipoPedido: tipo, tipos: CONTRATO.tipos });
      const id = String(descricao?.id ?? '') || 'sem-id';
      if (!j.superficies.has(id)) {
        if (j.superficies.size >= 12) throw recusa('teto-de-superficies', { teto: 12 });
        if (tipo === 'folha' && [...j.superficies.values()].filter(t => t.descricao.tipo === 'folha' && t.visivel).length >= 3) {
          throw recusa('teto-de-folhas', { teto: 3 });
        }
        j.superficies.set(id, novaTela(descricao));
      }
      const tela = j.superficies.get(id);
      tela.visivel = true;
      const atual = () => tela.atual;
      return Object.freeze({
        id,
        montar: voo(async arvore => {
          ponte('superficie-montar', { superficie: id, arvore });
          if (o.recusarMontagem.includes(id)) throw recusa('falhou');
          conferirArvore(arvore, new Set(CONTRATO.formas));
          if (contarNos(arvore) > TETO_DE_NOS) throw recusa('orcamento', { teto: TETO_DE_NOS, tamanho: contarNos(arvore) });
          tela.arvores.push(structuredClone(arvore));
          tela.atual = structuredClone(arvore);
          tela.editados.clear();
        }),
        atualizar: voo(async (chave, arvore) => {
          ponte('superficie-atualizar', { superficie: id, chave, arvore });
          conferirArvore(arvore, new Set(CONTRATO.formas));
          const copia = structuredClone(atual());
          if (!trocarNo(copia, chave, structuredClone(arvore))) throw recusa('chave-desconhecida', { chave });
          if (contarNos(copia) > TETO_DE_NOS) throw recusa('orcamento', { teto: TETO_DE_NOS, tamanho: contarNos(copia) });
          tela.atual = copia;
          tela.atualizacoes.push({ chave, subarvore: structuredClone(arvore) });
        }),
        formulario: Object.freeze({
          // Uma chave que não é de um campo recusa o pedido inteiro, como o
          // produto (`chave-desconhecida`), antes de marcar qualquer campo.
          erros: voo(async mapa => {
            ponte('formulario-erros', { superficie: id, erros: mapa });
            const campos = porChave(tela.atual);
            for (const chave of Object.keys(mapa ?? {})) {
              if (!FORMAS_DE_ENTRADA.has(campos.get(chave)?.forma)) throw recusa('chave-desconhecida', { chave });
            }
            tela.erros = structuredClone(mapa);
          }),
        }),
        classes: voo(async mapa => { ponte('superficie-classes', { superficie: id, classes: mapa }); tela.classes = structuredClone(mapa); }),
        mostrar: voo(async () => { tela.visivel = true; }),
        ocultar: voo(async () => { tela.visivel = false; }),
        suja: voo(async valor => { ponte('superficie-suja', { superficie: id, suja: valor !== false }); tela.sujaDeclarada = valor !== false; }),
        titulo: voo(async t => { tela.titulo = String(t ?? ''); }),
        fechar: voo(async () => { tela.visivel = false; }),
        descartar: voo(async () => { j.superficies.delete(id); }),
      });
    }),
    avisar: voo(async (mensagem, tom) => {
      ponte('superficie-criar', { descricao: { id: 'aviso-x', tipo: 'aviso', titulo: String(mensagem ?? ''), tom } });
      j.toasts.push({ mensagem: String(mensagem ?? ''), tom: tom ?? 'normal' });
      return { superficie: 'aviso', reaproveitada: false };
    }),
  });

  const SeeleUI = Object.freeze({
    tema: voo(async () => null),
    // O retrato é o da hora em que a janela responde, e não o da pergunta.
    retrato: voo(async () => { ponte('retrato', {}); return structuredClone(j.retrato); }),
    superficies,
    contribuicoes,
    capacidades: () => [...capacidades],
    aoEvento: fn => { ouvinte = typeof fn === 'function' ? fn : null; },
    ...(capacidades.includes('volume') ? {
      enviar: voo(async (arquivo, token) => {
        ponte('enviar-imagem', { arquivo, token });
        if (o.falharEnvio) {
          const { nome, ...campos } = o.falharEnvio;
          throw recusa(nome, campos);
        }
        m.enviar(token, j.escolhidos.get(arquivo), String(j.retrato.eu));
      }),
    } : {}),
    // `pedaco` e `soltar` são da capacidade `arquivo`, como `enviar` é do volume.
    ...(capacidades.includes('arquivo') ? {
      pedaco: voo(async (arquivo, inicio) => {
        const bytes = j.escolhidos.get(arquivo);
        if (!bytes) throw recusa('arquivo-nao-esta-de-pe');
        return bytes.subarray(inicio, inicio + 65535).toString('base64');
      }),
      soltar: voo(async arquivo => { j.escolhidos.delete(arquivo); j.soltos.push(arquivo); }),
    } : {}),
  });
  const SeeleMods = Object.freeze({
    request: voo(async (id, canal, valor) => {
      ponte('pedido', { id, canal, valor });
      j.pedidos.push({ id, canal, corpo: structuredClone(valor) });
      const padrao = () => m.chamar(valor, { pessoa: String(j.retrato.eu), canal: canal || null });
      return o.aoPedir ? o.aoPedir(valor, padrao) : padrao();
    }),
  });

  const registrar = linha => j.registro.push(String(linha));
  const sandbox = vm.createContext({
    ...(o.semConsole ? {} : { console: { log: registrar, info: registrar, warn: registrar, error: registrar } }),
    setTimeout: (fn, ms) => {
      if (Number(ms) < 1000) { setImmediate(fn); return 0; }
      j.relogios.push({ ms: Number(ms), fn });
      return j.relogios.length;
    },
    clearTimeout: () => {},
    SeeleUI, SeeleMods,
  });
  if (o.semConsole) vm.runInContext('delete globalThis.console', sandbox);
  j.sandbox = sandbox;

  // ---- o que a pessoa e o produto fazem ----
  j.evento = e => {
    if (!ouvinte) throw new Error('o MOD não registrou ouvinte de evento');
    if (FORMAS_DE_ENTRADA.has(e.nome === 'campo' ? 'campo' : e.nome)) {
      for (const tela of j.superficies.values()) if (porChave(tela.atual).has(e.chave)) tela.editados.set(e.chave, e.valor);
    }
    try { ouvinte(e); } catch (erro) { registrar('erro num ouvinte de evento: ' + (erro.message || erro)); }
  };
  j.agir = (acao, pessoa = '') => j.evento({ nome: 'acao', acao, pessoa: String(pessoa), canal: '' });
  j.escolher = (chave, bytes, tipo = 'image/png') => {
    const id = j.escolhidos.size + j.soltos.length + 1;
    j.escolhidos.set(id, Buffer.from(bytes));
    j.evento({ nome: 'arquivo', chave, arquivo: { id, tipo, papel: tipo.startsWith('image/') ? 'imagem' : 'som', bytes: bytes.length } });
    return id;
  };
  j.entrou = (id, apelido) => {
    j.retrato.pessoas.push({ id, apelido, falando: false, mudo: false });
    j.evento({ nome: 'pessoas', entrou: id });
  };
  j.saiu = id => {
    j.retrato.pessoas = j.retrato.pessoas.filter(p => String(p.id) !== String(id));
    j.evento({ nome: 'pessoas', saiu: id });
  };
  j.avisoDoServidor = (carga, canal = null) => j.evento({ nome: 'servidor', canal, carga: JSON.parse(JSON.stringify(carga)) });
  j.tick = () => { const proximo = j.relogios.shift(); if (!proximo) throw new Error('nenhum relógio pendente'); proximo.fn(); };
  j.contribuicoesDe = ponto => [...vivas.values()].filter(c => c.ponto === ponto);
  j.superficie = id => j.superficies.get(String(id))?.atual ?? null;
  j.controlesDe = id => porChave(j.superficie(id));

  if (o.carregarCliente) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../cliente/main.js'), 'utf8'), sandbox, { timeout: 1000 });
  }
  return j;
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const assentar = async (voltas = 12) => { for (let i = 0; i < voltas; i += 1) await settle(); };

/**
 * **Os avisos que o servidor guardou, entregues como o Servidor 1.0 os
 * entrega** (`api/v6.json`, `sentido.mundo.avisar`): os quatro primeiros da
 * janela de um segundo saem na hora, e o excedente fica, por canal, só o mais
 * novo, na ordem em que cada canal apareceu. Entrega a cada janela e esvazia
 * `m.avisos`.
 */
function entregarAvisos(m, janelas, { taxa = AVISOS_POR_SEGUNDO } = {}) {
  const todos = m.avisos.splice(0);
  const saem = todos.slice(0, taxa);
  const excedente = new Map();
  for (const aviso of todos.slice(taxa)) excedente.set(aviso.canal ?? null, aviso);
  for (const aviso of [...saem, ...excedente.values()]) {
    for (const j of janelas) j.avisoDoServidor(aviso.carga, aviso.canal ?? null);
  }
}

module.exports = { CONTRATO, TETO_DA_MENSAGEM, TETO_EM_VOO, mundo, janela, semearPerfis, trocarImagem, gravarDireto, assentar, entregarAvisos };
