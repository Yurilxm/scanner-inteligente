# Control Radar

Aplicativo mobile para digitalizar contas e boletos, extrair texto por OCR **no proprio aparelho** e organizar os dados localmente. Privacidade inegociavel: nenhum documento sai do dispositivo.

> **Status:** MVP funcional (Lote 2). Todas as fases principais (Captura, OCR, Extracao, Revisao, Biblioteca e Exportacao) estao integradas e testadas no emulador.

## Funcionalidades

- [x] Captura pela camera (scanner ML Kit) e importacao da galeria.
- [x] OCR local com extracao de texto integral.
- [x] Extracao de campos (Emissor, Referencia, Vencimento, Valor, CNPJ, Linha Digitavel) baseada em Regex e coordenadas (com tratamento de erros do OCR como "NESANO").
- [x] Tela de revisao com edicao manual e zoom na imagem original.
- [x] Armazenamento local (SQLite) com status de pagamento (Pago/Pendente).
- [x] Biblioteca com busca, filtros, agrupamento por emissor e tela de detalhes.
- [x] Exportacao para PDF e CSV (padrao brasileiro).

## Stack

- **Expo SDK 58** (React Native 0.88, New Architecture + Nitro Modules)
- **TypeScript** em modo `strict`
- **Expo Router** (navegacao por arquivos)
- **expo-document-scanner** (VisionKit no iOS, ML Kit no Android)
- **@infinitered/react-native-mlkit-text-recognition** (OCR ML Kit v2)
- **expo-sqlite** (banco de dados local)
- **Jest + jest-expo** (26 testes automatizados)
- **ESLint 9 + eslint-config-expo**
- **Tema visual:** Outfit, JetBrains Mono, MaterialCommunityIcons, ScannerBackground (SVG + Reanimated).

## Requisitos de ambiente

Testado em **Windows 11** com os itens abaixo.

| Ferramenta | Versao testada |
|---|---|
| Node.js | 24.12.0 |
| npm | 11.6.2 |
| JDK (JBR do Android Studio) | 25.0.3 |
| Android Studio | versao estavel de out/2026 |
| Android SDK | compileSdk 37, targetSdk 36, minSdk 24 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |
| Ninja | **1.13.2** |
| AVD | Pixel_7_API_35 com imagem Google Play |

**Nao use Expo Go**: as bibliotecas de scanner e OCR exigem **Development Build** (`npx expo run:android`).

## Instalacao

```powershell
git clone <url> scanner-inteligente
cd scanner-inteligente
npm install
O .npmrc ja configura legacy-peer-deps=true para resolver conflitos do Expo.

Execucao no emulador
powershell
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd Pixel_7_API_35"
adb devices
npx expo run:android --device Pixel_7_API_35
Comandos de teste e qualidade
powershell
npx tsc --noEmit
npx expo lint
npm test
Arquitetura
Navegacao: Expo Router em app/.

Telas: index, captura, revisao, biblioteca, detalhes.

Estado: DocumentContext para o documento em revisao.

Componentes: ScannerBackground, CustomToast, CustomModal.

Banco: src/db/database.ts (SQLite com CRUD e migracao).

Limitacoes conhecidas
Icone e nome do app: Ainda estao como "Scanner Inteligente" e com o icone padrao. Para corrigir, e preciso substituir os arquivos em assets/ e rodar npx expo prebuild --clean.

Google Play Services: O modelo do ML Kit pode exigir internet no primeiro uso. O processamento e local.

Sem criptografia: O armazenamento local fica no diretorio privado do app, sujeito a backups e a aparelho desbloqueado/root.

Procedimentos de build (Windows)
Ninja 1.13.2: Substituir o ninja.exe em cmake/3.22.1/bin para evitar erro de caminho longo.

MAX_PATH: Habilitar caminhos longos no Registro do Windows.

build.gradle: Apos npx expo prebuild --clean, adicionar buildStagingDirectory = file("C:/cxx-build") no bloco android { ... }.
