# Control

Aplicativo mobile (Android) de contas da casa. Digitaliza contas de consumo e boletos com OCR no próprio aparelho, organiza os vencimentos, avisa antes de vencer, aprende com o usuário e exporta para Excel.

> **Filosofia:** Local-First. Por padrão, nenhum dado sai do aparelho. A sincronização na nuvem é **opcional**, e quando ligada os dados vão **cifrados de ponta a ponta**: o servidor guarda só texto embaralhado e não consegue ler as contas. A consulta de CNPJ também é opcional e vem desligada.

## Funcionalidades

- **Scanner Inteligente:** OCR via ML Kit (Google) no próprio aparelho, sem internet.
- **Extração Contextual:** Identifica Condomínio, IPVA, Seguro, Gás, Faculdade, Internet, Telefonia, Enel, Prolagos, etc. Em nota fiscal, o emissor vem do Emitente/Razão Social.
- **Linha Digitável Validada:** Confere os dígitos verificadores (Febraban, 47 e 48 dígitos) e descarta leituras erradas do OCR. Quando válida, o valor e o vencimento vêm da própria linha.
- **Tolerante a OCR:** Reconhece ```VENCIWENTO```, ```Vencirmanto```, ```5102026```, ```1 O/2026``` (erros comuns do ML Kit).
- **Aprendizado Contínuo:** Reclassificação manual com palavra-chave. Nas próximas leituras, o app acerta automaticamente.
- **Consulta de CNPJ (opcional):** Desligada por padrão; ative em Configurações > Privacidade. Envia **apenas o CNPJ** para BrasilAPI + OpenCNPJ + PublicaCNPJ em paralelo (timeout 4s), com cache local de 30 dias.
- **Um perfil, várias gavetas:** O app tem um perfil só (você: nome, foto, PIN para abrir o app, tema e lembretes), que pode ser ligado à conta Google. As contas ficam em **gavetas** (Casa, Trabalho, Carro...), cada uma com nome, cor, ícone e banco SQLite próprio. Uma gaveta pode ficar só no celular, ir para a nuvem como backup ou ser compartilhada.
- **Temas:** Escuro (preto e branco, padrão), Legacy (o visual neon original) e Claro, em Configurações > Aparência. Valem para o app todo.
- **Lembretes:** 5, 3 ou 1 dia antes, uma vez ou diariamente. A tela **Próximos lembretes** (sino na tela inicial) mostra quando chega cada aviso.
- **Conta e sincronização (opcional):** Login com Google (nativo, pelo Credential Manager), backup na nuvem, vários aparelhos e frase de recuperação de 12 palavras, que pode ficar no Gerenciador de Senhas do Google. Detalhes em [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md).
- **Gavetas compartilhadas:** Compartilhe uma gaveta pelo e-mail (o convite aparece no sininho da pessoa) ou por QR code. Cada pessoa usa o próprio celular, com papel de Editor, Pagador (vê e marca como pago) ou Visualizador. Todo pagamento e edição fica no histórico, com o nome de quem fez. Remover alguém troca a chave da gaveta.
- **Gestão de Contas:** Status Pago/Pendente com Data de Pagamento.
- **Exportação:** PDF (visualizador nativo) e CSV (padrão Excel pt-BR), com aviso quando falha.
- **Automação Desktop:** Script Python atualiza planilha Excel com backup automático.
- **Debug OCR:** Botão ```Exportar OCR``` na tela de revisão. Os arquivos exportados são apagados na abertura do app e a cada nova exportação.
- **Abertura animada:** A tela de abertura nativa (radar parado) vira um radar girando enquanto o app carrega.

## Stack Tecnológica

- **React Native 0.88** (Expo SDK 58) + **TypeScript** (strict), Hermes
- **Expo Router** (navegação por arquivos em ```src/app/```)
- **OCR:** ```@infinitered/react-native-mlkit-text-recognition``` (ML Kit v2)
- **Banco:** ```expo-sqlite``` (local, um banco por gaveta)
- **Nuvem (opcional):** Supabase (Auth, Postgres com RLS, Storage) + criptografia ```@noble/*``` / ```@scure/*```
- **Login Google nativo:** ```react-native-credentials-manager``` (com login pelo navegador de reserva)
- **UI:** ```react-native-reanimated```, ```react-native-svg```, ```react-native-gesture-handler```, ```expo-linear-gradient```
- **Build e atualizações:** EAS Build (APK na nuvem) e EAS Update (atualização pela internet, sem reinstalar)
- **Testes:** Jest + Testing Library (**297 testes**, 50 suítes)

## Início rápido (desenvolvedores)

Para rodar no celular e ver as instruções de desenvolvimento (canais, contas próprias, build local), siga o **[docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)**.

```powershell
git clone https://github.com/Yurilxm/scanner-inteligente.git
cd scanner-inteligente
npm install
copy .env.example .env.local
npx.cmd eas-cli@latest build -p android --profile development
npx.cmd expo start -c
```

O app não abre no Expo Go. O comando de build instala o cliente de desenvolvimento; o `expo start` serve o código para ele. No Windows use `npx.cmd`.

