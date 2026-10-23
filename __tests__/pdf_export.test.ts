import { generatePDFFile } from '../src/utils/export';
import * as Print from 'expo-print';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file://fake.pdf' }),
}));

describe('Exportação PDF', () => {
  it('gera o PDF com os dados corretos', async () => {
    const mockDoc = { id: '1', documentType: 'BOLETO', issuer: 'ENEL', dueDate: '2026-11-10', isPaid: 0, totalAmountCents: 1000, referenceMonth: '10/2026' } as any;
    const result = await generatePDFFile([mockDoc]);
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(result.uri).toBe('file://fake.pdf');
  });
});
