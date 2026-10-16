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
//
// No PERFIS da API 6, também: o cartão de cada pessoa na lista, com a foto e a
// capa citadas; a capa aceita pelo produto; a folha do perfil de outra pessoa;
// o limite do nome conferido pelo produto no envio; a foto trocada que chega à
// lista; e a capa parada com o movimento reduzido. As capturas vão para
// `PERFIS_CAPTURAS`, quando a variável diz uma pasta.
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));

/** Um PNG de uma cor só, montado aqui: o caso é semeado antes de haver janela. */
function png(largura, altura, [r, g, b]) {
  const pedaco = (tipo, dados) => {
    const nome = Buffer.from(tipo, 'latin1');
    const tamanho = Buffer.alloc(4); tamanho.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([nome, dados])));
    return Buffer.concat([tamanho, nome, dados, crc]);
  };
  const cabeca = Buffer.alloc(13);
  cabeca.writeUInt32BE(largura, 0); cabeca.writeUInt32BE(altura, 4);
  cabeca[8] = 8; cabeca[9] = 2; // 8 bits por canal, RGB
  const linha = Buffer.alloc(1 + largura * 3);
  for (let x = 0; x < largura; x += 1) linha.set([r, g, b], 1 + x * 3);
  const linhas = Buffer.concat(Array.from({ length: altura }, () => linha));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cabeca), pedaco('IDAT', zlib.deflateSync(linhas)), pedaco('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Um GIF animado, um quadro de cada cor, em laço — a capa que anima.
 *
 * O LZW mais simples que um decodificador aceita: códigos de 3 bits, e a
 * tabela limpa a cada dois pixels, para ela nunca crescer até pedir 4 bits.
 */
function gifAnimado(largura, altura, cores) {
  const paleta = Buffer.alloc(12);
  cores.slice(0, 4).forEach((cor, i) => paleta.set(cor, i * 3));
  const tela = Buffer.alloc(7);
  tela.writeUInt16LE(largura, 0); tela.writeUInt16LE(altura, 2); tela[4] = 0x81; // tabela global de 4 cores
  const partes = [Buffer.from('GIF89a', 'latin1'), tela, paleta,
    Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])];
  cores.slice(0, 4).forEach((_, indice) => {
    partes.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, 20, 0, 0x00, 0x00])); // 0,2 s por quadro
    const quadro = Buffer.alloc(10);
    quadro[0] = 0x2c; quadro.writeUInt16LE(largura, 5); quadro.writeUInt16LE(altura, 7);
    partes.push(quadro, Buffer.from([2]));
    const codigos = [];
    const total = largura * altura;
    for (let i = 0; i < total; i += 2) codigos.push(4, ...(i + 1 < total ? [indice, indice] : [indice]));
    codigos.push(5);
    const bytes = [];
    let acumulado = 0, bits = 0;
    for (const codigo of codigos) {
      acumulado |= codigo << bits; bits += 3;
      while (bits >= 8) { bytes.push(acumulado & 0xff); acumulado >>= 8; bits -= 8; }
    }
    if (bits) bytes.push(acumulado & 0xff);
    for (let i = 0; i < bytes.length; i += 255) {
      const bloco = bytes.slice(i, i + 255);
      partes.push(Buffer.from([bloco.length]), Buffer.from(bloco));
    }
    partes.push(Buffer.from([0]));
  });
  partes.push(Buffer.from([0x3b]));
  return Buffer.concat(partes);
}

