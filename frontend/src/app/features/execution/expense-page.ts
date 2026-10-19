import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DemoStore } from '../../core/demo-store';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { toCents } from '../../core/money';
import { executionProgress } from '../../shared/execution-progress';
import { ExecutionDialog, ExecutionDialogData } from './execution-dialog';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';

@Component({
  selector: 'app-expense-page',
  imports: [RouterLink, MatButtonModule, MatTooltipModule, MoneyPipe, DateBrPipe],
  template: `
    <section class="page">
      @if (expense(); as expense) {
        <nav class="breadcrumbs" aria-label="Localização">
          <a routerLink="/recebimentos">Recebimentos</a><span>/</span
          ><a [routerLink]="['/recebimentos', expense.receiptId]">{{ receipt()?.object }}</a
          ><span>/</span><span>Despesa</span>
        </nav>
        <div class="page-head">
          <div>
            <h1 class="page-title">{{ expense.description }}</h1>
            <p class="page-intro">
              {{ expense.supplier }} · Nota de Empenho {{ expense.document }}
            </p>
          </div>
          <div class="actions">
            @if (store.isAdmin()) {
              <button mat-stroked-button type="button" (click)="open('commitment', undefined, 'edit')"
                matTooltip="Corrija os dados do empenho. A justificativa ficará registrada no histórico.">
                Corrigir empenho
              </button>
            }
            <button mat-stroked-button type="button" (click)="showHelp()">
              Como ler as etapas?
            </button>
            @if (store.canWrite()) {
              @if (positive(summary().toLiquidate)) {
                <button
                  mat-flat-button
                  type="button"
                  (click)="open('liquidation')"
                  matTooltip="Registre o valor entregue ou executado. A liquidação não reduz o saldo em caixa."
                >
                  Liquidar despesa
                </button>
              }
              @if (positive(summary().toPay) && positive(summary().toLiquidate)) {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="open('payment')"
                  matTooltip="Registre o pagamento do valor já liquidado."
                >
                  Registrar pagamento
                </button>
              } @else if (positive(summary().toPay)) {
                <button
                  mat-flat-button
                  type="button"
                  (click)="open('payment')"
                  matTooltip="Registre somente o valor efetivamente pago, até o limite já liquidado."
                >
                  Registrar pagamento
                </button>
              }
            }
          </div>
        </div>

        <dl class="expense-context">
          <div>
            <dt>Recurso</dt>
            <dd><a [routerLink]="['/recebimentos', expense.receiptId]">{{ receipt()?.object }}</a></dd>
          </div>
          <div>
            <dt>Parlamentar / emenda</dt>
            <dd>{{ store.receiptAuthor(expense.receiptId)?.name }} · {{ amendment()?.number }}</dd>
          </div>
          <div>
            <dt>Conta bancária</dt>
            <dd>{{ receipt()?.account }}</dd>
          </div>
          <div>
            <dt>Data do empenho</dt>
            <dd>{{ expense.commitmentDate | dateBr }}</dd>
          </div>
          <div>
            <dt>CNPJ do fornecedor</dt>
            <dd>{{ expense.cnpj || 'Não informado' }}</dd>
          </div>
          <div>
            <dt>Observações do empenho</dt>
            <dd>{{ expense.observations || 'Nenhuma observação registrada' }}</dd>
          </div>
          <div>
            <dt>Nota de Empenho em PDF</dt>
            <dd>
              @if (expense.commitmentDocument) {
                <a
                  [href]="commitmentPdfUrl(expense.id, expense.commitmentDocument.id)"
                  target="_blank"
                  rel="noopener"
                  [matTooltip]="'Abrir ' + expense.commitmentDocument.fileName"
                >
                  Ver documento · {{ expense.commitmentDocument.fileName }}
                </a>
              } @else {
                <span class="muted">Nenhum PDF anexado</span>
              }
            </dd>
          </div>
        </dl>

        <section class="execution-panel" aria-labelledby="execution-heading">
          <div class="execution-heading">
            <div>
              <h2 id="execution-heading">Execução financeira</h2>
              <p>Posição acumulada até 31/12/{{ store.year() }}. O percentual é calculado sobre o valor empenhado.</p>
            </div>
            @if (positive(summary().committed) && !positive(summary().toLiquidate) && !positive(summary().toPay)) {
              <span class="execution-status">Execução concluída</span>
            } @else if (!positive(summary().committed)) {
              <span class="execution-status">Sem valores neste exercício</span>
            }
          </div>

          <div class="paid-progress">
            <div class="paid-progress-label">
              <span>Pago líquido</span>
              <strong>{{ summary().paid | money }} <span>({{ paidProgress().label }})</span></strong>
            </div>
            <div
              class="progress-track"
              role="progressbar"
              aria-label="Percentual pago líquido do valor empenhado"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="paidProgress().width"
              [attr.aria-valuetext]="paidProgress().label"
            >
              <span [style.width.%]="paidProgress().width"></span>
            </div>
          </div>

          <ol class="execution-stages" aria-label="Etapas da execução da despesa">
            <li class="stage" [class.complete]="positive(summary().committed)">
              <span class="stage-number" aria-hidden="true">1</span>
              <div class="stage-content">
                <span class="stage-label">Empenho</span>
                <strong>{{ summary().committed | money }}</strong>
                <small>
                  @if (positive(summary().committed)) {
                    Valor reservado · {{ expense.commitmentDate | dateBr }}
                  } @else {
                    Ainda não considerado nesta posição
                  }
                </small>
              </div>
            </li>
            <li class="stage" [class.current]="liquidationStage() === 'current'" [class.complete]="liquidationStage() === 'complete'">
              <span class="stage-number" aria-hidden="true">2</span>
              <div class="stage-content">
                <span class="stage-label">Liquidação</span>
                <strong>{{ summary().liquidated | money }}</strong>
                <small>
                  @if (positive(summary().toLiquidate)) {
                    {{ summary().toLiquidate | money }} aguardando liquidação
                  } @else if (positive(summary().liquidated)) {
                    Etapa concluída
                  } @else {
                    Aguardando empenho
                  }
                </small>
              </div>
            </li>
            <li class="stage" [class.current]="paymentStage() === 'current'" [class.complete]="paymentStage() === 'complete'">
              <span class="stage-number" aria-hidden="true">3</span>
              <div class="stage-content">
                <span class="stage-label">Pagamento líquido</span>
                <strong>{{ summary().paid | money }}</strong>
                <small>
                  @if (positive(summary().toPay)) {
                    {{ summary().toPay | money }} aguardando pagamento
                  } @else if (paymentStage() === 'complete') {
                    Tudo que foi liquidado já foi pago
                  } @else {
                    Aguardando liquidação
                  }
                </small>
              </div>
            </li>
          </ol>
        </section>

        <div class="section-heading">
          <div>
            <h2>Liquidações registradas</h2>
            <p class="section-caption">Valores reconhecidos como entregues ou executados.</p>
          </div>
          <span class="muted">{{ liquidations().length }} {{ liquidations().length === 1 ? 'registro' : 'registros' }}</span>
        </div>
        <div class="table-wrap">
          <table class="work-table">
            <thead>
              <tr>
                <th scope="col">Data da liquidação</th>
                <th scope="col">Documento</th>
                <th scope="col">Conta de destino</th>
                <th scope="col" class="numeric">Valor liquidado</th>
                @if (store.isAdmin()) { <th scope="col">Ação</th> }
              </tr>
            </thead>
            <tbody>
              @for (item of liquidations(); track item.id) {
                <tr>
                  <td>{{ item.date | dateBr }}</td>
                  <td>
                    {{ item.document }}
                    @if (item.observations) {
                      <span class="cell-secondary">Observações: {{ item.observations }}</span>
                    }
                  </td>
                  <td>{{ item.destinationAccount || 'Não informada no registro antigo' }}</td>
                  <td class="numeric">{{ item.amount | money }}</td>
                  @if (store.isAdmin()) {
                    <td><button mat-button type="button" (click)="open('liquidation', undefined, 'edit', item.id)">Editar</button></td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="store.isAdmin() ? 5 : 4" class="empty-state">
                    <strong>Nenhuma liquidação registrada até 31/12/{{ store.year() }}</strong>
                    <p>Após confirmar a entrega ou execução, registre a liquidação para liberar o pagamento.</p>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="section-heading">
          <div>
            <h2>Pagamentos e estornos</h2>
            <p class="section-caption">Cada estorno fica vinculado ao pagamento original.</p>
          </div>
          <span class="muted">{{ payments().length }} {{ payments().length === 1 ? 'pagamento' : 'pagamentos' }}</span>
        </div>
        <div class="table-wrap">
          <table class="work-table">
            <thead>
              <tr>
                <th scope="col">Data / Ofício / protocolo</th>
                <th scope="col">Situação</th>
                <th scope="col" class="numeric">Valor original</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              @for (item of payments(); track item.id) {
                <tr>
                  <td>
                    {{ item.date | dateBr }}<span class="cell-secondary">Ofício: {{ item.document }}</span>
                    <span class="cell-secondary">Conta de destino: {{ item.destinationAccount || 'Não informada na liquidação' }}</span>
                    @if (item.observations) {
                      <span class="cell-secondary">Observações: {{ item.observations }}</span>
                    }
                    @if (item.protocolNumber) {
                      <span class="cell-secondary">Protocolo: {{ item.protocolNumber }}</span>
                    }
                    @if (item.paymentDocument) {
                      <a
                        class="cell-secondary payment-document-link"
                        [href]="paymentPdfUrl(item.id, item.paymentDocument.id)"
                        target="_blank"
                        rel="noopener"
                        [matTooltip]="'Abrir ' + item.paymentDocument.fileName"
                      >Ver Ofício em PDF · {{ item.paymentDocument.fileName }}</a>
                    }
                  </td>
                  <td>
                    @if (item.reversal && item.reversal.date <= cutoff()) {
                      <span class="status">Estornado integralmente</span
                      ><span class="cell-secondary"
                        >{{ item.reversal.date | dateBr }} · {{ item.reversal.reason }}</span
                      >
                    } @else {
                      <span class="status success">Pago</span>
                    }
                  </td>
                  <td class="numeric">{{ item.amount | money }}</td>
                  <td>
                    @if (store.isAdmin() && !item.reversal) {
                      <button mat-button type="button" (click)="open('payment', item.id, 'edit')">Editar</button>
                    }
                    @if (store.canWrite() && !item.reversal) {
                      <button mat-button type="button" (click)="open('reversal', item.id)">Estornar</button>
                    }
                    @if ((!store.canWrite() || item.reversal) && (!store.isAdmin() || item.reversal)) {
                      <span class="muted">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="empty-state">
                    <strong>Nenhum pagamento registrado até 31/12/{{ store.year() }}</strong>
                    @if (!positive(summary().liquidated)) {
                      <p>Registre uma liquidação antes de pagar a despesa.</p>
                    } @else {
                      <p>Ainda não há pagamentos para esta despesa.</p>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted footnote">
          O valor original continua visível após um estorno. O estorno devolve o valor ao caixa na data registrada; o empenho e as liquidações permanecem no histórico.
        </p>
      } @else {
        <div class="empty-state">
          <h1>Despesa não encontrada</h1>
          <a mat-button routerLink="/recebimentos">Voltar aos recebimentos</a>
        </div>
      }
    </section>
  `,
  styles: `
    .breadcrumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
      color: var(--app-muted);
      margin-bottom: 20px;
    }
    .breadcrumbs a {
      color: inherit;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .expense-context {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px 24px;
      margin: 0 0 25px;
      padding: 15px 0;
      border-block: 1px solid var(--app-line);
    }
    .expense-context dt {
      margin: 0 0 5px;
      color: var(--app-muted);
      font-size: 12px;
    }
    .expense-context dd {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .expense-context a {
      color: inherit;
    }
    .execution-panel {
      margin-bottom: 30px;
      padding-bottom: 22px;
      border-bottom: 1px solid var(--app-line);
    }
    .execution-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .execution-heading h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.3;
      font-weight: 500;
    }
    .execution-heading p,
    .section-caption {
      margin: 5px 0 0;
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .execution-status {
      padding: 4px 8px;
      color: var(--app-success);
      background: #eef4f0;
      border-radius: 3px;
      font-size: 12px;
      white-space: nowrap;
    }
    .paid-progress {
      max-width: 780px;
      margin-bottom: 20px;
    }
    .paid-progress-label {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .paid-progress-label strong {
      font-size: 15px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .paid-progress-label strong span {
      color: var(--app-primary);
    }
    .progress-track {
      height: 8px;
      overflow: hidden;
      border-radius: 4px;
      background: var(--app-tint);
    }
    .progress-track > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--app-primary);
      transition: width 160ms ease-out;
    }
    .execution-stages {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .stage {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      min-width: 0;
      padding: 14px 18px 4px 0;
      border-top: 1px solid var(--app-line);
    }
    .stage + .stage {
      padding-left: 18px;
      border-left: 1px solid var(--app-line);
    }
    .stage-number {
      display: inline-grid;
      flex: 0 0 24px;
      width: 24px;
      height: 24px;
      place-items: center;
      border: 1px solid var(--app-control);
      border-radius: 50%;
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1;
    }
    .stage.complete .stage-number {
      color: var(--app-primary);
      border-color: var(--app-primary);
    }
    .stage.current .stage-number {
      color: #fff;
      border-color: var(--app-primary);
      background: var(--app-primary);
    }
    .stage-content {
      display: grid;
      min-width: 0;
      gap: 4px;
    }
    .stage-label {
      color: var(--app-muted);
      font-size: 12px;
    }
    .stage-content strong {
      font-size: 15px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .stage-content small {
      color: var(--app-muted);
      font-size: 11px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .footnote {
      font-size: 12px;
      line-height: 1.45;
      margin-top: 18px;
    }
    .table-wrap .work-table {
      min-width: 900px;
    }
    @media (max-width: 1000px) {
      .expense-context {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 750px) {
      .execution-stages {
        grid-template-columns: 1fr;
      }
      .stage,
      .stage + .stage {
        padding: 12px 0;
        border-left: 0;
      }
      .stage + .stage {
        border-top: 0;
      }
    }
    @media (max-width: 600px) {
      .actions {
        width: 100%;
      }
      .expense-context {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .expense-context > div {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 10px;
      }
      .expense-context dt {
        margin: 0;
      }
      .execution-heading {
        flex-direction: column;
      }
      .paid-progress-label {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .progress-track > span {
        transition: none;
      }
    }
  `,
})
export class ExpensePage {
  readonly id = input.required<string>();
  readonly store = inject(DemoStore);
  private readonly dialog = inject(MatDialog);
  readonly expense = computed(() => this.store.expenses().find((e) => e.id === this.id()));
  readonly receipt = computed(() =>
    this.store.receipts().find((r) => r.id === this.expense()?.receiptId),
  );
  readonly amendment = computed(() =>
    this.store.amendments().find((a) => a.id === this.receipt()?.amendmentId),
  );
  readonly summary = computed(() => this.store.expenseSummary(this.id()));
  readonly paidProgress = computed(() =>
    executionProgress(this.summary().paid, this.summary().committed),
  );
  readonly liquidationStage = computed(() => {
    const summary = this.summary();
    if (!this.positive(summary.committed)) return 'pending';
    return this.positive(summary.toLiquidate) ? 'current' : 'complete';
  });
  readonly paymentStage = computed(() => {
    const summary = this.summary();
    if (!this.positive(summary.liquidated)) return 'pending';
    return this.positive(summary.toPay) ? 'current' : 'complete';
  });
  readonly cutoff = computed(() => `${this.store.year()}-12-31`);
  readonly liquidations = computed(() =>
    this.store
      .liquidations()
      .filter((l) => l.expenseId === this.id() && l.date <= this.cutoff())
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  readonly payments = computed(() =>
    this.store
      .payments()
      .filter((p) => p.expenseId === this.id() && p.date <= this.cutoff())
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  positive(value: string) {
    return toCents(value) > 0n;
  }

  commitmentPdfUrl(expenseId: string, documentId: string): string {
    return `/api/v1/expenses/${expenseId}/commitment-documents/${documentId}`;
  }
  paymentPdfUrl(paymentId: string, documentId: string): string {
    return `/api/v1/payments/${paymentId}/documents/${documentId}`;
  }
  showHelp() {
    this.dialog.open(WorkflowHelpDialog, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  open(
    kind: ExecutionDialogData['kind'],
    paymentId?: string,
    mode: ExecutionDialogData['mode'] = 'create',
    postingId?: string,
  ) {
    const expense = this.expense();
    if (!expense) return;
    this.dialog.open(ExecutionDialog, {
      data: { kind, expenseId: expense.id, receiptId: expense.receiptId, paymentId, postingId, mode },
      width: '660px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
}

