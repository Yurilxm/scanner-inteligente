// Uma rodada de sincronização: baixa, junta com o que está no celular, envia o que mudou.
// Não grava no banco; devolve o que o chamador deve gravar, para dar para testar sem SQLite.

import { Keyring, contexts, open, openJson, seal, sealJson } from './crypto';
import { formatBRL } from '../utils/format';
import {
  DocumentPayload, Incoming, LearnedPayload, NotePayload, OutboundRecord, PaymentPayload, RemoteRecord,
  SyncCommit, SyncReport, SyncRole, SyncSnapshot,
  applyIncoming, commitHasWork, emptyCommit, laterStamp, pendingDownloads, planPush,
} from './model';

// Limite do bucket "photos" no Supabase (file_size_limit da migração)
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type SyncRemote = {
  pull(vaultId: string, since: string): Promise<RemoteRecord[]>;
  push(vaultId: string, rows: OutboundRecord[]): Promise<void>;
  getPhoto(vaultId: string, id: string): Promise<Uint8Array | null>;
  putPhoto(vaultId: string, id: string, bytes: Uint8Array): Promise<void>;
  removePhoto(vaultId: string, id: string): Promise<void>;
};

export type PhotoIO = {
  read(uri: string): Promise<Uint8Array | null>;
  write(id: string, bytes: Uint8Array): Promise<string>;
  remove(uri: string): Promise<void>;
};

export type RunSyncInput = {
  snapshot: SyncSnapshot;
  role: SyncRole;
  vaultId: string;
  key: Uint8Array;
  keyVersion: number;
  /** Chaves antigas do cofre (depois de uma troca de chave), pela versão */
  previousKeys?: Keyring;
  remote: SyncRemote;
  photos: PhotoIO;
};

export async function runSync(input: RunSyncInput): Promise<{ commit: SyncCommit; report: SyncReport }> {
  const { snapshot, role, vaultId, key, keyVersion, remote, photos } = input;
  // Lê com a chave da época de cada registro; grava sempre com a atual
  const keys: Keyring = { ...(input.previousKeys ?? {}), [keyVersion]: key };
  const remoteRows = await remote.pull(vaultId, snapshot.cursor);
  const incoming = remoteRows
    .map(row => decodeRow(row, vaultId, keys))
    .filter((row): row is Incoming => row !== null);
  const applied = applyIncoming(snapshot, incoming);

  // O marcador avança por tudo que chegou, inclusive registros ignorados, para não baixá-los de novo
  const cursor = remoteRows.reduce((latest, row) => laterStamp(latest, row.updatedAt), applied.cursor);
  const commit = emptyCommit(cursor);
  commit.contents = applied.contents;
  commit.payments = applied.payments;
  commit.learned = applied.learned;

  for (const write of applied.contents) {
    if (!write.deletedAt) continue;
    const prev = snapshot.documents.find(d => d.id === write.id);
    if (prev?.imageUri) await photos.remove(prev.imageUri);
    await remote.removePhoto(vaultId, write.id);
  }

  let photosDown = 0;
  for (const item of pendingDownloads(applied.snapshot)) {
    // Foto com problema não pode travar contas e pagamentos: fica para a próxima rodada
    let uri: string;
    try {
      const sealed = await remote.getPhoto(vaultId, item.id);
      if (!sealed) continue;
      const bytes = openPhoto(keys, keyVersion, sealed, contexts.photo(vaultId, item.id));
      uri = await photos.write(item.id, bytes);
    } catch (e) {
      console.warn(`Foto de ${item.id} não baixada`, e);
      continue;
    }
    const content = commit.contents.find(c => c.id === item.id);
    if (content) content.imageUri = uri;
    else commit.images.push({ id: item.id, imageUri: uri });
    commit.meta[`photoHave:${item.id}`] = item.rev;
    const doc = applied.snapshot.documents.find(d => d.id === item.id);
    if (doc) doc.imageUri = uri;
    applied.snapshot.photoHave[item.id] = item.rev;
    photosDown += 1;
  }
  for (const [id, rev] of Object.entries(applied.snapshot.photoDue)) {
    if (commit.meta[`photoDue:${id}`] === undefined && snapshot.photoDue[id] !== rev) commit.meta[`photoDue:${id}`] = rev;
  }
  for (const id of Object.keys(snapshot.photoDue)) {
    if (!(id in applied.snapshot.photoDue)) commit.meta[`photoDue:${id}`] = null;
  }
  for (const id of Object.keys(snapshot.photoHave)) {
    if (!(id in applied.snapshot.photoHave)) commit.meta[`photoHave:${id}`] = null;
  }

  const plan = planPush(applied.snapshot, role);
  const outbound: OutboundRecord[] = [];

  let photosUp = 0;
  for (const doc of plan.documents) {
    let content = doc.content;
    let photoFailed = false;
    if (content && doc.imageUri) {
      if (doc.id in applied.snapshot.photoHave) {
        // A foto de uma conta nunca muda: já está na nuvem (enviada ou baixada por aqui)
        content = { ...content, hasPhoto: true };
      } else {
        // Foto com problema não pode travar contas e pagamentos: tenta de novo na próxima rodada
        try {
          const bytes = await photos.read(doc.imageUri);
          if (bytes) {
            const sealed = seal(key, bytes, contexts.photo(vaultId, doc.id));
            if (sealed.length > MAX_PHOTO_BYTES) throw new Error('foto maior que o limite do servidor');
            await remote.putPhoto(vaultId, doc.id, sealed);
            content = { ...content, hasPhoto: true };
            commit.meta[`photoHave:${doc.id}`] = content.updatedAt;
            photosUp += 1;
          }
        } catch (e) {
          photoFailed = true;
          console.warn(`Foto de ${doc.id} não enviada`, e);
        }
      }
    }
    if (doc.deleted) await remote.removePhoto(vaultId, doc.id);
    const text = !doc.deleted && content?.totalAmountCents
      ? `Atualizou ${content.issuer || 'conta'} ${formatBRL(content.totalAmountCents)}`
      : doc.text;
    outbound.push({
      kind: 'document',
      id: doc.id,
      ciphertext: content ? sealJson(key, content, contexts.record(vaultId, doc.id, 'document')) : null,
      deleted: doc.deleted,
      auditNote: sealJson(key, note(doc.at, text), contexts.note(vaultId, 'document', doc.id)),
      keyVersion,
    });
    // Sem a foto, a conta continua pendente: a próxima rodada tenta enviar a foto de novo
    if (!photoFailed) commit.clearContent.push(doc.id);
  }

  for (const pay of plan.payments) {
    outbound.push({
      kind: 'payment',
      id: pay.id,
      ciphertext: sealJson(key, pay.payment, contexts.record(vaultId, pay.id, 'payment')),
      deleted: false,
      auditNote: sealJson(key, note(pay.payment.paymentUpdatedAt, pay.text), contexts.note(vaultId, 'payment', pay.id)),
      keyVersion,
    });
    commit.clearPayment.push(pay.id);
  }

  for (const item of plan.learned) {
    outbound.push({
      kind: 'learned',
      id: item.id,
      ciphertext: item.deleted ? null : sealJson(key, item.payload, contexts.record(vaultId, item.id, 'learned')),
      deleted: item.deleted,
      auditNote: sealJson(key, note(item.payload.deletedAt || item.payload.updatedAt, item.text), contexts.note(vaultId, 'learned', item.id)),
      keyVersion,
    });
    commit.clearLearned.push(item.id);
  }

  if (outbound.length > 0) await remote.push(vaultId, outbound);

  return {
    commit,
    report: {
      pushed: outbound.length,
      pulled: applied.pulled,
      photosUp,
      photosDown,
      reminders: applied.reminders,
    },
  };
}

