import * as SQLite from 'expo-sqlite';
import { ExtractedFields } from '../types/document';
import { todayISO } from '../utils/format';
import { getActiveProfileId, setActiveProfileId } from './profiles';
import type { SyncCommit, SyncDocument, SyncLearned, SyncSnapshot } from '../sync/model';
import { EMPTY_CURSOR } from '../sync/model';

type Db = SQLite.SQLiteDatabase;

// Cada perfil tem seu proprio banco; o registro dos perfis fica em profiles.ts
export function profileDbName(profileId: string): string {
  return `scanner_${profileId}.db`;
}

let currentProfile = getActiveProfileId();
let db: Db = SQLite.openDatabaseSync(profileDbName(currentProfile));

export function getCurrentProfile() { return currentProfile; }

export function changeProfile(profile: string) {
  if (currentProfile === profile) return;
  db.closeSync();
  currentProfile = profile;
  db = SQLite.openDatabaseSync(profileDbName(currentProfile));
  initDatabase();
  setActiveProfileId(profile);
}

// ID unico mesmo com dois salvamentos no mesmo milissegundo
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Esquema da v1, congelado: a v1 recria a tabela com ele e a v2 acrescenta as colunas de sincronização
const DOCUMENTS_SCHEMA = `
  id TEXT PRIMARY KEY NOT NULL,
  imageUri TEXT NOT NULL,
  documentType TEXT NOT NULL,
  issuer TEXT,
  referenceMonth TEXT,
  cnpj TEXT,
  cpf TEXT,
  totalAmountCents INTEGER,
  dueDate TEXT,
  boletoLine TEXT,
  ocrText TEXT,
  isPaid INTEGER DEFAULT 0,
  paymentDate TEXT,
  createdAt TEXT NOT NULL
`;

const SCHEMA_VERSION = 2;

function runInTransaction(target: Db, sql: string) {
  try {
    target.execSync(`BEGIN;\n${sql}\nCOMMIT;`);
  } catch (e) {
    try { target.execSync('ROLLBACK;'); } catch {}
    throw e;
  }
}

function runMigrations(target: Db) {
  const row = target.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // v1: o ALTER TABLE antigo criava isPaid/totalAmountCents como TEXT,
  // fazendo isPaid === 0 falhar. Recria a tabela com os tipos corretos.
  if (version < 1) migrateToV1(target);

  // v2: base da sincronização. Conteúdo e pagamento têm datas e marcas de envio separadas,
  // para "fulano pagou" e "ciclano corrigiu o valor" não sobrescreverem um ao outro.
  // Exclusão vira marca (deletedAt), para avisar os outros aparelhos.
  if (version < 2) {
    runInTransaction(target, `
      ALTER TABLE documents ADD COLUMN updatedAt TEXT;
      ALTER TABLE documents ADD COLUMN paymentUpdatedAt TEXT;
      ALTER TABLE documents ADD COLUMN deletedAt TEXT;
      ALTER TABLE documents ADD COLUMN contentDirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE documents ADD COLUMN paymentDirty INTEGER NOT NULL DEFAULT 1;
      UPDATE documents SET updatedAt = createdAt, paymentUpdatedAt = createdAt;
      ALTER TABLE learned_categories ADD COLUMN updatedAt TEXT;
      ALTER TABLE learned_categories ADD COLUMN deletedAt TEXT;
      ALTER TABLE learned_categories ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      UPDATE learned_categories SET updatedAt = createdAt;
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      PRAGMA user_version = 2;
    `);
  }
}

function migrateToV1(target: Db) {
  try {
    target.execSync(`
      BEGIN;
      CREATE TABLE documents_v1 (${DOCUMENTS_SCHEMA});
      INSERT INTO documents_v1 (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt)
        SELECT id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf,
          CAST(NULLIF(TRIM(totalAmountCents), '') AS INTEGER),
          dueDate, boletoLine, ocrText,
          COALESCE(CAST(NULLIF(TRIM(isPaid), '') AS INTEGER), 0),
          paymentDate, createdAt
        FROM documents;
      DROP TABLE documents;
      ALTER TABLE documents_v1 RENAME TO documents;
      PRAGMA user_version = 1;
      COMMIT;
    `);
  } catch (e) {
    try { target.execSync('ROLLBACK;'); } catch {}
    throw e;
  }
}

