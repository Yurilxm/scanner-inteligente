// Gaveta da família: convite por QR, entrada, troca de chave ao remover alguém e histórico.
// Recebe o servidor como parâmetro (SharingRemote) para dar para testar sem rede.

import {
  Identity, Keyring, contexts, decodeBase64, inviteKeys, inviteLink, inviteTokenHash, newInviteSecret,
  openInviteVaultKey, openJson, parseInviteLink, sealInviteVaultKey, sealJson, sealKeyring, unwrapKey, wrapKey,
} from './crypto';
import type { NotePayload, VaultMeta } from './model';
import type { HistoryRow, MemberRow, SharingRemote } from './remote';
import { GuestRole, roleLabel } from './roles';
import { StoredVaultKey, allKeys } from './vaultKey';

export type { VaultMeta };

// ---- Convidar ----

export async function createInvite(
  remote: SharingRemote,
  input: { vaultId: string; stored: StoredVaultKey; role: GuestRole; newId: () => string },
): Promise<{ inviteId: string; link: string; expiresAt: string }> {
  const inviteId = input.newId();
  const secret = newInviteSecret();
  const { authToken, key } = inviteKeys(secret);
  const expiresAt = await remote.createInvite({
    id: inviteId,
    vaultId: input.vaultId,
    role: input.role,
    tokenHash: inviteTokenHash(authToken),
    wrappedVaultKey: sealInviteVaultKey(key, input.stored.key, contexts.invite(inviteId, input.vaultId, input.stored.version)),
    keyVersion: input.stored.version,
  });
  return { inviteId, link: inviteLink(inviteId, secret), expiresAt };
}

// ---- Entrar pelo QR ----

export type InvitePreview = {
  inviteId: string;
  authToken: string;
  vaultId: string;
  role: GuestRole;
  keyVersion: number;
  expiresAt: string;
  inviterName: string | null;
  meta: VaultMeta;
  vaultKey: Uint8Array;
};

export class NotAnInvite extends Error {
  constructor() {
    super('Este QR não é um convite do Control.');
  }
}

// Confere o convite no servidor e abre a chave da gaveta com a chave que veio no QR
export async function previewInvite(remote: SharingRemote, link: string): Promise<InvitePreview> {
  const parsed = parseInviteLink(link);
  if (!parsed) throw new NotAnInvite();
  const { authToken, key } = inviteKeys(parsed.secret);
  const peek = await remote.peekInvite(parsed.inviteId, authToken);
  const vaultKey = openInviteVaultKey(key, peek.wrappedVaultKey, contexts.invite(parsed.inviteId, peek.vaultId, peek.keyVersion));
  const meta = peek.encryptedMeta
    ? openJson<VaultMeta>(vaultKey, peek.encryptedMeta, contexts.vaultMeta(peek.vaultId))
    : {};
  return {
    inviteId: parsed.inviteId,
    authToken,
    vaultId: peek.vaultId,
    role: peek.role,
    keyVersion: peek.keyVersion,
    expiresAt: peek.expiresAt,
    inviterName: peek.inviterName,
    meta,
    vaultKey,
  };
}

// Entra na gaveta guardando a chave dela embrulhada para a própria chave pública
export async function acceptInvite(
  remote: SharingRemote, identity: Identity, userId: string, preview: InvitePreview,
): Promise<StoredVaultKey> {
  const wrapped = wrapKey(identity.publicKey, preview.vaultKey, contexts.vaultKey(preview.vaultId, userId, preview.keyVersion));
  await remote.acceptInvite(preview.inviteId, preview.authToken, wrapped);
  return { version: preview.keyVersion, key: preview.vaultKey };
}

// ---- Remover alguém (com troca de chave) ----

