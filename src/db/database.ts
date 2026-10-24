import * as SQLite from 'expo-sqlite';
import { ExtractedFields } from '../types/document';
import { todayISO } from '../utils/format';

let currentProfile = 'yuri';
let db = SQLite.openDatabaseSync(`scanner_${currentProfile}.db`);

export function getCurrentProfile() { return currentProfile; }

export function changeProfile(profile: string) {
  if (currentProfile === profile) return;
  db.closeSync();
  currentProfile = profile;
  db = SQLite.openDatabaseSync(`scanner_${currentProfile}.db`);
  initDatabase();
}

// ID unico mesmo com dois salvamentos no mesmo milissegundo
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

const SCHEMA_VERSION = 1;

function runMigrations() {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // v1: o ALTER TABLE antigo criava isPaid/totalAmountCents como TEXT,
  // fazendo isPaid === 0 falhar. Recria a tabela com os tipos corretos.
  try {
    db.execSync(`
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
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `);
  } catch (e) {
    try { db.execSync('ROLLBACK;'); } catch {}
    throw e;
  }
}

export function initDatabase() {
  // Tabela de documentos
  db.execSync(`CREATE TABLE IF NOT EXISTS documents (${DOCUMENTS_SCHEMA});`);

  // Tabela de cache de CNPJ (para consultas offline)
  db.execSync(`
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
  db.execSync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Tabela de aprendizado
  db.execSync(`
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
    try { db.execSync(`ALTER TABLE documents ADD COLUMN ${col} ${type};`); } catch {}
  }

  runMigrations();
}

export type SavedDocument = ExtractedFields & {
  id: string;
  imageUri: string;
  ocrText: string;
  isPaid: number;
  paymentDate?: string | null;
  createdAt: string;
};

export function saveDocument(imageUri: string, ocrText: string, fields: ExtractedFields, paymentDate?: string | null): string {
  const id = generateId();
  const createdAt = new Date().toISOString();
  const isPaid = paymentDate ? 1 : 0;
  db.runSync(
    `INSERT INTO documents (id, imageUri, documentType, issuer, referenceMonth, cnpj, cpf, totalAmountCents, dueDate, boletoLine, ocrText, isPaid, paymentDate, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, imageUri, fields.documentType || null, fields.issuer || null, fields.referenceMonth || null, fields.cnpj || null, fields.cpf || null, fields.totalAmountCents || null, fields.dueDate || null, fields.boletoLine || null, ocrText || null, isPaid, paymentDate || null, createdAt
  );
  return id;
}

export function getDocumentById(id: string): SavedDocument | null {
  const result = db.getFirstSync<SavedDocument>('SELECT * FROM documents WHERE id = ?', id);
  return result || null;
}

export function getDocuments(): SavedDocument[] {
  return db.getAllSync<SavedDocument>('SELECT * FROM documents ORDER BY createdAt DESC');
}

export function togglePaidStatus(id: string, currentStatus: number, paymentDate?: string): void {
  const newStatus = currentStatus === 1 ? 0 : 1;
  const dateToSave = newStatus === 1 ? (paymentDate || todayISO()) : null;
  db.runSync('UPDATE documents SET isPaid = ?, paymentDate = ? WHERE id = ?', newStatus, dateToSave, id);
}

export function deleteDocumentById(id: string): void {
  db.runSync('DELETE FROM documents WHERE id = ?', id);
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
  const id = generateId();
  db.runSync(
    'INSERT OR REPLACE INTO learned_categories (id, pattern, category, createdAt) VALUES (?, ?, ?, ?)',
    id, normalized, category, new Date().toISOString()
  );
}

export function getLearnedCategories(): { pattern: string; category: string }[] {
  try {
    return db.getAllSync<{ pattern: string; category: string }>('SELECT pattern, category FROM learned_categories');
  } catch {
    return [];
  }
}

export function updateDocumentIssuer(id: string, newIssuer: string): void {
  db.runSync('UPDATE documents SET issuer = ? WHERE id = ?', newIssuer, id);
}


export function getLearnedPatternForCategory(category: string): string | null {
  try {
    const row = db.getFirstSync<{ pattern: string }>(
      'SELECT pattern FROM learned_categories WHERE category = ? ORDER BY createdAt DESC LIMIT 1',
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