Antes de dar uma tarefa por concluída: `npx.cmd tsc --noEmit`, `npx.cmd expo lint` e `npm test`.

## Automação da Planilha (Usuários Finais)

1. Tenha o Python instalado no PC. Rode o ```setup_excel.ps1``` (na raiz do projeto). Ele instala o ```openpyxl```, se faltar, e cria ou atualiza a pasta ```Control_Planilha``` na Área de Trabalho, sem apagar planilhas e CSVs que já estejam lá.
2. Exporte o CSV pelo app (Biblioteca -> CSV -> Compartilhar). Cada gaveta gera o seu: ```relatorio_<gaveta>.csv``` (a coluna continua se chamando Perfil).
3. Mova os CSVs para dentro da pasta ```Control_Planilha```.
4. Dê dois cliques no ```Atualizar_Planilha.bat```.

O script cria ou atualiza o ```Planilha_Contas.xlsx```, com backup antes de cada alteração:
- **Contas novas** são adicionadas, e **contas já existentes são atualizadas** (pago, data de pagamento, valor...). A chave é Perfil + ID.
- Lê todos os CSVs da pasta, do mais antigo para o mais recente: o mais novo prevalece.
- O valor é gravado como número e as datas como datas, para dar para somar, ordenar e filtrar no Excel.
- Planilhas antigas (sem as colunas Perfil e Data Pagamento) ganham as colunas no fim; linhas que não vieram do app ficam intactas.
- Contas excluídas no app **não** são apagadas da planilha (histórico).

Testes do script: ```python -m unittest Controle_Excel/test_atualizar_planilha.py``` (requer ```openpyxl```).

## Arquitetura

```
src/
  app/          Telas (Expo Router). Cada arquivo é uma rota; _layout.tsx é o navegador raiz.
  components/   Componentes (ReclassifyModal, PinPad, ProfileAvatar, ThemePicker, RadarLoader, AnimatedSplash...)
  context/      DocumentContext (contas da gaveta aberta)
  db/           database.ts (banco da gaveta, migrações) e profiles.ts (registro das gavetas e ajustes do app)
  sync/         Conta, login, criptografia e motor de sincronização (carregado sob demanda)
  theme/        Temas e makeStyles/useTheme
  utils/        Extrator, boleto, OCR, notificações, PIN, exportação, formatação
supabase/       Migrações SQL e teste de RLS do backend de sincronização
__tests__/      Testes Jest (alguns usam SQLite real via test-utils/nodeSqlite.js)
Controle_Excel/ Script Python da planilha
```

- **Gaveta = `profile` no código:** cada gaveta é um registro em ```profiles``` (```control_app.db```) e usa o banco ```scanner_<id>.db```. O nome técnico ficou "profile" por histórico; nas telas, é sempre "gaveta". O perfil da pessoa (nome, foto, PIN) e os ajustes do app (tema, lembretes, privacidade) ficam em ```app_settings``` do ```control_app.db``` (```src/utils/perfil.ts```).
- **Migrações:** via ```PRAGMA user_version```. Banco do perfil na v2 (v1 corrige tipos antigos; v2 adiciona ```updatedAt```, ```paymentUpdatedAt```, ```deletedAt``` e marcas de envio para a sincronização). Registro de perfis na v1 (```vaultId```/```role```).
- **Tabelas da gaveta:** ```documents``` (contas), ```settings``` (preferências), ```learned_categories``` (aprendizado) e ```cnpj_cache``` (cache de CNPJ, 30 dias).
- **PIN do app:** pedido ao abrir o Control (não ao trocar de gaveta). SHA-256 com salt e 2000 rodadas (JS puro); após 5 erros seguidos, bloqueia por 30s. Protege o acesso pela interface; não criptografa o banco local.
- **Pipeline de imagem:** redimensiona para 1080px antes do OCR; na nuvem, a foto vai comprimida (1200px, 70%) e cifrada.
- **Extrator:** regex contextual + fallback posicional + cache de CNPJ e, se autorizado, consulta em paralelo (circuit breaker de 60s se todas as APIs falharem).
- **Sincronização:** ver [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md).

## Documentação

- [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md): ambiente, builds, atualizações pela internet, variáveis, testes, Windows.
- [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md): conta, login Google, frase de recuperação, criptografia, Supabase.
- [CHANGELOG.md](CHANGELOG.md): o que mudou.
- [AGENTS.md](AGENTS.md): regras para assistentes de código (Expo muda a cada SDK; sempre consultar a doc da versão).

## Limitações Conhecidas

- **Google Play Services:** O modelo do ML Kit pode exigir internet no primeiro uso.
- **Banco local sem criptografia:** fica no diretório privado do app; o PIN só protege a interface. (Na nuvem, tudo vai cifrado.)
- **OCR de câmera:** Fotos com distorção são mais desafiadoras que imagens da galeria.
- **Boleto sem texto legível:** Se o OCR não capturar o texto (ex: foto escura), os campos ficam vazios. Use o botão ```Exportar OCR``` para debugar.
- **Gaveta da família:** a chave pública de cada membro vem do servidor, sem conferência manual. Excluir no celular uma gaveta de outra pessoa não tira você dela; use "Sair da gaveta".
