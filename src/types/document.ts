export type DocumentType = 'BOLETO' | 'NOTA_FISCAL' | 'CONTA' | 'RECIBO' | 'DESCONHECIDO';

export type ExtractedFields = {
  documentType: DocumentType;
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null; // Sempre em centavos (inteiro)
  date: string | null; // Sempre em ISO string (YYYY-MM-DD)
  boletoLine: string | null; // Linha digitável (47 ou 48 dígitos)
};

export type ExtractedDocument = {
  rawText: string;
  fields: ExtractedFields;
};
