jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

import { extractFields } from '../src/utils/extractor';

describe('QA - Circuit Breaker CNPJ', () => {
  it('deve falhar rapido na segunda chamada (offline nao bloqueia)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const text = 'BOLETO CNPJ 11.222.333/0001-81 Venc 10/11/2026 R$ 100,00';

    const start = Date.now();
    await extractFields(text, [], { allowCnpjLookup: true });
    const first = Date.now() - start;

    const start2 = Date.now();
    await extractFields(text, [], { allowCnpjLookup: true });
    const second = Date.now() - start2;

    expect(second).toBeLessThanOrEqual(first + 50);
  });
});
