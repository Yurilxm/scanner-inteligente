# Control

Aplicativo mobile de finanças pessoais focado em **privacidade absoluta**. Digitaliza contas de consumo e boletos via OCR local, organiza os vencimentos e automatiza a exportação para Excel.

> **Filosofia:** Local-First. Nenhum dado sai do dispositivo. Sem servidores, sem nuvem, sem rastreamento.

## Funcionalidades

- **Multi-Perfil:** Bancos SQLite independentes (ex: Yuri e Mãe).
- **Scanner Inteligente:** OCR via ML Kit no próprio aparelho.
- **Extração Inteligente:** Identifica Condomínio, IPVA, Seguro, Gás, Faculdade, Enel, Prolagos, etc.
- **Gestão de Contas:** Pago/Pendente e Data de Pagamento.
- **Notificações Locais:** Aviso 5 dias antes do vencimento.
- **Exportação:** PDF (nativo) e CSV (padrão Excel pt-BR).
- **Automação Desktop:** Script Python atualiza planilha Excel com backup automático.

## Stack
- React Native (Expo SDK 58) + TypeScript (Strict)
- Expo Router, ML Kit, SQLite, Reanimated, Jest (38 testes)

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
4. Gere o APK:
   ```powershell
   npx expo run:android --variant release
   ```

### Setup Manual (se preferir)
```powershell
npm install
npx expo prebuild --clean
# Adicione buildStagingDirectory no android/app/build.gradle
```

## Automação da Planilha (Usuários Finais)
1. Rode o script ```setup_excel.ps1``` no PC (cria a pasta na Área de Trabalho).
2. Exporte o CSV no app.
3. Mova o CSV para a pasta ```Control_Planilha```.
4. Dê dois cliques no ```Atualizar_Planilha.bat```.

## Arquitetura e Decisões Técnicas
- **Banco Local:** O app troca o arquivo ```scanner_[perfil].db``` em tempo de execução.
- **Imagens:** Redimensionadas para 1080px antes do OCR para performance.
- **Extrator:** Regex contextual com fallback inteligente.