// Cria/atualiza as tabelas de um banco de perfil (o ativo ou outro, ao criar/editar perfis)
function initSchema(target: Db) {
  // Tabela de documentos
  target.execSync(`CREATE TABLE IF NOT EXISTS documents (${DOCUMENTS_SCHEMA});`);

  // Tabela de cache de CNPJ (para consultas offline)
  target.execSync(`
    CREATE TABLE IF NOT EXISTS cnpj_cache (
      cnpj TEXT PRIMARY KEY NOT NULL,
      razao_social TEXT,
      cnae_fiscal TEXT,
      cnae_descricao TEXT,
      categoria TEXT,
      fetchedAt TEXT NOT NULL
    );
  `);

  // Tabela de configurações
  target.execSync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Tabela de aprendizado
  target.execSync(`
    CREATE TABLE IF NOT EXISTS learned_categories (
      id TEXT PRIMARY KEY NOT NULL,
      pattern TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  // Migração segura de colunas antigas
  const columns: [string, string][] = [
    ['issuer', 'TEXT'], ['referenceMonth', 'TEXT'], ['dueDate', 'TEXT'], ['isPaid', 'INTEGER DEFAULT 0'],
    ['paymentDate', 'TEXT'], ['cnpj', 'TEXT'], ['cpf', 'TEXT'], ['totalAmountCents', 'INTEGER'], ['boletoLine', 'TEXT'],
  ];
  for (const [col, type] of columns) {
    try { target.execSync(`ALTER TABLE documents ADD COLUMN ${col} ${type};`); } catch {}
  }

  runMigrations(target);
}

export function initDatabase() {
  initSchema(db);
}

export type SavedDocument = ExtractedFields & {
  id: string;
  imageUri: string;
  ocrText: string;
  isPaid: number;
  paymentDate?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  paymentUpdatedAt?: string | null;
  deletedAt?: string | null;
  contentDirty?: number;
  paymentDirty?: number;
};

export function saveDocument(imageUri: string, ocrText: string, fields: ExtractedFields, paymentDate?: string | null): string {
  const id = generateId();
  const createdAt = new Date().toISOString();
  const isPaid = paymentDate ? 1 : 0;
  db.runSync(
    `INSERT INTO documents (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt, updatedAt, paymentUpdatedAt, contentDirty, paymentDirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    id, imageUri, fields.documentType || null, fields.issuer || null, fields.referenceMonth || null, fields.cnpj || null, fields.cpf || null, fields.totalAmountCents || null, fields.dueDate || null, fields.boletoLine || null, ocrText || null, isPaid, paymentDate || null, createdAt, createdAt, createdAt
  );
  return id;
}

export function getDocumentById(id: string): SavedDocument | null {
  const result = db.getFirstSync<SavedDocument>('SELECT * FROM documents WHERE id = ? AND deletedAt IS NULL', id);
  return result || null;
}

export function getDocuments(): SavedDocument[] {
  return db.getAllSync<SavedDocument>('SELECT * FROM documents WHERE deletedAt IS NULL ORDER BY createdAt DESC');
}

export function togglePaidStatus(id: string, currentStatus: number, paymentDate?: string): void {
  const newStatus = currentStatus === 1 ? 0 : 1;
  const dateToSave = newStatus === 1 ? (paymentDate || todayISO()) : null;
  db.runSync(
    'UPDATE documents SET isPaid = ?, paymentDate = ?, paymentUpdatedAt = ?, paymentDirty = 1 WHERE id = ?',
    newStatus, dateToSave, new Date().toISOString(), id,
  );
}

// Exclusão marcada: o registro fica (sem o texto do OCR) para a sincronização avisar os outros aparelhos
export function deleteDocumentById(id: string): void {
  const now = new Date().toISOString();
  db.runSync(
    'UPDATE documents SET deletedAt = ?, updatedAt = ?, ocrText = NULL, contentDirty = 1 WHERE id = ?',
    now, now, id,
  );
}

export function clearAllData(): void {
  db.runSync('DELETE FROM documents');
}

export function getSetting(key: string, defaultValue: string): string {
  try {
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export function saveLearnedCategory(pattern: string, category: string): void {
  const normalized = pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!normalized || normalized.length < 3) return;
  const now = new Date().toISOString();
  // Mesma palavra-chave mantém o mesmo id (a sincronização depende disso)
  db.runSync(
    `INSERT INTO learned_categories (id, pattern, category, createdAt, updatedAt, dirty) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(pattern) DO UPDATE SET category = excluded.category, updatedAt = excluded.updatedAt, deletedAt = NULL, dirty = 1`,
    generateId(), normalized, category, now, now,
  );
}

export function getLearnedCategories(): { pattern: string; category: string }[] {
  try {
    return db.getAllSync<{ pattern: string; category: string }>('SELECT pattern, category FROM learned_categories WHERE deletedAt IS NULL');
  } catch {
    return [];
  }
}

export function updateDocumentIssuer(id: string, newIssuer: string): void {
  db.runSync('UPDATE documents SET issuer = ?, updatedAt = ?, contentDirty = 1 WHERE id = ?', newIssuer, new Date().toISOString(), id);
}


export function getLearnedPatternForCategory(category: string): string | null {
  try {
    const row = db.getFirstSync<{ pattern: string }>(
      'SELECT pattern FROM learned_categories WHERE category = ? AND deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 1',
      category
    );
    return row ? row.pattern : null;
  } catch {
    return null;
  }
}


export function getCachedCNPJ(cnpj: string): { razao_social: string; cnae_fiscal: string; cnae_descricao: string; categoria: string } | null {
  try {
    const row = db.getFirstSync<any>('SELECT * FROM cnpj_cache WHERE cnpj = ?', cnpj.replace(/\D/g, ''));
    if (!row) return null;
    // Cache válido por 30 dias
    const fetched = new Date(row.fetchedAt).getTime();
    const daysOld = (Date.now() - fetched) / (1000 * 60 * 60 * 24);
    if (daysOld > 30) return null;
    return { razao_social: row.razao_social, cnae_fiscal: row.cnae_fiscal, cnae_descricao: row.cnae_descricao, categoria: row.categoria };
  } catch {
    return null;
  }
}

export function saveCachedCNPJ(cnpj: string, razao_social: string, cnae_fiscal: string, cnae_descricao: string, categoria: string): void {
  try {
    db.runSync(
      'INSERT OR REPLACE INTO cnpj_cache (cnpj, razao_social, cnae_fiscal, cnae_descricao, categoria, fetchedAt) VALUES (?, ?, ?, ?, ?, ?)',
      cnpj.replace(/\D/g, ''), razao_social, cnae_fiscal, cnae_descricao, categoria, new Date().toISOString()
    );
  } catch {}
}


// Executa fn no banco de um perfil qualquer, abrindo e fechando se não for o ativo
function withProfileDb<T>(profileId: string, fn: (target: Db) => T): T {
  if (profileId === currentProfile) return fn(db);
  const target = SQLite.openDatabaseSync(profileDbName(profileId));
  try {
    initSchema(target);
    return fn(target);
  } finally {
    target.closeSync();
  }
}

export function getProfileSettings(profileId: string, defaults: Record<string, string>): Record<string, string> {
  return withProfileDb(profileId, target => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const row = target.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
      if (row) result[key] = row.value;
    }
    return result;
  });
}

