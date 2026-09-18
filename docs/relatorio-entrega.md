# Entrega — Estilo e Perfis SEELE

Data: 17/09/2026 (sessão concluída à noite, America/Sao_Paulo).

## Resultado

Implementados dois MODs independentes API 2, versão 1.0.0: Estilo do servidor e Perfis do servidor. Mantêm o padrão visual SEELE: fontes nativas Saira Condensed/IBM Plex Mono, cores oficiais como base, bordas retas, espaçamento de 8/16/24 px e botões que quebram linha em telas estreitas.

Estilo permite ao host/administrador escolher paletas e editar cores, densidade, arredondamento, tipografia de dados e brilho. A alteração é persistida no servidor e recebida pelos clientes em até aproximadamente 4 segundos. Prévia antes de salvar e restauração do padrão.

Perfis oferece nome visual por servidor, pronomes, status, biografia, cor, avatar, banner GIF e efeitos Aurora/Estrelas/Brilho pulsante. Diretório e cartões compactos na faixa direita: avatar, banner animado, efeito, nome visual e status. Clique no cartão abre o perfil completo; controles e identidade nativos são preservados. Editor próprio, validação no servidor, proteção por revisão e upload fragmentado. Movimento reduzido e pausa ocultam imagens e suspendem efeitos.

## Arquivos para revisão pelo Claude

- `/Users/dev-alexandre/SEELE/mods/README.md` — instalação e manutenção.
- `/Users/dev-alexandre/SEELE/mods/desenvolvimento/interface.js` — interface/lifecycle compartilhados no build.
- `/Users/dev-alexandre/SEELE/mods/desenvolvimento/estilo.js` e `perfis.js` — clientes fonte.
- `/Users/dev-alexandre/SEELE/mods/seele/estilo/servidor/main.js` e `/Users/dev-alexandre/SEELE/mods/seele/perfis/servidor/main.js` — autorização, persistência e validação.
- `/Users/dev-alexandre/SEELE/mods/testes/servidor.test.cjs` — regressões.
- `/Users/dev-alexandre/SEELE/mods/testes/quickjs/` — verificação no runtime QuickJS.
- `/Users/dev-alexandre/SEELE/mods/dist/` — ZIPs para distribuição local e SHA256SUMS.

## Verificação realizada

- 9 testes Node passaram: autorização administrativa, tentativa de falsificar identidade, isolamento entre servidores, persistência entre canais, concorrência, contraste, opções inválidas, limites de texto/imagem, fragmentação, expiração, ordem, token alheio, falha de gravação, rejeição de SVG, preservação dos bytes GIF, sintaxe e manifestos.
- Ambos os handlers executaram no QuickJS com limite de 8 MiB; bindings de armazenamento simulados.
- Preview interativo com dois participantes simulados: edição do host, leitura por membro, tema bloqueado para membro, upload GIF por seletor de arquivo, pausa e remoção de banner. Verificação responsiva na largura do painel do navegador.
- SEELE instalado 0.11.0: criado servidor exclusivo QA PERSONALIZACAO; ativação e aceitação de ambos os MODs; carregamento dos atalhos; tema Oceano salvo e padrão restaurado; perfil salvo e lido pelo diretório. Interface nativa conferida visualmente.
- Não foi realizado teste de upload de imagem pelo seletor nativo nem sincronização entre dois computadores físicos; upload foi validado no navegador e handlers, sincronização entre clientes simulados.

## Correção descoberta no teste

Cada item reach do manifesto tem limite de 32 bytes. As descrições iniciais eram longas e impediram o anúncio do MOD. Foram encurtadas e foi acrescentada regressão. Para recuperar somente o servidor QA, ele foi parado e a flag enabled do Estilo foi desligada em seu banco exclusivo; nenhum servidor anterior foi alterado. Os manifestos corrigidos foram então ativados normalmente.

## Pendências do aplicativo (fora destes MODs)

A versão nativa 0.11.0 ainda pede novo aceite ao host após ele ligar o MOD, apesar do texto prometer que não perguntará novamente. Reproduzido para os dois pacotes. O código de aplicação/consentimento do SEELE precisa garantir o registro para o endereço local e conjunto exato. O fluxo de atualização e anúncio de conteúdo pertence ao core e não foi corrigido por estes MODs. Não afirmar que os problemas prévios do botão Atualizar ou da aprovação do host foram resolvidos nesta entrega.

## Limites de integração

- API autoriza administradores, não só host.
- Nome extra fica no perfil estendido e no cartão da coluna direita; não substitui a identidade nativa nem controles de moderação.
- Até 128 perfis e 256 KiB por imagem. Sem URLs de mídia externas/SVG.
- Perfil e arquivos ficam no host do servidor; participantes autorizados podem lê-los.
- O laboratório usa API simulada, identifica-se como tal e não substitui a validação nativa.
- Alterações existentes/concomitantes no core não fazem parte desta entrega. Não foi criado commit nem publicação no catálogo.

## Preview e pacotes

Preview aberto: http://127.0.0.1:8794/ (reiniciar com npm run preview --prefix mods se necessário).

Pacotes locais instalados em `/Users/dev-alexandre/.config/seele/mods/seele/estilo` e `/Users/dev-alexandre/.config/seele/mods/seele/perfis`. Servidor de teste: `/Users/dev-alexandre/.config/seele/servidores/qa-personalizacao/`.

## Adendo — personalização na faixa direita

Implementado após a validação nativa inicial, a pedido do usuário. O MOD agora decora `.painel-pessoas .pessoa` com um cartão compacto: faixa de banner de 56 px, avatar de 40 px, nome visual e status. Imagem GIF e efeitos são exibidos ali também. A geometria e tipografia continuam SEELE. Linhas nativas, indicadores de voz, nome original e ações de moderação permanecem intactos.

Perfis são consultados em lotes de até 32 pessoas e atualizados mesmo com o editor fechado. Os cartões são reutilizados quando o SEELE redesenha a lista. O MOD não altera dados globais de perfil. Apelidos ambíguos não são associados por suposição: o diretório continua disponível.

Verificado na prévia com handlers reais e dois participantes simulados: nome/status sincronizados, efeito Aurora ativo por CSS, GIF como avatar e banner carregados no cartão lateral, clique abrindo cartão completo, pausa removendo animações e descarregamento retirando cartões e atalhos. Nenhum erro no console durante essa verificação. Os GIFs de 1 px eram apenas fixtures de validação e foram removidos da demonstração depois do teste.

A captura nativa passou a falhar com ScreenCaptureKit (-3812) após o teste inicial. Portanto a versão final da faixa direita foi verificada no navegador, mas ainda precisa da conferência visual final no SEELE instalado. Os pacotes em `mods/seele` e `mods/dist` são a versão final; a cópia previamente instalada em `.config/seele/mods` é anterior ao adendo e não foi sobrescrita durante a sessão ativa. Reinstale a pasta final em ambiente de teste e confira o anúncio/conteúdo exigido pelo servidor. O servidor QA não foi parado via interface após a perda de acesso à captura.
