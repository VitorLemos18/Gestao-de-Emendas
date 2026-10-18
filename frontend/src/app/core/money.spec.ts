import { describe, expect, it } from 'vitest';
import { brl, formatBRLInput, fromCents, parseBRL, toCents } from './money';

describe('dinheiro exato em reais', () => {
  it('interpreta 10000 como dez mil reais sem deslocar centavos', () => {
    expect(parseBRL('10000')).toBe('10000.00');
    expect(formatBRLInput('10000.00')).toBe('10.000,00');
    expect(brl('10000.00')).toBe('R$ 10.000,00');
  });

  it('aceita colagem brasileira e preserva centavos sem arredondar', () => {
    expect(parseBRL('R$ 10.000,50')).toBe('10000.50');
    expect(parseBRL('0,01')).toBe('0.01');
    expect(parseBRL('1,001')).toBeNull();
    expect(parseBRL('12.34,50')).toBeNull();
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('0')).toBe('0.00');
    expect(parseBRL('-10,50')).toBe('-10.50');
  });

  it('mantém exatidão inclusive em totais acima do inteiro seguro', () => {
    const value = toCents('999999999999.99');
    expect(fromCents(value + 1n)).toBe('1000000000000.00');
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(brl('99999999999999999.99')).toBe('R$ 99.999.999.999.999.999,99');
    expect(fromCents(-1n)).toBe('-0.01');
    expect(() => toCents('1.001')).toThrow();
    expect(() => toCents('10.000,00')).toThrow();
  });
});
