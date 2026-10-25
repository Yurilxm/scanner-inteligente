# Conta, login e sincronização

A sincronização é **opcional**. Sem login, o app funciona 100% local, como antes. Com login, o seu perfil fica ligado à conta Google e cada gaveta pode ir para a nuvem, para ter backup, usar em vários aparelhos e compartilhar.

**O servidor nunca consegue ler as contas.** Tudo é cifrado no celular antes de sair, com chaves que só existem nos aparelhos da pessoa.

---

## Para o usuário

1. **Configurações > Conta e backup > Entrar com Google.** Abre a janela nativa do Android para escolher a conta (sem passar pelo navegador). Se o aparelho não suportar, cai no login pelo navegador.
2. **Na primeira vez, toque em Criar frase de recuperação.** O app gera 12 palavras em português. Ela é a chave que abre os dados na nuvem. O caminho recomendado é **Salvar na minha conta Google**: a frase vai para o Gerenciador de Senhas do Google, com o nome "Frase de recuperação do Control (email)". Também dá para escolher **Prefiro anotar em papel**, que mostra as palavras e confere três delas.
3. **Em Gavetas na nuvem, toque em Ativar** na gaveta desejada, e use **Sincronizar agora** quando quiser. O app também sincroniza sozinho ao abrir a Biblioteca e depois de salvar, editar, pagar ou excluir uma conta.
4. **Celular novo:** entre com o mesmo Google e escolha **Recuperar da conta Google** (ou **Digitar frase**). As gavetas e as contas são baixadas.

A frase **só é pedida uma vez por aparelho**. Depois ela fica guardada no chaveiro seguro do Android e o uso é transparente. Sem a frase e sem nenhum aparelho conectado, **ninguém consegue recuperar os dados**, nem o desenvolvedor, porque o servidor não tem a chave.

Um login guarda **todas as gavetas** da pessoa: cada gaveta vira um "cofre" na nuvem. No código, gaveta = `profile`.

---

## Como funciona (para desenvolvedores)

### Código

| Arquivo | Papel |
|---|---|
| `src/sync/supabase.ts` | Cliente Supabase (sessão no `localStorage` do expo-sqlite, PKCE) |
| `src/sync/auth.ts` | Login Google: nativo (`signInWithGoogleNative`, Credential Manager + `signInWithIdToken` com nonce) e pelo navegador (`signInWithGoogle`, PKCE + deep link `scannerinteligente://auth-callback`) |
| `src/app/auth-callback.tsx` | Rota que recebe a volta do login pelo navegador |
| `src/sync/crypto.ts` | Criptografia (só primitivas auditadas `@noble`/`@scure`) |
| `src/sync/identity.ts` | Frase de recuperação ↔ par de chaves; frase no `expo-secure-store` (só neste aparelho) |
| `src/sync/phraseBackup.ts` | Cópia da frase no Gerenciador de Senhas do Google |
| `src/sync/account.ts` | Fachada usada pelas telas (status, login, frase, restaurar, sair) |
| `src/sync/loadAccount.ts` | Carrega `account.ts` sob demanda (o resto do app não paga o custo do Supabase/cripto) |
| `src/sync/model.ts` | Regras puras: o que entra, o que sai, quem vence (testado sem rede e sem banco) |
| `src/sync/runSync.ts` | Uma rodada: baixa, junta, decide o que enviar |
| `src/sync/engine.ts` | Liga gaveta ↔ cofre e executa a rodada com o banco real |
| `src/sync/remote.ts` / `photos.ts` | Acesso às tabelas e ao bucket de fotos |
| `src/sync/vaultKey.ts` | Abre a chave do cofre do usuário |
| `src/sync/schedule.ts` | `scheduleActiveSync()`: dispara uma sincronização sem travar a tela |
| `src/app/conta.tsx`, `src/app/frase.tsx` | Telas de conta e da frase |
| `src/sync/sharingCore.ts` | Gaveta da família sem rede: convite, aceite, troca de chave, histórico (testado com servidor falso) |
| `src/sync/sharing.ts` | Liga o núcleo ao servidor, à conta e ao banco (carregado sob demanda) |
| `src/sync/roles.ts` | Nomes, ícones e explicações dos papéis |
| `src/app/gaveta.tsx`, `convidar.tsx`, `ler-convite.tsx`, `convite.tsx`, `historico.tsx` | Telas da gaveta: membros, QR, câmera, aceitar e histórico |

### Criptografia

