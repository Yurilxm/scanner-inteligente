import { supabase } from './supabase';
import { decodeBase64 } from './crypto';
import type { OutboundRecord, RemoteRecord, SyncRole } from './model';
import type { SyncRemote } from './runSync';
import type { GuestRole } from './roles';

// Erros conhecidos das funções do servidor, em português para a tela
const SERVER_ERRORS: Record<string, string> = {
  CONVITE_INVALIDO: 'Este convite não existe ou o QR está incompleto.',
  CONVITE_CANCELADO: 'Este convite foi cancelado por quem convidou.',
  CONVITE_JA_USADO: 'Este convite já foi usado. Peça um novo QR.',
  CONVITE_EXPIRADO: 'Este convite expirou. Peça um novo QR.',
  JA_E_MEMBRO: 'Você já participa desta gaveta.',
  SEM_ACESSO: 'Você não tem permissão para isso nesta gaveta.',
  DONO_NAO_SAI: 'O dono não pode ser removido da própria gaveta.',
  NAO_E_MEMBRO: 'Esta pessoa já não participa da gaveta.',
  MEMBROS_MUDARAM: 'Alguém entrou ou saiu agora mesmo. Tente de novo.',
  VERSAO_DA_CHAVE: 'A chave da gaveta mudou em outro aparelho. Tente de novo.',
  CONVITE_PARA_SI: 'Esse é o seu próprio e-mail.',
};

export class ServerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function serverError(prefix: string, error: { message: string }): Error {
  const code = Object.keys(SERVER_ERRORS).find(c => error.message.includes(c));
  return code ? new ServerError(code, SERVER_ERRORS[code]) : new Error(`${prefix}: ${error.message}`);
}

export type MemberRow = { userId: string; role: SyncRole; name: string; email: string; joinedAt: string };
export type InviteRow = { id: string; role: GuestRole; expiresAt: string; createdAt: string };
export type HistoryRow = {
  id: number; at: string; action: string; recordKind: string | null; recordId: string | null; note: string | null;
  actorId: string | null; actorName: string | null; targetId: string | null; targetName: string | null;
};
export type InvitePeek = {
  vaultId: string; role: GuestRole; wrappedVaultKey: string; keyVersion: number;
  expiresAt: string; encryptedMeta: string | null; inviterName: string | null;
};

export type DirectInvite = {
  id: string; vaultId: string; role: GuestRole; wrappedKey: string; keyVersion: number;
  expiresAt: string; encryptedMeta: string | null; inviterName: string | null;
};
export type SentInvite = { id: string; inviteeId: string; name: string; email: string; role: GuestRole; expiresAt: string };

// Parte do servidor usada pela gaveta da família (separada para os testes usarem um falso)
export type SharingRemote = {
  getMember(vaultId: string, userId: string): Promise<{ wrappedKey: string; keyVersion: number; role: SyncRole } | null>;
  getVault(vaultId: string): Promise<{ keyVersion: number; keyring: string | null; encryptedMeta: string | null } | null>;
  setVaultMeta(vaultId: string, encryptedMeta: string): Promise<void>;
  // Dono apaga a gaveta da nuvem: primeiro as fotos (o servidor não as apaga em cascata), depois o cofre
  deleteVault(vaultId: string): Promise<void>;
  listMembers(vaultId: string): Promise<MemberRow[]>;
  publicKeys(userIds: string[]): Promise<Record<string, string>>;
  setRole(vaultId: string, userId: string, role: GuestRole): Promise<void>;
  leave(vaultId: string, userId: string): Promise<void>;
  removeMemberRotate(input: {
    vaultId: string; userId: string; keyVersion: number; keyring: string; encryptedMeta: string;
    wraps: { user_id: string; wrapped_key: string }[];
  }): Promise<void>;
  // Validade padrão do servidor (24 h); devolve quando expira
  createInvite(input: {
    id: string; vaultId: string; role: GuestRole; tokenHash: string; wrappedVaultKey: string; keyVersion: number;
  }): Promise<string>;
  listInvites(vaultId: string): Promise<InviteRow[]>;
  revokeInvite(inviteId: string): Promise<void>;
  peekInvite(inviteId: string, token: string): Promise<InvitePeek>;
  acceptInvite(inviteId: string, token: string, wrappedKey: string): Promise<string>;
  history(vaultId: string, before: number | null, limit: number): Promise<HistoryRow[]>;
  findUserByEmail(email: string): Promise<{ userId: string; publicKey: string; name: string } | null>;
  createDirectInvite(input: { vaultId: string; inviteeId: string; role: GuestRole; wrappedKey: string; keyVersion: number }): Promise<string>;
  myDirectInvites(): Promise<DirectInvite[]>;
  answerDirectInvite(inviteId: string, accept: boolean): Promise<string>;
  sentDirectInvites(vaultId: string): Promise<SentInvite[]>;
  revokeDirectInvite(inviteId: string): Promise<void>;
};

