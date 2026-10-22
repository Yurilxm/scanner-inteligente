export type DocumentType = 'BOLETO' | 'NOTA_FISCAL' | 'CONTA' | 'RECIBO' | 'PIX' | 'DESCONHECIDO';

export type ExtractedFields = {
  documentType: DocumentType;
  issuer: string | null;         // Ex: Enel, Prolagos, Claro
  referenceMonth: string | null; // Ex: 10/2026
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null; // Sempre em centavos (inteiro)
  dueDate: string | null;          // Data de Vencimento (ISO string YYYY-MM-DD)
  boletoLine: string | null;       // Linha digitável (47 ou 48 dígitos)
};

export type ExtractedDocument = {
  rawText: string;
  fields: ExtractedFields;
};
