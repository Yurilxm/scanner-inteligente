# Control Radar

O **Control Radar** é um aplicativo mobile de finanças pessoais focado em **privacidade absoluta**. Ele permite digitalizar contas de consumo (água, luz, internet) e boletos, extrair os dados automaticamente usando Inteligência Artificial (OCR) e organizar os vencimentos e pagamentos.

> **Filosofia do Projeto:** Local-First. Nenhum dado sensível sai do dispositivo do usuário. Não há servidores, não há nuvem, não há rastreamento. Tudo roda offline.

## Funcionalidades Principais

- **Multi-Perfil:** Bancos de dados totalmente separados para diferentes usuários no mesmo aparelho (ex: Perfil "Yuri" e Perfil "Mãe").
- **Scanner Inteligente (OCR):** Captura via câmera ou galeria, com extração de texto usando ML Kit (Google) no próprio aparelho.
- **Extração de Dados:** Identifica automaticamente o emissor (Enel, Prolagos), valor total, data de vencimento, referência e CNPJ.
- **Gestão de Contas:** Controle de status (Pago/Pendente) e registro manual da data de pagamento.
- **Notificações Locais:** Lembretes agendados automaticamente 5 dias antes do vencimento.
- **Exportação Inteligente:** Geração de relatórios em PDF (visualização nativa) e CSV (padrão Excel brasileiro).
- **Automação Desktop:** Script em Python que lê o CSV exportado e atualiza automaticamente uma planilha financeira no PC.

## Stack Tecnológica

- **Core:** React Native (Expo SDK 58) + TypeScript (Strict Mode).
- **Navegação:** Expo Router (File-based routing).
- **OCR e Câmera:** ```expo-document-scanner``` e ```@infinitered/react-native-mlkit-text-recognition```.
- **Banco de Dados:** ```expo-sqlite``` (Armazenamento local).
- **UI/UX:** Tema escuro customizado com ```expo-linear-gradient```, ```react-native-reanimated``` e ```react-native-svg```.
- **Exportação:** ```expo-print``` e ```expo-sharing```.
- **Testes:** Jest e Testing Library (33 testes automatizados).

## Arquitetura e Decisões Técnicas

- **Banco de Dados Local (SQLite):** Em vez de usar um backend na nuvem, o app usa SQLite. Para permitir múltiplos usuários (perfis), a aplicação altera o caminho do arquivo de banco de dados em tempo de execução (ex: ```scanner_yuri.db``` e ```scanner_mae.db```). Isso garante isolamento total e privacidade.
- **Processamento de Imagem:** As imagens são redimensionadas para 1080px antes do OCR para respeitar o limite do ML Kit e garantir performance.
- **Automação Python:** O script na pasta ```Controle_Excel``` usa ```openpyxl``` para ler o CSV exportado, evitar duplicatas (comparando IDs) e atualizar a planilha do usuário com backup automático.

## Como Instalar e Rodar

### Pré-requisitos
- Node.js (v24+)
- Java JDK 17+ (JBR do Android Studio recomendado)
- Android SDK (API 34+)
- Emulador ou Celular Físico com modo Desenvolvedor ativo.

### Passo a Passo
1. Clone o repositório:
   ```powershell
   git clone https://github.com/Yurilxm/scanner-inteligente.git
   cd scanner-inteligente
   ```
2. Instale as dependências:
   ```powershell
   npm install
   ```
3. Rode os testes para garantir a integridade:
   ```powershell
   npx tsc --noEmit
   npm test
   ```
4. Gere o APK de Produção (Build):
   ```powershell
   npx expo run:android --variant release
   ```
   *O APK final estará em ```android/app/build/outputs/apk/release/app-release.apk```.*

## Workarounds Críticos (Windows)

O ambiente Windows exige configurações específicas para compilar projetos React Native com módulos nativos (C++ e Gradle):
1. **Ninja 1.13.2:** Substituir o ```ninja.exe``` padrão do CMake para evitar o erro de "Long Paths".
2. **MAX_PATH:** Ativar caminhos longos no registro do Windows (```HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem\\LongPathsEnabled = 1```).
3. **ProGuard:** Regras no ```app.json``` para evitar que o R8 apague as classes nativas do ML Kit e do Nitro Modules.
4. **build.gradle:** Após rodar ```npx expo prebuild --clean```, é obrigatório adicionar ```buildStagingDirectory file("C:/cxx-build")``` dentro do bloco ```externalNativeBuild```.

## Automação da Planilha (Excel)

1. Exporte o relatório **CSV** pelo aplicativo.
2. Mova o arquivo para a pasta ```Controle_Excel```.
3. Dê dois cliques no arquivo ```Atualizar_Planilha.bat```.
4. O script criará/atualizará o arquivo ```Planilha_Contas.xlsx``` automaticamente (criando backups antes de cada alteração).
