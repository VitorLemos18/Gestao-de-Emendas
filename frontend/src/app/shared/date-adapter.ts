import { Injectable } from '@angular/core';
import { MatDateFormats, NativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';

@Injectable()
export class PtBrDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Calendário';
  override openCalendarLabel = 'Abrir calendário';
  override closeCalendarLabel = 'Fechar calendário';
  override prevMonthLabel = 'Mês anterior';
  override nextMonthLabel = 'Próximo mês';
  override prevYearLabel = 'Ano anterior';
  override nextYearLabel = 'Próximo ano';
  override prevMultiYearLabel = 'Anos anteriores';
  override nextMultiYearLabel = 'Próximos anos';
  override switchToMonthViewLabel = 'Escolher mês e dia';
  override switchToMultiYearViewLabel = 'Escolher ano e mês';
  override startDateLabel = 'Data inicial';
  override endDateLabel = 'Data final';
  override comparisonDateLabel = 'Data de comparação';
  override formatYearRange(start: string, end: string): string { return `${start} – ${end}`; }
  override formatYearRangeLabel(start: string, end: string): string { return `De ${start} a ${end}`; }
}

export const APP_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: 'DD/MM/YYYY' },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: { month: 'long', year: 'numeric' },
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

@Injectable()
export class PtBrDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return this.isValid(value) ? this.clone(value) : this.invalid();
    if (typeof value !== 'string') return this.invalid();
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return this.invalid();
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    return this.strictDate(year, month, day);
  }

  override deserialize(value: unknown): Date | null {
    if (typeof value === 'string') {
      if (value === '') return null;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      return match ? this.strictDate(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : this.invalid();
    }
    return value instanceof Date && this.isValid(value) ? this.clone(value) : value == null ? null : this.invalid();
  }

  override format(date: Date, displayFormat: unknown): string {
    if (!this.isValid(date)) throw new RangeError('Data inválida.');
    if (displayFormat === 'DD/MM/YYYY') {
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).padStart(4, '0')}`;
    }
    return super.format(date, displayFormat as Intl.DateTimeFormatOptions);
  }

  override toIso8601(date: Date): string {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private strictDate(year: number, month: number, day: number): Date {
    const result = new Date(0);
    result.setFullYear(year, month, day);
    result.setHours(0, 0, 0, 0);
    return year > 0 && result.getFullYear() === year && result.getMonth() === month && result.getDate() === day
      ? result : this.invalid();
  }
}