// O dono gera a chave nova, embrulha para cada um que fica e guarda as antigas no chaveiro.
// Quem saiu não recebe a chave nova: o que for gravado daqui em diante fica fora do alcance dele.
export async function removeMember(
  remote: SharingRemote,
  input: { vaultId: string; removeUserId: string; stored: StoredVaultKey; newKey: Uint8Array },
): Promise<StoredVaultKey> {
  const { vaultId, removeUserId, stored, newKey } = input;
  const members = await remote.listMembers(vaultId);
  const staying = members.filter(m => m.userId !== removeUserId);
  if (staying.length === members.length) throw new Error('Esta pessoa já não participa da gaveta.');

  const version = stored.version + 1;
  const publicKeys = await remote.publicKeys(staying.map(m => m.userId));
  const wraps = staying.map(m => {
    const publicKey = publicKeys[m.userId];
    if (!publicKey) throw new Error(`Não foi possível achar a chave de ${m.name}.`);
    return {
      user_id: m.userId,
      wrapped_key: wrapKey(decodeBase64(publicKey), newKey, contexts.vaultKey(vaultId, m.userId, version)),
    };
  });

  const previous = allKeys(stored);
  const vault = await remote.getVault(vaultId);
  const meta = vault?.encryptedMeta
    ? openJson<VaultMeta>(stored.key, vault.encryptedMeta, contexts.vaultMeta(vaultId))
    : {};

  await remote.removeMemberRotate({
    vaultId,
    userId: removeUserId,
    keyVersion: version,
    keyring: sealKeyring(newKey, previous, contexts.keyring(vaultId, version)),
    encryptedMeta: sealJson(newKey, meta, contexts.vaultMeta(vaultId)),
    wraps,
  });
  return { version, key: newKey, previous };
}

// ---- Histórico ----

export type HistoryEntry = { id: number; at: string; icon: string; text: string };

const lowerFirst = (text: string) => (text ? text[0].toLocaleLowerCase('pt-BR') + text.slice(1) : text);

// O resumo de cada alteração vem cifrado com a chave da época: tenta todas as conhecidas
function openNote(keys: Keyring, vaultId: string, row: HistoryRow): NotePayload | null {
  if (!row.note || !row.recordKind || !row.recordId) return null;
  for (const key of Object.values(keys)) {
    try {
      return openJson<NotePayload>(key, row.note, contexts.note(vaultId, row.recordKind, row.recordId));
    } catch {
      // outra chave
    }
  }
  return null;
}

export function describeHistory(rows: HistoryRow[], keys: Keyring, vaultId: string, myId: string): HistoryEntry[] {
  const who = (id: string | null, name: string | null) => (id && id === myId ? 'Você' : name || 'Alguém');
  return rows.map(row => {
    const actor = who(row.actorId, row.actorName);
    const target = who(row.targetId, row.targetName);
    const entry = (icon: string, text: string): HistoryEntry => ({ id: row.id, at: row.at, icon, text });
    switch (row.action) {
      case 'create':
      case 'update':
      case 'payment':
      case 'delete': {
        const note = openNote(keys, vaultId, row);
        const fallback: Record<string, string> = {
          create: 'adicionou uma conta',
          update: 'editou uma conta',
          payment: 'atualizou um pagamento',
          delete: 'excluiu uma conta',
        };
        let text = note?.text ? lowerFirst(note.text) : fallback[row.action];
        if (row.action === 'create') text = text.replace(/^atualizou /, 'adicionou ');
        const icon = row.action === 'payment' ? 'cash-check' : row.action === 'delete' ? 'delete-outline'
          : row.recordKind === 'learned' ? 'school-outline' : 'file-document-edit-outline';
        return entry(icon, `${actor} ${text}`);
      }
      case 'member_add':
        if (row.note === 'owner') return entry('archive-outline', `${actor} criou a gaveta`);
        return entry('account-plus-outline', row.actorId === row.targetId
          ? `${target} entrou como ${roleLabel(row.note)}`
          : `${actor} adicionou ${target} como ${roleLabel(row.note)}`);
      case 'member_role': {
        const [from, to] = (row.note ?? '').split(' -> ');
        return entry('account-switch-outline', `${actor} mudou ${target} de ${roleLabel(from)} para ${roleLabel(to)}`);
      }
      case 'member_remove':
        return entry('account-remove-outline', row.actorId === row.targetId
          ? `${target} saiu da gaveta`
          : `${actor} removeu ${target}`);
      case 'key_rotate':
        return entry('key-change', 'A chave da gaveta foi trocada');
      case 'invite_create':
      case 'invite_revoke':
      case 'invite_decline':
        return describeInvite(row, actor, target, entry);
      default:
        return entry('information-outline', `${actor}: ${row.action}`);
    }
  });
}

