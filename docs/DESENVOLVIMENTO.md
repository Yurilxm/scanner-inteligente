# Desenvolvimento do Control

Este documento complementa o [README](../README.md) e cobre o setup do ambiente, os comandos do dia a dia, os perfis de build, as atualizações OTA e a solução de problemas comuns. Voltado para quem vai rodar, buildar ou contribuir com o projeto.

## Pré-requisitos

- Node.js 20+ (com npm)
- Conta Expo (para eas build e eas update)
- Conta Supabase (opcional: só se for ligar a nuvem)
- Conta Google Cloud com OAuth configurado (opcional: só se for usar o login nativo)
- Python 3.12 (opcional: só para os scripts auxiliares em Controle_Excel/)
- Android Studio (opcional: só se for buildar localmente; o eas build gera o APK na nuvem)

## Setup inicial

~~~powershell
git clone https://github.com/Yurilxm/scanner-inteligente.git
cd scanner-inteligente
npm install
copy .env.example .env.local
~~~

Edite o .env.local com as variáveis do seu ambiente. As 4 chaves obrigatórias:

| Variável | Como obter |
|---|---|
| EXPO_PUBLIC_SUPABASE_URL | URL base do projeto Supabase, ex: https://xyz.supabase.co (sem /rest/v1/ no final) |
| EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Painel Supabase → Settings → API → anon/publishable key |
| EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID | Google Cloud Console → Credentials → OAuth 2.0 Client ID (tipo Web) |
| EXPO_PUBLIC_DEV_APK_URL | URL do último build development (para o atalho de download no app) |

Nunca comite o .env.local. Ele já está no .gitignore. Para produção, use as variáveis de ambiente do EAS (veja abaixo).

## Comandos do dia a dia (Windows)

No Windows, use npx.cmd em vez de npx para evitar conflito com o npx.ps1 do PowerShell:

~~~powershell
npx.cmd expo start -c
npx.cmd tsc --noEmit
npx.cmd expo lint
npm test
npx.cmd expo-doctor
npx.cmd expo install --fix
~~~

Antes de commitar qualquer mudança, rode tsc --noEmit, expo lint e npm test. Os três precisam passar.

## Perfis de build (EAS)

O projeto tem 3 perfis configurados em eas.json:

| Perfil | Uso | Saída |
|---|---|---|
| development | Dev client com Expo Dev Tools | APK |
| preview | Teste interno, distribuição ad-hoc | APK |
| production | Publicação (Play Store) | AAB |

Para gerar um APK preview (o mais usado para testar no celular):

~~~powershell
npx.cmd eas-cli@latest build -p android --profile preview
~~~

Ao terminar, o EAS imprime um link para baixar/instalar o APK. Mande esse link para quem for testar.

Atenção: qualquer mudança de código nativo (novo módulo Expo, mudança de permissão em app.json, atualização de SDK) exige um build novo. eas update não adiciona código nativo ao APK já instalado.

## Atualizações OTA (EAS Update)

Para mudanças só de JS/TS (telas, lógica, textos), use eas update. O app baixa a atualização sem reinstalar o APK:

~~~powershell
# Canal preview (teste interno)
npx.cmd eas-cli@latest update --channel preview --environment preview --message "fix: descricao curta"

# Canal production (usuarios finais)
npx.cmd eas-cli@latest update --channel production --environment production --message "fix: descricao curta"
~~~

O --environment carrega as variáveis corretas da nuvem do EAS. Sem ele, as EXPO_PUBLIC_* ficam vazias e o app quebra.

## Variáveis de ambiente no EAS

As variáveis usadas no build/update ficam na nuvem, separadas do .env.local. Para inspecionar:

~~~powershell
npx.cmd eas-cli@latest env:list --environment preview
~~~

Para atualizar uma variável:

~~~powershell
npx.cmd eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://xyz.supabase.co" --environment preview --visibility plaintext
~~~

Variáveis EXPO_PUBLIC_* são embutidas no bundle em tempo de build. Sempre use --visibility plaintext.

## Testes

Os testes ficam em __tests__/ e cobrem extratores, banco, sync, criptografia, telas e lembretes. Rodar tudo:

~~~powershell
npm test
~~~

Rodar só um arquivo ou um padrão:

~~~powershell
npm test -- pix_extractor
npm test -- --testPathPattern="pix_extractor|extractor"
~~~

O jest.setup.js mocka as APIs nativas do Expo. Para testes que precisam de SQLite real, use test-utils/nodeSqlite.js como nos testes de database.test.ts.

## Solução de problemas comuns

PGRST125 (Invalid path specified in request URL) no login: a EXPO_PUBLIC_SUPABASE_URL no EAS ficou com /rest/v1/ ou barra no final. Remova via eas env:set e rode eas update de novo.

Cannot find native module ExpoClipboard (ou outro módulo nativo): o módulo foi adicionado ao package.json mas o APK instalado não tem ele embutido. Rode eas build (não só eas update).

Bloqueio de tela dispara ao abrir câmera/galeria: já corrigido via AppStateFlag (setPickingImage/setRequestingPermission). Se voltar a acontecer, veja src/app/_layout.tsx e src/utils/AppStateFlag.ts.

Acentos quebrados ao editar arquivos com PowerShell: o PowerShell 5.1 corrompe acentos em here-string. Para escrever arquivos com acentos, use Set-Content -Encoding utf8 com aspas simples ou um gerador Python.

npx abre o arquivo npx.ps1 em vez de executar: use npx.cmd no Windows (é a forma documentada no AGENTS.md).

## Estrutura do projeto

~~~text
src/
  app/          Telas (Expo Router). Cada arquivo e uma rota; _layout.tsx e o navegador raiz.
  components/   Componentes reutilizaveis (PinPad, ProfileAvatar, CustomToast, etc).
  context/      DocumentContext (contas da gaveta aberta).
  db/           database.ts (banco da gaveta, migracoes) e profiles.ts (registro das gavetas).
  sync/         Login, criptografia e motor de sincronizacao (carregado sob demanda).
  theme/        Temas e makeStyles/useTheme.
  utils/        Extrator, boleto, OCR, notificacoes, PIN, exportacao, formatacao.
supabase/       Migracoes SQL e teste de RLS do backend.
__tests__/      Testes Jest.
Controle_Excel/ Script Python da planilha.
docs/           SINCRONIZACAO.md e este DESENVOLVIMENTO.md.
~~~

## Documentação relacionada

- [README](../README.md): visão geral, funcionalidades e stack.
- [SINCRONIZACAO](./SINCRONIZACAO.md): login Google, criptografia E2E, frase de recuperação, Supabase.
- [CHANGELOG](../CHANGELOG.md): histórico de mudanças.
- [AGENTS](../AGENTS.md): regras para assistentes de código.
