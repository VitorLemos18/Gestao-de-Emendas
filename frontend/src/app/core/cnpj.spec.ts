import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj';

describe('CNPJ', () => {
  it('formats a numeric CNPJ while typing', () => {
    expect(formatCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });

  it('supports the alphanumeric CNPJ format and its check digits', () => {
    expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(normalizeCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
  });

  it('rejects an invalid check digit and allows an empty optional field', () => {
    expect(isValidCnpj('12.345.678/0001-90')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });
});
