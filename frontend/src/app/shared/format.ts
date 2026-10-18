import { Pipe, PipeTransform } from '@angular/core';
import { brl } from '../core/money';
import { ROLE_LABEL, Role } from '../core/models';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value === null || value === undefined ? '—' : brl(value);
  }
}

@Pipe({ name: 'dateBr' })
export class DateBrPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
    }).format(instant);
  }
}

@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(value: Role): string { return ROLE_LABEL[value]; }
}