export function setProfileSettings(profileId: string, values: Record<string, string>): void {
  withProfileDb(profileId, target => {
    for (const [key, value] of Object.entries(values)) {
      target.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    }
  });
}

export function countProfileDocuments(profileId: string): { total: number; pending: number } {
  return withProfileDb(profileId, target => {
    const row = target.getFirstSync<{ total: number; pending: number }>(
      'SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN isPaid = 0 THEN 1 ELSE 0 END), 0) AS pending FROM documents WHERE deletedAt IS NULL'
    );
    return { total: row?.total ?? 0, pending: row?.pending ?? 0 };
  });
}

export type PendingDocument = { id: string; issuer: string | null; totalAmountCents: number | null; dueDate: string | null };

// Contas não pagas de um perfil (inclusive não ativo), da que vence primeiro; sem vencimento vão para o fim.
// Ignora o "registro só de pagamento" que a sincronização cria antes de o conteúdo chegar.
export function listPendingDocuments(profileId: string, limit = 50): PendingDocument[] {
  return withProfileDb(profileId, target =>
    target.getAllSync<PendingDocument>(
      `SELECT id, issuer, totalAmountCents, dueDate FROM documents
       WHERE deletedAt IS NULL AND isPaid = 0
         AND NOT (documentType = 'DESCONHECIDO' AND issuer IS NULL AND totalAmountCents IS NULL)
       ORDER BY dueDate IS NULL, dueDate ASC, createdAt DESC
       LIMIT ?`,
      limit,
    ) ?? [],
  );
}

