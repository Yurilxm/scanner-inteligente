// Dispara uma sincronização sem travar a tela. Se o perfil não está na nuvem, não faz nada.
export function scheduleActiveSync(): void {
  void import('./engine')
    .then(engine => engine.syncActiveProfile())
    .catch(e => console.warn('Sincronização', e));
}

// Sincroniza todas as gavetas em segundo plano, no máximo uma vez a cada intervalo
// (tela inicial: traz o que os outros fizeram e dispara os avisos de novidades)
const ALL_SYNC_INTERVAL_MS = 2 * 60 * 1000;
let lastAllSync = 0;

export function scheduleAllSync(now = Date.now()): boolean {
  if (now - lastAllSync < ALL_SYNC_INTERVAL_MS) return false;
  lastAllSync = now;
  void import('./engine')
    .then(engine => engine.syncAllProfiles())
    .catch(e => console.warn('Sincronização', e));
  return true;
}
