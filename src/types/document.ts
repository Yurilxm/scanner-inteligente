export type DocumentType = 'OUTROS' | 'BOLETO' | 'NOTA_FISCAL' | 'CONTA' | 'RECIBO' | 'PIX' | 'DESCONHECIDO';

export type ExtractedFields = {
  documentType: DocumentType;
  issuer: string | null;         // Ex: Enel, Prolagos, Claro
  referenceMonth: string | null; // Ex: 10/2026
  cnpj: string | null;
  cpf: string | null;
  totalAmountCents: number | null; // Sempre em centavos (inteiro)
  dueDate: string | null;          // Data de Vencimento (ISO string YYYY-MM-DD)
  boletoLine: string | null;       // Linha digitavel (47 ou 48 digitos)

  // So o PIX preenche. Boleto deixa null/undefined.
  // Nao vai pro banco por este objeto: saveDocument/updateDocument
  // recebem paymentDate em parametro separado.
  paymentDate?: string | null;     // ISO YYYY-MM-DD detectada no comprovante PIX
  paymentTime?: string | null;     // HH:MM:SS detectado no comprovante PIX (display)
};

export type ExtractedDocument = {
  rawText: string;
  fields: ExtractedFields;
};
