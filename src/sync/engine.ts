// Liga um perfil a um cofre e sincroniza contas, pagamentos, aprendizado e fotos.
import * as ExpoCrypto from 'expo-crypto';
import {
  commitSync, documentExistsInProfile, getCurrentProfile, getProfileSettings, loadSyncSnapshot, resetSyncState, setProfileSettings,
} from '../db/database';
import {
  PROFILE_COLORS, Profile, createProfile, getProfile, linkProfileVault, listProfiles, unlinkProfileVault, updateProfile,
} from '../db/profiles';
import { cancelDueDateReminders, notifyNow, syncDueDateReminders } from '../utils/notifications';
import { currentSession } from './auth';
import { Identity, Keyring, contexts, newVaultKey, openJson, openKeyring, sealJson, unwrapKey, wrapKey } from './crypto';
import { loadIdentity } from './identity';
import { SyncRole, VaultMeta, matchProfileForVault, planMetaSync } from './model';
import {
  GAVETA_ACTIVITY_SETTING, GAVETA_MEMBERS_SETTING, GAVETA_NOTIFIED_SETTING, GAVETA_OWNER_SETTING, GAVETA_REVIEWED_SETTING,
  GAVETA_REVIEW_SETTING, GAVETA_SYNC_ERROR_SETTING, parseIdList,
} from './roles';
import { activityToNotify, reviewQueue } from './sharingCore';
import { photos } from './photos';
import './random';
import { remote } from './remote';
import { runSync, shouldCommit } from './runSync';
import { isSupabaseConfigured } from './supabase';
import { StoredVaultKey, allKeys, forgetVaultKey, readVaultKey, saveVaultKey } from './vaultKey';

export type { SyncReport, VaultMeta } from './model';


type Session = NonNullable<Awaited<ReturnType<typeof currentSession>>>;

function displayName(session: Session): string {
  const meta = session.user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name?.trim() || meta?.name?.trim() || (session.user.email ?? '').split('@')[0];
}

// Acerta nome, cor e ícone da gaveta: o dono manda os dele; os outros seguem o do dono
async function syncVaultMeta(profile: Profile, vaultId: string, key: Uint8Array, role: SyncRole, ownerName: string) {
  const vault = await remote.getVault(vaultId);
  if (!vault) return;
  const current = vault.encryptedMeta ? openJson<VaultMeta>(key, vault.encryptedMeta, contexts.vaultMeta(vaultId)) : null;
  const plan = planMetaSync({
    role,
    local: { name: profile.name, color: profile.color, icon: profile.icon },
    remote: current,
    ownerName,
    otherLocalNames: listProfiles().filter(p => p.id !== profile.id).map(p => p.name),
  });
  if (plan.push) await remote.setVaultMeta(vaultId, sealJson(key, plan.push, contexts.vaultMeta(vaultId)));
  if (plan.local) updateProfile(profile.id, plan.local);
  if (role !== 'owner' && current?.ownerName) setProfileSettings(profile.id, { [GAVETA_OWNER_SETTING]: current.ownerName });
}

