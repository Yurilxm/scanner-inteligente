// Carrega a fachada de conta sob demanda. Num APK antigo, sem expo-crypto / expo-secure-store /
// expo-web-browser, o import falha: a tela mostra "atualize o app" em vez de o app fechar.
export type AccountModule = typeof import('./account');

export class AppUpdateRequired extends Error {
  constructor() {
    super('Esta versão do app ainda não tem o login. Instale a versão mais nova do Control.');
  }
}

let cached: Promise<AccountModule> | null = null;

export function loadAccount(): Promise<AccountModule> {
  if (!cached) {
    cached = import('./account').catch(() => {
      cached = null;
      throw new AppUpdateRequired();
    });
  }
  return cached;
}
