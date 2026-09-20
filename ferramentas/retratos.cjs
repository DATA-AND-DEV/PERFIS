// Retratos do laboratório, para comparar aparência entre versões.
//
// Ele não afirma nada: ele **mostra**. A validação de 20/09/2026 recusou a
// aparência dos três MODs oficiais, e a lição foi que suíte verde e captura de
// tela respondem perguntas diferentes — «os elementos existem» e «isto está
// bem composto» não são a mesma pergunta.
//
// Sobe o laboratório do pacote, semeia o estado que o caso precisa, abre a
// atividade pela entrada de navegação e fotografa. Uma janela por execução: o
// laboratório serve uma instância de MOD por (servidor, pessoa), e duas abas
// na mesma corrida disputam a mesma.
//
//   node ferramentas/retratos.cjs <repo> <abrir|""> <prefixo> '<semente JSON>'
//
//   PESSOA=1     entra como quem hospeda (o `admin` do laboratório)
//   ESTREITO=1   janela de 460px em vez de 1240px
//   CLIQUES="A|B" apertos por texto de botão, depois de abrir
//   PROBE=<sel>  mede um nó e o imprime, para quando o retrato não explica
//
// Não é o aplicativo nativo: é o renderer do produto num navegador, com
// transporte e identidades simulados. O que ele pega são composição,
// espaçamento, contraste e quebra; o que ele não pega é foco, teclado e
// custo — isso continua sendo observação nativa.
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const repo = process.argv[2];
const acao = process.argv[3] || '';
const saida = process.argv[4] || '/tmp/mod';
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'mod.json')));
const semeia = process.argv[5] ? JSON.parse(process.argv[5]) : [];

(async () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seele-shot-'));
  const pacote = path.join(temp, 'pacote');
  execFileSync(process.execPath, [path.join(repo, 'ferramentas/package.mjs'), pacote]);
  const filho = spawn(process.execPath, [path.join(repo, 'ferramentas/preview.cjs')], {
    env: { ...process.env, MOD_PORT: '0', MOD_PACKAGE: pacote },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let navegador;
  try {
    const url = await new Promise((ok, no) => {
      const t = setTimeout(() => no(Error('lab nao subiu')), 15000);
      filho.stdout.on('data', d => { const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(t); ok(m[0]); } });
      filho.stderr.on('data', d => { clearTimeout(t); no(Error(String(d))); });
    });
    const chamar = async (corpo, pessoa = '1') => {
      const r = await (await fetch(url + '/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servidor: 'a', pessoa, canal: 1, corpo }),
      })).json();
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r;
    };
    for (const passo of semeia) await chamar(passo.corpo, passo.pessoa || '1');

    navegador = await chromium.launch({ headless: true });
    const medidas = process.env.ESTREITO ? [['estreito', 460, 900]] : [['largo', 1240, 820]];
    for (const [nome, largura, altura] of medidas) {
      const aba = await navegador.newPage({ viewport: { width: largura, height: altura } });
      const erros = [];
      aba.on('pageerror', e => erros.push(e.message));
      aba.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
      await aba.goto(url + '/?pessoa=2');
      await aba.waitForTimeout(1200);
      if (acao) {
        const b = aba.locator('#lista-mods-navegacao button');
        try {
          await b.first().waitFor({ timeout: 25000 });
        } catch (e) {
          console.error('nav[' + nome + ']:', await aba.locator('#lista-mods-navegacao').evaluate(n => n.outerHTML).catch(() => '?'));
          console.error('erros:', erros.slice(0, 5));
          throw e;
        }
        await b.first().click();
        await aba.waitForTimeout(1200);
      }
      for (const texto of (process.env.CLIQUES || '').split('|').filter(Boolean)) {
        const alvo = aba.locator('button', { hasText: texto }).first();
        if (await alvo.count()) { await alvo.click(); await aba.waitForTimeout(1200); }
        else console.error('nao achei:', texto, await aba.locator('button').allTextContents());
      }
      if (process.env.PROBE) {
        console.error('probe:', JSON.stringify(await aba.evaluate((sel) => {
          if (sel === 'ponto') {
            const r = [...document.querySelectorAll('[data-superficie="perfis-editor"] [data-forma="retrato"]')].pop();
            if (!r) return 'sem retrato';
            const b = r.getBoundingClientRect();
            const cima = document.elementFromPoint(b.x + b.width / 2, b.y + 6);
            const cs = getComputedStyle(r);
            return { retrato: JSON.stringify(b.toJSON()), bg: cs.backgroundColor, w: cs.width,
                     acima: cima ? (cima.tagName + '.' + cima.className + '/' + (cima.dataset.forma || '')) : 'nada',
                     paiT: getComputedStyle(r.parentElement).transform };
          }
          if (sel === 'cartao') {
            const raiz = document.querySelector('[data-superficie="perfis-editor"] [data-forma="caixa"]');
            const todos = [...document.querySelectorAll('[data-superficie="perfis-editor"] [data-forma]')].slice(0, 14);
            return todos.map(n => ({ f: n.dataset.forma, r: JSON.stringify(n.getBoundingClientRect().toJSON()).slice(0, 90),
                                     t: getComputedStyle(n).transform, p: getComputedStyle(n).position, o: getComputedStyle(n).overflow }));
          }
          const n = document.querySelector(sel);
          if (!n) return 'ausente';
          const c = getComputedStyle(n);
          return { classe: n.className, display: c.display, dir: c.flexDirection, w: n.getBoundingClientRect().width,
                   filhos: [...n.children].map(f => ({ t: f.tagName, d: getComputedStyle(f).display, w: f.getBoundingClientRect().width })) };
        }, process.env.PROBE)));
      }
      await aba.screenshot({ path: `${saida}-${nome}.png`, fullPage: false });
      if (erros.length) console.error(nome, 'ERROS', erros.slice(0, 5));
      await aba.close();
    }
    console.log('retratos em', saida + '-{largo,estreito}.png');
  } finally {
    await navegador?.close();
    filho.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
