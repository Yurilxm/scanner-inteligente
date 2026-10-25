// Gaveta da família para as telas: liga o núcleo (sharingCore) ao servidor real, à conta e ao banco.
// Carregado sob demanda pelas telas (como o engine), para o resto do app não pagar o custo.

import { getProfile, listProfiles, type Profile } from '../db/profiles';
import { newVaultKey } from './crypto';
import { RemovedFromVault, createProfileForVault, detachProfile, newId, openVault, requireReady, syncProfile } from './engine';
import { ServerError, remote, type InviteRow, type MemberRow, type SentInvite } from './remote';
import type { GuestRole } from './roles';
import * as core from './sharingCore';
import { allKeys, saveVaultKey } from './vaultKey';

export type { HistoryEntry, InvitePreview, PendingInvite } from './sharingCore';
export type { InviteRow, MemberRow, SentInvite };
export { NotAnInvite, NotOnControl } from './sharingCore';
export { RemovedFromVault };

function sharedProfile(profileId: string): Profile & { vaultId: string } {
  const profile = getProfile(profileId);
  if (!profile) throw new Error('Gaveta não encontrada.');
  if (!profile.vaultId) throw new Error('Leve esta gaveta para a nuvem antes de compartilhar.');
  return profile as Profile & { vaultId: string };
}

async function openShared(profileId: string) {
  const profile = sharedProfile(profileId);
  const { userId, identity } = await requireReady();
  const opened = await openVault(userId, profile.vaultId, identity);
  if (!opened) {
    await detachProfile(profileId, userId, profile.vaultId);
    throw new RemovedFromVault(profile.name);
  }
  return { profile, userId, identity, ...opened };
}

export type GavetaState = {
  me: string;
  role: Profile['role'];
  members: MemberRow[];
  invites: InviteRow[];
  sent: SentInvite[];
};

export async function loadGaveta(profileId: string): Promise<GavetaState> {
  const { profile, userId, role } = await openShared(profileId);
  const owner = role === 'owner';
  const [members, invites, sent] = await Promise.all([
    remote.listMembers(profile.vaultId),
    owner ? remote.listInvites(profile.vaultId) : Promise.resolve([]),
    owner ? remote.sentDirectInvites(profile.vaultId) : Promise.resolve([]),
  ]);
  return { me: userId, role, members, invites, sent };
}

export async function createInvite(profileId: string, role: GuestRole) {
  const { profile, stored, role: myRole } = await openShared(profileId);
  if (myRole !== 'owner') throw new Error('Só o dono da gaveta pode convidar.');
  return core.createInvite(remote, { vaultId: profile.vaultId, stored, role, newId });
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await remote.revokeInvite(inviteId);
}

// Convite pelo e-mail Google: aparece no sininho da pessoa
export async function inviteByEmail(profileId: string, email: string, role: GuestRole) {
  const { profile, stored, userId, role: myRole } = await openShared(profileId);
  if (myRole !== 'owner') throw new Error('Só o dono da gaveta pode convidar.');
  return core.inviteByEmail(remote, { vaultId: profile.vaultId, stored, email, role, myId: userId });
}

export async function revokeSentInvite(inviteId: string): Promise<void> {
  await remote.revokeDirectInvite(inviteId);
}

// Convites que eu mandei e ainda esperam resposta, em todas as gavetas de que sou dono (sininho)
export type OutgoingInvite = {
  id: string;
  kind: 'email' | 'qr';
  profileId: string;
  profileName: string;
  name: string | null;
  email: string | null;
  role: GuestRole;
  expiresAt: string;
};