const PAGE = 200;

function photoPath(vaultId: string, id: string): string {
  return `${vaultId}/${id}.bin`;
}

// O Blob do React Native não tem arrayBuffer(): lê pelo FileReader (data URL em base64)
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const withBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withBuffer.arrayBuffer === 'function') return new Uint8Array(await withBuffer.arrayBuffer());
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler a foto baixada.'));
    reader.readAsDataURL(blob);
  });
  return decodeBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Adapta o cliente do Supabase para a rodada de sincronização.
export const remote: SyncRemote & SharingRemote & {
  listMine(userId: string): Promise<{ vaultId: string; role: SyncRole; keyVersion: number; wrappedKey: string; encryptedMeta: string | null }[]>;
  createVault(input: { id: string; ownerId: string; encryptedMeta: string; userId: string; wrappedKey: string; keyVersion: number }): Promise<void>;
} = {
  async pull(vaultId, since) {
    const all: RemoteRecord[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase()
        .from('records')
        .select('kind, id, ciphertext, deleted, audit_note, key_version, updated_at')
        .eq('vault_id', vaultId)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Não foi possível baixar as contas: ${error.message}`);
      const rows = data ?? [];
      for (const row of rows) {
        all.push({
          kind: row.kind,
          id: row.id,
          ciphertext: row.ciphertext,
          deleted: row.deleted,
          auditNote: row.audit_note,
          keyVersion: row.key_version,
          updatedAt: row.updated_at,
        });
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  },

  async push(vaultId, rows: OutboundRecord[]) {
    if (rows.length === 0) return;
    const { error } = await supabase().from('records').upsert(rows.map(row => ({
      vault_id: vaultId,
      kind: row.kind,
      id: row.id,
      ciphertext: row.ciphertext,
      key_version: row.keyVersion,
      deleted: row.deleted,
      audit_note: row.auditNote,
    })), { onConflict: 'vault_id,kind,id' });
    if (error) throw new Error(`Não foi possível enviar as contas: ${error.message}`);
  },

  async getPhoto(vaultId, id) {
    const { data, error } = await supabase().storage.from('photos').download(photoPath(vaultId, id));
    if (error) {
      if (/not found|404/i.test(error.message)) return null;
      throw new Error(`Não foi possível baixar a foto: ${error.message}`);
    }
    return blobToBytes(data);
  },

  async putPhoto(vaultId, id, bytes) {
    const path = photoPath(vaultId, id);
    const { error } = await supabase().storage.from('photos').upload(path, asArrayBuffer(bytes), {
      upsert: true,
      contentType: 'application/octet-stream',
    });
    if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`);
  },

  async removePhoto(vaultId, id) {
    const { error } = await supabase().storage.from('photos').remove([photoPath(vaultId, id)]);
    if (error && !/not found|404/i.test(error.message)) {
      throw new Error(`Não foi possível apagar a foto da nuvem: ${error.message}`);
    }
  },

  async listMine(userId) {
    const { data, error } = await supabase()
      .from('vault_members')
      .select('vault_id, role, key_version, wrapped_key, vaults(encrypted_meta)')
      .eq('user_id', userId);
    if (error) throw new Error(`Não foi possível procurar suas gavetas na nuvem: ${error.message}`);
    return (data ?? []).map(row => {
      const vault = row.vaults as { encrypted_meta: string | null } | { encrypted_meta: string | null }[] | null;
      const meta = Array.isArray(vault) ? vault[0]?.encrypted_meta ?? null : vault?.encrypted_meta ?? null;
      return {
        vaultId: row.vault_id,
        role: row.role as SyncRole,
        keyVersion: row.key_version,
        wrappedKey: row.wrapped_key,
        encryptedMeta: meta,
      };
    });
  },

  async getMember(vaultId, userId) {
    const { data, error } = await supabase()
      .from('vault_members')
      .select('wrapped_key, key_version, role')
      .eq('vault_id', vaultId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível abrir a gaveta na nuvem: ${error.message}`);
    if (!data) return null;
    return { wrappedKey: data.wrapped_key, keyVersion: data.key_version, role: data.role };
  },

  async createVault(input) {
    const created = await supabase().from('vaults').insert({
      id: input.id,
      owner_id: input.ownerId,
      key_version: input.keyVersion,
      encrypted_meta: input.encryptedMeta,
    });
    if (created.error) throw new Error(`Não foi possível criar a gaveta na nuvem: ${created.error.message}`);
    const member = await supabase().from('vault_members').insert({
      vault_id: input.id,
      user_id: input.userId,
      role: 'owner',
      wrapped_key: input.wrappedKey,
      key_version: input.keyVersion,
    });
    if (member.error) {
      await supabase().from('vaults').delete().eq('id', input.id);
      throw new Error(`Não foi possível entrar na gaveta criada: ${member.error.message}`);
    }
  },
  async getVault(vaultId) {
    const { data, error } = await supabase()
      .from('vaults')
      .select('key_version, keyring, encrypted_meta')
      .eq('id', vaultId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível abrir a gaveta: ${error.message}`);
    if (!data) return null;
    return { keyVersion: data.key_version, keyring: data.keyring, encryptedMeta: data.encrypted_meta };
  },

  async deleteVault(vaultId) {
    const bucket = supabase().storage.from('photos');
    for (;;) {
      const { data, error } = await bucket.list(vaultId, { limit: 100 });
      if (error || !data || data.length === 0) break;
      const { error: removeError } = await bucket.remove(data.map(f => `${vaultId}/${f.name}`));
      if (removeError) break; // fotos que sobrarem ficam cifradas e sem cofre: ninguém abre
    }
    const { error, count } = await supabase().from('vaults').delete({ count: 'exact' }).eq('id', vaultId);
    if (error) throw serverError('Não foi possível apagar a gaveta da nuvem', error);
    if (count === 0) throw new ServerError('SEM_ACESSO', SERVER_ERRORS.SEM_ACESSO);
  },

  async setVaultMeta(vaultId, encryptedMeta) {
    const { error } = await supabase().from('vaults').update({ encrypted_meta: encryptedMeta }).eq('id', vaultId);
    if (error) throw new Error(`Não foi possível atualizar o nome da gaveta: ${error.message}`);
  },

  async listMembers(vaultId) {
    const { data, error } = await supabase().rpc('vault_member_list', { p_vault: vaultId });
    if (error) throw serverError('Não foi possível ver os membros', error);
    return ((data ?? []) as { user_id: string; role: SyncRole; name: string; email: string; joined_at: string }[]).map(row => ({
      userId: row.user_id, role: row.role, name: row.name, email: row.email, joinedAt: row.joined_at,
    }));
  },

  async publicKeys(userIds) {
    if (userIds.length === 0) return {};
    const { data, error } = await supabase().from('user_keys').select('user_id, public_key').in('user_id', userIds);
    if (error) throw new Error(`Não foi possível buscar as chaves dos membros: ${error.message}`);
    return Object.fromEntries((data ?? []).map(row => [row.user_id as string, row.public_key as string]));
  },

  async setRole(vaultId, userId, role) {
    const { error, count } = await supabase()
      .from('vault_members')
      .update({ role }, { count: 'exact' })
      .eq('vault_id', vaultId)
      .eq('user_id', userId);
    if (error) throw serverError('Não foi possível mudar o papel', error);
    if (count === 0) throw new ServerError('NAO_E_MEMBRO', SERVER_ERRORS.NAO_E_MEMBRO);
  },

  async leave(vaultId, userId) {
    const { error } = await supabase().from('vault_members').delete().eq('vault_id', vaultId).eq('user_id', userId);
    if (error) throw serverError('Não foi possível sair da gaveta', error);
  },

  async removeMemberRotate(input) {
    const { error } = await supabase().rpc('remove_member_rotate', {
      p_vault: input.vaultId,
      p_user: input.userId,
      p_key_version: input.keyVersion,
      p_keyring: input.keyring,
      p_meta: input.encryptedMeta,
      p_wraps: input.wraps,
    });
    if (error) throw serverError('Não foi possível remover', error);
  },

  async createInvite(input) {
    const { data, error } = await supabase().from('invites').insert({
      id: input.id,
      vault_id: input.vaultId,
      role: input.role,
      token_hash: input.tokenHash,
      wrapped_vault_key: input.wrappedVaultKey,
      key_version: input.keyVersion,
    }).select('expires_at').single();
    if (error) throw serverError('Não foi possível criar o convite', error);
    return data.expires_at as string;
  },

  async listInvites(vaultId) {
    const { data, error } = await supabase()
      .from('invites')
      .select('id, role, expires_at, created_at')
      .eq('vault_id', vaultId)
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Não foi possível ver os convites: ${error.message}`);
    return (data ?? []).map(row => ({ id: row.id, role: row.role, expiresAt: row.expires_at, createdAt: row.created_at }));
  },

  async revokeInvite(inviteId) {
    const { error } = await supabase().from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId);
    if (error) throw serverError('Não foi possível cancelar o convite', error);
  },

  async peekInvite(inviteId, token) {
    const { data, error } = await supabase().rpc('peek_invite', { p_invite: inviteId, p_token: token });
    if (error) throw serverError('Não foi possível abrir o convite', error);
    const row = (Array.isArray(data) ? data[0] : data) as {
      vault_id: string; role: GuestRole; wrapped_vault_key: string; key_version: number;
      expires_at: string; encrypted_meta: string | null; inviter_name: string | null;
    } | undefined;
    if (!row) throw new ServerError('CONVITE_INVALIDO', SERVER_ERRORS.CONVITE_INVALIDO);
    return {
      vaultId: row.vault_id, role: row.role, wrappedVaultKey: row.wrapped_vault_key, keyVersion: row.key_version,
      expiresAt: row.expires_at, encryptedMeta: row.encrypted_meta, inviterName: row.inviter_name,
    };
  },

  async acceptInvite(inviteId, token, wrappedKey) {
    const { data, error } = await supabase().rpc('accept_invite', { p_invite: inviteId, p_token: token, p_wrapped_key: wrappedKey });
    if (error) throw serverError('Não foi possível entrar na gaveta', error);
    return data as string;
  },

  async history(vaultId, before, limit) {
    const { data, error } = await supabase().rpc('vault_history', { p_vault: vaultId, p_before: before, p_limit: limit });
    if (error) throw serverError('Não foi possível ver o histórico', error);
    return ((data ?? []) as {
      id: number; at: string; action: string; record_kind: string | null; record_id: string | null; note: string | null;
      actor_id: string | null; actor_name: string | null; target_id: string | null; target_name: string | null;
    }[]).map(row => ({
      id: row.id, at: row.at, action: row.action, recordKind: row.record_kind, recordId: row.record_id, note: row.note,
      actorId: row.actor_id, actorName: row.actor_name, targetId: row.target_id, targetName: row.target_name,
    }));
  },
  async findUserByEmail(email) {
    const { data, error } = await supabase().rpc('find_user_by_email', { p_email: email });
    if (error) throw serverError('Não foi possível procurar o e-mail', error);
    const row = (Array.isArray(data) ? data[0] : data) as { user_id: string; public_key: string; name: string } | undefined;
    return row ? { userId: row.user_id, publicKey: row.public_key, name: row.name } : null;
  },

  async createDirectInvite(input) {
    const { data, error } = await supabase().rpc('create_direct_invite', {
      p_vault: input.vaultId,
      p_invitee: input.inviteeId,
      p_role: input.role,
      p_wrapped_key: input.wrappedKey,
      p_key_version: input.keyVersion,
    });
    if (error) throw serverError('Não foi possível enviar o convite', error);
    return data as string;
  },

  async myDirectInvites() {
    const { data, error } = await supabase().rpc('my_direct_invites');
    if (error) throw serverError('Não foi possível ver seus convites', error);
    return ((data ?? []) as {
      id: string; vault_id: string; role: GuestRole; wrapped_key: string; key_version: number;
      expires_at: string; encrypted_meta: string | null; inviter_name: string | null;
    }[]).map(row => ({
      id: row.id, vaultId: row.vault_id, role: row.role, wrappedKey: row.wrapped_key, keyVersion: row.key_version,
      expiresAt: row.expires_at, encryptedMeta: row.encrypted_meta, inviterName: row.inviter_name,
    }));
  },

  async answerDirectInvite(inviteId, accept) {
    const { data, error } = await supabase().rpc('answer_direct_invite', { p_invite: inviteId, p_accept: accept });
    if (error) throw serverError('Não foi possível responder ao convite', error);
    return data as string;
  },

  async sentDirectInvites(vaultId) {
    const { data, error } = await supabase().rpc('vault_direct_invites', { p_vault: vaultId });
    if (error) throw serverError('Não foi possível ver os convites enviados', error);
    return ((data ?? []) as { id: string; invitee_id: string; name: string; email: string; role: GuestRole; expires_at: string }[]).map(row => ({
      id: row.id, inviteeId: row.invitee_id, name: row.name, email: row.email, role: row.role, expiresAt: row.expires_at,
    }));
  },

  async revokeDirectInvite(inviteId) {
    const { error } = await supabase().rpc('revoke_direct_invite', { p_invite: inviteId });
    if (error) throw serverError('Não foi possível cancelar o convite', error);
  },
};
