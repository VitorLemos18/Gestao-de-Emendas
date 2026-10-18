/** Conversões exatas. Os cálculos usam centavos bigint, inclusive nos totais. */
export function toCents(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Informe um decimal com até duas casas decimais.');
  }
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
  const result = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -result : result;
}

export function fromCents(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function formatBRLInput(value: string): string {
  const canonical = fromCents(toCents(value));
  const [integer, fraction] = canonical.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
}

export function brl(value: string): string {
  const formatted = formatBRLInput(value);
  return formatted.startsWith('-') ? `-R$ ${formatted.slice(1)}` : `R$ ${formatted}`;
}

/** Texto brasileiro em edição; não faz arredondamento nem deslocamento de centavos. */
export function parseBRL(text: string): string | null {
  const input = text.trim().replace(/\s/g, '').replace(/^(-?)R\$/, '$1');
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(input)) return null;
  return fromCents(toCents(input.replace(/\./g, '').replace(',', '.').replace(/\.$/, '')));
}
