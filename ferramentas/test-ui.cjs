// DOM integration regression; not a native WebView/QUIC test.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const row='<li class="pessoa"><span class="pessoa-cabeca"><span class="pessoa-identidade"><button class="pessoa-nome" data-moderar-pessoa="2">Mika</button></span><span class="pessoa-sync">98</span></span><span class="barra">||||</span><span class="pessoa-rodape">EM ESCUTA</span><input class="volume" type="range" value="70" aria-label="Volume de Mika"></li>';
    await page.route('http://perfis.test/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/client.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../cliente/main.js'),'utf8')});
      return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:"},body:`<!doctype html><section id="tela-sessao"><section class="painel-canais"><div class="canais-rolagem"></div></section><aside class="painel-pessoas"><ul>${row}</ul></aside></section><script src="/client.js"></script>`});
    });
    await page.addInitScript(()=>{
      window.violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective));
      window.moderated=0;document.addEventListener('click',e=>{if(e.target.matches('[data-moderar-pessoa]'))window.moderated++;});
      window.SeeleMods={snapshot:async()=>({me:'1',channels:[{id:1}],presentes:[{id:'1',nickname:'Alex'},{id:'2',nickname:'Mika'}]}),request:async()=>({ok:true,profiles:{'1':{revision:0},'2':{revision:1,displayName:'Aurora',status:'Preparando sessão'}}})};
    });
    await page.goto('http://perfis.test/');
    await page.locator('.pf-replaced').waitFor();
    assert.equal(await page.locator('.pessoa-identidade').isVisible(),false);
    assert.equal(await page.locator('.barra').isVisible(),false);
    assert.equal(await page.locator('.pessoa-sync').isVisible(),false);
    assert.equal(await page.locator('.pessoa-cabeca').isVisible(),false);
    assert.equal(await page.locator('.pessoa-rodape').isVisible(),false);
    assert.equal(await page.getByLabel('Volume de Mika').inputValue(),'70');
    await page.getByRole('button',{name:'Moderar Mika',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.moderated),1);
    for(const width of [720,1280]){
      await page.setViewportSize({width,height:800});
      await page.getByRole('button',{name:'Ver perfil de Mika'}).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button',{name:'Fechar',exact:true}).click();
    }
    await page.locator('.painel-pessoas ul').evaluate((e,html)=>{e.innerHTML=html;},row);
    await page.locator('.pf-replaced').waitFor();
    assert.equal(await page.locator('.seele-perfis-roster').count(),1);
    assert.equal(await page.locator('.pessoa-sync').isVisible(),false);
    await page.locator('.pessoa-rodape').evaluate(e=>{e.textContent='TRANSMITINDO';});
    assert.equal(await page.getByText('TRANSMITINDO',{exact:true}).isVisible(),false);
    await page.evaluate(()=>dispatchEvent(new CustomEvent('seele-mod-unload',{detail:'seele/perfis'})));
    assert.equal(await page.locator('.seele-perfis-roster,.pf-moderate,.pf-replaced').count(),0);
    assert.equal(await page.locator('.pessoa-identidade').isVisible(),true);
    assert.equal(await page.locator('.pessoa-sync').isVisible(),true);
    assert.equal(await page.getByText('TRANSMITINDO',{exact:true}).isVisible(),true);
    assert.equal(await page.getByLabel('Volume de Mika').inputValue(),'70');
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>violations),[]);
    console.log('UI OK: cartão substitui identidade/sinal/estado nativos, volume/moderação preservados, restauração no unload, CSP, 720/1280px.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
