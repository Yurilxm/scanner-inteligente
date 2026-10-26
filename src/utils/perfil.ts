// Perfil único da pessoa: nome, foto, PIN do app e ajustes que valem para todas as gavetas
// (tema, lembretes, privacidade). As gavetas (no código, "profiles") têm só nome, cor, ícone e contas.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { getProfileSettings } from '../db/database';
import {
  PROFILE_COLORS, getActiveProfileId, getAppSetting, getProfile, listProfiles, setAppSetting, updateProfile,
} from '../db/profiles';
import { DEFAULT_THEME } from '../theme';
import { forgetUnlocked, hashPin, isUnlocked, markUnlocked, newSalt, pinLockRemaining, verifyPin } from './pin';

// Ajustes do app (antes ficavam em cada perfil)
export const APP_SETTING_DEFAULTS = {
  theme: DEFAULT_THEME as string,
  notifications_enabled: 'true',
  notification_days_before: '5',
  notification_frequency: 'once',
  use_biometrics: 'false',
  cnpj_lookup_enabled: 'false',
};
export type AppSettingKey = keyof typeof APP_SETTING_DEFAULTS;

export function appSetting(key: AppSettingKey): string {
  return getAppSetting(key, APP_SETTING_DEFAULTS[key]);
}

export function setAppSettingValue(key: AppSettingKey, value: string): void {
  setAppSetting(key, value);
}

// ---- Dados da pessoa ----

export type Perfil = { name: string; color: string; icon: string; photoUri: string | null; hasPin: boolean };

const KEY = {
  name: 'perfil_name',
  color: 'perfil_color',
  icon: 'perfil_icon',
  photo: 'perfil_photo',
  pinHash: 'perfil_pin_hash',
  pinSalt: 'perfil_pin_salt',
  version: 'perfil_version',
};

// O PIN do app usa a mesma proteção contra tentativas do PIN antigo, com um id próprio
const PIN_ID = '__app__';

export function getPerfil(): Perfil {
  return {
    name: getAppSetting(KEY.name, 'Eu'),
    color: getAppSetting(KEY.color, PROFILE_COLORS[0]),
    icon: getAppSetting(KEY.icon, 'initial'),
    photoUri: getAppSetting(KEY.photo, '') || null,
    hasPin: !!getAppSetting(KEY.pinHash, ''),
  };
}

export function updatePerfil(fields: Partial<Pick<Perfil, 'name' | 'color' | 'icon'>>): void {
  if (fields.name !== undefined) setAppSetting(KEY.name, fields.name.trim() || 'Eu');
  if (fields.color !== undefined) setAppSetting(KEY.color, fields.color);
  if (fields.icon !== undefined) setAppSetting(KEY.icon, fields.icon);
}

const PHOTOS_DIR = `${FileSystem.documentDirectory}profiles/`;

async function deleteQuietly(uri: string | null | undefined) {
  if (!uri) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

// Reduz a foto para avatar (512px) e guarda na pasta do app; apaga a anterior
export async function savePerfilPhoto(sourceUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  const resized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 512 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const dest = `${PHOTOS_DIR}perfil_${Date.now()}.jpg`;
  await FileSystem.moveAsync({ from: resized.uri, to: dest });
  const previous = getPerfil().photoUri;
  setAppSetting(KEY.photo, dest);
  await deleteQuietly(previous);
  return dest;
}

export async function removePerfilPhoto(): Promise<void> {
  const previous = getPerfil().photoUri;
  setAppSetting(KEY.photo, null);
  await deleteQuietly(previous);
}

// ---- PIN do app (pedido ao abrir) ----

export function needsAppPin(): boolean {
  return getPerfil().hasPin && !isUnlocked(PIN_ID);
}

// null se deu certo; senão a mensagem para mostrar
export function tryUnlockApp(pin: string): string | null {
  const hash = getAppSetting(KEY.pinHash, '');
  const salt = getAppSetting(KEY.pinSalt, '');
  if (!hash || !salt) {
    markUnlocked(PIN_ID);
    return null;
  }
  const waitMessage = (ms: number) => `Muitas tentativas. Aguarde ${Math.ceil(ms / 1000)}s.`;
  const before = pinLockRemaining(PIN_ID);
  if (before > 0) return waitMessage(before);
  if (verifyPin(PIN_ID, pin, salt, hash)) {
    markUnlocked(PIN_ID);
    return null;
  }
  const after = pinLockRemaining(PIN_ID);
  return after > 0 ? waitMessage(after) : 'PIN incorreto.';
}

// null remove o PIN
export function setAppPin(pin: string | null): void {
  if (pin === null) {
    setAppSetting(KEY.pinHash, null);
    setAppSetting(KEY.pinSalt, null);
    forgetUnlocked(PIN_ID);
    return;
  }
  const salt = newSalt();
  setAppSetting(KEY.pinHash, hashPin(pin, salt));
  setAppSetting(KEY.pinSalt, salt);
  markUnlocked(PIN_ID); // quem acabou de definir já está dentro
}

// ---- Migração do modelo antigo (vários perfis) para perfil único + gavetas ----
// Roda uma vez. O perfil ativo empresta nome, cor, ícone, foto, PIN e ajustes ao perfil da pessoa;
// cada perfil antigo vira uma gaveta (sem PIN). O vínculo com a nuvem fica: os cofres antigos foram
// apagados no servidor e a sincronização desliga sozinha a gaveta cujo cofre não existe mais.
// (Desligar aqui pegava também gavetas aceitas logo antes de a atualização entrar.)
export function migrateToSinglePerfil(): boolean {
  if (getAppSetting(KEY.version, '') === '1') return false;
  const active = getProfile(getActiveProfileId()) ?? listProfiles()[0] ?? null;
  if (active) {
    setAppSetting(KEY.name, active.name);
    setAppSetting(KEY.color, active.color);
    setAppSetting(KEY.icon, active.icon);
    if (active.photoUri) setAppSetting(KEY.photo, active.photoUri);
    if (active.pinHash && active.pinSalt) {
      setAppSetting(KEY.pinHash, active.pinHash);
      setAppSetting(KEY.pinSalt, active.pinSalt);
    }
    const settings = getProfileSettings(active.id, APP_SETTING_DEFAULTS);
    for (const key of Object.keys(APP_SETTING_DEFAULTS) as AppSettingKey[]) setAppSetting(key, settings[key]);
  }
  for (const gaveta of listProfiles()) {
    // A foto passou a ser do perfil da pessoa; gavetas usam ícone e cor
    updateProfile(gaveta.id, { pinHash: null, pinSalt: null, photoUri: null });
    forgetUnlocked(gaveta.id);
  }
  setAppSetting(KEY.version, '1');
  return true;
}
