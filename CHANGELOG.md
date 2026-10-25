# Changelog

Mudanças da branch `fix/extracao-e-dados` em relação à `main`, agrupadas por área. Os números de testes indicam o total que passava em cada etapa; hoje são **297 testes** (50 suítes), com lint e typecheck limpos e `expo-doctor` 20/20.

## Um perfil, várias gavetas

O app passou a ter **um perfil só** (a pessoa), que pode ser ligado à conta Google, e as contas ficam em **gavetas**. Antes, cada "perfil" fazia as duas coisas, e compartilhar um perfil podia expor contas pessoais.

- **Perfil (Configurações > Meu perfil):** nome, cor, foto e o **PIN do app**, pedido ao abrir o Control (não mais ao trocar de gaveta). Tema, lembretes e privacidade valem para o app todo.
- **Gavetas (canto superior esquerdo da tela inicial):** nome, cor, ícone e contas. Duas seções: **Minhas gavetas** (com Nova gaveta e o ícone para compartilhar) e **Compartilhadas comigo** (com o olho para ver os membros).
- **Migração automática, uma vez:** cada perfil antigo virou uma gaveta, com todas as contas, fotos e lembretes. O perfil que estava aberto emprestou nome, foto, PIN, tema e ajustes ao perfil novo. As gavetas perderam o PIN próprio.
- **Contas novas para revisar (sininho):** quando outra pessoa adiciona uma conta numa gaveta, chega o aviso ("Casa: Yuri adicionou ENEL R$ 181,31. Toque no sininho para aceitar ou recusar") e ela aparece no sininho, em **Contas novas nas gavetas**, com **Aceitar** (fica) e **Recusar** (é excluída para todos; só para quem pode editar). A bolinha do sininho conta essas contas. A fila sai direto do histórico, então contas antigas que ninguém revisou também aparecem. Cada conta gera um aviso só.
- **Correção: foto de outra pessoa travava a sincronização** ("undefined is not a function"). O Blob do React Native não tem `arrayBuffer()`; a foto agora é lida pelo `FileReader` (`blobToBytes`). E o download de foto passou a ser tolerante: se falhar, a conta chega mesmo assim e a foto fica para a próxima rodada (antes, derrubava a gaveta inteira).
- **Sincronização mais robusta:** uma gaveta com problema não trava as outras (nem a busca de gavetas novas), e o erro aparece na tela Gavetas ("Não sincronizou: …"); telas que abrem juntas reaproveitam a mesma rodada de sincronização, em vez de rodar duas em paralelo; excluir uma cópia duplicada de uma gaveta não tira mais a pessoa da gaveta; o app não cria mais cópias duplicadas da mesma gaveta.
- **Avisos de novidades:** todos que participam da gaveta (qualquer papel) recebem aviso do que os outros fizeram: entrar, sair, recusar o convite, adicionar, **alterar**, pagar/desmarcar ou excluir uma conta numa gaveta sua (ou compartilhada com você), chega uma notificação no celular ("Casa: Fulano entrou como Editor"). Vem na sincronização; a tela inicial agora sincroniza sozinha ao abrir (no máximo a cada 2 minutos), e a tela Gavetas ao abrir. Na primeira sincronização de cada gaveta, o app só marca o ponto de partida, sem avisar o passado. Os ecos de quem acabou de adicionar uma conta (a alteração e o pagamento inicial enviados na mesma rodada, até 60 s depois) não viram aviso extra.
- **Gavetas mostra quem participa:** "Compartilhada com Fulano" também nas suas gavetas, com o olho para ver os membros (cópia local da última sincronização).
- **Excluir qualquer gaveta:** inclusive a aberta (o app abre outra antes) e a última (o app cria uma vazia, "Minhas contas"). Gaveta sua na nuvem é apagada da nuvem para todos; gaveta de outra pessoa: você sai dela. Se a nuvem falhar (ex.: sem internet), nada é apagado do celular. No servidor, a migração `20261024190000_delete_vault.sql` corrige o histórico, que impedia o dono de apagar um cofre com membros.
- **Nuvem recomeçou do zero:** os cofres antigos (inclusive o compartilhado) foram apagados do servidor; a gaveta ligada a um cofre que não existe mais se desliga sozinha na sincronização. Para voltar, ative cada gaveta em Conta > Gavetas na nuvem. As contas continuam no celular.
- **Correção da migração:** a primeira versão desligava da nuvem todas as gavetas do celular, inclusive uma gaveta aceita logo antes de a atualização entrar (a conta adicionada nela não subia). Agora a migração não mexe no vínculo, e a sincronização religa sozinha a cópia desligada de uma gaveta compartilhada (mesmo nome e mesmo dono; gaveta pessoal nunca é religada).
- **Teste de ponta a ponta com dois celulares** (`__tests__/e2e_gaveta.test.ts`, dois cenários; o segundo cobre a conta adicionada por um editor chegando ao dono para aceitar ou recusar): cada celular carrega o app numa cópia isolada (banco, chaveiro e avisos próprios), contra um servidor falso com as regras do Supabase. Cobre criar a gaveta, levar à nuvem, adicionar boletos, convidar pelo e-mail, aceitar no sininho, ver os pendentes, pagar, o Pagador não conseguir criar conta e o dono receber os avisos.
- **Mover para outra gaveta** (Detalhes da conta): leva a conta, com a foto e o lembrete, para outra gaveta em que você pode adicionar contas; as duas sincronizam.
- **No código:** gaveta continua sendo `profile` (registro + banco próprio); o perfil da pessoa e os ajustes do app ficam em `src/utils/perfil.ts` (`app_settings` do `control_app.db`). Rotas: `perfis` = lista de gavetas, `perfil` = editar gaveta, `meu-perfil` = perfil da pessoa.

