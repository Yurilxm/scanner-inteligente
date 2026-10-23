# Control

Aplicativo mobile de finanças pessoais focado em **privacidade absoluta**. Digitaliza contas de consumo e boletos via OCR local, organiza os vencimentos, aprende com o usuário e automatiza a exportação para Excel.

> **Filosofia:** Local-First. Nenhum dado sai do dispositivo. Sem servidores, sem nuvem, sem rastreamento.

## Funcionalidades

- **Multi-Perfil:** Bancos SQLite independentes (ex: Yuri e Mãe) com troca instantânea.
- **Scanner Inteligente:** OCR via ML Kit (Google) no próprio aparelho, sem internet.
- **Extração Contextual:** Identifica Condomínio, IPVA, Seguro, Gás, Faculdade, Internet, Telefonia, Enel, Prolagos, etc.
- **Aprendizado Contínuo:** Se o app errar o emissor, você pode reclassificar e ensinar a palavra-chave. Nas próximas leituras, ele acerta automaticamente.
- **Gestão de Contas:** Status Pago/Pendente com Data de Pagamento manual.
- **Notificações Configuráveis:** Escolha quantos dias antes (5, 3 ou 1) e a frequência (uma vez ou todo dia).
- **Exportação:** PDF (visualizador nativo) e CSV (padrão Excel pt-BR).
- **Automação Desktop:** Script Python atualiza planilha Excel com backup automático.
- **Zoom na Imagem:** Pinça e toque duplo na tela de detalhes.

## Stack Tecnológica

- **React Native** (Expo SDK 58) + **TypeScript** (Strict Mode)
- **Expo Router** (navegação por arquivos)
- **OCR:** ```@infinitered/react-native-mlkit-text-recognition``` (ML Kit v2)
- **Banco:** ```expo-sqlite``` (local)
- **UI:** ```expo-linear-gradient```, ```react-native-reanimated```, ```react-native-gesture-handler```
- **Exportação:** ```expo-print```, ```expo-sharing```, ```expo-intent-launcher```
- **Testes:** Jest + Testing Library (**54 testes automatizados**)

## Como Instalar (Desenvolvedores)

### Setup Automático (Recomendado)
1. Tenha Node.js, JDK 17+ e Android SDK instalados.
2. Clone o repositório:
   ```powershell
   git clone https://github.com/Yurilxm/scanner-inteligente.git
   cd scanner-inteligente
   ```
3. Rode o script de setup:
   ```powershell
   .\setup_dev.ps1
   ```
4. Gere o APK de produção:
   ```powershell
   npx expo run:android --variant release
   ```

### Setup Manual (se preferir)
```powershell
npm install
npx expo prebuild --clean
# Após o prebuild, adicione buildStagingDirectory no android/app/build.gradle
```

## Automação da Planilha (Usuários Finais)

1. Rode o script ```setup_excel.ps1``` no PC. Ele cria a pasta ```Control_Planilha``` na Área de Trabalho.
2. Exporte o CSV pelo aplicativo (Biblioteca -> CSV -> Compartilhar).
3. Mova o arquivo CSV para dentro da pasta ```Control_Planilha```.
4. Dê dois cliques no ```Atualizar_Planilha.bat```.

O script cria/atualiza a planilha ```Planilha_Contas.xlsx``` automaticamente, fazendo backup antes de cada alteração.

## Arquitetura e Decisões Técnicas

- **Banco Local (SQLite):** Cada perfil usa um arquivo ```scanner_[perfil].db``` separado, trocado em tempo de execução.
- **Tabelas:** ```documents``` (contas), ```settings``` (preferências) e ```learned_categories``` (aprendizado do usuário).
- **Pipeline de Imagem:** Imagens são redimensionadas para 1080px antes do OCR (evita estouro de memória do ML Kit).
- **Extrator:** Regex contextual com fallback inteligente (prioriza Total a Pagar, ignora anos e zeros, remove acentos do texto antes de buscar).

## Workarounds Críticos (Windows)

O projeto só compila no Windows por causa destas configurações:
1. **SDK Path:** Mover para ```C:\Android\Sdk``` (sem espaços).
2. **MAX_PATH:** Ativar caminhos longos no Registro do Windows (```LongPathsEnabled = 1```).
3. **Ninja:** Substituir o ```ninja.exe``` do CMake pela versão 1.13.2.
4. **Gradle Memory:** ```org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m```.
5. **ProGuard:** Regras no ```app.json``` para não apagar classes nativas do ML Kit e Nitro Modules.
6. **build.gradle:** Após ```prebuild --clean```, adicionar ```buildStagingDirectory file("C:/cxx-build")``` no bloco ```externalNativeBuild```.

## Limitações Conhecidas

- **Google Play Services:** O modelo do ML Kit pode exigir internet no primeiro uso (o processamento em si é local).
- **Sem criptografia:** O armazenamento local fica no diretório privado do app, sujeito a backups e a aparelho desbloqueado.
- **OCR:** Câmera pode gerar imagens com distorção; a galeria tende a ter mais precisão.
