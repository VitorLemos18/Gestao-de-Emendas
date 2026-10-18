import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-workflow-help-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Como acompanhar uma emenda</h2>
    <mat-dialog-content>
      <p class="intro">
        O cadastro segue o caminho do recurso. Cada recebimento representa um objeto; um mesmo
        parlamentar e uma mesma emenda podem ter vários objetos.
      </p>
      <ol class="steps">
        <li>
          <span class="step-number">1</span>
          <div>
            <strong>Parlamentar e emenda</strong>
            <p>Cadastre quem indicou o recurso e vincule o número e o ano da emenda.</p>
          </div>
        </li>
        <li>
          <span class="step-number">2</span>
          <div>
            <strong>Recebimento por objeto</strong>
            <p>
              Registre o crédito que entrou, a data, a conta e a destinação. Insumos e locomoção são
              dois recebimentos, mesmo quando vêm da mesma emenda.
            </p>
          </div>
        </li>
        <li>
          <span class="step-number">3</span>
          <div>
            <strong>Empenho e liquidação</strong>
            <p>
              Empenho reserva parte do recurso para uma despesa. Liquidação registra o que foi
              entregue ou executado. Podem acontecer em parcelas.
            </p>
          </div>
        </li>
        <li>
          <span class="step-number">4</span>
          <div>
            <strong>Pagamento e saldo</strong>
            <p>
              O pagamento é a saída de caixa. Só ele reduz o saldo bancário; o estorno devolve o
              valor na data registrada e fica no histórico.
            </p>
          </div>
        </li>
      </ol>

      <section class="example" aria-label="Exemplo fictício de acompanhamento">
        <span class="eyebrow">Exemplo fictício · uma emenda, dois objetos</span>
        <div class="example-row">
          <span>Insumos</span
          ><span
            >Entrou R$ 100.000,00 · empenhado R$ 30.000,00 · liquidado R$ 20.000,00 · pago R$
            20.000,00 · caixa R$ 80.000,00</span
          >
        </div>
        <div class="example-row">
          <span>Locomoção</span
          ><span
            >Entrou R$ 300.000,00 · empenhado R$ 100.000,00 · liquidado R$ 75.000,00 · pago R$
            50.000,00 · caixa R$ 250.000,00</span
          >
        </div>
        <div class="example-total">
          <span>Total no caixa</span><strong>R$ 330.000,00</strong
          ><span>R$ 400.000,00 recebidos − R$ 70.000,00 pagos</span>
        </div>
      </section>
      <p class="note">
        Os valores são apenas ilustrativos. Cada recebimento, empenho, liquidação, pagamento e estorno lançado no sistema fica registrado no banco e no histórico.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-flat-button type="button" (click)="ref.close()">
        Entendi
      </button></mat-dialog-actions
    >
  `,
  styles: `
    .intro {
      color: var(--app-muted);
      line-height: 1.55;
      margin: 0 0 20px;
    }
    .steps {
      display: grid;
      gap: 14px;
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .steps li {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 12px;
      align-items: start;
    }
    .step-number {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      color: var(--app-blue);
      background: var(--app-tint);
      font-weight: 700;
      font-size: 12px;
    }
    .steps strong {
      font-size: 14px;
    }
    .steps p {
      margin: 3px 0 0;
      color: var(--app-muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .example {
      margin-top: 22px;
      border: 1px solid var(--app-line);
      border-radius: 6px;
      overflow: hidden;
    }
    .eyebrow {
      display: block;
      padding: 11px 13px;
      color: var(--app-muted);
      background: var(--app-background);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .example-row {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 12px;
      padding: 11px 13px;
      border-top: 1px solid var(--app-line);
      font-size: 12px;
      line-height: 1.45;
    }
    .example-row span:first-child {
      font-weight: 600;
    }
    .example-total {
      display: grid;
      gap: 3px;
      padding: 12px 13px;
      background: var(--app-tint);
      border-top: 1px solid var(--app-line);
      font-size: 12px;
    }
    .example-total strong {
      font-size: 17px;
    }
    .example-total span:last-child,
    .note {
      color: var(--app-muted);
    }
    .note {
      margin: 12px 0 0;
      font-size: 11px;
    }
    mat-dialog-actions {
      padding: 8px 24px 20px;
    }
    @media (max-width: 560px) {
      .example-row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
    }
  `,
})
export class WorkflowHelpDialog {
  readonly ref = inject(MatDialogRef<WorkflowHelpDialog>);
}
