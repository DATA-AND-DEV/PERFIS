# SEELE MOD PERFIS — 4.0.0

Requer **API de MOD 6** do SEELE, no cliente e no servidor. Roda no Servidor 1.0,
ou seja, no app 0.16 em diante. A linha 3 (a 3.3.1, na API 5) continua sendo a
que os apps do Servidor 0.15 — de v0.14.2 a 0.15.x — recebem do catálogo. O
cliente roda no executor do MOD, fora da janela, e declara o que quer mostrar;
quem monta tudo é o SEELE.

PERFIS dá a cada pessoa de um servidor um nome exibido, pronomes, status,
biografia, cor, efeito, foto e capa (o banner, que pode ser GIF). Os perfis são
por servidor e ficam na metade de servidor deste MOD.

## O que muda na 4.0.0

- **A capa aparece fora do perfil.** Ela entra no cartão da pessoa na chamada,
  no fundo da barra do operador (no computador), no cabeçalho do perfil do
  PERFIS e no «SEU PERFIL» do SEELE, além do cartão da lista.
- **Um cartão por pessoa na lista.** Cada pessoa é uma contribuição própria do
  SEELE, e a lista não depende mais de uma mensagem só para todo mundo: o
  limite que congelava a lista com umas 14 pessoas com foto e capa saiu.
- **O apelido do servidor fica sempre à vista**, ao lado do cartão que o PERFIS
  desenha: o nome exibido não toma o lugar dele.
- **O perfil de outra pessoa abre numa folha**, ao lado da conversa, e o
  diretório mostra todo mundo de uma vez, montado por partes.
- **O editor é um formulário do SEELE.** O limite de cada campo é conferido
  antes de gravar, a recusa do servidor volta para o campo dela, e um rascunho
  guardado reabre o editor como alterado.
- **O efeito aparece**, como a moldura animada da foto.
- **Sem consulta a cada 4 segundos.** A metade de servidor avisa as janelas
  quando um perfil muda, e só o perfil que mudou é lido de novo.
- **Nome, pronomes e status recusam caracteres de controle e de direção**, que
  deixavam um nome parecer outro.

## O que aparece, e onde

- **Lista de pessoas:** um cartão compacto (capa ao fundo, parada; foto quadrada
  e nome numa linha) ao lado do apelido do servidor; os detalhes nativos continuam no
  recolhível da linha. Clicar no próprio cartão abre o editor; no de outra
  pessoa, o perfil dela.
- **Navegação do servidor:** a entrada «Perfis» abre o diretório.
- **Perfil:** uma folha com a capa, a foto, o nome exibido, o apelido e o ID
  que o servidor conhece, os pronomes, o status e a biografia. No celular, a
  folha sobe da borda.
- **Editor:** um diálogo com a prévia do cartão em tamanho real. Fechar sem
  gravar passa pela confirmação do SEELE.
- **Foto:** o PERFIS publica `pessoa.avatar`, e a foto aparece na chamada, nas
  mensagens e na barra do operador.
- **Capa:** o PERFIS publica `pessoa.capa`. No celular não há barra do operador
  à vista, e a capa de quem usa aparece no «SEU PERFIL». Na lista, a capa fica
  parada no primeiro quadro; com o movimento reduzido, em todo lugar.

Desativar o MOD devolve a apresentação do SEELE em todos esses lugares.

## Limites

- Foto e capa aceitam PNG, JPEG, WebP ou GIF de até 10 MiB; HEIC é recusado,
  e o editor diz isso. O MOD autoriza o envio, o SEELE transmite os bytes direto
  ao volume do servidor, e só então a referência nova é publicada; a imagem
  anterior fica até a conclusão. Num aparelho sem envio de arquivos, o editor
  diz que foto e capa se trocam pelo computador.
- O SEELE aceita um número limitado de pessoas por ponto (cartão, foto e capa).
  Quando não cabe todo mundo, a própria pessoa vem primeiro, e quem não coube
  fica com a apresentação do SEELE. O registro de quem hospeda diz quantas
  ficaram de fora.
- O SEELE conta a memória das fotos e das capas de cada lugar. Acima do teto
  dele, as excedentes não são mostradas; quando é a sua, o editor diz por quê.
- Nome exibido até 40 caracteres, pronomes até 30, status até 60 e biografia
  até 280, contados como o contador do editor conta (um emoji é um caractere).
- Até 128 perfis por servidor; as consultas vão em lotes de 32 pessoas. Uma
  consulta que falha é tentada de novo depois de 4 segundos. Quando muita gente
  grava no mesmo segundo, o SEELE junta os avisos, e o PERFIS percebe o que
  perdeu e relê todo mundo.

## Migração e dados existentes

Mantenha o ID `seele/perfis` e o armazenamento de dados do servidor: os dados
da 3.3.1 servem à 4.0.0 sem conversão. Imagens antigas, gravadas em fragmentos,
continuam legíveis e são removidas quando substituídas; o envio novo é só pelo
volume. Não apague bancos, perfis ou arquivos para trocar o pacote.

## Desenvolvimento e validação

```sh
npm ci
npm run build
npm run check
npm test
npx playwright install chromium
SEELE_RAIZ=/caminho/do/SEELE npm run test:ui
npm run preview
cargo run --manifest-path ferramentas/quickjs-check/Cargo.toml
```

Edite `ferramentas/interface.js` e `ferramentas/perfis.js`; o build reproduz
`cliente/main.js`, autocontido e sem dependências de execução. O handler está em
`servidor/main.js`.

Os testes de `npm test` rodam o cliente final num laboratório da API 6, sem DOM
(`test/laboratorio.cjs`): o retrato, os eventos, as contribuições por pessoa, as
superfícies e o formulário, e o servidor com o volume. Com `SEELE_RAIZ`,
`test/contrato.test.cjs` confere a tabela desse laboratório contra o
`api/v6.json` do SEELE.

O laboratório em Chromium (`test:ui` e `preview`) recorta o prelúdio de
`crates/seele-motor/src/preludio.rs` e as regras do anfitrião de
`apps/seele-app/ui/base.js`, e usa o renderer de `apps/seele-app/ui` de um
checkout do SEELE. Por padrão ele procura `../SEELE` ao lado deste repositório;
num worktree, aponte `SEELE_RAIZ` (ou `SEELE_UI`). Ele oferece identidades
simuladas e dados temporários, servidos só em loopback; `?pessoas=20` põe vinte
pessoas na lista. Use `MOD_PORT` para mudar a porta. O executor dele é o `vm`
do Node; o `quickjs-check` roda o mesmo cliente e o mesmo servidor no QuickJS.
Nada disso substitui a homologação em duas janelas do app conectadas ao
servidor nativo.

## Preparar o pacote

```sh
npm run build
npm run package -- /caminho/absoluto/novo/pacote
```

O destino precisa ser novo. O pacote contém somente `mod.json`, `cliente/main.js`
e `servidor/main.js`. Instale os mesmos bytes no host e nos clientes pelo fluxo de
MODs do SEELE, habilite no servidor de teste e reconecte para conferir o novo
conjunto. Não use a raiz Git, com ferramentas e dependências, como pacote.

Publicar uma versão nova exige avaliação do commit, atualização do catálogo e
assinatura pelo indexador; mudar o código local não atualiza instalações
existentes.
