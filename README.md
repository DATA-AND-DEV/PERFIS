# SEELE MOD PERFIS — 3.3.1

Requer **API de MOD 5** do SEELE, no cliente e no servidor. É a versão da **linha
legada**: roda no Servidor 0.15, ou seja, nos apps de v0.14.2 a 0.15.x, e é a
que eles recebem do catálogo. O app 0.16 (Servidor 1.0) aceita só a API 6 e
recebe a linha 3.4 do PERFIS. O cliente roda no executor do MOD, fora da janela,
e declara o que quer mostrar; quem monta tudo é o SEELE.

PERFIS dá a cada pessoa de um servidor um nome exibido, pronomes, status,
biografia, cor, efeito, foto e faixa (banner, que pode ser GIF). Os perfis são
por servidor e ficam na metade de servidor deste MOD.

## O que a 3.3.1 conserta

- **A lista de pessoas não congela mais com muita gente.** Na 3.3.0, a partir de
  umas 14 pessoas com foto e faixa (21 sem imagem), os cartões paravam de
  atualizar ou nem apareciam. Agora a lista recebe os cartões que cabem, o seu
  primeiro, e os demais ficam com a apresentação do SEELE.
- **Nos apps 0.14.2 e 0.15.0, uma falha deixou de derrubar o PERFIS.** Lá, um
  erro qualquer nos cartões fazia sumir a entrada «Perfis» e aparecer «console
  is not defined».
- **«DESCARTAR E FECHAR» descarta.** Ao fechar o editor com alterações, o SEELE
  pergunta se pode descartar. Antes, quem confirmava reabria o editor e
  encontrava o texto que tinha aceitado perder.
- **Trocar de canal não apaga o que você está escrevendo** no editor do perfil.
- **Perder o canal e voltar não duplica** a entrada «Perfis» na navegação.

A metade de servidor é a mesma da 3.3.0, byte a byte: os dados não mudam, e
voltar para a 3.3.0 continua possível.

## O que aparece, e onde

- **Lista de pessoas:** um cartão compacto (faixa ao fundo, foto quadrada e
  nome numa linha) substitui a apresentação do SEELE; os detalhes nativos
  continuam no recolhível da linha. Clicar no próprio cartão abre o editor; no
  de outra pessoa, o perfil dela.
- **Navegação do servidor:** a entrada «Perfis» abre o diretório, em páginas de
  dez pessoas.
- **Perfil:** um diálogo com a faixa, a foto, o nome exibido, o apelido e o ID
  que o servidor conhece, os pronomes, o status e a biografia.
- **Editor:** um diálogo com a prévia do cartão em tamanho real. Fechar sem
  gravar passa pela confirmação do SEELE.
- **Foto em outros lugares:** o PERFIS publica `pessoa.avatar`, e a foto aparece
  na chamada, nas mensagens e na barra do operador. Desativar o MOD devolve a
  imagem do SEELE.

A faixa só aparece no cartão da lista e no perfil: a API 5 não tem um ponto
para a faixa na chamada nem na barra do operador. O efeito escolhido é gravado,
mas ainda não aparece: ele pede um desenho novo do cartão.

## Limites

- Foto e faixa aceitam PNG, JPEG, WebP ou GIF de até 10 MiB. O MOD autoriza o
  envio, o SEELE transmite os bytes direto ao volume do servidor, e só então a
  referência nova é publicada; a imagem anterior fica até a conclusão.
- O conjunto de cartões da lista vai numa mensagem só, com teto de 12.288 bytes
  e 64 pessoas. Quando não cabe todo mundo, o próprio cartão vai primeiro, os
  demais seguem a ordem da lista, e quem não coube fica com a apresentação do
  SEELE. O registro de quem hospeda diz quantos ficaram de fora.
- O SEELE soma as mídias de cada lugar (20 MiB nos cartões, 20 MiB nos avatares
  de outras superfícies, 24 MiB por página ou diálogo). Imagens grandes de
  muitas pessoas passam desse teto, e as excedentes não são mostradas.
- Até 128 perfis por servidor; as consultas vão em lotes de 32 pessoas, a cada
  4 segundos depois de concluída a anterior.

## Migração e dados existentes

Mantenha o ID `seele/perfis` e o armazenamento de dados do servidor. Imagens
antigas, gravadas em fragmentos, continuam legíveis e são removidas quando
substituídas. Não apague bancos, perfis ou arquivos para trocar o pacote.

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

O laboratório (`test:ui` e `preview`) recorta o prelúdio de
`apps/seele-app/src/executor.rs` e usa o renderer de `apps/seele-app/ui` de um
checkout do SEELE. Por padrão ele procura `../SEELE` ao lado deste repositório;
num worktree, aponte `SEELE_RAIZ` (ou `SEELE_UI`). Ele oferece identidades
simuladas e dados temporários, servidos só em loopback. Use `MOD_PORT` para mudar
a porta.

Os testes cobrem o cliente final sem DOM, o teto da ponte nos cartões e nas
superfícies, consultas sem sobreposição, falhas, troca de canal, rascunho,
envio de imagens, e as regras e a privacidade do servidor. O teste em Chromium
usa o pacote de distribuição, Worker real e renderer do SEELE. Nada disso
substitui a homologação em duas janelas Tauri conectadas ao servidor nativo.

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
