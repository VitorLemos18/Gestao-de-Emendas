import { describe, expect, it } from 'vitest';
import { executionProgress } from '../../shared/execution-progress';

describe('executionProgress', () => {
  it('calcula percentual com valores em centavos e arredonda para uma casa', () => {
    expect(executionProgress('250000.00', '1000000.00')).toEqual({ width: 25, label: '25%' });
    expect(executionProgress('125500.00', '1000000.00')).toEqual({ width: 12.6, label: '12,6%' });
  });

  it('não produz barra preenchida quando não há crédito', () => {
    expect(executionProgress('0.00', '0.00')).toEqual({ width: 0, label: '—' });
  });

  it('limita somente a largura da barra a 100%', () => {
    expect(executionProgress('120.00', '100.00')).toEqual({ width: 100, label: '120%' });
  });
});
