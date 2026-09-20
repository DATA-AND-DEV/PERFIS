// O laboratório, exercitado num navegador de verdade.
//
// # O que este arquivo passou a afirmar, e por que o que ele afirmava saiu
//
// Ele exigia que a região **não** tivesse `button` nem `input`:
//
//     assert.equal(await region.locator('img,button,input,script').count(), 0);
//
// Isso era verdade na API 2, quando um MOD só escrevia texto. Desde a API 3 a
// região tem botões e campos de propósito — é assim que alguém grava um perfil
// —, e desde a API 4 ela tem seletor de cor, abas e superfícies inteiras. A
// asserção continuava verde porque o laboratório ao lado estava quebrado e
// nunca chegava a montar nada; a auditoria de 20/09/2026 encontrou os dois.
//
// O que ele afirma agora é o contrato de hoje:
//
// - **o que o MOD desenha aparece**, e é montado pelo renderer do produto;
// - **os controles existem** — um MOD sem botão não seria utilizável;
// - **não há `script`** dentro do que o MOD declarou: a fronteira é essa, e ela
//   não mudou em nenhuma versão da API;
// - **não há endereço externo**: nenhuma forma da API carrega `src` de rede, e
//   é isso que impede a janela de quem conversa de buscar bytes de estranhos;
// - **sair solta tudo**, inclusive as superfícies e as contribuições.
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));

