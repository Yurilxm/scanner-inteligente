jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

import { validateBoletoLine, decodeBoletoLine } from '../src/utils/boleto';
import { extractFields } from '../src/utils/extractor';

// Linhas conferidas com uma implementação de referência independente (Febraban)
const BB_EXEMPLO = '00190500954014481606906809350314337370000000100';      // fator 3737, R$ 1,00
const BANCARIO = '23793381288600000000933812600006116260000018131';        // venc 10/11/2026, R$ 181,31
const BANCARIO_SEM_VALOR = '23793381288600000000933812600006300000000000000'; // fator e valor zerados
const ARREC_MOD10 = '826100000049620600480003123123456782901234500006';     // id 6, R$ 462,06
const ARREC_MOD11 = '828600000045620600480006123123456784901234500005';     // id 8, R$ 462,06
const ARREC_REFERENCIA = '827900000049620600480003123123456782901234500006'; // id 7 (valor de referência)

// Troca um dígito por outro, simulando erro de leitura do OCR
function corrupt(line: string, index: number): string {
  const d = (Number(line[index]) + 1) % 10;
  return line.slice(0, index) + d + line.slice(index + 1);
}

describe('validateBoletoLine', () => {
  it.each([BB_EXEMPLO, BANCARIO, BANCARIO_SEM_VALOR, ARREC_MOD10, ARREC_MOD11, ARREC_REFERENCIA])(
    'aceita linha válida %s', (line) => {
      expect(validateBoletoLine(line)).toBe(true);
    }
  );

  it('aceita a linha formatada como impressa no boleto', () => {
    expect(validateBoletoLine('00190.50095 40144.816069 06809.350314 3 37370000000100')).toBe(true);
    expect(validateBoletoLine('82610000004-9 62060048000-3 12312345678-2 90123450000-6')).toBe(true);
  });

  it('rejeita dígito trocado (47)', () => {
    for (let i = 0; i < BANCARIO.length; i++) {
      if (i === 39) continue; // ver teste abaixo
      expect(validateBoletoLine(corrupt(BANCARIO, i))).toBe(false);
    }
  });

  it('limite do padrão Febraban: DV geral 0/10/11 vira 1, então algumas trocas passam', () => {
    // Nesta linha o mod11 bruto é 1; trocar o índice 39 dá 10, que também vira DV 1
    expect(validateBoletoLine(corrupt(BANCARIO, 39))).toBe(true);
  });

  it('rejeita qualquer dígito trocado (48, mod10 e mod11)', () => {
    for (const line of [ARREC_MOD10, ARREC_MOD11]) {
      // posição 2 muda o módulo usado; as demais devem falhar no DV
      for (let i = 0; i < line.length; i++) {
        if (i === 2) continue;
        expect(validateBoletoLine(corrupt(line, i))).toBe(false);
      }
    }
  });

  it('rejeita tamanho errado, sequências repetidas e arrecadação sem o 8 inicial', () => {
    expect(validateBoletoLine('123')).toBe(false);
    expect(validateBoletoLine('8'.repeat(48))).toBe(false);
    expect(validateBoletoLine('1' + ARREC_MOD10.slice(1))).toBe(false);
  });
});

describe('decodeBoletoLine', () => {
  const hoje = new Date('2026-10-23T12:00:00Z');

  it('extrai valor e vencimento do boleto bancário (ciclo novo do fator)', () => {
    expect(decodeBoletoLine(BANCARIO, hoje)).toEqual({ kind: 'BANCARIO', amountCents: 18131, dueDate: '2026-11-10' });
  });

  it('usa o ciclo original do fator para datas antigas', () => {
    const r = decodeBoletoLine(BB_EXEMPLO, new Date('2007-12-01T12:00:00Z'));
    expect(r).toEqual({ kind: 'BANCARIO', amountCents: 100, dueDate: '2007-12-31' });
  });

  it('fator e valor zerados viram null', () => {
    expect(decodeBoletoLine(BANCARIO_SEM_VALOR, hoje)).toEqual({ kind: 'BANCARIO', amountCents: null, dueDate: null });
  });

  it('arrecadação com valor efetivo (6 e 8) traz o valor; sem vencimento', () => {
    expect(decodeBoletoLine(ARREC_MOD10)).toEqual({ kind: 'ARRECADACAO', amountCents: 46206, dueDate: null });
    expect(decodeBoletoLine(ARREC_MOD11)).toEqual({ kind: 'ARRECADACAO', amountCents: 46206, dueDate: null });
  });

  it('arrecadação com valor de referência (7) não traz valor', () => {
    expect(decodeBoletoLine(ARREC_REFERENCIA)?.amountCents).toBeNull();
  });

  it('linha inválida retorna null', () => {
    expect(decodeBoletoLine(corrupt(BANCARIO, 5))).toBeNull();
  });
});

describe('Extrator usando a linha digitável', () => {
  it('guarda a linha válida (só dígitos) e usa o valor dela', async () => {
    const r = await extractFields(`PROLAGOS TOTAL A PAGAR R$ 482,06 VENCIMENTO 05/11/2026
      82610000004-9 62060048000-3 12312345678-2 90123450000-6`);
    expect(r.boletoLine).toBe(ARREC_MOD10);
    expect(r.totalAmountCents).toBe(46206); // OCR leu 482,06; a linha validada diz 462,06
    expect(r.dueDate).toBe('2026-11-05');   // arrecadação não traz vencimento: vem do texto
  });

  it('usa vencimento e valor do boleto bancário quando o texto não tem', async () => {
    const r = await extractFields('Pagavel em qualquer banco 23793.38128 86000.000009 33812.600006 1 16260000018131');
    expect(r.documentType).toBe('BOLETO');
    expect(r.boletoLine).toBe(BANCARIO);
    expect(r.totalAmountCents).toBe(18131);
    expect(r.dueDate).toMatch(/^\d{4}-11-10$/);
  });

  it('descarta linha com dígito errado e mantém os dados do texto', async () => {
    const r = await extractFields(`TOTAL A PAGAR R$ 482,06 VENCIMENTO 05/11/2026 ${corrupt(ARREC_MOD10, 20)}`);
    expect(r.boletoLine).toBeNull();
    expect(r.totalAmountCents).toBe(48206);
  });
});
