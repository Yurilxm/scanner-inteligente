// Contas novas de outras pessoas para revisar (sininho). Só lê e grava no celular: a fila é montada
// na sincronização (engine), aqui ficam a leitura para as telas e as respostas Aceitar / Recusar.
import { deleteDocumentInProfile, getProfileSettings, setProfileSettings } from '../db/database';
import { Profile, canEdit, getProfile, listProfiles } from '../db/profiles';
import { GAVETA_REVIEWED_SETTING, GAVETA_REVIEW_SETTING, parseIdList } from './roles';
import type { ReviewItem } from './sharingCore';

export type ReviewEntry = ReviewItem & { profile: Profile; canRefuse: boolean };

function readQueue(profileId: string): ReviewItem[] {
  const raw = getProfileSettings(profileId, { [GAVETA_REVIEW_SETTING]: '[]' })[GAVETA_REVIEW_SETTING];
  try {
    const list = JSON.parse(raw) as ReviewItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function loadReviewEntries(): ReviewEntry[] {
  return listProfiles()
    .filter(p => p.vaultId)
    .flatMap(profile => readQueue(profile.id).map(item => ({ ...item, profile, canRefuse: canEdit(profile.role) })))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function countReviewEntries(): number {
  return loadReviewEntries().length;
}

function markReviewed(profileId: string, docId: string) {
  const settings = getProfileSettings(profileId, { [GAVETA_REVIEWED_SETTING]: '[]' });
  const reviewed = parseIdList(settings[GAVETA_REVIEWED_SETTING]);
  if (!reviewed.includes(docId)) reviewed.push(docId);
  setProfileSettings(profileId, {
    [GAVETA_REVIEWED_SETTING]: JSON.stringify(reviewed.slice(-500)),
    [GAVETA_REVIEW_SETTING]: JSON.stringify(readQueue(profileId).filter(i => i.docId !== docId)),
  });
}

// Aceitar: a conta fica na gaveta e sai da fila
export function acceptReview(profileId: string, docId: string): void {
  markReviewed(profileId, docId);
}

// Recusar: exclui a conta da gaveta (para todos, na próxima sincronização) e sai da fila
export function refuseReview(profileId: string, docId: string): void {
  const profile = getProfile(profileId);
  if (!profile || !canEdit(profile.role)) throw new Error('Seu papel nesta gaveta não permite excluir contas.');
  deleteDocumentInProfile(profileId, docId);
  markReviewed(profileId, docId);
}