// Apaga o banco de um perfil (que não pode ser o ativo) e devolve o que precisa ser limpo fora dele
export function deleteProfileDatabase(profileId: string): { imageUris: string[]; docIds: string[] } {
  if (profileId === currentProfile) throw new Error('Troque de perfil antes de excluir o perfil ativo.');
  const target = SQLite.openDatabaseSync(profileDbName(profileId));
  let rows: { id: string; imageUri: string }[] = [];
  try {
    rows = target.getAllSync<{ id: string; imageUri: string }>('SELECT id, imageUri FROM documents') ?? [];
  } catch {
    // banco vazio, sem tabela documents
  } finally {
    target.closeSync();
  }
  SQLite.deleteDatabaseSync(profileDbName(profileId));
  return { imageUris: rows.map(r => r.imageUri), docIds: rows.map(r => r.id) };
}


// Move uma conta da gaveta aberta para outra: copia para o banco da outra (marcada para enviar)
// e deixa uma marca de exclusão aqui, para a gaveta de origem sumir com ela nos outros celulares.
// A foto continua no mesmo arquivo do celular.
export function moveDocumentToProfile(id: string, targetProfileId: string): SavedDocument {
  if (targetProfileId === currentProfile) throw new Error('A conta já está nesta gaveta.');
  const doc = db.getFirstSync<SavedDocument>(
    'SELECT * FROM documents WHERE id = ? AND deletedAt IS NULL', id,
  );
  if (!doc) throw new Error('Conta não encontrada.');
  const now = new Date().toISOString();
  withProfileDb(targetProfileId, target => {
    target.runSync(
      `INSERT OR REPLACE INTO documents (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt, updatedAt, paymentUpdatedAt, deletedAt, contentDirty, paymentDirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 1)`,
      doc.id, doc.imageUri ?? '', doc.documentType, doc.issuer, doc.referenceMonth, doc.cnpj, doc.cpf,
      doc.totalAmountCents, doc.dueDate, doc.boletoLine, doc.ocrText, doc.isPaid, doc.paymentDate ?? null,
      doc.createdAt, now, now,
    );
  });
  deleteDocumentById(id);
  return doc;
}

// Conta existe (e não foi excluída) no banco de uma gaveta, aberta ou não
export function documentExistsInProfile(profileId: string, id: string): boolean {
  return withProfileDb(profileId, target =>
    !!target.getFirstSync<{ id: string }>('SELECT id FROM documents WHERE id = ? AND deletedAt IS NULL', id));
}

// Exclui (marca de exclusão, para sincronizar) uma conta de qualquer gaveta, aberta ou não
export function deleteDocumentInProfile(profileId: string, id: string): void {
  const now = new Date().toISOString();
  withProfileDb(profileId, target => {
    target.runSync('UPDATE documents SET deletedAt = ?, updatedAt = ?, ocrText = NULL, contentDirty = 1 WHERE id = ?', now, now, id);
  });
}

type SyncDocRow = Omit<SyncDocument, 'contentDirty' | 'paymentDirty'> & { contentDirty: number; paymentDirty: number };
type SyncLearnedRow = Omit<SyncLearned, 'dirty'> & { dirty: number };

// Estado usado por uma rodada de sincronização do perfil
export function loadSyncSnapshot(profileId: string): SyncSnapshot {
  return withProfileDb(profileId, target => {
    const docs = target.getAllSync<SyncDocRow>(
      `SELECT id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText,
              isPaid, paymentDate, createdAt, updatedAt, paymentUpdatedAt, deletedAt, contentDirty, paymentDirty
       FROM documents`
    ) ?? [];
    const learned = target.getAllSync<SyncLearnedRow>(
      'SELECT id, pattern, category, updatedAt, deletedAt, dirty FROM learned_categories'
    ) ?? [];
    const meta = target.getAllSync<{ key: string; value: string }>('SELECT key, value FROM sync_meta') ?? [];
    const photoDue: Record<string, string> = {};
    const photoHave: Record<string, string> = {};
    let cursor = EMPTY_CURSOR;
    for (const row of meta) {
      if (row.key === 'cursor') cursor = row.value;
      else if (row.key.startsWith('photoDue:')) photoDue[row.key.slice('photoDue:'.length)] = row.value;
      else if (row.key.startsWith('photoHave:')) photoHave[row.key.slice('photoHave:'.length)] = row.value;
    }
    return {
      cursor,
      photoDue,
      photoHave,
      documents: docs.map(d => ({
        ...d,
        imageUri: d.imageUri || '',
        updatedAt: d.updatedAt || d.createdAt,
        paymentUpdatedAt: d.paymentUpdatedAt || d.createdAt,
        contentDirty: d.contentDirty === 1,
        paymentDirty: d.paymentDirty === 1,
      })),
      learned: learned.map(d => ({ ...d, updatedAt: d.updatedAt || '', dirty: d.dirty === 1 })),
    };
  });
}