## Extração e dados

- **Extrator:** corrige falsos positivos.
  - O filtro que descartava valores entre R$ 1.900 e R$ 2.100 saiu.
  - Emissores por palavra inteira (GASTOS, ESTIMADO, ULTIMO).
  - Tipo do documento por indicadores fortes e fracos (NF com VALOR TOTAL, CHUVA × UVA).
- **Valor digitado:** `parseBRLToCents` aceita milhar (`1.234,56`), e a revisão bloqueia valor inválido.
- **Linha digitável Febraban** (`src/utils/boleto.ts`): confere os dígitos de boleto bancário (47) e de arrecadação (48).
  - Extrai valor e vencimento, já com o novo ciclo do fator de vencimento (22/02/2025).
  - O extrator só aceita linha válida e prefere o valor e o vencimento dela.
  - O validador antigo recusava linhas válidas e aceitava qualquer linha de 48 dígitos.
- **Nota fiscal:** o emissor vem de "Emitente" e "Razão Social", além de Beneficiário e Cedente.
- **Banco:**
  - Migração versionada (`PRAGMA user_version`). A v1 corrige `isPaid` e `totalAmountCents` gravados como texto em bancos antigos, que quebravam o filtro de pendentes.
  - IDs únicos mesmo quando gerados no mesmo milissegundo.
- **Lembretes:** cancelados ao pagar ou excluir uma conta, e reagendados ao desmarcar ou reclassificar.
- **Datas e PDF:**
  - Datas validadas (31/02 é rejeitado), com máscara nos campos.
  - A data de pagamento padrão usa o fuso local (antes virava o dia depois das 21h).
  - O PDF abre pela API certa do SDK 58 e não mostra mais "undefined" em conta sem vencimento.
- **Exportação:**
  - O CSV ganha a coluna Perfil e um arquivo por perfil.
  - Erros de exportação aparecem na tela.
  - O app espera o CSV terminar de gravar antes de compartilhar.

## Privacidade

- A consulta de CNPJ na internet vem **desligada** (Configurações > Privacidade). Só CNPJs válidos são enviados, e o cache local funciona offline.
- Os arquivos do "Exportar OCR" são apagados na abertura do app e a cada nova exportação.
- O texto do OCR é escapado no PDF, para não virar marcação.

## Perfis, temas e lembretes

- **Perfis personalizáveis:**
  - nome, cor, ícone ou foto, PIN opcional e lembretes e privacidade próprios;
  - os perfis antigos (Yuri e Mãe) foram migrados sem perder contas;
  - excluir um perfil apaga o banco, as fotos e os lembretes dele, com confirmação pelo nome.
- **PIN:**
  - SHA-256 com salt e 2000 rodadas;
  - bloqueio de 30s depois de 5 erros;
  - **trocar para um perfil com PIN sempre pede o PIN.**
- **Temas por perfil:** Escuro (preto e branco, padrão), Legacy (o neon original) e Claro.
  - Sistema `useTheme`/`makeStyles` em todas as telas, com contraste WCAG testado.
  - A barra de status e o fundo nativo acompanham o tema.
- **Tela inicial:** o seletor de perfil fica no canto superior esquerdo.
- **Tela "Próximos lembretes"** (sino na tela inicial): o próximo aviso em destaque e a lista com data, hora e valor. Ela mostra só os lembretes do perfil ativo.

## Conta e sincronização (Supabase, ponta a ponta)

Detalhes em [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md).

- **Criptografia** (`src/sync/crypto.ts`):
  - identidade X25519 derivada de uma frase BIP39 de 12 palavras em português;
  - dados em XChaCha20-Poly1305, com contexto (AAD) por registro;
  - chave do cofre embrulhada para cada membro.
