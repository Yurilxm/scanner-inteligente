import * as SQLite from 'expo-sqlite';
import { ExtractedFields } from '../types/document';
import { todayISO } from '../utils/format';

type Db = SQLite.SQLiteDatabase;

// Cada perfil tem seu proprio banco; o registro dos perfis fica em profiles.ts
export function profileDbName(profileId: string): string {
  return `scanner_${profileId}.db`;
}

let currentProfile = 'yuri';
let db: Db = SQLite.openDatabaseSync(profileDbName(currentProfile));

export function getCurrentProfile() { return currentProfile; }

export function changeProfile(profile: string) {
  if (currentProfile === profile) return;
  db.closeSync();
  currentProfile = profile;
  db = SQLite.openDatabaseSync(profileDbName(currentProfile));
  initDatabase();
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

