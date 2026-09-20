// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # O que mudou com a API 4
//
// A casca da API 3 sabia desenhar **uma região** — a faixa de 240 px que a
// auditoria de 20/09/2026 chamou de «o mesmo formulário estreito para
// atividades diferentes». Ela sabia receber evento, redesenhar na hora e
// guardar rascunho, e isso continua valendo.
//
// O que ela não sabia era **abrir**. Não havia gesto para começar uma
// atividade: os três MODs desenhavam ao conectar porque a região era o único
// lugar onde eles podiam existir.
//
// Agora ela sabe mais três coisas:
//
// - **registrar uma entrada.** `entrada()` põe um nome na navegação do
//   servidor; ele não ocupa altura nenhuma até alguém apertá-lo;
// - **abrir uma superfície.** `pagina()`, `painel()` e `dialogo()` devolvem
//   punhos com `montar`, `fechar` e estado de alteração;
// - **apresentar dentro do SEELE.** `contribuir()` registra um ponto
//   semântico — o cartão de uma pessoa, por exemplo — e devolve o handle que
//   o revoga.
//
// # A degradação é explícita
//
// `SeeleUI.superficies` **não existe** quando o pacote declara `api: 3`. Não é
// um método que falha: é um método ausente, e o `TypeError` acontece na linha
// que o chama. `temSuperficies` é como um MOD pergunta antes, quando quer
// degradar em vez de falhar.
function interfaceMod(id, titulo, intervalo = 4000) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui) throw new Error('Este MOD exige a API 3 do SEELE.');

  // ---- as formas da API 3 ----
  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const cabecalho = dentro => ({ forma: 'titulo', dentro: String(dentro ?? '') });
  const lista = itens => ({ forma: 'lista', dentro: itens.map(dentro => ({ forma: 'item', dentro: String(dentro) })) });
  const campo = (chave, rotulo, valor, extra) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const escolha = (chave, rotulo, valor, opcoes) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes });
  const botao = (chave, dentro, desligado = false, extra) => ({ forma: 'botao', chave, dentro: String(dentro), desligado, ...extra });
  const linha = (dentro, estilo) => ({ forma: 'linha', dentro, ...(estilo ? { estilo } : {}) });

  // ---- as formas de composição da API 4 ----
  //
  // Elas existem para o MOD montar **os componentes dele**. Um perfil com
  // faixa, retrato sobreposto e nome não é um formulário mais largo; é uma
  // caixa dentro de outra, com posição, recorte e camada.
  //
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

  // ---- os controles da API 4 ----
  const formulario = (chave, dentro, extra) => ({ forma: 'formulario', chave, dentro, ...extra });
  const acoes = (dentro, fixas = false) => ({ forma: 'acoes', dentro, ...(fixas ? { fixas: true } : {}) });
  const abas = (chave, valor, dentro) => ({ forma: 'abas', chave, valor, dentro });
  const aba = (chave, rotulo, dentro) => ({ forma: 'aba', chave, rotulo, dentro });
  const textoLongo = (chave, rotulo, valor, extra) => ({ forma: 'textoLongo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const numero = (chave, rotulo, valor, extra) => ({ forma: 'numero', chave, rotulo, valor, ...extra });
  const deslizante = (chave, rotulo, valor, extra) => ({ forma: 'deslizante', chave, rotulo, valor, ...extra });
  const marca = (chave, rotulo, valor) => ({ forma: 'marca', chave, rotulo, valor: valor === true });
  const interruptor = (chave, rotulo, valor) => ({ forma: 'interruptor', chave, rotulo, valor: valor === true });
  const cor = (chave, rotulo, valor) => ({ forma: 'cor', chave, rotulo, valor: String(valor ?? '#000000') });
  const retrato = (chave, extra) => ({ forma: 'retrato', chave, ...extra });
  const distintivo = (dentro, estilo) => ({ forma: 'distintivo', dentro, ...(estilo ? { estilo } : {}) });
  const link = (chave, dentro, endereco) => ({ forma: 'link', chave, dentro: String(dentro), endereco });
  const arquivo = (chave, dentro, extra) => ({ forma: 'arquivo', chave, dentro: String(dentro), ...extra });
  const midia = (chave, extra) => ({ forma: 'midia', chave, ...extra });

  const canalDe = snapshot => {
    const id = snapshot.open_channel ?? snapshot.channels?.[0]?.id;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  async function request(canal, valor) {
    const resposta = await api.request(id, canal, valor);
    if (!resposta?.ok) throw new Error(resposta?.error || 'O servidor recusou a consulta.');
    return resposta;
  }

  // O último canal visto, para um evento saber a quem falar sem perguntar de
  // novo: `snapshot` é uma ida à ponte, e um arraste não pode pagar uma por
  // quadro.
  let canalAtual = null;
  let pintando = false;
  let pendente = null;

  /**
   * Uma pintura de cada vez, e **nenhuma perdida**.
   *
   * Dois `regiao` em voo chegariam fora de ordem, e o desenho de trás apagaria
   * o da frente — por isso a segunda espera. Mas a primeira versão **descartava**
   * a segunda, e dois eventos seguidos (escolher a densidade e a fonte, no mesmo
   * quadro) perdiam o desenho do segundo: a tela ficava mostrando a escolha
   * anterior, e só o relógio a corrigia, quatro segundos depois.
   *
   * Guardar a última e pintá-la ao fim da que está em voo é o que resolve. É a
   * mesma forma do aviso que chega durante uma colheita: o que não cabe agora
   * não se joga fora, fica marcado.
   */
  const desenhar = async partes => {
    if (pintando) { pendente = partes; return; }
    pintando = true;
    try {
      let atual = partes;
      for (;;) {
        pendente = null;
        await ui.regiao([cabecalho(titulo), ...atual]);
        if (!pendente) return;
        atual = pendente;
      }
    } finally {
      pintando = false;
    }
  };

  // ---- as superfícies ----
  //
  // **Ausente, e não recusado.** Quando o pacote declara `api: 3`, o prelúdio
  // monta um `SeeleUI` em que `superficies` simplesmente não está. Um MOD que
  // queira degradar pergunta por `temSuperficies` antes; um que não pergunte
  // recebe um `TypeError` na linha que chamou, com pilha, em vez de uma
  // promessa que rejeita com um código.
  const temSuperficies = Boolean(ui.superficies);
  const temContribuicoes = Boolean(ui.contribuicoes);

  /**
   * Abre (ou reabre) uma superfície e devolve o punho dela.
   *
   * Reabrir **não recria**: chamar com o mesmo `id` mostra a que já existe, e
   * o que estava escrito nos campos dela continua lá. É a diferença entre
   * «mostre aquela» e «comece de novo», e um MOD que quisesse a segunda
   * `descarta` a primeira.
   */
  async function superficie(descricao) {
    if (!temSuperficies) throw new Error('Este SEELE não oferece superfícies de MOD.');
    return ui.superficies.criar(descricao);
  }

  const pagina = (chaveDaTela, titulo, extra) =>
    superficie({ id: chaveDaTela, tipo: 'pagina', titulo, ...extra });
  const painel = (chaveDaTela, titulo, extra) =>
    superficie({ id: chaveDaTela, tipo: 'painel', titulo, ...extra });
  const dialogo = (chaveDaTela, titulo, extra) =>
    superficie({ id: chaveDaTela, tipo: 'dialogo', modal: true, titulo, ...extra });

  /** Um aviso curto. A fila dele tem fim; ver `enfileirarAviso` no produto. */
  const avisar = (mensagem, tom) => {
    if (!temSuperficies) return Promise.resolve(null);
    return ui.superficies.avisar(mensagem, tom);
  };

  /** Registra uma contribuição e devolve o handle que a revoga. */
  const contribuir = pedido => {
    if (!temContribuicoes) throw new Error('Este SEELE não oferece contribuições de MOD.');
    return ui.contribuicoes.registrar(pedido);
  };
  const revogar = handle => {
    if (!temContribuicoes) return Promise.resolve(false);
    return ui.contribuicoes.revogar(handle);
  };

  /**
   * Uma entrada na navegação do servidor.
   *
   * **U03 pelo nome**: sem ela, o MOD não tem gesto de abertura, e desenhar ao
   * conectar é a única forma de existir. Com ela, a atividade começa quando a
   * pessoa a escolhe.
   */
  const entrada = (rotulo, acao = 'abrir', extra) => contribuir({
    ponto: 'servidor.navegacao',
    modo: 'adicionar',
    rotulo,
    acaoPrincipal: acao,
    ...extra,
  });

  function iniciar(consultar, semCanal = async () => {}, aoEvento = null) {
    /**
     * Redesenha com o que o estado local diz **agora**.
     *
     * É o que um evento chama. Ele não vai ao servidor: quem digita espera a
     * letra aparecer, e não esperar a rede.
     */
    const repintar = partes => { void desenhar(partes); };

    if (aoEvento) {
      ui.aoEvento(evento => {
        // O erro do MOD fica com o MOD, e é dito na região em vez de sumir.
        try {
          const talvez = aoEvento(evento, canalAtual, repintar);
          if (talvez && typeof talvez.catch === 'function') {
            talvez.catch(erro => void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]));
          }
        } catch (erro) {
          void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]);
        }
      });
    }

    async function atualizar() {
      try {
        const snapshot = await api.snapshot(), canal = canalDe(snapshot);
        canalAtual = canal;
        if (canal === null) {
          await semCanal();
          await desenhar([texto('Entre em um servidor com um canal de texto.')]);
        } else {
          const resultado = await consultar(snapshot, canal);
          // Não apresente uma resposta do canal anterior após a navegação.
          if (canalDe(await api.snapshot()) === canal) await desenhar(resultado);
          else await desenhar([texto('Canal alterado. Atualizando…')]);
        }
      } catch (erro) {
        try { await desenhar([texto('Não foi possível atualizar: ' + (erro.message || String(erro)))]); }
        catch (falha) { console.error(titulo + ': ' + (falha.message || String(falha))); }
      } finally {
        // Agenda depois de concluir: nunca sobrepõe consultas nem repete
        // escritas. O SEELE encerra o executor e seus temporizadores ao sair.
        setTimeout(atualizar, intervalo);
      }
    }
    void atualizar();
  }

  return {
    // API 3
    texto, cabecalho, lista, campo, escolha, botao, linha, arquivo, midia,
    request, iniciar, desenhar,
    // API 4 — composição
    caixa, pilha, grade, rolagem, separador, espaco,
    // API 4 — controle
    formulario, acoes, abas, aba, textoLongo, numero, deslizante,
    marca, interruptor, cor,
    // API 4 — apresentação
    retrato, distintivo, link,
    // API 4 — superfícies e integração
    temSuperficies, temContribuicoes,
    superficie, pagina, painel, dialogo, avisar,
    contribuir, revogar, entrada,
  };
}