- **Banco local v2:**
  - datas separadas para conteúdo e pagamento;
  - exclusão vira marca;
  - marcas do que falta enviar;
  - vínculo perfil–cofre com papel (`owner`, `editor`, `payer`, `viewer`).
- **Backend:**
  - tabelas com RLS por papel;
  - histórico imutável, escrito só por gatilhos;
  - convites por QR (token guardado só como hash);
  - bucket privado de fotos cifradas;
  - endurecimento de acordo com os advisors do Supabase;
  - teste de RLS com cerca de 40 verificações.
- **Login com Google:**
  - **nativo** (Credential Manager, janela "Continuar no Control"), com login pelo navegador como reserva;
  - PKCE, nonce verificado e rota `auth-callback` para a volta do navegador.
- **Frase de recuperação:**
  - criada uma vez e guardada no chaveiro seguro do aparelho;
  - recomendado salvar no **Gerenciador de Senhas do Google**, com a opção de anotar em papel;
  - celular novo recupera pela conta Google ou digitando a frase.
- **Motor de sincronização:**
  - baixa, junta e envia, sem travar a tela;
  - roda ao abrir a Biblioteca e depois de cada alteração, e também pelo botão "Sincronizar agora";
  - fotos comprimidas (1200px, 70%) e enviadas uma vez só;
  - uma foto com falha não trava a rodada;
  - sem contas-fantasma após exclusão.
- **Keepalive:** um GitHub Action a cada 3 dias impede que o Supabase gratuito seja pausado (falta o push e os secrets).

## Gaveta da família (fase 5)

