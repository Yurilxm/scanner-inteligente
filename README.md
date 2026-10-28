# Control

Aplicativo mobile (Android) de contas da casa. Digitaliza contas de consumo, boletos e comprovantes Pix com OCR no próprio aparelho, organiza os vencimentos, avisa antes de vencer, aprende com o usuário e exporta para Excel. Também permite cadastrar contas que não têm comprovante (como academias ou cursos) e protege o acesso com biometria ou PIN.

> **Filosofia:** Local-First. Por padrão, nenhum dado sai do aparelho. A sincronização na nuvem é **opcional**, e quando ligada os dados vão **cifrados de ponta a ponta**: o servidor guarda só texto embaralhado e não consegue ler as contas. A consulta de CNPJ também é opcional e vem desligada.

## Funcionalidades

- **Onboarding e Segurança:** Fluxo de primeiro acesso guiado (boas-vindas, perfil e escolha de proteção). O app suporta PIN e Biometria (digital/rosto) de forma independente, com suporte a tentar novamente em caso de falha.
- **Bloqueio Global (Estilo Banco):** Ao minimizar o app (ou trocar de aplicativo), a tela é bloqueada instantaneamente. O bloqueio é um *overlay* escuro e opaco que **não desmonta o app**, ou seja, se você estiver no meio de um processamento de OCR e o app for para segundo plano, você pode desbloquear e continuar de onde parou.
- **Scanner Inteligente (Boleto e Pix):** OCR via ML Kit (Google) no próprio aparelho, sem internet.
- **Extração Contextual de Boletos:** Identifica Condomínio, IPVA, Seguro, Gás, Faculdade, Internet, Telefonia, Enel, Prolagos, etc. Em nota fiscal, o emissor vem do Emitente/Razão Social. Tolerante a erros comuns de OCR (ex: VENCIWENTO, 5102026).
- **Extração Inteligente de Pix:** Lê comprovantes de transferência e extrai o nome do recebedor de forma universal (tolerante a layouts do Bradesco, Nubank, Itaú, etc.), o valor e a data/hora exata do comprovante. Oculta campos inúteis para Pix (como Vencimento e Referência) e permite copiar a chave Pix com um toque.
- **Cadastro Manual de Contas:** Adicione contas que não têm papel (ex: academia, curso de inglês). Preencha o nome, valor, vencimento, chave Pix (opcional) e receba notificações normalmente.
- **Edição de Documentos:** Qualquer conta (boleto, pix ou manual) pode ser editada clicando no ícone de lápis na tela de detalhes. As alterações refletem na hora.
- **Lembretes Inteligentes:** 5, 3 ou 1 dia antes, uma vez ou diariamente. Se você cadastrar uma conta que vence em 3 dias e a configuração for de 5 dias, o app faz um *catch-up* e agenda o aviso para o próximo dia útil às 9h. O sininho mostra o próximo aviso agrupado por conta para não poluir a tela.
- **Linha Digitável Validada:** Confere os dígitos verificadores (Febraban, 47 e 48 dígitos) e descarta leituras erradas do OCR. Quando válida, o valor e o vencimento vêm da própria linha.
- **Aprendizado Contínuo:** Reclassificação manual com palavra-chave. Nas próximas leituras, o app acerta automaticamente.
- **Consulta de CNPJ (opcional):** Desligada por padrão; ative em Configurações > Privacidade. Envia **apenas o CNPJ** para BrasilAPI + OpenCNPJ + PublicaCNPJ em paralelo (timeout 4s), com cache local de 30 dias.
- **Um perfil, várias gavetas:** O app tem um perfil só (você: nome, foto, PIN, tema e lembretes), que pode ser ligado à conta Google. As contas ficam em **gavetas** (Casa, Trabalho, Carro...), cada uma com nome, cor, ícone e banco SQLite próprio.
- **Gavetas Compartilhadas:** Compartilhe uma gaveta pelo e-mail ou QR code. Papéis de Editor, Pagador ou Visualizador. Todo pagamento e edição fica no histórico.
- **Temas:** Escuro (preto e branco, padrão), Legacy (o visual neon original) e Claro, em Configurações > Aparência. Valem para o app todo.
- **Gestão de Contas:** Status Pago/Pendente com Data de Pagamento. Máscara de moeda automática (ex: 10000 vira 100,00) e de data (DD/MM/AAAA).
- **Exportação:** PDF (visualizador nativo) e CSV (padrão Excel pt-BR), com aviso quando falha.
- **Automação Desktop:** Script Python atualiza planilha Excel com backup automático.
- **Debug OCR:** Botão Exportar OCR na tela de revisão para depurar leituras.

## Stack Tecnológica

