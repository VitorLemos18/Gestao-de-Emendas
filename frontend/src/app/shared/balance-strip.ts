import { Component, input } from '@angular/core';
import { AnnualSummary } from '../core/models';
import { MoneyPipe } from './format';

@Component({
  selector: 'app-balance-strip',
  imports: [MoneyPipe],
  template: `
    <section class="balance-strip" aria-label="Composição do saldo de caixa registrado">
      <div class="balance-item"><span>Saldo anterior</span><strong>{{ summary().opening | money }}</strong></div>
      <div class="balance-item"><span>+ Recebido no ano</span><strong>{{ summary().received | money }}</strong></div>
      <div class="balance-item"><span>− Pago no ano</span><strong>{{ summary().paid | money }}</strong></div>
      <div class="balance-item"><span>+ Estornado</span><strong>{{ summary().reversed | money }}</strong></div>
      <div class="balance-item balance-final"><span>= Saldo de caixa registrado</span><strong>{{ summary().closing | money }}</strong></div>
    </section>
  `,
})
export class BalanceStrip {
  readonly summary = input.required<AnnualSummary>();
}