// Convite por QR não tem destinatário; convite direto tem (targetId)
function describeInvite(
  row: HistoryRow, actor: string, target: string, entry: (icon: string, text: string) => HistoryEntry,
): HistoryEntry {
  const role = roleLabel(row.note);
  if (row.action === 'invite_decline') return entry('account-cancel-outline', `${target} recusou o convite (${role})`);
  if (row.action === 'invite_revoke') {
    return entry('qrcode-remove', row.targetId ? `Convite para ${target} (${role}) cancelado` : `Convite (${role}) cancelado`);
  }
  return entry(row.targetId ? 'email-fast-outline' : 'qrcode', row.targetId
    ? `${actor} convidou ${target} como ${role}`
    : `${actor} criou um convite por QR (${role})`);
}

export type { MemberRow };

// ---- Convite direto pelo e-mail (aparece no sininho de quem foi convidado) ----

export class NotOnControl extends Error {
  constructor(readonly email: string) {
    super(`${email} ainda não usa o Control (ou nunca criou a frase de recuperação). Peça para a pessoa entrar no app uma vez, ou convide pelo QR code.`);
  }
}

// O dono embrulha a chave da gaveta para a chave pública da pessoa: o mesmo embrulho de um membro,
// então ao aceitar ela já entra com a chave certa. O servidor não abre nada.
export async function inviteByEmail(
  remote: SharingRemote,
  input: { vaultId: string; stored: StoredVaultKey; email: string; role: GuestRole; myId: string },
): Promise<{ name: string; expiresAt: string }> {
  const email = input.email.trim();
  const user = await remote.findUserByEmail(email);
  if (!user) throw new NotOnControl(email);
  if (user.userId === input.myId) throw new Error('Esse é o seu próprio e-mail.');
  const wrappedKey = wrapKey(
    decodeBase64(user.publicKey), input.stored.key, contexts.vaultKey(input.vaultId, user.userId, input.stored.version),
  );
  const expiresAt = await remote.createDirectInvite({
    vaultId: input.vaultId, inviteeId: user.userId, role: input.role, wrappedKey, keyVersion: input.stored.version,
  });
  return { name: user.name, expiresAt };
}

export type PendingInvite = {
  id: string;
  vaultId: string;
  role: GuestRole;
  keyVersion: number;
  expiresAt: string;
  inviterName: string | null;
  meta: VaultMeta;
  vaultKey: Uint8Array;
};

// Convites do sininho, já com o nome da gaveta aberto. Um embrulho que não abre com a minha
// identidade (chave trocada, frase de outra conta) é ignorado em vez de quebrar a lista.
export async function listMyInvites(remote: SharingRemote, identity: Identity, userId: string): Promise<PendingInvite[]> {
  const rows = await remote.myDirectInvites();
  return rows.flatMap(row => {
    try {
      const vaultKey = unwrapKey(identity, row.wrappedKey, contexts.vaultKey(row.vaultId, userId, row.keyVersion));
      const meta = row.encryptedMeta ? openJson<VaultMeta>(vaultKey, row.encryptedMeta, contexts.vaultMeta(row.vaultId)) : {};
      return [{
        id: row.id, vaultId: row.vaultId, role: row.role, keyVersion: row.keyVersion, expiresAt: row.expiresAt,
        inviterName: row.inviterName, meta, vaultKey,
      }];
    } catch {
      return [];
    }
  });
}

