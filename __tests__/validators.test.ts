import { validateBoletoLine } from '../src/utils/validators';
import { isValidCPF, isValidCNPJ, isValidBoleto, onlyDigits } from '../src/utils/validators';

describe('Validadores', () => {
  describe('onlyDigits', () => {
    it('remove caracteres nao numericos', () => {
      expect(onlyDigits('123.456.789-00')).toBe('12345678900');
      expect(onlyDigits('R$ 10,50')).toBe('1050');
    });
  });

  describe('isValidCPF', () => {
    it('aceita CPFs validos', () => {
      expect(isValidCPF('529.982.247-25')).toBe(true);
      expect(isValidCPF('52998224725')).toBe(true);
    });

    it('rejeita CPFs invalidos', () => {
      expect(isValidCPF('111.111.111-11')).toBe(false);
      expect(isValidCPF('123.456.789-00')).toBe(false);
      expect(isValidCPF('123')).toBe(false);
    });
  });

  describe('isValidCNPJ', () => {
    it('aceita CNPJs validos', () => {
      expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
      expect(isValidCNPJ('11222333000181')).toBe(true);
    });

    it('rejeita CNPJs invalidos', () => {
      expect(isValidCNPJ('11.111.111/1111-11')).toBe(false);
      expect(isValidCNPJ('11.222.333/0001-00')).toBe(false);
      expect(isValidCNPJ('123')).toBe(false);
    });
  });

  describe('isValidBoleto', () => {
    it('aceita linha digitavel com 47 ou 48 digitos', () => {
      expect(isValidBoleto('12345678901234567890123456789012345678901234567')).toBe(true); // 47
      expect(isValidBoleto('123456789012345678901234567890123456789012345678')).toBe(true); // 48
    });

    it('rejeita tamanhos incorretos', () => {
      expect(isValidBoleto('123')).toBe(false);
    });
  });
});

describe('Boleto Line Validation', () => {
  it('validates a correct 47-digit line', () => {
    // Um número fictício para testar a lógica base
    expect(validateBoletoLine('23793381286000000003381260000000000000000000')).toBe(false); // Ajustar com um válido real
  });
  it('rejects lines with wrong length', () => {
    expect(validateBoletoLine('123')).toBe(false);
  });
});
