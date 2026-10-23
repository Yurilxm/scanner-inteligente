# Control

Aplicativo mobile de finanças pessoais focado em **privacidade absoluta**. Digitaliza contas de consumo e boletos via OCR local, organiza os vencimentos, aprende com o usuário e automatiza a exportação para Excel.

> **Filosofia:** Local-First. Por padrão, nenhum dado sai do dispositivo. Sem servidores, sem nuvem, sem rastreamento. A única conexão externa (consulta de CNPJ) é opcional e vem desligada.

## Funcionalidades

- **Multi-Perfil:** Bancos SQLite independentes (ex: Yuri e Mãe) com troca instantânea.
- **Scanner Inteligente:** OCR via ML Kit (Google) no próprio aparelho, sem internet.
- **Extração Contextual:** Identifica Condomínio, IPVA, Seguro, Gás, Faculdade, Internet, Telefonia, Enel, Prolagos, etc.
- **Aprendizado Contínuo:** Reclassificação manual com palavra-chave. Nas próximas leituras, o app acerta automaticamente.
- **Consulta de CNPJ (opcional):** Desligada por padrão; ative em Configurações > Privacidade. Quando o emissor não é reconhecido, envia **apenas o CNPJ** para BrasilAPI + OpenCNPJ + PublicaCNPJ em paralelo (timeout 4s). Só CNPJs válidos são consultados, e o cache local (30 dias) é usado mesmo com a opção desligada.
- **Tolerante a OCR:** Reconhece ```VENCIWENTO```, ```Vencirmanto```, ```5102026```, ```1 O/2026``` (erros comuns do ML Kit).
- **Gestão de Contas:** Status Pago/Pendente com Data de Pagamento.
- **Notificações Configuráveis:** 5, 3 ou 1 dia antes, uma vez ou diariamente.
- **Exportação:** PDF (visualizador nativo) e CSV (padrão Excel pt-BR).
- **Automação Desktop:** Script Python atualiza planilha Excel com backup automático.
- **Debug OCR:** Botão ```Exportar OCR``` na tela de revisão para capturar texto bruto. Os arquivos exportados são apagados na abertura do app e a cada nova exportação.
- **Zoom na Imagem:** Pinça e toque duplo na tela de detalhes.

## Stack Tecnológica

- **React Native** (Expo SDK 58) + **TypeScript** (Strict Mode)
- **Expo Router** (navegação por arquivos)
- **OCR:** ```@infinitered/react-native-mlkit-text-recognition``` (ML Kit v2)
- **Banco:** ```expo-sqlite``` (local)
- **UI:** ```expo-linear-gradient```, ```react-native-reanimated```, ```react-native-gesture-handler```
- **Exportação:** ```expo-print```, ```expo-sharing```, ```expo-intent-launcher```
- **Testes:** Jest + Testing Library (**107 testes automatizados**)

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

### Setup Manual
```powershell
npm install
npx expo prebuild --clean
# Após o prebuild, adicione buildStagingDirectory no android/app/build.gradle
```

## Automação da Planilha (Usuários Finais)

1. Rode o script ```setup_excel.ps1``` no PC. Ele cria a pasta ```Control_Planilha``` na Área de Trabalho.
2. Exporte o CSV pelo app (Biblioteca -> CSV -> Compartilhar).
3. Mova o CSV para dentro da pasta ```Control_Planilha```.
4. Dê dois cliques no ```Atualizar_Planilha.bat```.

O script cria/atualiza ```Planilha_Contas.xlsx``` automaticamente, com backup antes de cada alteração.

## Arquitetura e Decisões Técnicas

- **Banco Local (SQLite):** Cada perfil usa ```scanner_[perfil].db``` separado, trocado em runtime.
- **Tabelas:** ```documents``` (contas), ```settings``` (preferências), ```learned_categories``` (aprendizado) e ```cnpj_cache``` (cache de CNPJ com TTL de 30 dias).
- **Pipeline de Imagem:** Redimensionamento para 1080px antes do OCR.
- **Extrator:** Regex contextual + fallback posicional + cache de CNPJ e, se autorizado, consulta em paralelo (circuit breaker de 60s se todas APIs falharem).
- **Banco versionado:** Migrações via ```PRAGMA user_version``` (v1 corrige tipos de ```isPaid```/```totalAmountCents``` em bancos antigos).
- **Testes:** 107 testes cobrindo extração, banco, migração, notificações, privacidade, CSV/HTML escape, cache de CNPJ, boletos reais (Enel, Prolagos, UVA, Sicoob, NetMaxxi).

## Workarounds Críticos (Windows)

1. **SDK Path:** Mover para ```C:\Android\Sdk``` (sem espaços).
2. **MAX_PATH:** Ativar caminhos longos no Registro (```LongPathsEnabled = 1```).
3. **Ninja:** Substituir ```ninja.exe``` do CMake pela versão 1.13.2.
4. **Gradle Memory:** ```org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m```.
5. **ProGuard:** Regras no ```app.json``` para não apagar classes nativas do ML Kit e Nitro Modules.
6. **build.gradle:** Após ```prebuild --clean```, adicionar ```buildStagingDirectory file("C:/cxx-build")``` no bloco ```externalNativeBuild```.

## Limitações Conhecidas

- **Google Play Services:** O modelo do ML Kit pode exigir internet no primeiro uso.
- **Sem criptografia:** Armazenamento local fica no diretório privado do app.
- **OCR de câmera:** Fotos com distorção são mais desafiadoras que imagens da galeria.
- **Boleto sem texto legível:** Se o OCR não capturar o texto (ex: foto escura), os campos ficam vazios. Use o botão ```Exportar OCR``` para debugar.