// Grava o resultado de uma rodada. Conteúdo não mexe no pagamento, e o contrário também.
export function commitSync(profileId: string, commit: SyncCommit): void {
  withProfileDb(profileId, target => {
    const run = (sql: string, ...args: (string | number | null)[]) => {
      target.runSync(sql, ...args);
    };
    try {
      target.execSync('BEGIN');
      for (const doc of commit.contents) {
        run(
          `INSERT INTO documents (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt, updatedAt, paymentUpdatedAt, deletedAt, contentDirty, paymentDirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, 0, 0)
           ON CONFLICT(id) DO UPDATE SET
             imageUri = COALESCE(?, documents.imageUri),
             documentType = excluded.documentType,
             issuer = excluded.issuer,
             referenceMonth = excluded.referenceMonth,
             cnpj = excluded.cnpj,
             cpf = excluded.cpf,
             totalAmountCents = excluded.totalAmountCents,
             dueDate = excluded.dueDate,
             boletoLine = excluded.boletoLine,
             ocrText = excluded.ocrText,
             createdAt = excluded.createdAt,
             updatedAt = excluded.updatedAt,
             deletedAt = excluded.deletedAt,
             contentDirty = 0`,
          doc.id, doc.imageUri ?? '', doc.documentType, doc.issuer, doc.referenceMonth, doc.cnpj, doc.cpf,
          doc.totalAmountCents, doc.dueDate, doc.boletoLine, doc.ocrText, doc.createdAt, doc.updatedAt, doc.updatedAt, doc.deletedAt,
          doc.imageUri,
        );
      }
      for (const pay of commit.payments) {
        const exists = target.getFirstSync<{ id: string }>('SELECT id FROM documents WHERE id = ?', pay.id);
        if (!exists) {
          run(
            `INSERT INTO documents (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt, updatedAt, paymentUpdatedAt, contentDirty, paymentDirty)
             VALUES (?, '', 'DESCONHECIDO', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, 0, 0)`,
            pay.id, pay.isPaid, pay.paymentDate, pay.paymentUpdatedAt, pay.paymentUpdatedAt, pay.paymentUpdatedAt,
          );
        } else {
          run(
            'UPDATE documents SET isPaid = ?, paymentDate = ?, paymentUpdatedAt = ?, paymentDirty = 0 WHERE id = ?',
            pay.isPaid, pay.paymentDate, pay.paymentUpdatedAt, pay.id,
          );
        }
      }
      for (const item of commit.learned) {
        run('DELETE FROM learned_categories WHERE pattern = ? AND id <> ?', item.pattern, item.id);
        run(
          `INSERT INTO learned_categories (id, pattern, category, createdAt, updatedAt, deletedAt, dirty)
           VALUES (?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT(id) DO UPDATE SET pattern = excluded.pattern, category = excluded.category, updatedAt = excluded.updatedAt, deletedAt = excluded.deletedAt, dirty = 0`,
          item.id, item.pattern, item.category, item.updatedAt, item.updatedAt, item.deletedAt,
        );
      }
      for (const image of commit.images) {
        run('UPDATE documents SET imageUri = ? WHERE id = ?', image.imageUri, image.id);
      }
      for (const id of commit.clearContent) run('UPDATE documents SET contentDirty = 0 WHERE id = ?', id);
      for (const id of commit.clearPayment) run('UPDATE documents SET paymentDirty = 0 WHERE id = ?', id);
      for (const id of commit.clearLearned) run('UPDATE learned_categories SET dirty = 0 WHERE id = ?', id);
      if (commit.cursor) run('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', 'cursor', commit.cursor);
      for (const [key, value] of Object.entries(commit.meta)) {
        if (value === null) run('DELETE FROM sync_meta WHERE key = ?', key);
        else run('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', key, value);
      }
      target.execSync('COMMIT');
    } catch (e) {
      try { target.execSync('ROLLBACK'); } catch {}
      throw e;
    }
  });
}

// Perfil desligado da nuvem (saiu ou foi removido de uma gaveta): esquece o que já foi enviado,
// para que, se voltar a sincronizar num cofre novo, tudo suba de novo
export function resetSyncState(profileId: string): void {
  withProfileDb(profileId, target => {
    target.execSync('BEGIN');
    try {
      target.runSync('DELETE FROM sync_meta');
      target.runSync('UPDATE documents SET contentDirty = 1, paymentDirty = 1');
      target.runSync('UPDATE learned_categories SET dirty = 1');
      target.execSync('COMMIT');
    } catch (e) {
      try { target.execSync('ROLLBACK'); } catch {}
      throw e;
    }
  });
}