Contas da casa divididas entre várias pessoas, cada uma no próprio celular, com permissões e histórico. Detalhes em [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md#gaveta-da-família).

- **Criar e convidar** (Perfis > Criar gaveta da família, ou o ícone de família ao lado de um perfil que já existe):
  - o dono escolhe o papel (Editor, Pagador ou Visualizador) e mostra o QR;
  - o convite vale 24 horas, para uma pessoa só, e pode ser cancelado;
  - também dá para enviar por mensagem: a pessoa cola o texto no app (o WhatsApp não abre links `scannerinteligente://`).
- **Convidar pelo e-mail (sininho):**
  - o dono digita o e-mail Google da pessoa, e o convite aparece no sininho do Control dela, com uma bolinha de contagem;
  - ela toca em **Aceitar** ou **Recusar**, sem QR nem mensagem;
  - o app pega a chave pública da pessoa e entrega a chave da gaveta já embrulhada para ela: o servidor guarda só o pedido;
  - vale 7 dias; a pessoa precisa já ter entrado no Control uma vez (login + frase); se não, o QR continua disponível;
  - o histórico registra quem convidou, quem recusou e o que foi cancelado;
  - o sininho mostra também os convites que você mandou e ainda esperam resposta (de todas as suas gavetas), com Cancelar;
  - e a seção **Pendentes nas gavetas**: contas não pagas de todas as gavetas, da que vence primeiro (vencidas em destaque). Ao abrir, sincroniza para trazer o que os outros adicionaram; tocar abre a conta. Perfis com PIN bloqueado ficam de fora.
- **Entrar** (Perfis > Entrar numa gaveta (QR code)):
  - a câmera lê o QR, ou a pessoa cola a mensagem;
  - antes de aceitar, aparecem o nome da gaveta, quem convidou e o papel;
  - ao aceitar, surge um perfil novo, já sincronizado. Ele nunca se junta a um perfil local de mesmo nome.
- **Nome da gaveta sempre em dia:** a cada sincronização, o nome, a cor e o ícone que o dono deu chegam a todos (antes ficava o nome do momento em que a gaveta foi para a nuvem). Se o nome já existe noutro perfil do celular, ganha quem compartilhou: "Família (Kayo)".
- **Perfis:** a gaveta de outra pessoa mostra "Compartilhada por Kayo · Pagador" e um **olho** que abre quem faz parte, com papel de cada um e o atalho para o histórico.
- **Membros:** lista com nome, e-mail e papel; o dono muda o papel ou remove a pessoa; quem foi convidado pode sair.
- **Troca de chave ao remover alguém:**
  - o dono gera uma chave nova, embrulha para quem fica e guarda as antigas num chaveiro cifrado com a nova;
  - tudo numa única transação no servidor (`remove_member_rotate`), que cancela os convites pendentes;
  - se alguém entrar ou sair no meio tempo, a operação falha sem efeito e o app tenta de novo.
- **Histórico:** "Maria pagou ENEL", "Você removeu João", com o nome de cada pessoa. Os resumos são abertos com a chave da época.
- **Permissões nas telas:**
  - Pagador e Visualizador não veem "Novo documento", "Excluir" nem "Reclassificar";
  - o Visualizador também não vê "Pagar";
  - a tela inicial mostra "Gaveta compartilhada · Pagador".
  - O servidor já barrava essas ações; agora as telas também escondem os botões.
- **Removido ou saiu:** o perfil fica só no celular, com as contas que já estavam lá. Se voltar a sincronizar, tudo é reenviado num cofre novo.
- **Selo da conta na tela inicial:** com a conta conectada, o botão "ENTRAR" dá lugar a um selo no canto superior direito: o "G" do Google com verificado azul quando a conta está conectada e com a frase neste celular, ou com alerta quando falta a frase. A checagem é só local (`getLocalAccountStatus`, `src/sync/badge.ts`).
- **Servidor:** migrações `20261024120000_family_sharing.sql` e `20261024160000_direct_invites.sql` (aplicadas), com os testes `supabase/tests/sharing_test.sql` e `supabase/tests/direct_invites_test.sql` (passaram no banco real, sem deixar rastro).

## Visual

- **Ícone do app:** radar branco sobre preto, com versão adaptativa e monocromática (ícones temáticos do Android).
- **Abertura animada:** a tela nativa (radar parado) é trocada por uma cópia idêntica que gira o radar, com rastro de varredura e onda, e esmaece quando o app fica pronto (`AnimatedSplash`, `RadarLoader`).
- O carregamento do "Processando OCR..." usa o mesmo radar animado.
- **Área útil da tela:** nenhuma tela fica atrás da barra de status nem dos botões de navegação do celular (o Android desenha de borda a borda). A barra "Descartar / Salvar" da Revisão, a tela inicial, a Captura, o aviso flutuante, o fechar da foto ampliada e a folha de papéis da gaveta passaram a respeitar a área segura.

## Forma de desenvolver

Detalhes em [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md).

- **Rotas em `src/app/`** (padrão do AGENTS.md). O `ReclassifyModal` é único para a Revisão e os Detalhes, e a formatação fica centralizada em `src/utils/format.ts`. Lint zerado.
- **Builds na nuvem com EAS:**
  - perfis `development` (dev client), `preview` e `production`;
  - o projeto `o projeto EAS` usa sempre o mesmo keystore;
  - não precisa mais de Android Studio nem dos ajustes de Gradle e CMake no Windows.
- **EAS Update:**
  - mudanças de código chegam aos celulares sem reinstalar;
  - canais `preview` e `production`;
  - `runtimeVersion` por **fingerprint**: uma atualização incompatível nunca é entregue a um APK antigo.
- **Seção Desenvolvimento** (Configurações), no build de desenvolvimento e no APK de teste:
  - mostra a atualização em uso, com o botão "Buscar atualização agora";
  - "Baixar APK de teste mais recente" (`EXPO_PUBLIC_DEV_APK_URL`);
  - lembrete de teste em 10s e lista dos agendados.
- **Diagnóstico de OCR (dev):** um botão nos Detalhes envia a foto, o texto e os campos para o PC que roda o Expo.
- **Variáveis públicas** em `.env.local` (fora do git) e no EAS, por ambiente. O modelo fica no `.env.example`.
- **Testes:**
  - SQL real no Jest (`test-utils/nodeSqlite.js`);
  - testes da planilha em Python;
  - mocks centralizados em `jest.setup.js`.
- **Limpeza do repositório:**
  - saíram os scripts antigos de commit e o `fix_regex.py`, que reescrevia o extrator;
  - dados pessoais saíram do git;
  - o `.gitignore` cobre credenciais (`client_secret*.json`), `supabase/.temp/`, `contas_teste/` e planilhas;
  - o `atualizar_planilha.py` foi reescrito: atualiza contas existentes, usa a chave Perfil+ID e grava números e datas de verdade.

## Próximos passos

- **Gaveta da família, melhorias possíveis:**
  - conferir a chave pública de cada membro (como os "números de segurança" de apps de mensagem). Hoje o app confia no servidor para entregar a chave certa de cada pessoa;
  - transferir a posse da gaveta para outra pessoa;
  - avisos com o app fechado (exigiriam um servidor de envio de notificações).
- **Fotos órfãs no Supabase:** as 2 fotos cifradas dos cofres apagados na limpeza continuam no bucket `photos` (ninguém consegue abri-las). Dá para apagar no painel: Storage > photos.
- **Link do APK de teste:** expira cerca de 14 dias depois do build. Ao gerar um novo, atualizar `EXPO_PUBLIC_DEV_APK_URL` no `.env.local` e no EAS.
- **Keepalive:** fazer o push e cadastrar os secrets `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no GitHub.
- **Contas do projeto:** se o desenvolvedor original for manter o projeto, ele precisa de convite para o EAS, o Supabase e o Google Cloud, ou montar os dele (ver DESENVOLVIMENTO.md, seção 8).
