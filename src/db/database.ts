import * as SQLite from 'expo-sqlite';
import { ExtractedFields } from '../types/document';

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

export function initDatabase() {
  // 1. Cria a tabela se não existir (com todas as colunas)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS documents (
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
    );
  `);

  // 2. Tenta ALTER TABLE de forma defensiva (não depende do PRAGMA)
  try {
    db.execSync('ALTER TABLE documents ADD COLUMN paymentDate TEXT;');
    console.log('✅ Coluna paymentDate adicionada (ou já existia).');
  } catch (e: any) {
    // Se falhar com "duplicate column name", ignora (já existe)
    const msg = String(e);
    if (msg.includes('duplicate column name') || msg.includes('already exists')) {
      console.log('✅ Coluna paymentDate já existe.');
    } else {
      // Se falhar por outro motivo, recria a tabela
      console.warn('⚠️ Recriando tabela documentos para garantir integridade...', msg);
      try {
        db.execSync('DROP TABLE IF EXISTS documents');
        db.execSync(`
          CREATE TABLE documents (
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
          );
        `);
        console.log('✅ Tabela recriada com sucesso.');
      } catch (recreateError) {
        console.error('❌ Erro fatal ao recriar tabela:', recreateError);
      }
    }
  }
}

export type SavedDocument = ExtractedFields & {
  id: string;
  imageUri: string;
  ocrText: string;
  isPaid: number;
  paymentDate?: string | null;
  createdAt: string;
};

export function saveDocument(
  imageUri: string,
  ocrText: string,
  fields: ExtractedFields,
  paymentDate?: string | null
): string {
  const id = Date.now().toString();
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
  const dateToSave = newStatus === 1 ? (paymentDate || new Date().toISOString().split('T')[0]) : null;
  db.runSync('UPDATE documents SET isPaid = ?, paymentDate = ? WHERE id = ?', newStatus, dateToSave, id);
}

export function deleteDocumentById(id: string): void {
  db.runSync('DELETE FROM documents WHERE id = ?', id);
}


export function clearAllData(): void {
  db.runSync('DELETE FROM documents');
}


export function saveLearnedCategory(pattern: string, category: string): void {
  const normalized = pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!normalized || normalized.length < 3) return;
  const id = Date.now().toString();
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