export function newId(): string {
  const bytes = ExpoCrypto.getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Member = { wrappedKey: string; keyVersion: number; role: SyncRole };

// Abre a chave atual do cofre (e as antigas, se a chave já foi trocada) e guarda no chaveiro.
// null = esta conta não participa mais do cofre.
export async function openVault(
  userId: string, vaultId: string, identity: Identity, known?: Member,
): Promise<{ stored: StoredVaultKey; role: SyncRole } | null> {
  const member = known ?? await remote.getMember(vaultId, userId);
  if (!member) return null;
  const stored = await readVaultKey(userId, vaultId);
  if (stored && stored.version === member.keyVersion) return { stored, role: member.role };

  const key = unwrapKey(identity, member.wrappedKey, contexts.vaultKey(vaultId, userId, member.keyVersion));
  let previous: Keyring = stored ? allKeys(stored) : {};
  if (member.keyVersion > 1) {
    const vault = await remote.getVault(vaultId);
    if (vault?.keyring) {
      previous = { ...previous, ...openKeyring(key, vault.keyring, contexts.keyring(vaultId, member.keyVersion)) };
    }
  }
  delete previous[member.keyVersion];
  const next: StoredVaultKey = { version: member.keyVersion, key, previous };
  await saveVaultKey(userId, vaultId, next);
  return { stored: next, role: member.role };
}

export async function requireReady() {
  if (!isSupabaseConfigured()) throw new Error('Sincronização não configurada nesta versão do app.');
  const session = await currentSession();
  if (!session) throw new Error('Entre com o Google antes de sincronizar.');
  const identity = await loadIdentity(session.user.id);
  if (!identity) throw new Error('Crie ou digite a frase de recuperação antes de sincronizar.');
  return { userId: session.user.id, email: session.user.email ?? '', identity };
}

// Desliga o perfil da nuvem neste celular; as contas continuam aqui
export async function detachProfile(profileId: string, userId: string, vaultId: string): Promise<void> {
  unlinkProfileVault(profileId);
  resetSyncState(profileId);
  await forgetVaultKey(userId, vaultId);
}

// Guarda quem participa (para a tela de Gavetas) e avisa no celular o que os outros fizeram
async function syncMembersAndActivity(profile: Profile, vaultId: string, keys: Keyring, userId: string) {
  const members = await remote.listMembers(vaultId);
  const cached = members.map(m => ({ name: m.name, role: m.role, me: m.userId === userId }));
  const settings = getProfileSettings(profile.id, {
    [GAVETA_ACTIVITY_SETTING]: '', [GAVETA_REVIEWED_SETTING]: '[]', [GAVETA_NOTIFIED_SETTING]: '[]',
  });
  const seenRaw = settings[GAVETA_ACTIVITY_SETTING];
  const rows = await remote.history(vaultId, null, 50);
  const { notify, lastSeen } = activityToNotify(rows, keys, vaultId, userId, seenRaw ? Number(seenRaw) : null);

  // Contas novas de outras pessoas: fila de revisão (Aceitar / Recusar) e um aviso por conta, uma vez só
  const reviewed = new Set(parseIdList(settings[GAVETA_REVIEWED_SETTING]));
  const queue = reviewQueue(rows, keys, vaultId, userId, reviewed, id => documentExistsInProfile(profile.id, id));
  const notified = parseIdList(settings[GAVETA_NOTIFIED_SETTING]);
  const freshReviews = queue.filter(item => !notified.includes(item.docId));

  setProfileSettings(profile.id, {
    [GAVETA_MEMBERS_SETTING]: JSON.stringify(cached),
    [GAVETA_REVIEW_SETTING]: JSON.stringify(queue),
    [GAVETA_NOTIFIED_SETTING]: JSON.stringify([...notified, ...freshReviews.map(i => i.docId)].slice(-500)),
    ...(lastSeen !== null ? { [GAVETA_ACTIVITY_SETTING]: String(lastSeen) } : {}),
  });

  const texts = [...freshReviews.map(i => `${i.text}. Toque no sininho para aceitar ou recusar.`), ...notify.map(e => e.text)];
  // Muitas novidades de uma vez viram um aviso só
  if (texts.length > 3) {
    await notifyNow(profile.name, `${texts.length} novidades: ${texts[0]} e mais.`, { profile: profile.id });
  } else {
    for (const text of texts) await notifyNow(profile.name, text, { profile: profile.id });
  }
}

export class RemovedFromVault extends Error {
  constructor(profileName: string) {
    super(`Você não participa mais de "${profileName}". As contas que já estavam aqui ficaram só neste celular.`);
  }
}

export async function syncProfile(profileId: string) {
  const profile = getProfile(profileId);
  if (!profile?.vaultId) return null;
  if (!isSupabaseConfigured()) return null;
  const session = await currentSession();
  if (!session) return null;
  const identity = await loadIdentity(session.user.id);
  if (!identity) return null;

  const vaultId = profile.vaultId;
  const opened = await openVault(session.user.id, vaultId, identity);
  if (!opened) {
    await detachProfile(profileId, session.user.id, vaultId);
    throw new RemovedFromVault(profile.name);
  }
  // O dono pode ter mudado o papel desta pessoa em outro aparelho
  if (opened.role !== profile.role) linkProfileVault(profileId, vaultId, opened.role);
  // Nome da gaveta: falha aqui não pode impedir as contas de sincronizar
  try {
    await syncVaultMeta(profile, vaultId, opened.stored.key, opened.role, displayName(session));
  } catch (e) {
    console.warn('Nome da gaveta', e);
  }

  const snapshot = loadSyncSnapshot(profileId);
  const { commit, report } = await runSync({
    snapshot,
    role: opened.role,
    vaultId,
    key: opened.stored.key,
    keyVersion: opened.stored.version,
    previousKeys: opened.stored.previous,
    remote,
    photos,
  });
  if (shouldCommit(commit, snapshot.cursor)) commitSync(profileId, commit);
  // Depois de gravar as contas: a fila de revisão confere se cada conta nova já está neste celular
  try {
    await syncMembersAndActivity(profile, vaultId, allKeys(opened.stored), session.user.id);
  } catch (e) {
    console.warn('Membros da gaveta', e);
  }
  if (profileId === getCurrentProfile()) {
    for (const item of report.reminders) {
      if (item.deleted) await cancelDueDateReminders(item.id);
      else await syncDueDateReminders(item);
    }
  }
  return report;
}

export async function syncActiveProfile() {
  return syncProfile(getCurrentProfile());
}

// Cria o cofre deste perfil (se ainda não existir) e envia o que já está no celular.
export async function enableProfileSync(profileId: string) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error('Gaveta não encontrada.');
  if (profile.vaultId) return syncProfile(profileId);
  if (profile.role !== 'owner' && profile.role !== 'editor') {
    throw new Error('Esta gaveta só pode ir para a nuvem por quem pode editá-la.');
  }
  const { userId, identity } = await requireReady();
  const vaultId = newId();
  const key = newVaultKey();
  const version = 1;
  await remote.createVault({
    id: vaultId,
    ownerId: userId,
    userId,
    keyVersion: version,
    encryptedMeta: sealJson(key, { name: profile.name, color: profile.color, icon: profile.icon }, contexts.vaultMeta(vaultId)),
    wrappedKey: wrapKey(identity.publicKey, key, contexts.vaultKey(vaultId, userId, version)),
  });
  await saveVaultKey(userId, vaultId, { version, key });
  linkProfileVault(profileId, vaultId, 'owner');
  return syncProfile(profileId);
}

