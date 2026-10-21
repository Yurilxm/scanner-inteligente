# Scanner Inteligente

Aplicativo mobile para digitalizar documentos (contas, boletos, notas fiscais, recibos), extrair texto por OCR **no proprio aparelho** e organizar os dados localmente. Privacidade inegociavel: nenhum documento sai do dispositivo.

> **Status:** Fase 1 concluida. O app abre, navega e compila com scanner e OCR integrados. As funcionalidades de captura, OCR, revisao, armazenamento e exportacao entram nas fases seguintes (ver "Proximos passos").

## Funcionalidades (MVP planejado)

- [x] Base do projeto (Expo SDK 58, TypeScript strict, Expo Router)
- [x] Scanner de documentos e OCR compilados no APK
- [ ] Captura pela camera e importacao da galeria (Fase 2)
- [ ] OCR local do texto integral (Fase 3)
- [ ] Extracao de campos com revisao humana obrigatoria (Fase 4)
- [ ] Armazenamento local e biblioteca com busca (Fase 5)
- [ ] Exportacao em PDF e CSV (Fase 6)

## Stack

- **Expo SDK 58** (React Native 0.88, New Architecture + Nitro Modules)
- **TypeScript** em modo `strict`
- **Expo Router** (navegacao por arquivos)
- **expo-document-scanner** (VisionKit no iOS, ML Kit no Android)
- **@infinitered/react-native-mlkit-text-recognition** (OCR ML Kit v2)
- **Jest + jest-expo** (testes)
- **ESLint 9 + eslint-config-expo**

## Requisitos de ambiente

Testado em **Windows 11** com os itens abaixo. Outras plataformas podem funcionar, mas nao foram validadas.

| Ferramenta | Versao testada |
|---|---|
| Node.js | 24.12.0 |
| npm | 11.6.2 |
| JDK (JBR do Android Studio) | 25.0.3 |
| Android Studio | versao estavel de out/2026 |
| Android SDK | compileSdk 37, targetSdk 36, minSdk 24 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |
| Ninja | **1.13.2** (substituido manualmente, ver "Problemas conhecidos") |
| AVD | Pixel_7_API_35 com imagem Google Play |

**Nao use Expo Go**: as bibliotecas de scanner e OCR sao modulos nativos e exigem **Development Build** (`npx expo run:android`).

## Instalacao

```powershell
git clone <url> scanner-inteligente
cd scanner-inteligente
npm install --legacy-peer-deps
```

O arquivo `.npmrc` ja configura `legacy-peer-deps=true` no projeto. Esse ajuste e necessario porque o `expo-router` e o `@infinitered/react-native-mlkit-text-recognition` declaram peers de React que conflitam com a versao instalada.

## Execucao no emulador

Inicie o AVD com Google Play:

```powershell
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd Pixel_7_API_35"
```

Aguarde a tela inicial do Android e confirme:

```powershell
adb devices
```

Build e instalacao:

```powershell
npx expo run:android --device Pixel_7_API_35
```

Para reabrir o Metro sem reinstalar:

```powershell
npx expo start --dev-client
```

## Execucao em aparelho fisico

Ative Depuracao USB no aparelho e conecte por cabo.

Autorize o computador no popup do Android.

Confirme com `adb devices` que aparece o serial do aparelho.

Rode:

```powershell
npx expo run:android --device <serial>
```

## Comandos de teste e qualidade

```powershell
npx tsc --noEmit
npx expo lint
npm test
```

## Bibliotecas e licencas

| Biblioteca | Versao | Licenca |
|---|---|---|
| expo | 58.0.16 | MIT |
| react-native | 0.88.0 | MIT |
| expo-router | 58.0.24 | MIT |
| expo-document-scanner | 0.2.8 | MIT |
| react-native-nitro-modules | 0.37.1 | MIT |
| @infinitered/react-native-mlkit-text-recognition | 5.0.1 | MIT |
| jest-expo | 58.0.11 | MIT |
| @react-native/jest-preset | 0.88.x | MIT |

## Arquitetura

**Navegacao:** Expo Router, roteamento por arquivos em `app/`.

**Telas do MVP:** `app/index.tsx` (Inicio), e futuramente captura, revisao, biblioteca, detalhes, exportacao.

**Estado:** sera definido na Fase 4. Por enquanto, sem gerenciador de estado.

**Componentes:** `StyleSheet` do React Native, sem NativeWind.

## Armazenamento

Nao implementado ainda. A Fase 5 vai usar o diretorio privado do app para imagens e metadados. Nao havera criptografia no MVP; isso sera documentado como limitacao conhecida.

## Formatos de exportacao (planejados)

- **PDF:** documento digitalizado e/ou relatorio com os campos.
- **CSV para Excel pt-BR:** UTF-8 com BOM, separador `;`, virgula decimal, datas em `dd/mm/aaaa`.

## Limitacoes conhecidas

**Android primeiro:** o scanner e o OCR funcionam em Android e iOS, mas so Android foi testado.

**Google Play Services:** o modelo do ML Kit e entregue pelo Play Services e pode exigir internet no primeiro uso. O processamento e local.

**OCR nao interpreta campos:** a extracao de tipo, emissor, CNPJ, valor, etc. e responsabilidade nossa, a partir do texto e das coordenadas retornadas pela biblioteca.

**Confianca por palavra:** o ML Kit nativo fornece confidence, mas a API JS do `@infinitered/react-native-mlkit-text-recognition` pode nao expor esse campo. Sera confirmado na Fase 3.

**Sem criptografia:** o armazenamento local fica no diretorio privado do app, sujeito a backups do Android e a aparelho desbloqueado/root.

`npx expo prebuild --clean` apaga edicoes manuais no `android/`. Ver "Problemas conhecidos".

## Procedimentos de build

### Windows: substituir o ninja.exe por 1.13.2

O Ninja que vem com o CMake 3.22.1 do Android SDK nao lida bem com caminhos acima de 260 caracteres, causando erros como:

```text
ninja: error: mkdir(...): No such file or directory
```

Passos:

1. Baixe `ninja-win.zip` em https://github.com/ninja-build/ninja/releases (1.12 ou superior; testado com 1.13.2).
2. Extraia o `ninja.exe`.
3. Substitua `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe` pelo novo.
4. Confirme:

```powershell
& "$env:ANDROID_HOME\cmake\3.22.1\bin\ninja.exe" --version
```

### Windows: redirecionar artefatos do CMake para C:/cxx-build

O `android/` esta no `.gitignore` (padrao Expo), entao a edicao abaixo nao vai para o Git e precisa ser reaplicada apos qualquer `npx expo prebuild --clean`.

No arquivo `android/app/build.gradle`, dentro do bloco `android { ... }`, adicione:

```gradle
externalNativeBuild {
    cmake {
        buildStagingDirectory = file("C:/cxx-build")
    }
}
```

Isso tira os objetos intermediarios do caminho profundo `android/app/.cxx/...` e evita o estouro do limite de 260 caracteres.

**TODO:** transformar essa edicao em um config plugin na Fase 7.

## Proximos passos

- **Fase 2:** captura pela camera e importacao da galeria, com previa e cancelamento.
- **Fase 3:** OCR local do texto integral, com medicao de qualidade.
- **Fase 4:** extracao de campos com revisao humana obrigatoria.
- **Fase 5:** armazenamento local, biblioteca e busca.
- **Fase 6:** exportacao em PDF e CSV.
- **Fase 7:** regressao, fluxo completo, README final, config plugin para o `buildStagingDirectory`.

## Documentacao

Prompt mestre do projeto: mantido fora do repositorio.
