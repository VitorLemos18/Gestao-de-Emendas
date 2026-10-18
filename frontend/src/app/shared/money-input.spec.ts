import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MoneyInput } from './money-input';

@Component({ imports: [MoneyInput, ReactiveFormsModule], template: '<app-money-input [formControl]="amount" label="Valor recebido" />' })
class MoneyHost { amount = new FormControl<string | null>(null); }

describe('MoneyInput', () => {
  async function setup() {
    await TestBed.configureTestingModule({ imports: [MoneyHost] }).compileComponents();
    const fixture = TestBed.createComponent(MoneyHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const enter = (text: string, inputType = 'insertText', caret = text.length) => {
      input.value = text;
      input.setSelectionRange(caret, caret);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
      fixture.detectChanges();
    };
    return { fixture, input, enter, amount: fixture.componentInstance.amount };
  }

  it('treats typed digits as whole reais and only completes centavos on blur', async () => {
    const { input, enter, amount, fixture } = await setup();
    enter('10000');
    expect(input.value).toBe('10.000');
    expect(amount.value).toBe('10000.00');
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(input.value).toBe('10.000,00');
    expect(amount.touched).toBe(true);
  });

  it('accepts Brazilian currency paste, keeps exact cents and lets the user clear', async () => {
    const { input, enter, amount } = await setup();
    enter('R$ 10.000,50', 'insertFromPaste');
    expect(input.value).toBe('10.000,50');
    expect(amount.value).toBe('10000.50');
    enter('', 'deleteContentBackward');
    expect(input.value).toBe('');
    expect(amount.value).toBeNull();
  });

  it('preserves a third fractional digit as an explicit error instead of rounding', async () => {
    const { input, enter, amount } = await setup();
    enter('10,005');
    expect(input.value).toBe('10,005');
    expect(amount.invalid).toBe(true);
    expect(amount.errors?.['money']).toBe(true);
    expect(amount.value).toBeNull();
    enter('10,05');
    expect(amount.valid).toBe(true);
    expect(amount.value).toBe('10.05');
  });

  it('regroups edits without sending the caret to the end', async () => {
    const { input, enter, amount } = await setup();
    enter('120.000', 'insertText', 2);
    expect(input.value).toBe('120.000');
    expect(input.selectionStart).toBe(2);
    expect(amount.value).toBe('120000.00');
    enter('120.000,', 'insertText');
    expect(input.value).toBe('120.000,');
    expect(amount.value).toBe('120000.00');
  });

  it('accepts external canonical values and disables the actual field', async () => {
    const { fixture, input, amount } = await setup();
    amount.setValue('123456789012.99');
    fixture.detectChanges();
    expect(input.value).toBe('123.456.789.012,99');
    amount.disable();
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });
});
