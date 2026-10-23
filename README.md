# Control Radar

Aplicativo mobile para digitalizar contas e boletos, extrair texto por OCR **no próprio aparelho** e organizar os dados localmente. Privacidade inegociável: nenhum documento sai do dispositivo.

> **Status:** MVP completo (Lote 3). Captura, OCR, extração, revisão, biblioteca, exportação, notificações e automação de planilha implementados e testados.

## Funcionalidades

- [x] Captura pela câmera (scanner ML Kit) e importação da galeria.
- [x] OCR local com extração de texto integral e redimensionamento de imagem.
- [x] Extração inteligente de campos (emissor, referência, vencimento, valor, CNPJ) com tratamento de falsos positivos.
- [x] Validação estrutural de linha digitável (Módulos 10 e 11).
- [x] Tela de revisão com edição manual e **zoom na imagem original (pinça e toque duplo)**.
- [x] Armazenamento local (SQLite) com status de pagamento e **Data de Pagamento**.
- [x] Biblioteca com busca, filtros, agrupamento por emissor e tela de detalhes.
- [x] Exportação para PDF (visualização nativa) e CSV (preview em modal + compartilhamento).
- [x] **Notificações locais** 5 dias antes do vencimento (às 09h).
- [x] **Automação de planilha Excel** via script Python (lê o CSV e atualiza a planilha da família).
- [x] UI/UX "Radar/Scanner" com tema escuro, animações e ícone customizado.

## Stack

- **Expo SDK 58** (React Native 0.88, New Architecture + Nitro Modules)
- **TypeScript** em modo strict
- **Expo Router** (navegação por arquivos)
- **expo-document-scanner** (VisionKit no iOS, ML Kit no Android)
- **@infinitered/react-native-mlkit-text-recognition** (OCR ML Kit v2)
- **expo-sqlite** (banco de dados local)
- **expo-notifications** (lembretes de vencimento)
- **react-native-gesture-handler + reanimated** (zoom e animações)
- **Jest + jest-expo** (**30 testes automatizados**)
- **ESLint 9 + eslint-config-expo**

## Requisitos de ambiente

Testado em **Windows 11** com os itens abaixo.

| Ferramenta | Versão testada |
|---|---|
| Node.js | 24.12.0 |
| npm | 11.6.2 |
| JDK (JBR do Android Studio) | 25.0.3 |
| Android Studio | versão estável de out/2026 |
| Android SDK | compileSdk 37, targetSdk 36, minSdk 24 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |
| Ninja | **1.13.2** |
| AVD | Pixel_7_API_35 com imagem Google Play |

**Não use o Expo Go**: as bibliotecas de scanner e OCR exigem **Development Build**.

## Instalação e Execução

```powershell
git clone <url> control-radar
cd control-radar
npm install
```

Para rodar no emulador ou celular físico:
```powershell
npx expo run:android --variant release
```

## Comandos de teste e qualidade

```powershell
npx tsc --noEmit
npx expo lint
npm test
```

## Automação de Planilha (Excel)

O projeto inclui uma pasta Controle_Excel com um script Python para atualizar a planilha financeira da família.

**Como usar:**
1. Exporte o CSV pelo aplicativo (Biblioteca -> CSV -> Compartilhar).
2. Salve o arquivo CSV dentro da pasta Controle_Excel.
3. Dê **dois cliques** no arquivo Atualizar_Planilha.bat.
4. O script irá criar (ou atualizar) o arquivo Planilha_Contas.xlsx, fazendo backup automático antes de salvar.

## Workarounds Críticos (Windows)

O projeto só compila no Windows por causa destas configurações:
1. **SDK Path:** Mover para C:/Android/Sdk para evitar espaços no caminho.
2. **MAX_PATH:** Habilitar caminhos longos no Registro do Windows (LongPathsEnabled = 1).
3. **Ninja:** Substituir o ninja.exe do CMake pela versão 1.13.2.
4. **Gradle Memory:** android/gradle.properties alterado para org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m.
5. **ProGuard/R8:** Regras no app.json para não apagar classes nativas (com.margelo.nitro e com.google.mlkit).
6. **build.gradle:** Após npx expo prebuild --clean, adicionar buildStagingDirectory file(C:/cxx-build) dentro do bloco externalNativeBuild.

## Limitações conhecidas

- **Google Play Services:** o modelo do ML Kit pode exigir internet no primeiro uso (o processamento em si é local).
- **Sem criptografia:** o armazenamento local fica no diretório privado do app, sujeito a backups e a aparelho desbloqueado ou com root.
