# SEELE MOD PERFIS

Perfis por servidor com avatar, banner animado, efeitos, nome visual, pronomes, status e biografia. A coluna direita usa os cartões do MOD no lugar da identidade visual nativa, sem dois cartões para a mesma pessoa. Clicar abre o perfil completo. Estado de voz, sinal, volume e acesso à moderação são preservados. Descarregar o MOD restaura a apresentação original; identidades ambíguas mantêm a linha nativa.

Avatar aceita até **512 KiB**; banner até **1 MiB**, com máximo de 4096 px por lado no seletor. PNG, JPEG, WebP e GIF são aceitos, sem reconversão que remova animação. Upload e download são divididos em partes; a imagem só é publicada após o upload completo. Os limites independem do ícone nativo do SEELE.

Repositório: [PERFIS](https://github.com/DATA-AND-DEV/PERFIS). Versão 1.1.0, API 2, sem dependências de execução no cliente.

## Instalação

Clone este repositório e escolha sua pasta raiz em Configurações → MODs → Instalar MOD de uma pasta. Ela contém mod.json, cliente/ e servidor/. No servidor hospedado, ligue o MOD e reconecte quando solicitado. Os participantes precisam do mesmo conteúdo instalado.

## Desenvolvimento

```sh
npm run build
npm test
npm run check
npm run test:ui
npm run preview
cargo run --manifest-path ferramentas/quickjs-check/Cargo.toml
```

Edite ferramentas/interface.js e ferramentas/perfis.js; o build gera cliente/main.js. O handler está em servidor/main.js. Prévia local: http://127.0.0.1:8795/ . A prévia usa identidades simuladas, handlers reais e armazenamento em memória; não é um servidor de produção.

## Padrão visual

Saira Condensed nos títulos, IBM Plex Mono nos dados, tokens SEELE, bordas retas e espaçamento de 8/16/24 px. Fontes e licenças usadas pela prévia ficam em ferramentas/native. A execução dentro do app usa as fontes e tokens do SEELE.

## Documentação

- [Relatório de entrega e limites conhecidos](docs/relatorio-entrega.md)
- [Migração dos diretórios](docs/migracao-diretorios.md)

O relatório preserva o histórico de validação anterior à publicação, incluindo limitações da versão SEELE 0.11.0. A publicação do código não equivale à aprovação no catálogo de MODs. As cópias instaladas no aplicativo não são atualizadas por git push.
