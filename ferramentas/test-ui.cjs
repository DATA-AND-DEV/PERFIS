const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
(async () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seele-api3-'));
  const pacote = path.join(temp, 'pacote');
  execFileSync(process.execPath, [path.join(__dirname, 'package.mjs'), pacote]);
  const child = spawn(process.execPath, [path.join(__dirname, 'preview.cjs')], { env: { ...process.env, MOD_PORT: '0', MOD_PACKAGE: pacote }, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Laboratório não iniciou')), 10000);
      child.stdout.on('data', chunk => { const m = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timeout); resolve(m[0]); } });
      child.stderr.on('data', chunk => { clearTimeout(timeout); reject(Error(String(chunk))); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('Laboratório saiu: ' + code)); });
    });
    const call = async (body, person = '1') => {
      const r = await (await fetch(url + '/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person, channel: 1, body }) })).json();
      assert.equal(r.ok, true, JSON.stringify(r)); return r;
    };
    let expected;
    if (manifest.id === 'seele/mesa') {
      let r = await call({ op: 'setup', name: 'Campanha API 3', system: 'free', gm: '1', revision: 0, nonce: 'a' });
      r = await call({ op: 'sheet-create', name: 'Iria <img src=x>', owner: '2', revision: r.campaign.revision, nonce: 'b' });
      await call({ op: 'sheet-create', name: 'Segredo do terceiro', owner: '3', revision: r.campaign.revision, nonce: 'c' });
      expected = 'Iria <img src=x>';
    } else if (manifest.id === 'seele/perfis') {
      await call({ op: 'save', revision: 0, profile: { displayName: 'Lia <img src=x>', pronouns: 'ela/dela', bio: 'Biografia preservada', status: 'Presente', accent: '#a78bfa', effect: 'aurora' } }, '2');
      expected = 'Biografia preservada';
    } else {
      const r = await call({ op: 'view' });
      await call({ op: 'save', revision: 0, theme: { ...r.theme, accent: '#6bffb6' } });
      expected = 'Cores do servidor aplicadas';
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let sawWorker = false;
    page.on('worker', async worker => {
      sawWorker = true;
      const globals = await worker.evaluate(() => [typeof document, typeof window, typeof localStorage, typeof CSSStyleSheet]);
      assert.deepEqual(globals, ['undefined', 'undefined', 'undefined', 'undefined']);
    });
    await page.goto(url + '/?person=2');
    const region = page.locator('[data-mod="' + manifest.id + '"]');
    await region.getByText(expected, { exact: false }).waitFor();
    assert.ok(sawWorker); assert.equal(await region.locator('img,button,input,script').count(), 0);
    assert.ok(!((await region.textContent()).includes('Segredo do terceiro')));
    if (manifest.id === 'seele/estilo') {
      assert.equal(await page.locator('#tela-sessao').evaluate(e => e.style.getPropertyValue('--seele-laranja-nerv')), '#6bffb6');
      assert.equal(await page.locator('html').evaluate(e => e.style.getPropertyValue('--seele-laranja-nerv')), '');
      // A mesma validação do SEELE deve recusar disputa e contraste insuficiente.
      const refused = await page.evaluate(() => {
        const errors = [];
        for (const [id, theme] of [['outro/tema', { acento: '#ffffff' }], ['seele/estilo', { texto: '#ffffff', fundo: '#ffffff' }]]) {
          try { aplicarOTemaDoMod(id, theme); } catch (e) { errors.push(e.message); }
        }
        return errors;
      });
      assert.equal(refused.length, 2); assert.match(refused[0], /já é/); assert.match(refused[1], /4,5:1/);
    }
    if (manifest.id === 'seele/mesa') {
      await page.selectOption('#channel', '2');
      await region.getByText('Nenhuma campanha criada', { exact: false }).waitFor();
      assert.ok(!(await region.textContent()).includes('Iria'));
    }
    await page.click('#unload');
    assert.equal(await region.count(), 0);
    assert.equal(await page.locator('#tela-sessao').evaluate(e => e.style.getPropertyValue('--seele-laranja-nerv')), '');
    await page.waitForTimeout(4500); assert.equal(await region.count(), 0);
    await page.reload(); await region.getByText(expected, { exact: false }).waitFor();
    assert.equal(await region.count(), 1);
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.deepEqual(errors, []);
    console.log(manifest.id + ': Worker real, renderer do SEELE, dados autorizados, tema, saída e reconexão conferidos.');
  } finally { await browser?.close(); child.kill(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