// Cria o perfil local de um cofre (gaveta própria vinda de outro celular, ou compartilhada)
export function createProfileForVault(meta: VaultMeta, vaultId: string, role: SyncRole, matchByName: boolean): string {
  // Já existe uma gaveta ligada a este cofre neste celular: usa ela (nada de cópias duplicadas)
  const linked = listProfiles().find(p => p.vaultId === vaultId);
  if (linked) {
    if (linked.role !== role) linkProfileVault(linked.id, vaultId, role);
    return linked.id;
  }
  const name = meta.name?.trim() || 'Gaveta';
  const existing = matchByName ? matchProfileForVault(listProfiles(), name) : null;
  const profileId = existing ?? createProfile({
    name,
    color: meta.color || PROFILE_COLORS[0],
    icon: meta.icon || 'initial',
  });
  linkProfileVault(profileId, vaultId, role);
  return profileId;
}

// Cópia local desligada de uma gaveta compartilhada: sem nuvem, com o mesmo dono registrado e o mesmo
// nome. Gavetas pessoais nunca têm "quem compartilhou", então nunca são religadas a uma gaveta alheia.
export function findDetachedCopy(meta: VaultMeta): Profile | null {
  const name = meta.name?.trim().toLowerCase();
  const owner = meta.ownerName?.trim();
  if (!name || !owner) return null;
  return listProfiles().find(p => {
    if (p.vaultId) return false;
    const savedOwner = getProfileSettings(p.id, { [GAVETA_OWNER_SETTING]: '' })[GAVETA_OWNER_SETTING];
    if (savedOwner !== owner) return false;
    const local = p.name.toLowerCase();
    return local === name || local === `${name} (${owner.toLowerCase()})`;
  }) ?? null;
}