(async () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seele-lab-'));
  const pacote = path.join(temp, 'pacote');
  execFileSync(process.execPath, [path.join(__dirname, 'package.mjs'), pacote]);

  const filho = spawn(process.execPath, [path.join(__dirname, 'preview.cjs')], {
    env: { ...process.env, MOD_PORT: '0', MOD_PACKAGE: pacote },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let navegador;
  try {
    const url = await new Promise((resolve, reject) => {
      const prazo = setTimeout(() => reject(Error('Laboratório não iniciou')), 10000);
      filho.stdout.on('data', pedaco => {
        const m = String(pedaco).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (m) { clearTimeout(prazo); resolve(m[0]); }
      });
      filho.stderr.on('data', pedaco => { clearTimeout(prazo); reject(Error(String(pedaco))); });
      filho.once('exit', codigo => { clearTimeout(prazo); reject(Error('Laboratório saiu: ' + codigo)); });
    });

    /** Uma escrita direta no servidor deste MOD, para semear o caso. */
    const chamar = async (corpo, pessoa = '1') => {
      const r = await (await fetch(url + '/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servidor: 'a', pessoa, canal: 1, corpo }),
      })).json();
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    };

    let esperado;
    if (manifest.id === 'seele/mesa') {
      let r = await chamar({ op: 'setup', name: 'Campanha do laboratório', system: 'free', gm: '1', revision: 0, nonce: 'a' });
      r = await chamar({ op: 'sheet-create', name: 'Iria <img src=x>', owner: '2', revision: r.campaign.revision, nonce: 'b' });
      await chamar({ op: 'sheet-create', name: 'Segredo do terceiro', owner: '3', revision: r.campaign.revision, nonce: 'c' });
      esperado = 'Campanha do laboratório';
    } else if (manifest.id === 'seele/perfis') {
      await chamar({
        op: 'save', revision: 0,
        profile: { displayName: 'Lia <img src=x>', pronouns: 'ela/dela', bio: 'Biografia preservada', status: 'Presente', accent: '#a78bfa', effect: 'aurora' },
      }, '2');
      esperado = 'Lia <img src=x>';
    } else {
      const r = await chamar({ op: 'view' });
      await chamar({ op: 'save', revision: 0, theme: { ...r.theme, accent: '#6bffb6' } });
      esperado = 'Tema deste servidor';
    }

    navegador = await chromium.launch({ headless: true });
    const aba = await navegador.newPage({ viewport: { width: 390, height: 844 } });
    const erros = [];
    aba.on('pageerror', e => erros.push(e.message));
    await aba.goto(url + '/?pessoa=2');

    // **A faixa permanente não volta, e nada abre sozinho.** N2 da validação
    // nativa de 20/09/2026: com os três instalados, `ui.regiao` a cada volta do
    // relógio tomava cerca de 230 px da janela — quase um terço — sem nenhuma
    // atividade aberta.
    //
    // Conferido **antes** de abrir qualquer coisa, que é o estado que a
    // validação descreveu: chegar no servidor e já ter um terço da janela
    // ocupado por três formulários que ninguém pediu.
    if (manifest.api >= 4) {
      const entradas = aba.locator('#lista-mods-navegacao button');
      await entradas.first().waitFor({ timeout: 15000 });
      const faixa = aba.locator('#regioes-dos-mods');
      const altura = await faixa.evaluate(n => n.getBoundingClientRect().height);
      assert.ok(altura <= 1,
        'a faixa permanente voltou a ocupar ' + Math.round(altura) + 'px sem nenhuma '
        + 'atividade aberta: a região legada está sendo pintada num pacote de API 4');
      // E a atividade começa por um gesto: a entrada existe e é o que abre.
      await entradas.first().click();
      await aba.locator('.superficie-de-mod').first().waitFor({ timeout: 15000 });
    }

    // **Onde quer que ele tenha desenhado.** Era `.first()`, que numa página com
    // a faixa antes da lista significava «na faixa». Num pacote de API 4 a
    // faixa fica vazia e o que o MOD desenha está no cartão de alguém ou na
    // superfície que acabou de abrir — e o que se quer provar é que ele
    // desenhou, não onde.
    const doMod = aba.locator('[data-mod="' + manifest.id + '"]');
    await doMod.getByText(esperado, { exact: false }).first().waitFor({ timeout: 15000 });

    // **A fronteira, e ela não mudou em nenhuma versão da API.**
    const sessao = aba.locator('#tela-sessao');
    assert.equal(await sessao.locator('script').count(), 0,
      'apareceu um <script> dentro do que o MOD declarou');
    const comEndereco = await sessao.locator('[src^="http"],[href^="http"]').count();
    assert.equal(comEndereco, 0,
      'o MOD montou um endereço externo, e a janela de quem conversa não busca bytes de estranhos');

    // **E os controles existem.** Um MOD sem botão não é utilizável, e foi
    // justamente a asserção contrária que ficou obsoleta sem ninguém notar.
    assert.ok(await sessao.locator('button').count() > 0,
      'o MOD não montou controle nenhum');

    // O que é de outra pessoa não vaza para quem não pode ver.
    if (manifest.id === 'seele/mesa') {
      const texto = await sessao.textContent();
      assert.ok(!texto.includes('Segredo do terceiro'),
        'a ficha de outra pessoa apareceu para quem não é dona dela nem GM');
    }

    // ---- a superfície aberta acima é do produto ----
    if (manifest.api >= 4) {
      const entradas = aba.locator('#lista-mods-navegacao button');
      assert.ok(await entradas.count() > 0,
        'o MOD não registrou entrada de navegação: U03 continua de pé');

      const superficie = aba.locator('.superficie-de-mod').first();
      await superficie.waitFor({ timeout: 15000 });
      // **A saída é do produto, e ela está sempre lá.** Um MOD que não desenhe
      // botão nenhum continua sendo uma superfície de onde se sai.
      assert.equal(await superficie.locator('.superficie-de-mod-sair').count(), 1,
        'a superfície ficou sem a saída que o produto monta');
      // E ela diz de quem é: uma tela de MOD indistinguível das do SEELE é o
      // que tornaria uma tela de confiança falsificável.
      const origem = await superficie.locator('[class$="-origem"]').first().textContent();
      assert.equal(origem.trim(), manifest.id,
        'a superfície não diz de qual MOD ela é');
    }

    // ---- sair solta tudo ----
    await aba.click('#sair');
    await aba.waitForTimeout(500);
    // **Nomeados, e não contados.** «2 !== 0» mandou procurar às cegas o que
    // tinha sobrevivido; a lista diz qual nó e de quem ele é filho, e foi ela
    // que encontrou em dois minutos o `esquecer` que a instância de mentira
    // não devolvia.
    const sobreviventes = await aba.locator('[data-mod="' + manifest.id + '"]').evaluateAll(
      ns => ns.map(n => n.tagName + '.' + n.className + '#' + (n.id || '-')
        + ' pai=' + (n.parentElement?.id || n.parentElement?.className || '?')),
    );
    assert.deepEqual(sobreviventes, [],
      'o que o MOD desenhou sobreviveu à saída da sessão'
      + (erros.length ? ' — e a janela registrou: ' + erros.join(' · ') : ''));
    assert.equal(await aba.locator('.superficie-de-mod').count(), 0,
      'uma superfície do MOD sobreviveu à saída da sessão');
    assert.equal(await aba.locator('#lista-mods-navegacao button').count(), 0,
      'a entrada de navegação sobreviveu à saída da sessão');

    // E recarregar monta de novo, do estado do servidor. Na API 4 a atividade
    // não volta aberta — e não deve: quem recarrega cai na conversa, e não na
    // janela que estava aberta antes. O gesto de abrir é o mesmo da primeira
    // vez, e é isso que se repete aqui.
    await aba.reload();
    if (manifest.api >= 4) {
      const entradas = aba.locator('#lista-mods-navegacao button');
      await entradas.first().waitFor({ timeout: 15000 });
      await entradas.first().click();
    }
    await aba.locator('[data-mod="' + manifest.id + '"]')
      .getByText(esperado, { exact: false }).first().waitFor({ timeout: 15000 });

    assert.deepEqual(erros, [], 'a janela registrou erros: ' + erros.join(' · '));
    console.log(manifest.id + ': renderer do produto, prelúdio real, superfícies, '
      + 'dados autorizados, saída e reconexão conferidos.');
  } finally {
    await navegador?.close();
    filho.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