// Aceitar devolve a chave da gaveta para guardar; recusar devolve null
export async function answerInvite(remote: SharingRemote, invite: PendingInvite, accept: boolean): Promise<StoredVaultKey | null> {
  await remote.answerDirectInvite(invite.id, accept);
  return accept ? { version: invite.keyVersion, key: invite.vaultKey } : null;
}

// ---- Avisos de novidades da gaveta (notificação no celular) ----

// O que vale avisar quando quem fez foi outra pessoa
// (conta nova não entra aqui: vira item de revisão, com aviso próprio)
const NOTIFY_ACTIONS = new Set(['member_add', 'member_remove', 'invite_decline', 'update', 'payment', 'delete']);

// Ao adicionar uma conta, o celular de quem adicionou também envia uma "alteração" e o pagamento
// inicial (não paga) na mesma rodada, segundos depois. Esses ecos não viram aviso: o da conta nova
// já basta. Uma mudança de verdade (pagar minutos depois) passa da janela e avisa normalmente.
const CREATE_ECHO_MS = 60 * 1000;

function isCreateEcho(row: HistoryRow, creates: HistoryRow[]): boolean {
  if (row.action !== 'update' && row.action !== 'payment') return false;
  return creates.some(c => c.recordId === row.recordId && c.actorId === row.actorId
    && Math.abs(Date.parse(row.at) - Date.parse(c.at)) <= CREATE_ECHO_MS);
}

// Do histórico mais recente, o que é novo desde a última olhada e foi feito por outra pessoa.
// Na primeira vez numa gaveta só marca o ponto de partida (não avisa o passado todo).
export function activityToNotify(
  rows: HistoryRow[], keys: Keyring, vaultId: string, myId: string, lastSeen: number | null,
): { notify: HistoryEntry[]; lastSeen: number | null } {
  const newest = rows.reduce<number | null>((max, r) => (max === null || r.id > max ? r.id : max), lastSeen);
  if (lastSeen === null) return { notify: [], lastSeen: newest };
  const creates = rows.filter(r => r.action === 'create' && r.recordKind === 'document');
  const fresh = rows
    .filter(r => r.id > lastSeen && NOTIFY_ACTIONS.has(r.action) && r.actorId !== myId)
    .filter(r => r.action !== 'member_add' || r.note !== 'owner')
    .filter(r => !isCreateEcho(r, creates))
    .sort((a, b) => a.id - b.id);
  return { notify: describeHistory(fresh, keys, vaultId, myId), lastSeen: newest };
}

// ---- Contas novas para revisar (sininho: Aceitar / Recusar) ----

export type ReviewItem = { docId: string; historyId: number; at: string; actorName: string; text: string };

// Contas que outra pessoa adicionou e esta pessoa ainda não aceitou nem recusou. Vem direto do
// histórico (não de um marcador), então contas antigas que ninguém revisou também aparecem.
// `present` diz se a conta ainda existe neste celular (excluída não precisa de revisão).
export function reviewQueue(
  rows: HistoryRow[], keys: Keyring, vaultId: string, myId: string,
  reviewed: Set<string>, present: (docId: string) => boolean,
): ReviewItem[] {
  const creates = rows
    .filter(r => r.action === 'create' && r.recordKind === 'document' && r.recordId && r.actorId && r.actorId !== myId)
    .filter(r => !reviewed.has(r.recordId!) && present(r.recordId!))
    .sort((a, b) => a.id - b.id);
  const texts = describeHistory(creates, keys, vaultId, myId);
  return creates.map((r, i) => ({
    docId: r.recordId!, historyId: r.id, at: r.at, actorName: r.actorName || 'Alguém', text: texts[i].text,
  }));
}