// No segundo celular, traz os perfis que esta conta já tem na nuvem.
export async function adoptRemoteVaults(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const session = await currentSession();
  if (!session) return 0;
  const identity = await loadIdentity(session.user.id);
  if (!identity) return 0;

  const mine = await remote.listMine(session.user.id);
  let adopted = 0;
  for (const member of mine) {
    if (listProfiles().some(p => p.vaultId === member.vaultId)) continue;
    // Um cofre com problema (ex.: chave que não abre) não impede os outros de serem trazidos
    let opened;
    try {
      opened = await openVault(session.user.id, member.vaultId, identity, member);
    } catch (e) {
      console.warn('Gaveta da nuvem', member.vaultId, e);
      continue;
    }
    if (!opened) continue;
    const meta = member.encryptedMeta
      ? openJson<VaultMeta>(opened.stored.key, member.encryptedMeta, contexts.vaultMeta(member.vaultId))
      : {};
    // Gaveta de outra pessoa que este celular já teve e foi desligada da nuvem (ex.: pela migração
    // do modelo de gavetas): religa a mesma cópia, e o que foi adicionado nela sobe para os outros
    const detached = member.role !== 'owner' ? findDetachedCopy(meta) : null;
    if (detached) {
      linkProfileVault(detached.id, member.vaultId, member.role);
    } else {
      // Só junta com uma gaveta local de mesmo nome se ela é desta pessoa (outro celular dela);
      // uma gaveta compartilhada por outra pessoa vira sempre uma gaveta nova
      createProfileForVault(meta, member.vaultId, member.role, member.role === 'owner');
    }
    adopted += 1;
  }
  return adopted;
}

// Várias telas pedem sincronização ao abrir (inicial, sininho, gavetas): quem chega com uma rodada
// em andamento espera a mesma, em vez de rodar outra em paralelo gravando por cima
let allSyncInFlight: ReturnType<typeof runAllProfiles> | null = null;

export function syncAllProfiles() {
  if (!allSyncInFlight) {
    allSyncInFlight = runAllProfiles().finally(() => { allSyncInFlight = null; });
  }
  return allSyncInFlight;
}

async function runAllProfiles() {
  try {
    await adoptRemoteVaults();
  } catch (e) {
    console.warn('Gavetas da nuvem', e); // sem trazer as novas, as já ligadas sincronizam mesmo assim
  }
  const reports = [];
  let firstError: unknown = null;
  for (const profile of listProfiles()) {
    if (!profile.vaultId) continue;
    // Uma gaveta com problema não impede as outras; o erro fica guardado para a tela de Gavetas mostrar
    try {
      const report = await syncProfile(profile.id);
      if (report) reports.push(report);
      if (getProfile(profile.id)) setProfileSettings(profile.id, { [GAVETA_SYNC_ERROR_SETTING]: '' });
    } catch (e) {
      firstError ??= e;
      const message = e instanceof Error ? e.message : String(e);
      if (getProfile(profile.id)) setProfileSettings(profile.id, { [GAVETA_SYNC_ERROR_SETTING]: message.slice(0, 300) });
    }
  }
  if (firstError) throw firstError;
  return reports;
}