- **React Native 0.88** (Expo SDK 58) + **TypeScript** (strict), Hermes
- **Expo Router** (navegação por arquivos em src/app/)
- **OCR:** @infinitered/react-native-mlkit-text-recognition (ML Kit v2)
- **Banco:** expo-sqlite (local, um banco por gaveta)
- **Nuvem (opcional):** Supabase (Auth, Postgres com RLS, Storage) + criptografia @noble/* / @scure/*
- **Login Google nativo:** react-native-credentials-manager
- **UI e Utilidades:** react-native-reanimated, react-native-svg, react-native-gesture-handler, expo-linear-gradient, expo-clipboard
- **Build e atualizações:** EAS Build (APK na nuvem) e EAS Update (OTA)
- **Testes:** Jest + Testing Library (**303 testes**, 60 suítes)

## Início rápido (desenvolvedores)

Para rodar no celular e ver as instruções de desenvolvimento, siga o **[docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)**.

Comandos para rodar:
git clone https://github.com/Yurilxm/scanner-inteligente.git
cd scanner-inteligente
npm install
copy .env.example .env.local
npx.cmd eas-cli@latest build -p android --profile development
npx.cmd expo start -c

O app não abre no Expo Go. O comando de build instala o cliente de desenvolvimento; o expo start serve o código para ele. No Windows use npx.cmd.

Antes de dar uma tarefa por concluída: npx.cmd tsc --noEmit, npx.cmd expo lint e npm test.

## Automação da Planilha (Usuários Finais)

1. Tenha o Python instalado no PC. Rode o setup_excel.ps1 (na raiz do projeto). Ele instala o openpyxl, se faltar, e cria ou atualiza a pasta Control_Planilha na Área de Trabalho.
2. Exporte o CSV pelo app (Biblioteca -> CSV -> Compartilhar). Cada gaveta gera o seu: relatorio_<gaveta>.csv.
3. Mova os CSVs para dentro da pasta Control_Planilha.
4. Dê dois cliques no Atualizar_Planilha.bat.

O script cria ou atualiza o Planilha_Contas.xlsx, com backup antes de cada alteração. Contas novas são adicionadas e contas existentes são atualizadas (a chave é Perfil + ID). O valor é gravado como número e as datas como datas, para dar para somar, ordenar e filtrar no Excel. Contas excluídas no app não são apagadas da planilha (histórico).

## Arquitetura

src/
  app/          Telas (Expo Router). Cada arquivo é uma rota; _layout.tsx é o navegador raiz.
  components/   Componentes (ReclassifyModal, PinPad, ProfileAvatar, ThemePicker, CustomToast...)
  context/      DocumentContext (contas da gaveta aberta)
  db/           database.ts (banco da gaveta, migrações) e profiles.ts (registro das gavetas e ajustes)
  sync/         Conta, login, criptografia e motor de sincronização
  theme/        Temas e makeStyles/useTheme
  utils/        Extrator, boleto, OCR, notificações, PIN, exportação, formatação
supabase/       Migrações SQL e teste de RLS do backend de sincronização
__tests__/      Testes Jest (alguns usam SQLite real via test-utils/nodeSqlite.js)
Controle_Excel/ Script Python da planilha

- **Gaveta = profile no código:** cada gaveta é um registro em profiles (control_app.db) e usa o banco scanner_<id>.db. O perfil da pessoa e os ajustes do app ficam em app_settings do control_app.db.
- **Migrações:** via PRAGMA user_version. O banco da gaveta está na **v4** (adicionou updatedAt, marcas de sincronização, observacao e pixKey). O registro de perfis está na v1.
- **Tabelas da gaveta:** documents (contas), settings (preferências), learned_categories (aprendizado) e cnpj_cache (cache de CNPJ).
- **PIN e Biometria:** O PIN é pedido ao abrir o Control (SHA-256 com salt e 2000 rodadas). Após 5 erros seguidos, bloqueia por 30s. A biometria usa a API nativa do Android. O onboarding.tsx garante que configurar só a biometria não crie um PIN fantasma nos bastidores.
- **Bloqueio Global:** A tela de bloqueio usa um *overlay* com zIndex: 9999 (não desmonta o app, mantendo o OCR vivo). Fotos da câmera e o prompt de permissão de notificação são ignorados por uma flag (AppStateFlag) para não disparar o bloqueio incorretamente.
- **Pipeline de imagem:** redimensiona para 1080px antes do OCR; na nuvem, a foto vai comprimida (1200px, 70%) e cifrada.
- **Extrator:** regex contextual + fallback posicional + cache de CNPJ e, se autorizado, consulta em paralelo (circuit breaker de 60s). O PIX usa uma estratégia universal (fatia o bloco do recebedor e filtra logos/nomes de bancos) para funcionar em qualquer banco.

## Documentação

- [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md): ambiente, builds, atualizações OTA, variáveis, testes.
- [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md): conta, login Google, frase de recuperação, criptografia, Supabase.
- [CHANGELOG.md](CHANGELOG.md): o que mudou.
- [AGENTS.md](AGENTS.md): regras para assistentes de código.

## Limitações Conhecidas

- **Google Play Services:** O modelo do ML Kit pode exigir internet no primeiro uso.
- **Banco local sem criptografia:** fica no diretório privado do app; o PIN e a Biometria só protegem a interface. (Na nuvem, tudo vai cifrado.)
- **OCR de câmera:** Fotos com distorção são mais desafiadoras que imagens da galeria.
- **Boleto sem texto legível:** Se o OCR não capturar o texto, os campos ficam vazios. Use o botão Exportar OCR para debugar.
- **PIX com layout atípico:** O extrator é robusto, mas bancos que usam formatos muito diferentes podem exigir ajuste fino nas regras de regex.
- **Gaveta da família:** a chave pública de cada membro vem do servidor, sem conferência manual. Excluir no celular uma gaveta de outra pessoa não tira você dela; use "Sair da gaveta".
