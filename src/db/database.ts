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
      createdAt TEXT NOT NULL
    );
  `);

  // Migracao simples para quem ja tinha a tabela antiga (ignora erro se a coluna ja existir)
  try { db.execSync("ALTER TABLE documents ADD COLUMN issuer TEXT;"); } catch {}
  try { db.execSync("ALTER TABLE documents ADD COLUMN referenceMonth TEXT;"); } catch {}
  try { db.execSync("ALTER TABLE documents ADD COLUMN dueDate TEXT;"); } catch {}
  try { db.execSync("ALTER TABLE documents ADD COLUMN isPaid INTEGER DEFAULT 0;"); } catch {}
}

export type SavedDocument = ExtractedFields & {
  id: string;
  imageUri: string;
  ocrText: string;
  isPaid: number;
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
    id, imageUri, fields.documentType, fields.issuer, fields.referenceMonth, fields.cnpj, fields.cpf, fields.totalAmountCents, fields.dueDate, fields.boletoLine, ocrText, isPaid, paymentDate || null, createdAt
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

export function togglePaidStatus(id: string, currentStatus: number): void {
  const newStatus = currentStatus === 1 ? 0 : 1;
  db.runSync('UPDATE documents SET isPaid = ? WHERE id = ?', newStatus, id);
}

export function deleteDocumentById(id: string): void {
  db.runSync('DELETE FROM documents WHERE id = ?', id);
}


export function clearAllData(): void {
  db.runSync('DELETE FROM documents');
}