export async function loadOutgoingInvites(): Promise<OutgoingInvite[]> {
  await requireReady();
  const owned = listProfiles().filter(p => p.vaultId && p.role === 'owner');
  const perProfile = await Promise.all(owned.map(async p => {
    const vaultId = p.vaultId as string;
    // Uma gaveta com problema (ex.: saiu da nuvem) não esconde os convites das outras
    const [sent, qr] = await Promise.all([
      remote.sentDirectInvites(vaultId).catch(() => []),
      remote.listInvites(vaultId).catch(() => []),
    ]);
    return [
      ...sent.map(i => ({ id: i.id, kind: 'email' as const, profileId: p.id, profileName: p.name, name: i.name, email: i.email, role: i.role, expiresAt: i.expiresAt })),
      ...qr.map(i => ({ id: i.id, kind: 'qr' as const, profileId: p.id, profileName: p.name, name: null, email: null, role: i.role, expiresAt: i.expiresAt })),
    ];
  }));
  return perProfile.flat().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function cancelOutgoingInvite(invite: OutgoingInvite): Promise<void> {
  if (invite.kind === 'email') await remote.revokeDirectInvite(invite.id);
  else await remote.revokeInvite(invite.id);
}

// Convites para mim (sininho). Sem conta ou sem frase neste celular, não há o que mostrar.
export async function loadMyInvites(): Promise<core.PendingInvite[]> {
  const { userId, identity } = await requireReady();
  return core.listMyInvites(remote, identity, userId);
}

// Aceitar cria o perfil da gaveta e traz as contas; recusar só responde
export async function answerMyInvite(
  invite: core.PendingInvite, accept: boolean,
): Promise<{ profileId: string; syncError: string | null } | null> {
  const { userId } = await requireReady();
  const stored = await core.answerInvite(remote, invite, accept);
  if (!stored) return null;
  await saveVaultKey(userId, invite.vaultId, stored);
  const profileId = createProfileForVault(invite.meta, invite.vaultId, invite.role, false);
  try {
    await syncProfile(profileId);
    return { profileId, syncError: null };
  } catch (e) {
    return { profileId, syncError: e instanceof Error ? e.message : String(e) };
  }
}

export async function previewInvite(link: string) {
  await requireReady();
  return core.previewInvite(remote, link);
}

// Entra na gaveta, cria o perfil dela neste celular e traz as contas
export async function joinInvite(preview: core.InvitePreview): Promise<{ profileId: string; syncError: string | null }> {
  const { userId, identity } = await requireReady();
  const stored = await core.acceptInvite(remote, identity, userId, preview);
  await saveVaultKey(userId, preview.vaultId, stored);
  const profileId = createProfileForVault(preview.meta, preview.vaultId, preview.role, false);
  // A entrada já valeu; se a primeira sincronização falhar (ex.: sem internet), tenta depois
  try {
    await syncProfile(profileId);
    return { profileId, syncError: null };
  } catch (e) {
    return { profileId, syncError: e instanceof Error ? e.message : String(e) };
  }
}

export async function changeRole(profileId: string, userId: string, role: GuestRole): Promise<void> {
  const { profile } = await openShared(profileId);
  await remote.setRole(profile.vaultId, userId, role);
}

// Remove e troca a chave. Se alguém entrou/saiu no meio tempo, tenta de novo com a lista nova.
export async function removeMember(profileId: string, removeUserId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const { profile, userId, stored, role } = await openShared(profileId);
    if (role !== 'owner') throw new Error('Só o dono da gaveta pode remover pessoas.');
    if (removeUserId === userId) throw new Error('O dono não pode ser removido da própria gaveta.');
    try {
      const next = await core.removeMember(remote, { vaultId: profile.vaultId, removeUserId, stored, newKey: newVaultKey() });
      await saveVaultKey(userId, profile.vaultId, next);
      return;
    } catch (e) {
      const retry = e instanceof ServerError && (e.code === 'MEMBROS_MUDARAM' || e.code === 'VERSAO_DA_CHAVE');
      if (!retry || attempt >= 2) throw e;
    }
  }
}

// Antes de excluir a gaveta do celular: a dona apaga da nuvem (para todos); quem foi convidado sai.
// Sem isso, a gaveta voltaria na próxima sincronização.
export async function removeFromCloud(profileId: string): Promise<void> {
  let opened;
  try {
    opened = await openShared(profileId);
  } catch (e) {
    if (e instanceof RemovedFromVault) return; // já não estava mais na nuvem para esta conta
    throw e;
  }
  const { profile, userId, role } = opened;
  // Outra cópia neste celular usa o mesmo cofre: só desliga esta, sem sair da gaveta nem apagá-la
  const duplicate = listProfiles().some(p => p.id !== profileId && p.vaultId === profile.vaultId);
  if (!duplicate) {
    if (role === 'owner') await remote.deleteVault(profile.vaultId);
    else await remote.leave(profile.vaultId, userId);
  }
  await detachProfile(profileId, userId, profile.vaultId);
}

// Sai da gaveta de outra pessoa; as contas que já estavam aqui ficam só neste celular
export async function leaveGaveta(profileId: string): Promise<void> {
  const { profile, userId, role } = await openShared(profileId);
  if (role === 'owner') throw new Error('O dono não sai da própria gaveta. Remova as outras pessoas, se quiser.');
  await remote.leave(profile.vaultId, userId);
  await detachProfile(profileId, userId, profile.vaultId);
}

export async function loadHistory(profileId: string, before: number | null = null, limit = 50) {
  const { profile, userId, stored } = await openShared(profileId);
  const rows = await remote.history(profile.vaultId, before, limit);
  return {
    entries: core.describeHistory(rows, allKeys(stored), profile.vaultId, userId),
    next: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}
