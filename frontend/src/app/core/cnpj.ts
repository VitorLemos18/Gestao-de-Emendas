const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(input: string): string {
  return input.toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '').slice(0, 14);
}

export function formatCnpj(input: string): string {
  const value = normalizeCnpj(input);
  const parts = [value.slice(0, 2), value.slice(2, 5), value.slice(5, 8), value.slice(8, 12)];
  let result = parts[0];
  if (parts[1]) result += `.${parts[1]}`;
  if (parts[2]) result += `.${parts[2]}`;
  if (parts[3]) result += `/${parts[3]}`;
  if (value.length > 12) result += `-${value.slice(12, 14)}`;
  return result;
}

export function isValidCnpj(input: string): boolean {
  const value = normalizeCnpj(input);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(value) || /^([0-9])\1{13}$/.test(value)) return false;
  return (
    checkDigit(value.slice(0, 12), FIRST_DIGIT_WEIGHTS) === Number(value[12]) &&
    checkDigit(value.slice(0, 13), SECOND_DIGIT_WEIGHTS) === Number(value[13])
  );
}

function checkDigit(base: string, weights: number[]): number {
  const sum = [...base].reduce(
    (total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index],
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
