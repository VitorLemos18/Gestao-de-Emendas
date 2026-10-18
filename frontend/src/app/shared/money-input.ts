import { ChangeDetectorRef, Component, Input, forwardRef, inject } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { formatBRLInput, parseBRL } from '../core/money';

let moneyFieldId = 0;

@Component({
  selector: 'app-money-input',
  imports: [MatFormFieldModule, MatInputModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MoneyInput), multi: true },
  ],
  template: `
    <mat-form-field appearance="outline" floatLabel="always" class="money-field">
      <mat-label>{{ label }}</mat-label>
      <span matTextPrefix class="currency-prefix">R$&nbsp;</span>
      <input matInput [id]="fieldId" type="text" inputmode="decimal" autocomplete="off"
             [value]="text" [disabled]="disabled" [required]="required"
             [attr.aria-invalid]="invalid ? 'true' : null"
             [attr.aria-describedby]="fieldId + '-help'"
             (input)="onInput($event)" (blur)="onBlur()" (keydown)="onKeydown($event)"
             (compositionstart)="composing = true" (compositionend)="endComposition($event)">
      <mat-hint [id]="fieldId + '-help'" [class.money-error]="invalid" aria-live="polite">
        {{ invalid ? 'Informe reais e centavos com até duas casas decimais.' : hint }}
      </mat-hint>
    </mat-form-field>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .money-field { width: 100%; }
    input { text-align: right; font-variant-numeric: tabular-nums; }
    .currency-prefix { color: var(--app-muted); }
    .money-error { color: var(--mat-sys-error); }
  `,
})
export class MoneyInput implements ControlValueAccessor, Validator {
  private readonly changeDetector = inject(ChangeDetectorRef);
  @Input() label = 'Valor';
  @Input() hint = 'Ex.: 10.000,50';
  @Input() required = false;
  protected readonly fieldId = `money-${++moneyFieldId}`;
  protected text = '';
  protected disabled = false;
  protected invalid = false;
  protected composing = false;
  private change: (value: string | null) => void = () => {};
  private touched: () => void = () => {};
  private validatorChange: () => void = () => {};

  writeValue(value: string | null): void {
    this.text = value === null || value === undefined ? '' : formatBRLInput(value);
    this.invalid = false;
    this.changeDetector.markForCheck();
  }
  registerOnChange(fn: (value: string | null) => void): void { this.change = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; this.changeDetector.markForCheck(); }
  registerOnValidatorChange(fn: () => void): void { this.validatorChange = fn; }
  validate(_control: AbstractControl): ValidationErrors | null {
    return this.invalid ? { money: true } : null;
  }

  protected onInput(event: Event): void {
    if (this.composing || (event instanceof InputEvent && event.isComposing)) return;
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const cleaned = raw.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
    // Group separators already present move as a digit is inserted or deleted.
    const isPaste = event instanceof InputEvent && event.inputType === 'insertFromPaste';
    const candidate = isPaste ? cleaned : cleaned.replace(/\./g, '');
    const canonical = parseBRL(candidate);
    this.invalid = cleaned !== '' && canonical === null;
    this.text = cleaned === '' ? '' : raw;
    if (!this.invalid && cleaned !== '') {
      const normalized = cleaned.replace(/\./g, '');
      const [integer, fraction] = normalized.split(',');
      this.text = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
        (fraction === undefined ? '' : `,${fraction}`);
      const meaningfulBefore = raw.slice(0, caret).replace(/[^\d,\-]/g, '').length;
      let nextCaret = 0;
      let seen = 0;
      while (nextCaret < this.text.length && seen < meaningfulBefore) {
        if (/[\d,\-]/.test(this.text[nextCaret])) seen++;
        nextCaret++;
      }
      input.value = this.text;
      input.setSelectionRange(nextCaret, nextCaret);
    }
    this.change(cleaned === '' ? null : canonical);
    this.validatorChange();
  }

  protected endComposition(event: CompositionEvent): void {
    this.composing = false;
    this.onInput(event);
  }

  protected onBlur(): void {
    if (!this.invalid) {
      const value = parseBRL(this.text);
      if (value !== null) this.text = formatBRLInput(value);
    }
    this.touched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const input = event.target as HTMLInputElement;
    const start = input.selectionStart ?? 0;
    if (start !== input.selectionEnd) return;
    if (event.key === 'Backspace' && input.value[start - 1] === '.') {
      input.setSelectionRange(Math.max(0, start - 1), start - 1);
    }
    if (event.key === 'Delete' && input.value[start] === '.') {
      input.setSelectionRange(start + 1, start + 1);
    }
  }
}
