import * as SQLite from 'expo-sqlite';

// Registro global dos perfis. Cada perfil continua com seu proprio banco (scanner_<id>.db);
// aqui ficam so os dados do perfil em si e qual esta ativo.

export type Profile = {
  id: string;
  name: string;
  color: string;
  icon: string;          // nome de icone do MaterialCommunityIcons; 'initial' = inicial do nome
  photoUri: string | null;
  pinHash: string | null;
  pinSalt: string | null;
  sortOrder: number;
  createdAt: string;
  vaultId: string | null;  // cofre na nuvem; null enquanto o perfil não sincroniza
  role: ProfileRole;       // papel do usuário neste cofre
};

// Visualizador vê; Pagador vê e marca como pago; Editor também edita; Dono também gerencia membros
export type ProfileRole = 'owner' | 'editor' | 'payer' | 'viewer';

export function canPay(role: ProfileRole): boolean {
  return role !== 'viewer';
}

export function canEdit(role: ProfileRole): boolean {
  return role === 'owner' || role === 'editor';
}

export function canManageMembers(role: ProfileRole): boolean {
  return role === 'owner';
}

export const PROFILE_COLORS = ['#00d4ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#ff7eb6', '#ffa657', '#79c0ff', '#e5e5e5', '#8a8a8a'];

export const PROFILE_ICONS = [
  'initial', 'account', 'face-woman', 'face-man', 'human-female', 'human-male',
  'home-heart', 'briefcase', 'school', 'heart', 'star', 'paw',
];

export const MAX_PROFILE_NAME = 20;

// Perfis que existiam antes do registro: mesmos ids, para continuar usando scanner_yuri.db e scanner_mae.db
const LEGACY_PROFILES = [
  { id: 'yuri', name: 'Yuri', color: PROFILE_COLORS[0], icon: 'initial' },
  { id: 'mae', name: 'Mãe', color: PROFILE_COLORS[5], icon: 'initial' },
];

let registry: SQLite.SQLiteDatabase | null = null;

const REGISTRY_VERSION = 1;

// v1: vínculo com o cofre na nuvem e papel do usuário (perfis existentes são do próprio usuário: dono)
function migrateRegistry(target: SQLite.SQLiteDatabase) {
  const version = target.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (version >= REGISTRY_VERSION) return;
  try {
    target.execSync(`
      BEGIN;
      ALTER TABLE profiles ADD COLUMN vaultId TEXT;
      ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
      PRAGMA user_version = ${REGISTRY_VERSION};
      COMMIT;
    `);
  } catch (e) {
    try { target.execSync('ROLLBACK;'); } catch {}
    throw e;
  }
}

function reg(): SQLite.SQLiteDatabase {
  if (registry) return registry;
  registry = SQLite.openDatabaseSync('control_app.db');
  registry.execSync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      photoUri TEXT,
      pinHash TEXT,
      pinSalt TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  migrateRegistry(registry);
  const count = registry.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM profiles');
  if (!count || count.n === 0) {
    const now = new Date().toISOString();
    LEGACY_PROFILES.forEach((p, i) => {
      registry!.runSync(
        'INSERT OR IGNORE INTO profiles (id, name, color, icon, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        p.id, p.name, p.color, p.icon, i, now,
      );
    });
  }
  return registry;
}

export function listProfiles(): Profile[] {
  return reg().getAllSync<Profile>('SELECT * FROM profiles ORDER BY sortOrder, createdAt') ?? [];
}

export function getProfile(id: string): Profile | null {
  return reg().getFirstSync<Profile>('SELECT * FROM profiles WHERE id = ?', id) ?? null;
}

// Id seguro para nome de arquivo (vira scanner_<id>.db)
function newProfileId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeProfileName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_PROFILE_NAME);
}

export function createProfile(data: { name: string; color: string; icon: string }): string {
  const id = newProfileId();
  const max = reg().getFirstSync<{ m: number | null }>('SELECT MAX(sortOrder) AS m FROM profiles');
  reg().runSync(
    'INSERT INTO profiles (id, name, color, icon, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    id, normalizeProfileName(data.name), data.color, data.icon, (max?.m ?? -1) + 1, new Date().toISOString(),
  );
  return id;
}

type EditableFields = Partial<Pick<Profile, 'name' | 'color' | 'icon' | 'photoUri' | 'pinHash' | 'pinSalt'>>;

const EDITABLE_COLUMNS = new Set(['name', 'color', 'icon', 'photoUri', 'pinHash', 'pinSalt']);

export function updateProfile(id: string, fields: EditableFields): void {
  // Colunas vêm de uma lista fixa: nunca monta SQL com chave arbitrária
  const entries = Object.entries(fields)
    .filter(([k, v]) => EDITABLE_COLUMNS.has(k) && v !== undefined) as [string, string | null][];
  if (entries.length === 0) return;
  const values = entries.map(([k, v]) => (k === 'name' && typeof v === 'string' ? normalizeProfileName(v) : v));
  reg().runSync(
    `UPDATE profiles SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...values, id,
  );
}

export function deleteProfileRecord(id: string): void {
  reg().runSync('DELETE FROM profiles WHERE id = ?', id);
}

// Liga o perfil a um cofre já criado na nuvem
export function linkProfileVault(id: string, vaultId: string, role: ProfileRole): void {
  reg().runSync('UPDATE profiles SET vaultId = ?, role = ? WHERE id = ?', vaultId, role, id);
}

// Perfil volta a ser só deste celular (e de quem é dono dele aqui)
export function unlinkProfileVault(id: string): void {
  reg().runSync("UPDATE profiles SET vaultId = NULL, role = 'owner' WHERE id = ?", id);
}

export function getActiveProfileId(): string {
  try {
    const row = reg().getFirstSync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'active_profile'");
    if (row && getProfile(row.value)) return row.value;
    return listProfiles()[0]?.id ?? LEGACY_PROFILES[0].id;
  } catch {
    return LEGACY_PROFILES[0].id;
  }
}

export function setActiveProfileId(id: string): void {
  reg().runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_profile', ?)", id);
}

// ---- Ajustes do app (do perfil único da pessoa), no registro global ----
// No modelo novo há um perfil só (a pessoa, que pode ligar a conta Google) e várias gavetas.
// No código, cada gaveta continua sendo um "profile" (registro + banco próprio); o perfil da
// pessoa e os ajustes que valem para o app todo ficam aqui, em app_settings.

export function getAppSetting(key: string, fallback: string): string {
  const row = reg().getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setAppSetting(key: string, value: string | null): void {
  if (value === null) reg().runSync('DELETE FROM app_settings WHERE key = ?', key);
  else reg().runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', key, value);
}
