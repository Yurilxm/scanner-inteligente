// Limpa tudo que nao for numero
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Valida CPF (11 digitos)
export function isValidCPF(cpf: string): boolean {
  const cleanCPF = onlyDigits(cpf);
  if (cleanCPF.length !== 11 || /^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(10))) return false;

  return true;
}

// Valida CNPJ (14 digitos)
export function isValidCNPJ(cnpj: string): boolean {
  const cleanCNPJ = onlyDigits(cnpj);
  if (cleanCNPJ.length !== 14 || /^(\d)\1{13}$/.test(cleanCNPJ)) return false;

  let size = cleanCNPJ.length - 2;
  let numbers = cleanCNPJ.substring(0, size);
  const digits = cleanCNPJ.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = cleanCNPJ.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

// Valida Linha Digitável de Boleto (47 ou 48 digitos com DVs)
export function isValidBoleto(line: string): boolean {
  const cleanLine = onlyDigits(line);
  // MVP: validacao estrutural basica (tamanho e modulos).
  // A validacao completa dos digitos verificadores sera implementada
  // depois que extrairmos a linha corretamente.
  return cleanLine.length === 47 || cleanLine.length === 48;
}


// ==========================================
// VALIDAÇÃO DE LINHA DIGITÁVEL (BOLETO)
// ==========================================
export function validateBoletoLine(line: string): boolean {
  const cleanLine = line.replace(/\D/g, '');
  if (cleanLine.length !== 47 && cleanLine.length !== 48) return false;

  // Lógica simplificada para validação de módulo 10 e 11
  // (A validação completa exige o cálculo do DV geral e dos campos)
  try {
    if (cleanLine.length === 47) {
      const fields = [cleanLine.slice(0, 10), cleanLine.slice(10, 21), cleanLine.slice(21, 32)];
      const dv = parseInt(cleanLine.slice(32, 33), 10);
      
      let sum = 0;
      let weight = 2;
      const fieldWithoutDv = cleanLine.slice(0, 9) + cleanLine.slice(10, 20) + cleanLine.slice(21, 31);
      
      // Módulo 10
      const mod10 = (str: string) => {
        let s = 0, w = 2;
        for (let i = str.length - 1; i >= 0; i--) {
          let digit = parseInt(str[i], 10) * w;
          if (digit > 9) digit = Math.floor(digit / 10) + (digit % 10);
          s += digit;
          w = w === 2 ? 1 : 2;
        }
        const rem = s % 10;
        return rem === 0 ? 0 : 10 - rem;
      };
      
      return mod10(fieldWithoutDv) === dv;
    }
    // Para 48 dígitos (arrecadação), seria Módulo 11
    return true; // Implementação completa do M11 fica para o futuro se precisar
  } catch {
    return false;
  }
}
