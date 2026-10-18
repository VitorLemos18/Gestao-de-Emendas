import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DemoStore } from '../../core/demo-store';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { fromCents, toCents } from '../../core/money';
import { executionProgress } from '../../shared/execution-progress';
import { BalanceStrip } from '../../shared/balance-strip';
import { ExecutionDialog } from '../execution/execution-dialog';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';

@Component({
  selector: 'app-receipt-detail',
  imports: [
    RouterLink,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MoneyPipe,
    DateBrPipe,
    BalanceStrip,
  ],
  template: `
    <section class="page">
      @if (receipt(); as receipt) {
        <nav class="breadcrumbs" aria-label="Localização">
          <a routerLink="/recebimentos">Recebimentos</a><span>/</span
          ><span>Detalhe do recurso</span>
        </nav>
        <div class="page-head">
          <div>
            <h1 class="page-title">{{ receipt.object }}</h1>
            <p class="page-intro">
              {{ store.receiptAuthor(id())?.name }} · {{ amendment()?.number }}
            </p>
          </div>
          <div class="detail-actions">
            <button mat-stroked-button type="button" (click)="openHelp()">
              Como ler os valores?
            </button>
            @if (store.canWrite()) {
              <a mat-stroked-button [routerLink]="['/recebimentos', id(), 'corrigir']"
                >Editar dados</a
              ><button
                mat-flat-button
                (click)="newExpense()"
                matTooltip="Registre uma despesa e reserve o valor para ela. O saldo de caixa só muda quando houver pagamento."
              >
                Registrar despesa
              </button>
            }
          </div>
        </div>
        <dl class="receipt-meta">
          <div>
            <dt>Data do crédito</dt>
            <dd>{{ receipt.creditDate | dateBr }}</dd>
          </div>
          <div>
            <dt>Conta bancária</dt>
            <dd>{{ receipt.account }}</dd>
          </div>
        </dl>
        <div class="resource-overview" aria-label="Resumo do recebimento">
          <div>
            <span>Valor recebido</span>
            <strong>{{ receipt.amount | money }}</strong>
          </div>
          <div>
            <span>Saldo em caixa em 31/12/{{ store.year() }}</span>
            <strong>{{ summary().closing | money }}</strong>
          </div>
        </div>
        <mat-tab-group animationDuration="0ms" dynamicHeight>
          <mat-tab label="Execução e despesas"
            ><div class="tab-content">
              <section class="execution-overview" aria-labelledby="execution-heading">
                <div class="section-heading">
                  <div>
                    <h2 id="execution-heading">Execução até {{ store.year() }}</h2>
                    <p>O percentual usa como base o valor recebido deste objeto.</p>
                  </div>
                </div>
                <div class="paid-progress">
                  <div class="paid-progress-label">
                    <span>Pago líquido acumulado</span>
                    <strong>{{ paid() | money }} <span>({{ progress(paid()).label }})</span></strong>
                  </div>
                  <div class="progress-track" role="progressbar" aria-label="Percentual pago líquido acumulado"
                       aria-valuemin="0" aria-valuemax="100"
                       [attr.aria-valuenow]="progress(paid()).width"
                       [attr.aria-valuetext]="progress(paid()).label">
                    <span [style.width.%]="progress(paid()).width"></span>
                  </div>
                </div>
                <div class="execution-summary" aria-label="Etapas anteriores ao pagamento">
                  <div>
                    <span>Empenhado</span>
                    <strong>{{ summary().committed | money }}</strong>
                    <small>{{ progress(summary().committed).label }} do recebido</small>
                  </div>
                  <div>
                    <span>Liquidado</span>
                    <strong>{{ summary().liquidated | money }}</strong>
                    <small>{{ progress(summary().liquidated).label }} do recebido</small>
                  </div>
                </div>
                <div class="pending-summary" aria-label="Valores pendentes por etapa">
                  <div>
                    <span>Ainda disponível para empenhar</span>
                    <strong>{{ summary().toCommit | money }}</strong>
                  </div>
                  <div>
                    <span>Empenhado, aguardando liquidação</span>
                    <strong>{{ summary().toLiquidate | money }}</strong>
                  </div>
                  <div>
                    <span>Liquidado, aguardando pagamento</span>
                    <strong>{{ summary().toPay | money }}</strong>
                  </div>
                </div>
                <p class="pending-note">
                  Saldo em caixa considera pagamentos e estornos. O valor disponível para empenhar
                  desconta o que já foi reservado para despesas.
                </p>
              </section>
              <div class="section-heading">
                <h2>Despesas vinculadas</h2>
                <span class="muted">{{ expenses().length }} {{ expenses().length === 1 ? 'despesa' : 'despesas' }}</span>
              </div>
              <div class="table-wrap">
                <table class="work-table">
                  <thead>
                    <tr>
                      <th scope="col">Despesa / fornecedor</th>
                      <th scope="col">Nota de Empenho</th>
                      <th scope="col" class="numeric">Empenhado</th>
                      <th scope="col" class="numeric">Liquidado</th>
                      <th scope="col" class="numeric">Pago líquido</th>
                      <th scope="col" class="numeric">A pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (expense of expenses(); track expense.id) {
                      <tr>
                        <td>
                          <a [routerLink]="['/despesas', expense.id]">{{ expense.description }}</a
                          ><span class="cell-secondary">{{ expense.supplier }}</span>
                          @if (expense.cnpj) {
                            <span class="cell-secondary">CNPJ: {{ expense.cnpj }}</span>
                          }
                        </td>
                        <td>
                          {{ expense.document
                          }}<span class="cell-secondary">{{
                            expense.commitmentDate | dateBr
                          }}</span>
                          @if (expense.commitmentDocument) {
                            <a
                              class="cell-secondary document-link"
                              [href]="commitmentPdfUrl(expense.id, expense.commitmentDocument.id)"
                              target="_blank"
                              rel="noopener"
                            >Ver Nota de Empenho em PDF</a>
                          }
                        </td>
                        <td class="numeric">{{ expense.amount | money }}</td>
                        <td class="numeric">
                          {{ store.expenseSummary(expense.id).liquidated | money }}
                        </td>
                        <td class="numeric">{{ store.expenseSummary(expense.id).paid | money }}</td>
                        <td class="numeric">{{ store.expenseSummary(expense.id).toPay | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (!expenses().length) {
                <div class="empty-state">
                  <h2>Nenhuma despesa registrada até {{ store.year() }}</h2>
                  <p>Use “Registrar despesa” para criar o empenho vinculado a este objeto.</p>
                </div>
              }
              <p class="muted footnote">
                Empenho reserva o valor para a despesa. Liquidação confirma a entrega ou execução.
                O pagamento reduz o caixa; um estorno recompõe o saldo.
              </p>
            </div></mat-tab
          >
          <mat-tab label="Movimentações"
            ><div class="tab-content">
              <div class="section-heading balance-heading">
                <div>
                  <h2>Composição do saldo de caixa</h2>
                  <p>Posição acumulada até 31/12/{{ store.year() }}.</p>
                </div>
              </div>
              <app-balance-strip [summary]="summary()" />
              <div class="section-heading">
                <h2>Movimentações em {{ store.year() }}</h2>
                <span class="muted">Saldo no início do ano: {{ summary().opening | money }}</span>
              </div>
              <div class="table-wrap">
                <table class="work-table">
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Lançamento / documento</th>
                      <th scope="col" class="numeric">Movimentação</th>
                      <th scope="col" class="numeric">Saldo de caixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of ledger(); track line.id) {
                      <tr>
                        <td>{{ line.date | dateBr }}</td>
                        <td>
                          <span class="status">{{ line.type }}</span> {{ line.description
                          }}<span class="cell-secondary">{{ line.document }}</span>
                        </td>
                        <td class="numeric">{{ line.amount | money }}</td>
                        <td class="numeric">{{ line.balance | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (!ledger().length) {
                <div class="empty-state">
                  <h2>Sem movimentações no exercício</h2>
                  <p>O saldo anterior permanece vinculado a este recurso.</p>
                </div>
              }
            </div></mat-tab
          >
          <mat-tab label="Dados do crédito"
            ><div class="tab-content">
              <dl class="record-data">
                <div>
                  <dt>Parlamentar</dt>
                  <dd>{{ store.receiptAuthor(id())?.name }}</dd>
                </div>
                <div>
                  <dt>Emenda / proposta</dt>
                  <dd>{{ amendment()?.number }}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{{ receipt.type }}</dd>
                </div>
                <div>
                  <dt>Ação</dt>
                  <dd>{{ receipt.action }}</dd>
                </div>
                <div>
                  <dt>Elemento de despesa</dt>
                  <dd>{{ receipt.expenseElement || 'Não informado no cadastro anterior' }}</dd>
                </div>
                <div>
                  <dt>Fonte de recurso</dt>
                  <dd>{{ receipt.source }}</dd>
                </div>
                <div>
                  <dt>Conta bancária</dt>
                  <dd>{{ receipt.account }}</dd>
                </div>
                <div class="full-width">
                  <dt>Objeto</dt>
                  <dd>{{ receipt.object }}</dd>
                </div>
                <div>
                  <dt>Data do crédito</dt>
                  <dd>{{ receipt.creditDate | dateBr }}</dd>
                </div>
                <div>
                  <dt>Valor recebido</dt>
                  <dd>{{ receipt.amount | money }}</dd>
                </div>
              </dl>
            </div></mat-tab
          >
          <mat-tab label="Histórico"
            ><div class="tab-content">
              <p class="muted footnote">
                Alterações deste recebimento e de suas despesas · horário de Brasília.
              </p>
              <ol class="audit-timeline">
                @for (entry of history(); track entry.id) {
                  <li>
                    <time>{{ entry.timestamp | dateBr }}</time>
                    <div>
                      <h3>{{ entry.action }}</h3>
                      <p>{{ entry.description }}</p>
                      <p class="muted">
                        {{ entry.actor }}
                        @if (entry.reason) {
                          · Motivo: {{ entry.reason }}
                        }
                      </p>
                      @if (entry.changes.length) {
                        <dl class="change-list">
                          @for (change of entry.changes; track $index) {
                            <div>
                              <dt>{{ fieldLabel(change.field) }}</dt>
                              <dd>
                                <span class="muted">{{ change.before || 'Não informado' }}</span> →
                                {{ change.after || 'Não informado' }}
                              </dd>
                            </div>
                          }
                        </dl>
                      }
                    </div>
                  </li>
                }
              </ol>
              @if (!history().length) {
                <div class="empty-state">
                  <h2>Nenhuma alteração adicional</h2>
                  <p>Novos registros aparecerão no histórico.</p>
                </div>
              }
            </div></mat-tab
          >
        </mat-tab-group>
      } @else {
        <div class="empty-state">
          <h1>Recebimento não encontrado</h1>
          <a mat-button routerLink="/recebimentos">Voltar aos recebimentos</a>
        </div>
      }
    </section>
  `,
  styles: `
    .breadcrumbs {
      display: flex;
      gap: 8px;
      color: var(--app-muted);
      font-size: 12px;
      margin-bottom: 20px;
    }
    .breadcrumbs a {
      color: inherit;
    }
    .detail-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .receipt-meta {
      display: flex;
      gap: 10px 28px;
      flex-wrap: wrap;
      margin: 0 0 18px;
    }
    .receipt-meta div {
      display: flex;
      gap: 8px;
    }
    .receipt-meta dt {
      color: var(--app-muted);
    }
    .receipt-meta dd {
      margin: 0;
      font-weight: 500;
    }
    .resource-overview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0 0 8px;
      border-top: 1px solid var(--app-line);
      border-bottom: 1px solid var(--app-line);
    }
    .resource-overview > div {
      display: grid;
      gap: 5px;
      padding: 13px 18px 15px 0;
    }
    .resource-overview > div + div {
      padding-left: 18px;
      border-left: 1px solid var(--app-line);
    }
    .resource-overview span {
      color: var(--app-muted);
      font-size: 12px;
    }
    .resource-overview strong {
      font-size: 18px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .tab-content {
      padding-top: 24px;
    }
    .execution-overview {
      margin-bottom: 28px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--app-line);
    }
    .execution-overview .section-heading {
      margin-top: 0;
    }
    .execution-overview .section-heading p,
    .balance-heading p {
      margin: 5px 0 0;
      color: var(--app-muted);
      font-size: 12px;
    }
    .paid-progress {
      margin: 0 0 16px;
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
    }
    .execution-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px 28px;
      margin-bottom: 18px;
    }
    .execution-summary span {
      display: block;
      color: var(--app-muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .execution-summary strong {
      display: block;
      font-size: 16px;
      font-weight: 500;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .execution-summary small {
      display: block;
      margin-top: 4px;
      color: var(--app-muted);
      font-size: 11px;
    }
    .pending-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px 20px;
      padding-top: 14px;
      border-top: 1px solid var(--app-line);
    }
    .pending-summary > div {
      display: grid;
      align-content: start;
      gap: 5px;
    }
    .pending-summary span {
      color: var(--app-muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .pending-summary strong {
      font-size: 13px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .pending-note {
      margin: 10px 0 0;
      color: var(--app-muted);
      font-size: 11px;
      line-height: 1.45;
    }
    .table-wrap .work-table {
      min-width: 900px;
    }
    .footnote {
      font-size: 12px;
      margin-top: 20px;
    }
    .record-data {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 25px;
    }
    .record-data dt {
      color: var(--app-muted);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .record-data dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .audit-timeline {
      list-style: none;
      padding: 0;
      margin: 15px 0;
    }
    .audit-timeline > li {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 20px;
      padding: 20px 0;
      border-bottom: 1px solid var(--app-line);
    }
    .audit-timeline time {
      color: var(--app-muted);
      font-size: 12px;
    }
    .audit-timeline h3 {
      font-size: 14px;
      font-weight: 500;
      margin: 0 0 6px;
    }
    .audit-timeline p {
      font-size: 13px;
      margin: 0;
    }
    .change-list {
      margin: 12px 0 0;
    }
    .change-list div {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 10px;
      font-size: 13px;
      margin: 6px 0;
    }
    .change-list dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    @media (max-width: 850px) {
      .pending-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .receipt-meta {
        gap: 10px 20px;
      }
    }
    @media (max-width: 600px) {
      .resource-overview {
        grid-template-columns: 1fr;
      }
      .resource-overview > div,
      .resource-overview > div + div {
        padding: 12px 0;
        border-left: 0;
      }
      .resource-overview > div + div {
        border-top: 1px solid var(--app-line);
      }
      .paid-progress-label {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
      .execution-summary,
      .pending-summary {
        grid-template-columns: 1fr;
      }
      .record-data {
        grid-template-columns: 1fr;
      }
      .audit-timeline > li {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .receipt-meta div {
        width: 100%;
        justify-content: space-between;
      }
      .receipt-meta {
        display: grid;
        gap: 8px;
      }
      .change-list div {
        grid-template-columns: 1fr;
        gap: 3px;
      }
    }
  `,
})
export class ReceiptDetail {
  readonly id = input.required<string>();
  readonly store = inject(DemoStore);
  private readonly dialog = inject(MatDialog);
  readonly receipt = computed(() => this.store.receipts().find((r) => r.id === this.id()));
  readonly amendment = computed(() =>
    this.store.amendments().find((a) => a.id === this.receipt()?.amendmentId),
  );
  readonly summary = computed(() => this.store.receiptSummary(this.id()));
  readonly paid = computed(() =>
    fromCents(
      this.expenses().reduce(
        (total, expense) => total + toCents(this.store.expenseSummary(expense.id).paid),
        0n,
      ),
    ),
  );
  readonly expenses = computed(() =>
    this.store
      .expenses()
      .filter((e) => e.receiptId === this.id() && e.commitmentDate <= `${this.store.year()}-12-31`),
  );
  readonly ledger = computed(() => this.store.ledger(this.id()));
  readonly history = computed(() =>
    [...this.store.receiptAudit(this.id())].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  );
  progress(value: string) {
    return executionProgress(value, this.receipt()?.amount ?? '0.00');
  }
  newExpense() {
    this.dialog.open(ExecutionDialog, {
      data: { kind: 'commitment', receiptId: this.id() },
      width: '660px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  openHelp() {
    this.dialog.open(WorkflowHelpDialog, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  commitmentPdfUrl(expenseId: string, documentId: string): string {
    return `/api/v1/expenses/${expenseId}/commitment-documents/${documentId}`;
  }
  fieldLabel(field: string) {
    return (
      (
        {
          type: 'Tipo',
          action: 'Ação',
          blockAction: 'Ação',
          block_action: 'Ação',
          expenseElement: 'Elemento de despesa',
          expense_element: 'Elemento de despesa',
          source: 'Fonte de recurso',
          object: 'Objeto',
          account: 'Conta bancária',
          version: 'Versão',
        } as Record<string, string>
      )[field] ?? field
    );
  }
}