- **Identidade:** um par X25519 derivado da frase de recuperação (BIP39, 12 palavras, lista em português). A mesma frase gera sempre as mesmas chaves. No servidor fica só a **chave pública** (`user_keys`).
- **Cofre** (um por gaveta): uma chave simétrica aleatória de 32 bytes, "embrulhada" para cada membro com a chave pública dele (X25519 + HKDF-SHA256 + XChaCha20-Poly1305) e guardada em `vault_members`.
- **Dados:** XChaCha20-Poly1305 com a chave do cofre e um contexto (AAD) que amarra cada texto cifrado ao seu cofre, tipo e id. Assim o servidor não consegue trocar registros de lugar.
- **Fotos:** comprimidas (1200px, qualidade 70%), cifradas e enviadas ao bucket privado `photos` (limite de 2 MB por arquivo, caminho `<vault_id>/<registro>.bin`). Cada foto sobe uma vez só.
- A aleatoriedade vem do `expo-crypto` (`src/sync/random.ts`).

### Dados e conflitos

- **Tipos de registro** (`records.kind`): `document` (conteúdo da conta), `payment` (pago/data de pagamento) e `learned` (categoria aprendida).
- **Pagamento e conteúdo são separados**, com datas próprias (`paymentUpdatedAt` e `updatedAt`). Assim, uma pessoa marcar como pago não desfaz a edição que outra fez no valor.
- **Vence a alteração mais recente** (data do celular, que vai dentro do texto cifrado). O horário do servidor serve só para saber o que ainda não foi baixado (cursor).
- **Exclusões viram marcas** (`deletedAt`), para não "ressuscitarem" em outro aparelho. Uma conta paga e depois excluída também vira marca.
- Uma foto que falha não trava a rodada: a conta fica pendente e tenta de novo na próxima.
- Banco local v2: `updatedAt`, `paymentUpdatedAt`, `deletedAt` e marcas do que já foi enviado. Registro de gavetas v1: `vaultId` e `role` por gaveta.

### Backend (Supabase)

Migrações em `supabase/migrations/` (aplicar na ordem):

1. `20261023220000_sync_schema.sql`: tabelas `user_keys`, `vaults`, `vault_members`, `records`, `audit_log`, `invites`, o bucket `photos`, as funções e gatilhos de histórico e a função `keepalive()`.
2. `20261023230000_tighten_grants.sql`: retira privilégios padrão (ex.: DELETE) que o Supabase concede.
3. `20261023233000_harden_functions_and_policies.sql`: funções de gatilho fora da API, `(select auth.uid())` nas regras e índices (apontamentos do Security/Performance Advisor).
4. `20261024120000_family_sharing.sql`: chaveiro do cofre (`vaults.keyring`), `vault_member_list` e `vault_history` (com nomes, só para membros), `peek_invite` com o nome cifrado da gaveta e quem convidou, e `remove_member_rotate`.
5. `20261024160000_direct_invites.sql`: convite pelo e-mail (tabela `direct_invites`, fechada; só funções): `find_user_by_email`, `create_direct_invite`, `my_direct_invites`, `answer_direct_invite`, `vault_direct_invites` e `revoke_direct_invite`. A troca de chave também cancela esses convites.
6. `20261024190000_delete_vault.sql`: o gatilho de histórico dos membros não registra saídas quando o cofre inteiro está sendo apagado (antes, isso impedia o dono de apagar um cofre com membros).

**Papéis por cofre** (RLS):

| Papel | Vê | Marca pago | Edita/exclui contas | Gerencia membros |
|---|---|---|---|---|
| `viewer` (Visualizador) | ✓ | | | |
| `payer` (Pagador) | ✓ | ✓ | | |
| `editor` (Editor) | ✓ | ✓ | ✓ | |
| `owner` (Dono) | ✓ | ✓ | ✓ | ✓ |

