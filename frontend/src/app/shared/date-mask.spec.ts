import { maskitoTransform } from '@maskito/core';
import { PT_BR_DATE_MASK } from './date-mask';

describe('PT_BR_DATE_MASK', () => {
  it('inserts date separators while typing digits', () => {
    expect(maskitoTransform('23052024', PT_BR_DATE_MASK)).toBe('23/05/2024');
  });

  it('keeps the Brazilian date format when pasted with separators', () => {
    expect(maskitoTransform('23/05/2024', PT_BR_DATE_MASK)).toBe('23/05/2024');
  });
});
