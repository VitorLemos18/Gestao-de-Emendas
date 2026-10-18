import { toCents } from '../core/money';

/** Percentual arredondado a uma casa, com largura segura para a barra visual. */
export function executionProgress(amount: string, base: string): { width: number; label: string } {
  const denominator = toCents(base);
  if (denominator <= 0n) return { width: 0, label: '—' };

  const numerator = toCents(amount);
  const tenths = (numerator * 1000n + denominator / 2n) / denominator;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;
  const label = fraction === 0n ? `${whole}%` : `${whole},${fraction}%`;
  const width = Math.max(0, Math.min(100, Number(tenths) / 10));
  return { width, label };
}
