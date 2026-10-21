import * as SQLite from 'expo-sqlite';
import { ExtractedFields } from '../types/document';

// Abre ou cria o banco de dados local
const db = SQLite.openDatabaseSync('scanner.db');

// Inicializa a tabela (chamado uma vez quando o app abre)
export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      imageUri TEXT NOT NULL,
      documentType TEXT NOT NULL,
      cnpj TEXT,
      cpf TEXT,
      totalAmountCents INTEGER,
      date TEXT,
      boletoLine TEXT,
      ocrText TEXT,
      createdAt TEXT NOT NULL
    );
  `);
}

export type SavedDocument = ExtractedFields & {
  id: string;
  imageUri: string;
  ocrText: string;
  createdAt: string;
};

// Salva um novo documento
export function saveDocument(
  imageUri: string,
  ocrText: string,
  fields: ExtractedFields
): void {
  const id = Date.now().toString();
  const createdAt = new Date().toISOString();

  db.runSync(
    `INSERT INTO documents (id, imageUri, documentType, cnpj, cpf, totalAmountCents, date, boletoLine, ocrText, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    imageUri,
    fields.documentType,
    fields.cnpj,
    fields.cpf,
    fields.totalAmountCents,
    fields.date,
    fields.boletoLine,
    ocrText,
    createdAt
  );
}

// Busca todos os documentos salvos (ordem decrescente de data)
export function getDocuments(): SavedDocument[] {
  return db.getAllSync<SavedDocument>('SELECT * FROM documents ORDER BY createdAt DESC');
}

// Apaga um documento pelo ID
export function deleteDocumentById(id: string): void {
  db.runSync('DELETE FROM documents WHERE id = ?', id);
}
