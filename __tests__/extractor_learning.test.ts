import { extractFields } from '../src/utils/extractor';

describe('QA Senior - Extrator com Aprendizado', () => {
  it('deve priorizar a categoria aprendida sobre as regras fixas', async () => {
    const text = 'BOLETO GIGA MAIS FIBRA Venc 10/11/2026 Total R$ 100,00';
    const learned = [{ pattern: 'giga mais', category: 'GIGA MAIS TELECOM' }];
    
    const fields = await extractFields(text, learned);
    // Deve ser 'GIGA MAIS TELECOM' e não 'INTERNET' (regra fixa)
    expect(fields.issuer).toBe('GIGA MAIS TELECOM');
  });

  it('deve usar a regra fixa se o aprendizado nao bater', async () => {
    const text = 'BOLETO GIGA MAIS FIBRA Venc 10/11/2026 Total R$ 100,00';
    const learned = [{ pattern: 'outra coisa', category: 'OUTRO' }];
    
    const fields = await extractFields(text, learned);
    expect(fields.issuer).toBe('INTERNET');
  });

  it('deve ignorar palavras aprendidas muito curtas (evitar falsos positivos)', async () => {
    const text = 'BOLETO Venc 10/11/2026 Total R$ 100,00';
    const learned = [{ pattern: 'de', category: 'FALSO' }];
    
    const fields = await extractFields(text, learned);
    expect(fields.issuer).not.toBe('FALSO');
  });

  it('deve lidar com categorias aprendidas vazias sem quebrar', async () => {
    const text = 'BOLETO Venc 10/11/2026 Total R$ 100,00';
    const fields = await extractFields(text, []);
    expect(fields.documentType).toBe('BOLETO');
  });
});
