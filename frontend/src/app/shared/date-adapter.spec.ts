import { TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { PtBrDateAdapter } from './date-adapter';

describe('PtBrDateAdapter', () => {
  let adapter: PtBrDateAdapter;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PtBrDateAdapter, { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' }] });
    adapter = TestBed.inject(PtBrDateAdapter);
  });

  it('parses DD/MM/AAAA strictly, including leap years', () => {
    expect(adapter.format(adapter.parse('29/02/2024')!, 'DD/MM/YYYY')).toBe('29/02/2024');
    for (const text of ['29/02/2025', '31/04/2026', '01/13/2026', '10/16/2026', '1/2/2026', '2026-10-16']) {
      expect(adapter.isValid(adapter.parse(text)!)).toBe(false);
    }
    expect(adapter.parse('')).toBeNull();
  });

  it('preserves date-only values without timezone conversion or overflow', () => {
    const date = adapter.deserialize('2026-10-16')!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(16);
    expect(adapter.toIso8601(date)).toBe('2026-10-16');
    expect(adapter.isValid(adapter.deserialize('2026-02-31')!)).toBe(false);
    expect(adapter.getMonthNames('long')[9]).toBe('outubro');
  });
});