- **Histórico:** `audit_log` é escrito **só por gatilhos** (quem, quando, o quê) e ninguém consegue alterá-lo pela API.
- **Convites por QR** (`invites`): o dono gera um token (no banco fica só o hash) junto com a chave do cofre embrulhada para o convite. Quem lê o QR chama `peek_invite`/`accept_invite`.
- **Testes do servidor:** `supabase/tests/rls_test.sql` (papéis e regras) e `supabase/tests/sharing_test.sql` (membros, histórico, prévia do convite e troca de chave) simulam usuários dentro de um bloco desfeito no final. Se tudo estiver certo, imprimem `TODOS_OS_TESTES_PASSARAM`.
- **Keepalive:** projetos gratuitos do Supabase pausam após 7 dias sem uso. O workflow `.github/workflows/supabase-keepalive.yml` chama `rpc/keepalive` a cada 3 dias (precisa dos secrets `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no GitHub).

---

## Gaveta da família

Uma gaveta na nuvem (um cofre) pode ser dividida com outras pessoas, cada uma no próprio celular.

**Para o usuário:**
1. **Dono:** em Gavetas, toque no ícone de pessoas ao lado da gaveta (ou crie uma em **Nova gaveta**), e depois em Convidar pessoa. Escolha **Pelo e-mail** (o convite aparece no sininho da pessoa, que aceita ou recusa) ou **QR code**. Escolha o papel e mostre o QR. O convite vale 24 horas, para uma pessoa só. Também dá para enviar por mensagem: quem recebe cola o texto no app.
2. **Convidado:** entre com o Google e tenha a frase de recuperação. Depois vá em Gavetas > Entrar numa gaveta (QR code), leia o QR (ou cole a mensagem), confira e toque em Entrar na gaveta.
3. **Membros e histórico:** pela mesma tela Família. O dono muda papéis e remove pessoas; o convidado pode sair.

**Como funciona:**
- **Convite pelo e-mail:** o app do dono acha a chave pública da pessoa (`find_user_by_email`) e embrulha a chave da gaveta para ela, no mesmo formato de um membro. Ao aceitar (`answer_direct_invite`), esse embrulho vira a linha dela em `vault_members`. Vale 7 dias e exige que a pessoa já tenha a chave cadastrada (login + frase).
- **Convite por QR:** o QR leva o id do convite e um segredo. Do segredo saem o token (o servidor guarda só o hash) e a chave que abre a chave da gaveta. O servidor libera o convite sem conseguir abrir a gaveta.
- **Ao aceitar:** o convidado embrulha a chave da gaveta para a própria chave pública e entra em `vault_members` (`accept_invite`). A gaveta aparece em "Compartilhadas comigo" e é sincronizada.
- **Remover alguém:**
  - o dono gera a chave nova (versão +1), embrulha para quem fica, guarda as chaves antigas no chaveiro cifrado com a nova e recifra o nome da gaveta;
  - `remove_member_rotate` faz tudo numa transação e cancela os convites pendentes;
  - quem saiu perde o acesso pelas regras (RLS) e não recebe a chave nova;
  - os registros antigos continuam com a chave da época, e quem fica lê com o chaveiro.
- **Nome da gaveta:** fica cifrado em `vaults.encrypted_meta`, com o nome de quem compartilhou. A cada sincronização, o dono envia o nome, a cor e o ícone da gaveta, e os outros atualizam a cópia local (`planMetaSync`). Renomear a gaveta no celular de um membro não vale: volta para o nome do dono.
- **Papel no app:** o motor atualiza o papel a cada sincronização, e as telas escondem o que o papel não permite. O servidor continua sendo quem garante.
- **Membros e novidades:** a cada sincronização, o motor guarda quem participa (`gaveta_members`, para a tela de Gavetas) e compara o histórico com o último evento já visto (`gaveta_activity_seen`). O que outra pessoa fez desde então vira notificação (`activityToNotify`).
- **Revisão de contas novas:** depois de gravar as contas, o motor monta a fila (`reviewQueue`) com as criações de outras pessoas no histórico que ainda não foram aceitas ou recusadas neste celular (`gaveta_review`, `gaveta_reviewed`) e avisa cada uma uma vez (`gaveta_notified`). Aceitar e recusar ficam em `src/sync/review.ts`; recusar exclui a conta (marca de exclusão sincronizada).
- **Erros por gaveta:** `syncAllProfiles` guarda o último erro de cada gaveta (`gaveta_sync_error`), mostrado na tela Gavetas, e reaproveita a rodada em andamento.
- **Cópia desligada:** se uma gaveta compartilhada com a pessoa ficou sem vínculo no celular (mas ela continua membro no servidor), `adoptRemoteVaults` religa a mesma cópia em vez de criar outra (`findDetachedCopy`: sem nuvem, mesmo nome e mesmo "quem compartilhou"). Assim o que foi adicionado nela sobe. Gaveta pessoal não tem "quem compartilhou" e nunca é religada.
- **Mover conta:** `moveDocumentToProfile` copia a conta para o banco da outra gaveta (marcada para enviar) e deixa uma marca de exclusão na de origem.
- **Excluir uma gaveta:** `removeFromCloud` apaga o cofre da nuvem (se a gaveta é sua) ou sai dele (se é de outra pessoa) antes de apagar a cópia do celular. Assim ela não volta na próxima sincronização.
- **Saiu ou foi removido:** `detachProfile` desliga a gaveta da nuvem e zera o estado de envio (`resetSyncState`). Se ele voltar a sincronizar, tudo sobe de novo num cofre novo.

**Limites conhecidos:**
- **Chave pública:** vem do servidor, sem conferência manual entre as pessoas (não existem "números de segurança"). Um servidor malicioso poderia entregar uma chave falsa ao convidar pelo e-mail ou ao trocar a chave da gaveta. O convite por QR não depende disso.
- **Busca por e-mail:** quem está logado consegue saber se um e-mail já usa o Control. É o preço do convite pelo e-mail.
- **Avisos:** convites aparecem no sininho, e as novidades das gavetas viram notificação no celular, mas só quando o app sincroniza (ao abrir a tela inicial, o sininho, a Biblioteca ou Gavetas). Com o app fechado não chega nada: isso exigiria um servidor de push.
- **Fotos de gavetas apagadas:** o app do dono apaga as fotos do cofre pela API de armazenamento antes de apagar o cofre. Se alguma sobrar, ela fica cifrada e sem cofre: ninguém consegue abrir.

---

## Montar o backend do zero

Para quem for usar o próprio Supabase/Google em vez dos atuais.

### 1. Supabase

1. Crie um projeto em supabase.com (a região atual é nos EUA).
2. Aplique as migrações:
   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref <ref-do-projeto>
   npx.cmd supabase db push
   ```
   (Alternativa: colar cada arquivo, na ordem, no SQL Editor do painel.)
3. Rode `supabase/tests/rls_test.sql` no SQL Editor e confira `TODOS_OS_TESTES_PASSARAM`.
4. Em **Authentication > URL Configuration > Redirect URLs**, adicione `scannerinteligente://auth-callback`.
5. Copie a URL e a chave **publishable** para `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A senha do banco e a secret/service_role key **não** vão para o app.

### 2. Google Cloud (login)

1. Crie um projeto e configure a **Tela de consentimento OAuth** (nome do app "Control", e-mail de suporte). É esse nome que aparece no login nativo.
2. **Credenciais > Criar ID do cliente OAuth > Aplicativo da Web.**
   - URI de redirecionamento autorizado: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`.
   - O **ID do cliente** vai para `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   - O **Client Secret** vai **só** no Supabase (passo 4). Cole você mesmo e não salve o JSON no repositório.
3. **Criar ID do cliente OAuth > Android.**
   - Pacote: `com.yuril.scannerinteligente`.
   - SHA-1: o certificado do keystore do EAS (`npx.cmd eas-cli@latest credentials -p android`, em "SHA1 Fingerprint").
   - Sem esse cliente, o login nativo falha. O login pelo navegador continua funcionando.
4. No Supabase: **Authentication > Sign In / Providers > Google**.
   - Ligue o provedor e preencha o Client ID (o da Web) e o Client Secret.
   - Deixe a verificação de nonce **ligada**: o app manda o nonce.

### 3. App

Preencha o `.env.local`, cadastre as mesmas variáveis no EAS (ver [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md#2-variáveis-de-ambiente)) e gere um APK novo. As variáveis vão embutidas no build.

### Problemas já vistos

| Sintoma | Causa | Solução |
|---|---|---|
| `provider is not enabled` (400) | Google desligado no Supabase | Ligar o provedor (passo 2.4) |
| `redirect_uri_mismatch` / "Acesso bloqueado" | URI do Supabase não cadastrada no cliente Web | Passo 2.2 (pode levar alguns minutos para valer) |
| Login volta para `localhost` | Site URL/Redirect URLs do Supabase | Passo 1.4 |
| "Unmatched Route" após o login | Falta a rota de retorno | Já existe `src/app/auth-callback.tsx` |
| Tela de login mostra `xxxx.supabase.co` | Login pelo navegador | O login nativo (Credential Manager) mostra o nome do app; exige o cliente Android com o SHA-1 certo |
| `Cannot find native module ...` | APK sem o módulo nativo (Expo Go ou APK antigo) | Gerar/instalar um APK novo |
