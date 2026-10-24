# Como rodar e desenvolver o Control

Este é o fluxo usado neste projeto. O celular não abre o Control pelo **Expo Go**. O app usa leitor de documentos, OCR, login do Google e banco local, e o Expo Go não traz esses módulos. No lugar dele entra um **APK de desenvolvimento** gerado na nuvem (EAS). Esse APK é o "Expo" deste projeto: ele se conecta no servidor do PC e mostra o código na hora.

Não precisa de Android Studio, JDK nem Android SDK.

No repositório `control-radar`, o detalhe de builds, canais e contas próprias está em `docs/DESENVOLVIMENTO.md`. A nuvem está em `docs/SINCRONIZACAO.md`.

## 1. No PC

- Node.js LTS e Git.
- Conta em [expo.dev](https://expo.dev) com acesso ao projeto **@kayomacedo/control-radar**. Sem esse acesso, o build cria outra assinatura e o login com Google deixa de coincidir com o app que já está nos celulares. Peça o convite.
- Celular Android na **mesma rede Wi-Fi** do PC.
- No Windows, o PowerShell bloqueia `npx.ps1`. Use **`npx.cmd`**.

## 2. Pegar o código

O projeto completo (sincronização, gavetas, builds) está em:

https://github.com/kayomacedo/control-radar

```powershell
git clone https://github.com/kayomacedo/control-radar.git
cd control-radar
npm install
copy .env.example .env.local
```

Preencha o `.env.local` com os quatro valores públicos (URL e chave publishable do Supabase, ID do cliente Web do Google, link do APK de teste). Eles não são senha. A senha do banco, a secret key do Supabase e o Client Secret do Google não entram em arquivo nenhum do repositório.

O pull request em `Yurilxm/scanner-inteligente` traz só as correções do extrator, do banco e da planilha. Para programar do jeito descrito aqui, use o `control-radar`.

## 3. Entrar no EAS (uma vez)

```powershell
npx.cmd eas-cli@latest login
```

## 4. Instalar o app de desenvolvimento (uma vez)

```powershell
npx.cmd eas-cli@latest build -p android --profile development
```

No fim aparece um link. Abra esse link no celular e instale o APK. Esse passo se repete só quando muda algo nativo (seção 6).

## 5. Todo dia

No PC:

```powershell
npx.cmd expo start -c
```

No celular, abra o **Control** que você instalou no passo 4 (não o Expo Go). Ele mostra o servidor da rede. Toque nele. Se não aparecer, digite o endereço que o terminal mostra, no formato `http://<IP-do-PC>:8081`.

A partir daí:

- Salvou um arquivo `.ts` ou `.tsx`, o app recarrega sozinho.
- No terminal, `r` recarrega e `m` abre o menu.
- Mudou o `.env.local`, pare o servidor e rode `npx.cmd expo start -c` de novo.

## 6. O que atualiza sozinho e o que pede APK novo

| Mudança | O que fazer |
|---|---|
| Tela, texto, cor, extrator, regra de negócio, imagem usada dentro do app | Salvar o arquivo, com o `expo start` rodando. O celular recarrega. |
| Biblioteca com código nativo, plugin, permissão, ícone, splash, nome ou `runtimeVersion` no `app.json` | APK novo: o mesmo comando do passo 4. Instale por cima. |

Instale pacotes com `npx.cmd expo install <pacote>`, para vir a versão do SDK 58. Não coloque `react-native-credentials-manager` na lista `plugins` do `app.json` (o plugin é só de iOS).

As pastas `android/` e `ios/` não ficam no git. O EAS gera elas a partir do `app.json`. Não edite essas pastas à mão.

## 7. Mandar para um celular sem o PC ligado

O APK de desenvolvimento exige o servidor do PC. Para um celular de teste, que abre sozinho:

```powershell
npx.cmd eas-cli@latest build -p android --profile preview
```

Instale esse APK uma vez. Depois, mudança só de código vai pela internet:

```powershell
npx.cmd eas-cli@latest update --channel preview --environment preview --platform android --message "o que mudou"
```

Rode o `eas update` pelo **PowerShell**. No Git Bash ele quebra por causa do espaço em `C:\Program Files`.

No celular, feche e abra o app. Ele baixa na abertura e aplica na abertura seguinte. Em **Configurações > Desenvolvimento > Buscar atualização agora** a troca é na hora.

Se a mudança foi nativa, o `update` não chega nesse APK. Gere o `preview` de novo. A impressão digital do código nativo (`fingerprint`) impede um pacote incompatível de ser instalado por cima.

O perfil `production` é o mesmo caminho, trocando `preview` por `production` no build e no update. Esse APK não mostra a seção Desenvolvimento.

## 8. Antes de considerar pronto

```powershell
npx.cmd tsc --noEmit
npx.cmd expo lint
npm test
```

Mensagens de commit: `tipo(área): descrição`, em português (`feat`, `fix`, `style`, `build`, `chore`, `refactor`).

Não faça commit de `.env.local`, `client_secret*.json`, `supabase/.temp/`, `contas_teste/` nem de CSV ou XLSX em `Controle_Excel/`.
