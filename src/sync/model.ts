// Regras da sincronização, sem rede e sem banco: o que entra, o que sai e quem vence.
// Conteúdo e pagamento são comparados por datas diferentes, para um não apagar o outro.
// A data de dentro do texto cifrado é a do celular; o horário do servidor só serve para
// saber o que ainda não foi baixado.

export type SyncRole = 'owner' | 'editor' | 'payer' | 'viewer';

export type DocumentPayload = {
  documentType: string;
  issuer: string | null;
  referenceMonth: string | null;
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null;
  dueDate: string | null;
  boletoLine: string | null;
  ocrText: string | null;
  pixKey?: string | null;
  createdAt: string;
  updatedAt: string;
  hasPhoto: boolean;
};

export type PaymentPayload = {
  isPaid: number;
  paymentDate: string | null;
  paymentUpdatedAt: string;
};

export type LearnedPayload = {
  pattern: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type NotePayload = { at: string; text: string };

export type RemoteRecord = {
  kind: 'document' | 'payment' | 'learned';
  id: string;
  ciphertext: string | null;
  deleted: boolean;
  auditNote: string | null;
  keyVersion: number;
  updatedAt: string;
};

export type OutboundRecord = {
  kind: 'document' | 'payment' | 'learned';
  id: string;
  ciphertext: string | null;
  deleted: boolean;
  auditNote: string;
  keyVersion: number;
};

export type SyncDocument = {
  id: string;
  imageUri: string;
  documentType: string;
  issuer: string | null;
  referenceMonth: string | null;
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null;
  dueDate: string | null;
  boletoLine: string | null;
  ocrText: string | null;
  pixKey?: string | null;
  isPaid: number;
  paymentDate: string | null;
  createdAt: string;
  updatedAt: string;
  paymentUpdatedAt: string;
  deletedAt: string | null;
  contentDirty: boolean;
  paymentDirty: boolean;
};

export type SyncLearned = {
  id: string;
  pattern: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: boolean;
};

export type SyncSnapshot = {
  cursor: string;
  documents: SyncDocument[];
  learned: SyncLearned[];
  photoDue: Record<string, string>;
  photoHave: Record<string, string>;
};

export const EMPTY_CURSOR = '1970-01-01T00:00:00.000Z';

export type ContentWrite = {
  id: string;
  imageUri: string | null; // null = manter a foto local; '' = limpar; caminho = gravar
  documentType: string;
  issuer: string | null;
  referenceMonth: string | null;
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null;
  dueDate: string | null;
  boletoLine: string | null;
  ocrText: string | null;
  pixKey?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type PaymentWrite = {
  id: string;
  isPaid: number;
  paymentDate: string | null;
  paymentUpdatedAt: string;
};

export type LearnedWrite = {
  id: string;
  pattern: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ImageWrite = { id: string; imageUri: string };

export type SyncCommit = {
  contents: ContentWrite[];
  payments: PaymentWrite[];
  learned: LearnedWrite[];
  images: ImageWrite[];
  clearContent: string[];
  clearPayment: string[];
  clearLearned: string[];
  cursor: string;
  meta: Record<string, string | null>;
};

export type ReminderRefresh = {
  id: string;
  issuer: string | null;
  dueDate: string | null;
  isPaid: number;
  deleted: boolean;
};

export type SyncReport = {
  pushed: number;
  pulled: number;
  photosUp: number;
  photosDown: number;
  reminders: ReminderRefresh[];
};

export type Incoming =
  | { kind: 'document'; id: string; serverUpdatedAt: string; deleted: false; content: DocumentPayload }
  | { kind: 'document'; id: string; serverUpdatedAt: string; deleted: true; at: string }
  | { kind: 'payment'; id: string; serverUpdatedAt: string; payment: PaymentPayload }
  | { kind: 'learned'; id: string; serverUpdatedAt: string; learned: LearnedPayload };

export function canEditRole(role: SyncRole): boolean {
  return role === 'owner' || role === 'editor';
}

export function canPayRole(role: SyncRole): boolean {
  return role !== 'viewer';
}

export function isAfter(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false;
  const at = Date.parse(a);
  if (Number.isNaN(at)) return false;
  if (!b) return true;
  const bt = Date.parse(b);
  return Number.isNaN(bt) ? true : at > bt;
}

export function laterStamp(a: string, b: string): string {
  return isAfter(b, a) ? b : a;
}

export function emptyCommit(cursor: string): SyncCommit {
  return {
    contents: [], payments: [], learned: [], images: [],
    clearContent: [], clearPayment: [], clearLearned: [],
    cursor, meta: {},
  };
}

export function commitHasWork(commit: SyncCommit, previousCursor: string): boolean {
  return commit.contents.length > 0
    || commit.payments.length > 0
    || commit.learned.length > 0
    || commit.images.length > 0
    || commit.clearContent.length > 0
    || commit.clearPayment.length > 0
    || commit.clearLearned.length > 0
    || Object.keys(commit.meta).length > 0
    || commit.cursor !== previousCursor;
}

function copySnapshot(snapshot: SyncSnapshot): SyncSnapshot {
  return {
    cursor: snapshot.cursor,
    documents: snapshot.documents.map(d => ({ ...d })),
    learned: snapshot.learned.map(d => ({ ...d })),
    photoDue: { ...snapshot.photoDue },
    photoHave: { ...snapshot.photoHave },
  };
}

function contentOf(doc: SyncDocument, hasPhoto: boolean): DocumentPayload {
  return {
    documentType: doc.documentType,
    issuer: doc.issuer,
    referenceMonth: doc.referenceMonth,
    cnpj: doc.cnpj,
    cpf: doc.cpf,
    totalAmountCents: doc.totalAmountCents,
    dueDate: doc.dueDate,
    boletoLine: doc.boletoLine,
    ocrText: doc.ocrText,
    pixKey: doc.pixKey ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasPhoto,
  };
}

function reminderOf(doc: SyncDocument): ReminderRefresh {
  return {
    id: doc.id,
    issuer: doc.issuer,
    dueDate: doc.dueDate,
    isPaid: doc.isPaid,
    deleted: !!doc.deletedAt,
  };
}

export type AppliedRemote = {
  snapshot: SyncSnapshot;
  contents: ContentWrite[];
  payments: PaymentWrite[];
  learned: LearnedWrite[];
  pulled: number;
  reminders: ReminderRefresh[];
  cursor: string;
};

// Aplica o que veio da nuvem. Empate fica com o celular: a data igual não substitui.
export function applyIncoming(snapshot: SyncSnapshot, incoming: Incoming[]): AppliedRemote {
  const next = copySnapshot(snapshot);
  const contents: ContentWrite[] = [];
  const payments: PaymentWrite[] = [];
  const learned: LearnedWrite[] = [];
  const reminders = new Map<string, ReminderRefresh>();
  let pulled = 0;
  let cursor = snapshot.cursor;

  const docs = new Map(next.documents.map(d => [d.id, d]));
  const byPattern = new Map(next.learned.map(d => [d.pattern, d]));

  const ordered = [...incoming].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
  for (const row of ordered) {
    cursor = laterStamp(cursor, row.serverUpdatedAt);
    if (row.kind === 'document') {
      const local = docs.get(row.id);
      if (row.deleted) {
        if (local && isAfter(row.at, local.updatedAt)) {
          local.deletedAt = row.at;
          local.updatedAt = row.at;
          local.ocrText = null;
          local.contentDirty = false;
          delete next.photoDue[row.id];
          delete next.photoHave[row.id];
          contents.push(contentWrite(local, ''));
          reminders.set(row.id, reminderOf(local));
          pulled += 1;
        } else if (!local) {
          // Exclusão de conta que este celular nunca teve: guarda a marca (invisível no app),
          // para um pagamento antigo dessa conta não virar uma conta vazia "DESCONHECIDO"
          const tombstone = stubDocument(row.id, row.at);
          tombstone.deletedAt = row.at;
          docs.set(tombstone.id, tombstone);
          contents.push(contentWrite(tombstone, ''));
          pulled += 1;
        }
      } else if (!local || isAfter(row.content.updatedAt, local.updatedAt)) {
        // Remoto mais novo vence, mesmo que o celular tenha alteração ainda não enviada.
        const created = !local;
        const doc = local ?? stubDocument(row.id, row.content.createdAt);
        fillContent(doc, row.content);
        doc.contentDirty = false;
        if (created) docs.set(doc.id, doc);
        if (row.content.hasPhoto) next.photoDue[doc.id] = row.content.updatedAt;
        else delete next.photoDue[doc.id];
        contents.push(contentWrite(doc, null));
        reminders.set(doc.id, reminderOf(doc));
        pulled += 1;
      }
    } else if (row.kind === 'payment') {
      const local = docs.get(row.id);
      const remoteAt = row.payment.paymentUpdatedAt;
      if (!local || isAfter(remoteAt, local.paymentUpdatedAt)) {
        const doc = local ?? stubDocument(row.id, remoteAt);
        doc.isPaid = row.payment.isPaid ? 1 : 0;
        doc.paymentDate = row.payment.paymentDate;
        doc.paymentUpdatedAt = remoteAt;
        doc.paymentDirty = false;
        if (!local) docs.set(doc.id, doc);
        payments.push({
          id: doc.id,
          isPaid: doc.isPaid,
          paymentDate: doc.paymentDate,
          paymentUpdatedAt: doc.paymentUpdatedAt,
        });
        reminders.set(doc.id, reminderOf(doc));
        pulled += 1;
      }
    } else {
      const payload = row.learned;
      const local = byPattern.get(payload.pattern) ?? next.learned.find(d => d.id === row.id);
      if (!local || isAfter(payload.updatedAt, local.updatedAt)) {
        const rowLearned: SyncLearned = {
          id: row.id,
          pattern: payload.pattern,
          category: payload.category,
          updatedAt: payload.updatedAt,
          deletedAt: payload.deletedAt,
          dirty: false,
        };
        if (local && local.id !== row.id) {
          next.learned = next.learned.filter(d => d.id !== local.id);
          byPattern.delete(local.pattern);
        }
        if (local && local.id === row.id) Object.assign(local, rowLearned);
        else next.learned.push(rowLearned);
        byPattern.set(payload.pattern, local && local.id === row.id ? local : rowLearned);
        learned.push({
          id: row.id,
          pattern: payload.pattern,
          category: payload.category,
          updatedAt: payload.updatedAt,
          deletedAt: payload.deletedAt,
        });
        pulled += 1;
      }
    }
  }

  next.documents = [...docs.values()];
  next.cursor = cursor;
  return { snapshot: next, contents, payments, learned, pulled, reminders: [...reminders.values()], cursor };
}

function kindOrder(kind: Incoming['kind']): number {
  if (kind === 'document') return 0;
  if (kind === 'payment') return 1;
  return 2;
}

function stubDocument(id: string, at: string): SyncDocument {
  return {
    id,
    imageUri: '',
    documentType: 'DESCONHECIDO',
    issuer: null,
    referenceMonth: null,
    cnpj: null,
    cpf: null,
    totalAmountCents: null,
    dueDate: null,
    boletoLine: null,
    ocrText: null,
    pixKey: null,
    isPaid: 0,
    paymentDate: null,
    createdAt: at,
    updatedAt: at,
    paymentUpdatedAt: at,
    deletedAt: null,
    contentDirty: false,
    paymentDirty: false,
  };
}

function fillContent(doc: SyncDocument, content: DocumentPayload) {
  doc.documentType = content.documentType || 'DESCONHECIDO';
  doc.issuer = content.issuer;
  doc.referenceMonth = content.referenceMonth;
  doc.cnpj = content.cnpj;
  doc.cpf = content.cpf;
  doc.totalAmountCents = content.totalAmountCents;
  doc.dueDate = content.dueDate;
  doc.boletoLine = content.boletoLine;
  doc.ocrText = content.ocrText;
  doc.pixKey = content.pixKey ?? null;
  doc.createdAt = content.createdAt || doc.createdAt;
  doc.updatedAt = content.updatedAt;
  doc.deletedAt = null;
}

function contentWrite(doc: SyncDocument, imageUri: string | null): ContentWrite {
  return {
    id: doc.id,
    imageUri,
    documentType: doc.documentType,
    issuer: doc.issuer,
    referenceMonth: doc.referenceMonth,
    cnpj: doc.cnpj,
    cpf: doc.cpf,
    totalAmountCents: doc.totalAmountCents,
    dueDate: doc.dueDate,
    boletoLine: doc.boletoLine,
    ocrText: doc.deletedAt ? null : doc.ocrText,
    pixKey: doc.pixKey ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

export type PushPlan = {
  documents: { id: string; deleted: boolean; content: DocumentPayload | null; at: string; text: string; imageUri: string }[];
  payments: { id: string; payment: PaymentPayload; text: string }[];
  learned: { id: string; deleted: boolean; payload: LearnedPayload; text: string }[];
};

export function planPush(snapshot: SyncSnapshot, role: SyncRole): PushPlan {
  const documents = canEditRole(role)
    ? snapshot.documents.filter(d => d.contentDirty).map(d => ({
      id: d.id,
      deleted: !!d.deletedAt,
      content: d.deletedAt ? null : contentOf(d, false),
      at: d.deletedAt || d.updatedAt,
      text: d.deletedAt ? `Excluiu ${d.issuer || 'conta'}` : `Atualizou ${d.issuer || 'conta'}`,
      imageUri: d.deletedAt ? '' : d.imageUri,
    }))
    : [];
  const payments = canPayRole(role)
    ? snapshot.documents.filter(d => d.paymentDirty && !d.deletedAt).map(d => ({
      id: d.id,
      payment: { isPaid: d.isPaid ? 1 : 0, paymentDate: d.paymentDate, paymentUpdatedAt: d.paymentUpdatedAt },
      text: d.isPaid ? `Pagou ${d.issuer || 'conta'}` : `Desmarcou pagamento de ${d.issuer || 'conta'}`,
    }))
    : [];
  const learned = canEditRole(role)
    ? snapshot.learned.filter(d => d.dirty).map(d => ({
      id: d.id,
      deleted: !!d.deletedAt,
      payload: { pattern: d.pattern, category: d.category, updatedAt: d.updatedAt, deletedAt: d.deletedAt },
      text: d.deletedAt ? `Esqueceu ${d.pattern}` : `Aprendeu ${d.pattern}`,
    }))
    : [];
  return { documents, payments, learned };
}

// No outro celular, um perfil local com o mesmo nome e sem nuvem recebe o cofre.
// Se não houver um único candidato, cria-se um perfil novo.
export function matchProfileForVault(profiles: { id: string; name: string; vaultId: string | null }[], remoteName: string): string | null {
  const wanted = remoteName.trim().toLowerCase();
  const matches = profiles.filter(p => !p.vaultId && p.name.trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0].id : null;
}

// A foto de uma conta nunca muda: baixa só se este celular ainda não tem nenhuma
export function pendingDownloads(snapshot: SyncSnapshot): { id: string; rev: string }[] {
  return Object.entries(snapshot.photoDue)
    .filter(([id]) => !(id in snapshot.photoHave) && !snapshot.documents.find(d => d.id === id)?.deletedAt)
    .map(([id, rev]) => ({ id, rev }));
}

// ---- Nome, cor e ícone da gaveta (cifrados em vaults.encrypted_meta) ----

export type VaultMeta = { name?: string; color?: string; icon?: string; ownerName?: string };
type LocalLook = { name: string; color: string; icon: string };

// O dono manda o visual do perfil dele (e o próprio nome, para os outros verem quem compartilhou);
// quem foi convidado segue o que o dono definiu. Se o nome já existe em outro perfil deste
// celular, acrescenta quem compartilhou, para não ficar dois perfis iguais.
export function planMetaSync(input: {
  role: SyncRole;
  local: LocalLook;
  remote: VaultMeta | null;
  ownerName: string;
  otherLocalNames: string[];
}): { push: VaultMeta | null; local: LocalLook | null } {
  const { role, local, remote } = input;
  if (role === 'owner') {
    const want: VaultMeta = { name: local.name, color: local.color, icon: local.icon, ownerName: input.ownerName || remote?.ownerName };
    const same = remote && remote.name === want.name && remote.color === want.color && remote.icon === want.icon
      && remote.ownerName === want.ownerName;
    return { push: same ? null : want, local: null };
  }
  const name = remote?.name?.trim();
  if (!name) return { push: null, local: null };
  const taken = input.otherLocalNames.some(n => n.toLowerCase() === name.toLowerCase());
  const next: LocalLook = {
    name: taken && remote?.ownerName ? `${name} (${remote.ownerName})` : name,
    color: remote?.color || local.color,
    icon: remote?.icon || local.icon,
  };
  const same = next.name === local.name && next.color === local.color && next.icon === local.icon;
  return { push: null, local: same ? null : next };
}
