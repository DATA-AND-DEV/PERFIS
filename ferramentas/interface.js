// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # O que mudou com a API 3 completa
//
// A versão anterior sabia **redesenhar por relógio** e nada mais: perguntava ao
// servidor a cada quatro segundos e mostrava a resposta. Um MOD assim é uma tela
// de leitura, e foi nisso que os três oficiais viraram depois da migração.
//
// Agora ela sabe três coisas a mais:
//
// - **receber evento.** `SeeleUI.aoEvento` traz o que a pessoa fez — digitou,
//   escolheu, apertou, arrastou — sem que o MOD tenha perguntado;
// - **redesenhar na hora.** Um evento muda o estado local e a tela acompanha
//   imediatamente, em vez de esperar o próximo relógio;
// - **guardar rascunho.** O que está sendo editado **não** é sobrescrito pela
//   resposta do servidor. Sem isso, digitar durante um ciclo de quatro segundos
//   perderia o que foi digitado — e o produto preservar o foco não bastaria: o
//   foco ficaria numa caixa cujo valor o próprio MOD acabou de trocar.
function interfaceMod(id, titulo, intervalo = 4000) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui) throw new Error('Este MOD exige a API 3 do SEELE.');

  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const cabecalho = dentro => ({ forma: 'titulo', dentro: String(dentro ?? '') });
  const lista = itens => ({ forma: 'lista', dentro: itens.map(dentro => ({ forma: 'item', dentro: String(dentro) })) });
  const campo = (chave, rotulo, valor) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? '') });
  const escolha = (chave, rotulo, valor, opcoes) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes });
  const botao = (chave, dentro, desligado = false) => ({ forma: 'botao', chave, dentro: String(dentro), desligado });
  const linha = dentro => ({ forma: 'linha', dentro });

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

  return { texto, cabecalho, lista, campo, escolha, botao, linha, request, iniciar, desenhar };
}
