# Control Radar

Aplicativo mobile para digitalizar contas e boletos, extrair texto por OCR **no próprio aparelho** e organizar os dados localmente. Privacidade inegociável: nenhum documento sai do dispositivo.

> **Status:** MVP funcional (Lote 2). As fases principais (captura, OCR, extração, revisão, biblioteca e exportação) estão integradas e testadas no emulador.

## Funcionalidades

- [x] Captura pela câmera (scanner ML Kit) e importação da galeria.
- [x] OCR local com extração de texto integral.
- [x] Extração de campos (emissor, referência, vencimento, valor, CNPJ, linha digitável) baseada em regex e coordenadas, com tratamento de erros do OCR como "NESANO".
- [x] Tela de revisão com edição manual e zoom na imagem original.
- [x] Armazenamento local (SQLite) com status de pagamento (Pago/Pendente).
- [x] Biblioteca com busca, filtros, agrupamento por emissor e tela de detalhes.
- [x] Exportação para PDF e CSV (padrão brasileiro).

## Stack

- **Expo SDK 58** (React Native 0.88, New Architecture + Nitro Modules)
- **TypeScript** em modo `strict`
- **Expo Router** (navegação por arquivos)
- **expo-document-scanner** (VisionKit no iOS, ML Kit no Android)
- **@infinitered/react-native-mlkit-text-recognition** (OCR ML Kit v2)
- **expo-sqlite** (banco de dados local)
- **Jest + jest-expo** (26 testes automatizados)
- **ESLint 9 + eslint-config-expo**
- **Tema visual:** Outfit, JetBrains Mono, MaterialCommunityIcons, ScannerBackground (SVG + Reanimated)

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

**Não use o Expo Go**: as bibliotecas de scanner e OCR exigem **Development Build** (`npx expo run:android`).

## Instalação

```powershell
git clone <url> scanner-inteligente
cd scanner-inteligente
npm install
```

O `.npmrc` já configura `legacy-peer-deps=true` para resolver conflitos de dependências do Expo.

## Execução no emulador

```powershell
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd Pixel_7_API_35"
adb devices
npx expo run:android --device Pixel_7_API_35
```

## Comandos de teste e qualidade

```powershell
npx tsc --noEmit
npx expo lint
npm test
```

## Arquitetura

- **Navegação:** Expo Router em `app/`.
- **Telas:** index, captura, revisão, biblioteca, detalhes.
- **Estado:** `DocumentContext` para o documento em revisão.
- **Componentes:** `ScannerBackground`, `CustomToast`, `CustomModal`.
- **Banco:** `src/db/database.ts` (SQLite com CRUD e migração).

## Limitações conhecidas

- **Ícone e nome do app:** ainda estão como "Scanner Inteligente" e com o ícone padrão. Para corrigir, substitua os arquivos em `assets/` e rode `npx expo prebuild --clean`.
- **Google Play Services:** o modelo do ML Kit pode exigir internet no primeiro uso. O processamento é local.
- **Sem criptografia:** o armazenamento local fica no diretório privado do app, sujeito a backups e a aparelho desbloqueado ou com root.

## Procedimentos de build (Windows)

1. **Ninja 1.13.2:** substituir o `ninja.exe` em `cmake/3.22.1/bin` para evitar erro de caminho longo.
2. **MAX_PATH:** habilitar caminhos longos no Registro do Windows.
3. **build.gradle:** após `npx expo prebuild --clean`, adicionar `buildStagingDirectory = file("C:/cxx-build")` dentro do bloco `android { ... }`.