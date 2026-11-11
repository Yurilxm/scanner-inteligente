// Ferramentas de desenvolvimento: visiveis so pro dev e pro QA (chefe).
// "development" roda no metro (__DEV__ = true) OU eh build de dev
// "preview"     eh o build de QA — chefe ve tudo
// "production"  eh o build de loja — NADA de dev
//
// O expo-updates eh carregado dinamicamente porque APKs antigos (buildados
// antes de instalar o expo-updates) nao tem o modulo nativo, e o import
// estatico quebraria a tela.

let updatesChannel: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updates = require('expo-updates') as { channel?: string };
  updatesChannel = updates.channel ?? null;
} catch {
  // APK antigo sem expo-updates: assume dev so se __DEV__
}

export const SHOW_DEV_TOOLS =
  __DEV__ ||
  updatesChannel === 'development' ||
  updatesChannel === 'preview';

export const RUNNING_CHANNEL = updatesChannel;
