// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # A API 6
//
// O MOD declara, e o produto monta. A casca sabe:
//
// - **ler o retrato.** `SeeleUI.retrato()` é a lista branca do que o MOD pode
//   saber da sessão: quem é ele, quem está no servidor, os canais e onde a
//   casca está. O `snapshot` inteiro da API 5 não existe mais;
// - **registrar uma entrada.** `entrada()` põe um nome na navegação do
//   servidor; ele não ocupa altura nenhuma até alguém apertá-lo;
// - **abrir uma superfície.** `pagina()`, `dialogo()` e `folha()` devolvem
//   punhos com `montar`, `atualizar`, `formulario.erros` e `fechar`;
// - **apresentar dentro do SEELE.** `contribuir()` registra um ponto
//   semântico — o cartão de uma pessoa, por exemplo — e devolve o handle;
//   `atualizar()` troca o conteúdo dele sem revogar, e `revogar()` o tira.
//
// A região de 240 px e os cartões em lote da API 3 saíram: a 6 não os tem, e
// eles faltam do `SeeleUI` como qualquer coisa que a API não tem.
function interfaceMod(id, titulo, intervalo = 4000) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui) throw new Error('Este MOD exige a API 6 do SEELE.');

  // ---- as formas ----
  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const campo = (chave, rotulo, valor, extra) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const escolha = (chave, rotulo, valor, opcoes, extra) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes, ...extra });
  const botao = (chave, dentro, desligado = false, extra) => ({ forma: 'botao', chave, dentro: String(dentro), desligado, ...extra });

  // **`estilo` e `extra` são argumentos separados, e isso não é arrumação.**
  // `classe`, `chave` e `nomeAcessivel` são do **nó**; `fundo` e `intervalo`
  // são do estilo dele. Misturá-los num objeto só faria `classe: 'editor'`
  // virar uma propriedade de estilo que o validador do produto recusa — e a
  // recusa chegaria como «a superfície não montou», sem dizer qual chave.
  const caixa = (dentro, estilo, extra) => ({ forma: 'caixa', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const pilha = (dentro, estilo, extra) => ({ forma: 'pilha', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const grade = (dentro, estilo, extra) => ({ forma: 'grade', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const rolagem = (dentro, estilo, extra) => ({ forma: 'rolagem', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const separador = (estilo, extra) => ({ forma: 'separador', ...(estilo ? { estilo } : {}), ...extra });
  const espaco = (estilo, extra) => ({ forma: 'espaco', ...(estilo ? { estilo } : {}), ...extra });

  const formulario = (chave, dentro, extra) => ({ forma: 'formulario', chave, dentro, ...extra });
  const acoes = (dentro, fixas = false) => ({ forma: 'acoes', dentro, ...(fixas ? { fixas: true } : {}) });
  const textoLongo = (chave, rotulo, valor, extra) => ({ forma: 'textoLongo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const cor = (chave, rotulo, valor, extra) => ({ forma: 'cor', chave, rotulo, valor: String(valor ?? '#000000'), ...extra });
  const retrato = (chave, extra) => ({ forma: 'retrato', chave, ...extra });
  const arquivo = (chave, dentro, extra) => ({ forma: 'arquivo', chave, dentro: String(dentro), ...extra });
  const midia = (chave, extra) => ({ forma: 'midia', chave, ...extra });

  /**
   * Escreve no registro de quem hospeda, **quando há registro**.
   *
   * O `console` do executor nativo só existe a partir da v0.15.1, e a API 5
   * desde a v0.14.2. Nos apps do meio, um `console.warn` num caminho
   * de erro virava `ReferenceError` e derrubava justamente o que ele só queria
   * contar.
   */
  const anotar = (nivel, mensagem) => {
    try { globalThis.console?.[nivel]?.(mensagem); } catch { /* sem registro, não há a quem dizer */ }
  };

  /** O retrato da sessão: a lista branca do que o MOD pode saber dela. */
  const lerRetrato = () => ui.retrato();

  /**
   * Um pedido à metade de servidor deste MOD.
   *
   * A recusa vira um `Error` com a frase de `error`. Quando ela é de campos, os
   * `erros` dela (a `chave` do controle e o motivo, a forma combinada entre os
   * MODs oficiais) vão presos no erro, para o formulário pô-los nos campos.
   */
  async function request(canal, valor) {
    const resposta = await api.request(id, canal, valor);
    if (!resposta?.ok) {
      const falha = new Error(resposta?.error || 'O servidor recusou a consulta.');
      if (resposta?.erros && typeof resposta.erros === 'object') falha.erros = resposta.erros;
      throw falha;
    }
    return resposta;
  }

  /** Uma atualização em voo e apenas o estado mais recente aguardando. */
  function agruparAtualizacoes(atualizar) {
    let emVoo = null;
    let proxima = null;
    return (...args) => {
      proxima = args;
      if (!emVoo) {
        emVoo = Promise.resolve().then(async () => {
          while (proxima) {
            const atuais = proxima;
            proxima = null;
            await atualizar(...atuais);
          }
        }).finally(() => { emVoo = null; });
      }
      return emVoo;
    };
  }

  // ---- as superfícies ----
  //
  // Reabrir **não recria**: chamar com o mesmo `id` mostra a que já existe, e o
  // que estava escrito nos campos dela continua lá.
  const superficie = descricao => ui.superficies.criar(descricao);
  const pagina = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'pagina', titulo, ...extra });
  const dialogo = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'dialogo', modal: true, titulo, ...extra });
  const folha = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'folha', titulo, ...extra });

  /** Um aviso curto. A fila dele tem fim; ver `enfileirarAviso` no produto. */
  const avisar = (mensagem, tom) => ui.superficies.avisar(mensagem, tom);

  /** Registra uma contribuição e devolve `{ handle }`. */
  const contribuir = pedido => ui.contribuicoes.registrar(pedido);
  /** Troca o conteúdo de uma contribuição sem revogá-la. */
  const atualizar = (handle, conteudo) => ui.contribuicoes.atualizar(handle, conteudo);
  const revogar = handle => ui.contribuicoes.revogar(handle);

  /** Uma entrada na navegação do servidor: o gesto que começa a atividade. */
  const entrada = (rotulo, acao = 'abrir', extra) => contribuir({
    ponto: 'servidor.navegacao',
    modo: 'adicionar',
    rotulo,
    acaoPrincipal: acao,
    ...extra,
  });

  /**
   * Diz alguma coisa a quem está olhando, **sem ocupar a sessão**: um aviso
   * sai sozinho. A falha do próprio aviso não vira outra falha.
   */
  const dizer = (mensagem, tom = 'normal') => avisar(mensagem, tom).then(() => {}, () => {});

  function iniciar(consultar, aoEvento = null) {
    if (aoEvento) {
      ui.aoEvento(evento => {
        // O erro do MOD fica com o MOD, e é dito em vez de sumir.
        try {
          const talvez = aoEvento(evento);
          if (talvez && typeof talvez.catch === 'function') {
            talvez.catch(erro => void dizer('Falhou: ' + (erro.message || String(erro)), 'erro'));
          }
        } catch (erro) {
          void dizer('Falhou: ' + (erro.message || String(erro)), 'erro');
        }
      });
    }

    // Um recado repetido a cada volta é um recado que vira ruído: a fila de
    // avisos tem fim. Só o que mudou é dito.
    let ultimoRecado = '';
    const recado = (mensagem, tom) => {
      if (mensagem === ultimoRecado) return Promise.resolve();
      ultimoRecado = mensagem;
      return dizer(mensagem, tom);
    };

    // **Com o aviso do servidor, não há laço.** A metade de servidor diz quando
    // um dado mudou (`mundo.avisar`), e a janela não pergunta a cada volta. Sem
    // a capacidade, o laço de sempre. E uma consulta que falha é tentada de
    // novo depois do intervalo, com aviso ou sem: sem ela, o MOD ficaria sem
    // dado nenhum até alguém gravar.
    const temAvisoDoServidor = typeof ui.capacidades === 'function' && ui.capacidades().includes('aviso-do-servidor');

    async function atualizarTudo() {
      let falhou = false;
      try {
        await consultar(await lerRetrato());
        ultimoRecado = '';
      } catch (erro) {
        falhou = true;
        await recado('Não foi possível atualizar: ' + (erro.message || String(erro)), 'erro');
      } finally {
        // Agenda depois de concluir: nunca sobrepõe consultas nem repete
        // escritas. O SEELE encerra o executor e seus temporizadores ao sair.
        if (falhou || !temAvisoDoServidor) setTimeout(atualizarTudo, intervalo);
      }
    }
    void atualizarTudo();
  }

  return {
    texto, campo, escolha, botao, arquivo, midia,
    caixa, pilha, grade, rolagem, separador, espaco,
    formulario, acoes, textoLongo, cor, retrato,
    request, iniciar, lerRetrato, dizer, anotar, agruparAtualizacoes,
    superficie, pagina, dialogo, folha, avisar,
    contribuir, atualizar, revogar, entrada,
  };
}
