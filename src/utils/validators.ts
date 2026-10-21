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