(async () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seele-lab-'));
  const pacote = path.join(temp, 'pacote');
  execFileSync(process.execPath, [path.join(__dirname, 'package.mjs'), pacote]);
  const capturas = process.env.PERFIS_CAPTURAS || temp;
  fs.mkdirSync(capturas, { recursive: true });
  const captura = nome => path.join(capturas, nome);

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
    const chamar = async (corpo, pessoa = '1', canal = 1) => {
      const r = await (await fetch(url + '/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servidor: 'a', pessoa, canal, corpo }),
      })).json();
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    };

    /** Uma imagem pelo volume, como o produto a manda: autoriza, transmite, publica. */
    const enviarPeloVolume = async (pessoa, slot, bytes) => {
      const { token } = await chamar({ op: 'upload-start', slot, transporte: 'volume', bytes: bytes.length }, pessoa, 0);
      const r = await fetch(url + '/volume?servidor=a&pessoa=' + pessoa + '&token=' + encodeURIComponent(token), { method: 'POST', body: bytes });
      assert.equal(r.ok, true, await r.text());
      await chamar({ op: 'upload-finish', token }, pessoa, 0);
    };

    let esperado;
    let pessoasNaLista = 3;
    if (manifest.id === 'seele/mesa') {
      let r = await chamar({ op: 'setup', name: 'Campanha do laboratório', system: 'free', gm: '1', revision: 0, nonce: 'a' });
      r = await chamar({ op: 'sheet-create', name: 'Iria <img src=x>', owner: '2', revision: r.campaign.revision, nonce: 'b' });
      await chamar({ op: 'sheet-create', name: 'Segredo do terceiro', owner: '3', revision: r.campaign.revision, nonce: 'c' });
      esperado = 'Campanha do laboratório';
    } else if (manifest.id === 'seele/perfis') {
      // **Vinte pessoas, cada uma com foto e capa.** Na 3.x a lista congelava a
      // partir de umas 14 com foto e faixa: o conjunto inteiro ia numa mensagem.
      pessoasNaLista = 20;
      const cor = p => [(p * 53) % 256, (p * 97) % 256, (p * 29) % 256];
      for (let p = 1; p <= pessoasNaLista; p += 1) {
        const eu = String(p);
        await chamar({
          op: 'save', revision: 0,
          profile: p === 2
            ? { displayName: 'Lia <img src=x>', pronouns: 'ela/dela', bio: 'Biografia preservada', status: 'Presente', accent: '#a78bfa', effect: 'aurora' }
            : { displayName: 'Perfil ' + p, pronouns: '', bio: '', status: 'Presente', accent: '#a78bfa', effect: 'none' },
        }, eu, 0);
        await enviarPeloVolume(eu, 'avatar', png(64, 64, cor(p)));
        await enviarPeloVolume(eu, 'banner', gifAnimado(96, 32, [cor(p), [10, 8, 6]]));
      }
      esperado = 'Lia <img src=x>';
    } else {
      const r = await chamar({ op: 'view' });
      await chamar({ op: 'save', revision: 0, theme: { ...r.theme, accent: '#6bffb6' } });
      esperado = 'Tema deste servidor';
    }
    const daLista = pessoasNaLista > 3 ? '&pessoas=' + pessoasNaLista : '';

    navegador = await chromium.launch({ headless: true });
    const aba = await navegador.newPage({ viewport: { width: 390, height: 844 } });
    const erros = [];
    aba.on('pageerror', e => erros.push(e.message));
    await aba.goto(url + '/?pessoa=2' + daLista);

    // **Nada abre sozinho.** N2 da validação nativa de 20/09/2026: com os três
    // instalados, `ui.regiao` a cada volta do relógio tomava cerca de 230 px da
    // janela — quase um terço — sem nenhuma atividade aberta. A 6 não tem
    // região; o que se confere é que a atividade começa por um gesto.
    if (manifest.api >= 4) {
      const entradas = aba.locator('#lista-mods-navegacao button');
      await entradas.first().waitFor({ timeout: 15000 });
      assert.equal(await aba.locator('.superficie-de-mod').count(), 0,
        'uma superfície abriu sem que ninguém a pedisse');
      await entradas.first().click();
      await aba.locator('.superficie-de-mod').first().waitFor({ timeout: 15000 });
    }

    // **Onde quer que ele tenha desenhado.** No cartão de alguém ou na
    // superfície que acabou de abrir — o que se quer provar é que ele
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

    if (manifest.id === 'seele/perfis') {
      await aba.setViewportSize({ width: 1280, height: 900 });

      // ---- o cartão de cada pessoa, com a foto e a capa citadas ----
      await aba.waitForFunction(n => {
        const cartoes = [...document.querySelectorAll('#lista-roster .contribuicao-de-mod[data-ponto="pessoa.cartao"]')];
        return cartoes.length === n && cartoes.every(cartao => {
          const compacto = cartao.querySelector('[data-chave-do-mod="pessoa-compacta"]');
          const foto = cartao.querySelector('img');
          return compacto?.style.backgroundImage.includes('data:image/')
            && foto?.complete && foto.naturalWidth === 64;
        });
      }, pessoasNaLista, { timeout: 30000 });
      // **Na lista, a capa citada fica parada** (api/v6.json, capa.onde.lista):
      // o produto cita o primeiro quadro, e o cartão recebe um PNG.
      assert.equal(await aba.locator('#lista-roster [data-chave-do-mod="pessoa-compacta"][style*="data:image/gif"]').count(), 0,
        'na lista, a capa citada no cartão anima');
      // O apelido verificado fica à vista, ao lado do cartão: o nome exibido
      // não toma o lugar dele.
      assert.equal(await aba.locator('#lista-roster .pessoa-apresentada .pessoa-nucleo .pessoa-nome').nth(1).textContent(), 'Lia');
      const compacto = aba.locator('#lista-roster [data-chave-do-mod="pessoa-compacta"]').first();
      assert.equal(await compacto.evaluate(no => no.getBoundingClientRect().height), 44);

      // ---- o produto aceita a capa ----
      //
      // A chamada não existe neste laboratório; o que ele prova é que o
      // registro do produto aceitou `pessoa.capa` para cada pessoa, e que a
      // capa decodificou — é a que o cartão da lista cita.
      assert.deepEqual(await aba.evaluate(n => Array.from({ length: n }, (_, i) =>
        contribuicoes.escolherSubstituicao('pessoa.capa', String(i + 1)).escolhida?.mod ?? null), pessoasNaLista),
      Array.from({ length: pessoasNaLista }, () => 'seele/perfis'));
      await aba.locator('#lista-roster').screenshot({ path: captura('perfis-lista.png') });

      // ---- a folha do perfil de outra pessoa, com a capa animada ----
      await aba.getByRole('button', { name: 'Rafa — perfil em seele/perfis', exact: true }).click();
      const folha = aba.locator('.folha-de-mod');
      await folha.getByText('Perfil 3', { exact: false }).first().waitFor({ timeout: 15000 });
      // A capa e a foto da folha são citadas com o id da pessoa: a capa anima ali.
      await aba.waitForFunction(() => {
        const capa = document.querySelector('.folha-de-mod [data-chave-do-mod="d-capa"]');
        const foto = document.querySelector('.folha-de-mod [data-chave-do-mod="d-retrato"] img');
        return capa?.style.backgroundImage.includes('data:image/gif') && foto?.complete && foto.naturalWidth === 64;
      }, null, { timeout: 15000 });
      await folha.screenshot({ path: captura('perfis-folha.png') });
      await folha.locator('.superficie-de-mod-sair').click();

      // ---- o limite do nome é do produto, no envio, e não vai ao servidor ----
      await aba.getByRole('button', { name: 'EDITAR MEU PERFIL', exact: true }).click();
      const editor = aba.locator('.dialogo-de-mod');
      // O nome acessível do campo leva o contador do produto («NOME EXIBIDO 15/40»).
      const nome = editor.getByLabel(/^NOME EXIBIDO/);
      await nome.fill('x'.repeat(41));
      await editor.getByRole('button', { name: 'GRAVAR', exact: true }).click();
      await editor.locator('[data-mensagem-de-erro="Use até 40 caracteres; este tem 41."]').waitFor({ timeout: 15000 });
      const visto = await chamar({ op: 'view', people: ['2'] }, '2', 0);
      assert.equal(visto.profiles['2'].displayName, 'Lia <img src=x>',
        'o nome de 41 caracteres passou pelo produto e chegou ao servidor');
      await nome.fill('Lia <img src=x>');

      // ---- a foto e a capa trocadas pelo editor ----
      await editor.getByLabel(/^SOBRE MIM/).fill('Rascunho com foto nova');
      let ultimaFoto;
      for (const [slot, rotulo, cor] of [
        ['avatar', 'FOTO', '#ff0000'], ['banner', 'CAPA', '#0000ff'], ['avatar', 'FOTO', '#00ff00'],
      ]) {
        const uri = await aba.evaluate(cor => {
          const c = document.createElement('canvas'); c.width = 64; c.height = 32;
          const ctx = c.getContext('2d'); ctx.fillStyle = cor; ctx.fillRect(0, 0, 64, 32);
          return c.toDataURL('image/png');
        }, cor);
        const bytes = Buffer.concat([Buffer.from(uri.split(',')[1], 'base64'), Buffer.alloc(70000)]);
        const escolha = aba.waitForEvent('filechooser');
        await editor.getByRole('button', { name: new RegExp('^' + rotulo + '( |$)') }).click();
        await (await escolha).setFiles({ name: slot + '.png', mimeType: 'image/png', buffer: bytes });
        const esperadoNaTela = 'data:image/png;base64,' + bytes.toString('base64');
        if (slot === 'banner') {
          await aba.waitForFunction(esperado => [...document.querySelectorAll('.dialogo-de-mod [data-chave-do-mod="pessoa-compacta"]')]
            .some(no => no.style.backgroundImage.includes(esperado)), esperadoNaTela);
        } else {
          await aba.waitForFunction(esperado => [...document.querySelectorAll('.dialogo-de-mod img')]
            .some(img => img.src === esperado && img.complete && img.naturalWidth === 64), esperadoNaTela);
        }
        assert.equal(await editor.getByLabel(/^SOBRE MIM/).inputValue(), 'Rascunho com foto nova');
        if (slot === 'avatar') ultimaFoto = esperadoNaTela;
      }
      // **A foto nova chega à lista**, no cartão que a cita, sem o cartão mudar.
      await aba.waitForFunction(esperado => [...document.querySelectorAll('#lista-roster [data-destino="2"] img')]
        .some(img => img.src === esperado && img.complete && img.naturalWidth === 64), ultimaFoto, { timeout: 15000 });
      // O rascunho permanece; gravá-lo fecha a verificação sem confirmação pendente.
      await editor.getByRole('button', { name: 'GRAVAR', exact: true }).click();
      await editor.getByText('gravado', { exact: true }).waitFor();
      await editor.locator('.dialogo-de-mod-corpo').evaluate(no => { no.scrollTop = 0; });
      await aba.screenshot({ path: captura('perfis-editor.png') });
      await editor.locator('.superficie-de-mod-sair').click();

      // ---- a capa com o movimento reduzido: o quadro parado ----
      //
      // `animation: none` não para um GIF; o produto cita o primeiro quadro,
      // redesenhado num `canvas`, e é um PNG o que a lista recebe.
      const contextoParado = await navegador.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
      const parada = await contextoParado.newPage();
      parada.on('pageerror', e => erros.push(e.message));
      await parada.goto(url + '/?pessoa=3' + daLista);
      await parada.waitForFunction(n => {
        const capas = [...document.querySelectorAll('#lista-roster [data-chave-do-mod="pessoa-compacta"]')];
        return capas.length === n && capas.every(no => no.style.backgroundImage.includes('data:image/png'));
      }, pessoasNaLista, { timeout: 30000 });
      await parada.locator('#lista-roster').screenshot({ path: captura('perfis-lista-movimento-reduzido.png') });
      // E a capa do perfil, na folha, citada com o id da pessoa: parada também.
      // A da Pessoa 4, que ainda é um GIF (a da Lia virou PNG no editor, acima).
      await parada.getByRole('button', { name: 'Pessoa 4 — perfil em seele/perfis', exact: true }).click();
      await parada.waitForFunction(() => document.querySelector('.folha-de-mod [data-chave-do-mod="d-capa"]')
        ?.style.backgroundImage.includes('data:image/png'), null, { timeout: 15000 });
      await contextoParado.close();
      console.log('PERFIS: ' + pessoasNaLista + ' cartões com foto e capa, a capa aceita e parada na lista, a folha com a capa '
        + 'e a foto citadas, o limite do nome, a foto trocada que chega à lista e a capa parada com o movimento reduzido.');
    }

    // ---- sair solta tudo ----
    //
    // **A superfície sai primeiro.** Desde que o ESTILO voltou a abrir num
    // modal, a camada cobre a aplicação — é o que um modal faz — e o clique em
    // «sair da sessão» não a atravessa. Fechar pela saída do produto é o
    // caminho de quem usa, e é o que o teste passou a fazer.
    const saidaDaSuperficie = aba.locator('.superficie-de-mod-sair').first();
    if (await saidaDaSuperficie.count()) {
      await saidaDaSuperficie.click();
      await aba.waitForTimeout(400);
    }
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

    // E recarregar monta de novo, do estado do servidor. A atividade não volta
    // aberta — e não deve: quem recarrega cai na conversa, e não na janela que
    // estava aberta antes. O gesto de abrir é o mesmo da primeira vez, e é
    // isso que se repete aqui.
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