export function shouldCommit(commit: SyncCommit, previousCursor: string): boolean {
  return commitHasWork(commit, previousCursor);
}

function note(at: string, text: string): NotePayload {
  return { at, text: text.slice(0, 140) };
}

// A foto não guarda a versão da chave: tenta a atual primeiro e depois as antigas
function openPhoto(keys: Keyring, current: number, sealed: Uint8Array, context: string): Uint8Array {
  const versions = [current, ...Object.keys(keys).map(Number).filter(v => v !== current).sort((a, b) => b - a)];
  for (const version of versions) {
    try {
      return open(keys[version], sealed, context);
    } catch {
      // chave de outra época: tenta a próxima
    }
  }
  throw new Error('Não foi possível abrir uma foto da nuvem com as chaves desta gaveta.');
}

function decodeRow(row: RemoteRecord, vaultId: string, keys: Keyring): Incoming | null {
  const key = keys[row.keyVersion];
  if (!key) {
    throw new Error('Um registro desta gaveta usa uma chave que este celular ainda não tem. Sincronize de novo.');
  }
  if (row.kind === 'document' && row.deleted) {
    const stamped = openNote(key, vaultId, row);
    if (!stamped) throw new Error('Uma exclusão chegou sem data. A sincronização foi interrompida para não apagar a conta errada.');
    return { kind: 'document', id: row.id, serverUpdatedAt: row.updatedAt, deleted: true, at: stamped.at };
  }
  // O servidor apaga o conteúdo de todo registro excluído. Nenhuma tela exclui palavras aprendidas
  // hoje; se alguma passar a excluir, ignorar aqui evita travar a sincronização para sempre.
  if (row.deleted && row.kind === 'learned') return null;
  if (!row.ciphertext) throw new Error('Um registro da nuvem chegou vazio.');
  if (row.kind === 'document') {
    const content = openJson<DocumentPayload>(key, row.ciphertext, contexts.record(vaultId, row.id, 'document'));
    return { kind: 'document', id: row.id, serverUpdatedAt: row.updatedAt, deleted: false, content };
  }
  if (row.kind === 'payment') {
    const payment = openJson<PaymentPayload>(key, row.ciphertext, contexts.record(vaultId, row.id, 'payment'));
    return { kind: 'payment', id: row.id, serverUpdatedAt: row.updatedAt, payment };
  }
  const learned = openJson<LearnedPayload>(key, row.ciphertext, contexts.record(vaultId, row.id, 'learned'));
  return { kind: 'learned', id: row.id, serverUpdatedAt: row.updatedAt, learned };
}

function openNote(key: Uint8Array, vaultId: string, row: RemoteRecord): NotePayload | null {
  if (!row.auditNote) return null;
  return openJson<NotePayload>(key, row.auditNote, contexts.note(vaultId, row.kind, row.id));
}
