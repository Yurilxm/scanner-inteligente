import * as FileSystem from 'expo-file-system/legacy';
import { changeProfile, deleteProfileDatabase, getCurrentProfile } from '../db/database';
import { ThemeName, setThemeName } from '../theme';
import { PROFILE_COLORS, ProfileRole, createProfile, deleteProfileRecord, getProfile, listProfiles } from '../db/profiles';
import { cancelProfileReminders } from './notifications';
import { appSetting, setAppSettingValue } from './perfil';

// No código, cada gaveta é um "profile" (registro + banco próprio). A pessoa tem um perfil só
// (src/utils/perfil.ts), com PIN, tema e ajustes que valem para todas as gavetas.

// Papel na gaveta ativa: numa gaveta de outra pessoa pode ser editor, pagador ou visualizador
export function activeProfileRole(): ProfileRole {
  return getProfile(getCurrentProfile())?.role ?? 'owner';
}

// Troca a gaveta aberta (o PIN é do app, pedido ao abrir; trocar de gaveta não pede)
export function switchProfile(profileId: string): void {
  if (!getProfile(profileId)) throw new Error('Gaveta não encontrada.');
  changeProfile(profileId);
}

// O tema vale para o app todo
export function applyProfileTheme(): void {
  setThemeName(appSetting('theme') as ThemeName);
}

export function setProfileTheme(name: ThemeName): void {
  setAppSettingValue('theme', name);
  setThemeName(name);
}

async function deleteFileQuietly(uri: string | null | undefined) {
  if (!uri) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

// Exclui a gaveta e tudo dela: contas, fotos das contas e lembretes
export async function deleteProfile(profileId: string): Promise<void> {
  const profile = getProfile(profileId);
  if (!profile) return;
  if (listProfiles().length <= 1) throw new Error('É preciso manter pelo menos uma gaveta.');
  if (profileId === getCurrentProfile()) throw new Error('Abra outra gaveta antes de excluir esta.');

  const { imageUris, docIds } = deleteProfileDatabase(profileId);
  deleteProfileRecord(profileId);

  // Limpeza fora do banco: se algo falhar aqui, a gaveta já não aparece mais
  try { await cancelProfileReminders(profileId, docIds); } catch {}
  await Promise.all(imageUris.map(deleteFileQuietly));
  await deleteFileQuietly(profile.photoUri);
}

// Gaveta que sobra quando a pessoa exclui a última: o app sempre tem uma aberta
export const FALLBACK_GAVETA_NAME = 'Minhas contas';

// Exclui qualquer gaveta, inclusive a aberta: abre outra antes (ou cria uma vazia, se era a última).
// Devolve a gaveta que ficou aberta.
export async function deleteGaveta(profileId: string): Promise<string> {
  if (profileId === getCurrentProfile()) {
    const other = listProfiles().find(p => p.id !== profileId);
    const nextId = other?.id ?? createProfile({ name: FALLBACK_GAVETA_NAME, color: PROFILE_COLORS[0], icon: 'initial' });
    switchProfile(nextId);
  }
  await deleteProfile(profileId);
  return getCurrentProfile();
}
