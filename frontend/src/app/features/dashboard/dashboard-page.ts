import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { DemoStore } from '../../core/demo-store';
import { Amendment, Author, Receipt } from '../../core/models';
import { brl, fromCents, toCents } from '../../core/money';
import { executionProgress } from '../../shared/execution-progress';
import { BalanceStrip } from '../../shared/balance-strip';
import { MoneyPipe } from '../../shared/format';

interface CumulativeTotals {
  received: string;
  committed: string;
  liquidated: string;
  paid: string;
  toCommit: string;
  toLiquidate: string;
  toPay: string;
}

interface ProgressRow {
  id: 'committed' | 'liquidated' | 'paid';
  label: string;
  amount: string;
  width: number;
  percentage: string;
  pendingLabel: string;
  pendingAmount: string;
}

interface MonthRow {
  month: number;
  name: string;
  shortName: string;
  received: string;
  paid: string;
  reversed: string;
  receivedWidth: number;
  paidWidth: number;
  reversedWidth: number;
  accessibleLabel: string;
}

interface AuthorRow extends CumulativeTotals {
  id: string;
  name: string;
  closing: string;
  receivedWidth: number;
  paidWidth: number;
}

interface ObjectRow extends CumulativeTotals {
  id: string;
  author: string;
  amendment: string;
  object: string;
  closing: string;
  executionWidth: number;
  executionLabel: string;
}

interface RecentRow {
  id: string;
  date: string;
  dateLabel: string;
  stage: string;
  author: string;
  amendment: string;
  object: string;
  amount: string;
  receiptId: string;
}

interface MonthAccumulator {
  received: bigint;
  paid: bigint;
  reversed: bigint;
}

interface ObjectAccumulator {
  id: string;
  author: string;
  amendment: string;
  object: string;
  totals: CumulativeTotals;
  closing: bigint;
}

const MONTHS = [
  ['Janeiro', 'Jan'],
  ['Fevereiro', 'Fev'],
  ['Março', 'Mar'],
  ['Abril', 'Abr'],
  ['Maio', 'Mai'],
  ['Junho', 'Jun'],
  ['Julho', 'Jul'],
  ['Agosto', 'Ago'],
  ['Setembro', 'Set'],
  ['Outubro', 'Out'],
  ['Novembro', 'Nov'],
  ['Dezembro', 'Dez'],
] as const;

const ZERO_TOTALS: CumulativeTotals = {
  received: '0.00',
  committed: '0.00',
  liquidated: '0.00',
  paid: '0.00',
  toCommit: '0.00',
  toLiquidate: '0.00',
  toPay: '0.00',
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MoneyPipe,
    BalanceStrip,
  ],
  template: `
    <section class="page dashboard">
      <header class="page-head">
        <div>
          <p class="eyebrow">Acompanhamento financeiro</p>
          <h1 class="page-title">Visão geral</h1>
          <p class="page-intro">Caixa, execução e movimentações em um só lugar.</p>
        </div>
        <a mat-stroked-button routerLink="/parlamentares">Ver parlamentares</a>
      </header>

      <div class="dashboard-toolbar">
        <mat-form-field appearance="outline" class="author-filter">
          <mat-label>Parlamentar</mat-label>
          <mat-select [value]="selectedAuthorId()" (selectionChange)="selectAuthor($event.value)">
            <mat-option value="">Todos os parlamentares</mat-option>
            @for (author of store.authors(); track author.id) {
              <mat-option [value]="author.id">{{ author.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <p class="filter-context">
          <span>Exercício {{ store.year() }}</span>
          <span class="context-divider" aria-hidden="true">·</span>
          <strong>{{ selectedAuthor()?.name ?? 'Todos os parlamentares' }}</strong>
        </p>
      </div>

      <section aria-labelledby="cash-title">
        <div class="section-heading">
          <h2 id="cash-title">Caixa do exercício {{ store.year() }}</h2>
          <span>Valores do ano selecionado · em reais</span>
        </div>
        <app-balance-strip [summary]="annualSummary()" />
        <p class="balance-note">
          Pagamentos e estornos aparecem separados para explicar a variação do caixa. Empenhos e
          liquidações acompanham a execução, mas não reduzem o saldo.
        </p>
      </section>

      <section class="execution-section" aria-labelledby="execution-title">
        <div class="section-heading">
          <h2 id="execution-title">Execução acumulada até {{ store.year() }}</h2>
          <span>Créditos recebidos: {{ cumulativeTotals().received | money }}</span>
        </div>
        <p class="section-note">
          Percentuais sobre o crédito recebido acumulado. As etapas mostram o avanço da execução e
          não devem ser somadas entre si.
        </p>
        <div class="execution-grid">
          @for (row of progressRows(); track row.id) {
            <div class="progress-item">
              <div class="progress-heading">
                <span>{{ row.label }}</span>
                <strong>{{ row.amount | money }} · {{ row.percentage }}</strong>
              </div>
              <div
                class="progress-track"
                role="progressbar"
                [attr.aria-label]="row.label + ' sobre o crédito recebido acumulado'"
                [attr.aria-valuenow]="row.width"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span [class]="'progress-fill ' + row.id" [style.width.%]="row.width"></span>
              </div>
              <div class="progress-caption">
                <span>{{ row.pendingLabel }}</span>
                <strong>{{ row.pendingAmount | money }}</strong>
              </div>
            </div>
          }
        </div>
      </section>

      <div class="charts-grid">
        <section class="chart-panel" aria-labelledby="monthly-title">
          <div class="chart-heading">
            <div>
              <h2 id="monthly-title">Movimentação mensal</h2>
              <p>Entradas, pagamentos e estornos no exercício {{ store.year() }}.</p>
            </div>
            <span class="chart-period">R$</span>
          </div>
          <div class="legend" aria-label="Legenda do gráfico mensal">
            <span><i class="legend-swatch received" aria-hidden="true"></i>Recebido</span>
            <span><i class="legend-swatch paid" aria-hidden="true"></i>Pagamento</span>
            <span><i class="legend-swatch reversed" aria-hidden="true"></i>Estorno</span>
          </div>
          @if (hasMonthlyMovements()) {
            <figure class="monthly-chart" aria-describedby="monthly-description">
              <figcaption id="monthly-description" class="sr-only">
                Gráfico de colunas mensais de recebimentos, pagamentos e estornos. Os valores exatos
                estão disponíveis na tabela abaixo do gráfico.
              </figcaption>
              <div class="plot-layout">
                <div class="y-axis" aria-hidden="true">
                  @for (label of monthlyAxisLabels(); track $index) {
                    <span>{{ label }}</span>
                  }
                </div>
                <div class="month-groups">
                  @for (row of monthlyRows(); track row.month) {
                    <div class="month-group">
                      <div class="month-bars" [attr.aria-label]="row.accessibleLabel">
                        <span
                          class="month-bar received"
                          [style.height.%]="row.receivedWidth"
                          [attr.title]="'Recebido ' + (row.received | money)"
                        ></span>
                        <span
                          class="month-bar paid"
                          [style.height.%]="row.paidWidth"
                          [attr.title]="'Pagamento ' + (row.paid | money)"
                        ></span>
                        <span
                          class="month-bar reversed"
                          [style.height.%]="row.reversedWidth"
                          [attr.title]="'Estorno ' + (row.reversed | money)"
                        ></span>
                      </div>
                      <span class="month-name">{{ row.shortName }}</span>
                    </div>
                  }
                </div>
              </div>
              <div class="chart-totals">
                <span>Recebido {{ annualSummary().received | money }}</span>
                <span>Pago líquido {{ netPaidInYear() | money }}</span>
                <span>Estornado {{ annualSummary().reversed | money }}</span>
              </div>
            </figure>
            <details class="month-details">
              <summary>Ver valores exatos por mês</summary>
              <div class="table-wrap">
                <table aria-label="Valores mensais de recebimento, pagamento e estorno">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th class="numeric">Recebido</th>
                      <th class="numeric">Pago</th>
                      <th class="numeric">Estornado</th>
                      <th class="numeric">Pago líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of monthlyRows(); track row.month) {
                      <tr>
                        <td>{{ row.name }}</td>
                        <td class="numeric">{{ row.received | money }}</td>
                        <td class="numeric">{{ row.paid | money }}</td>
                        <td class="numeric">{{ row.reversed | money }}</td>
                        <td class="numeric">{{ rowNetPaid(row) | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          } @else {
            <div class="chart-empty">
              <strong>Sem movimentações neste exercício</strong>
              <p>Quando houver registros, eles aparecerão mês a mês neste gráfico.</p>
            </div>
          }
        </section>

        <section class="chart-panel" aria-labelledby="author-chart-title">
          <div class="chart-heading">
            <div>
              <h2 id="author-chart-title">Créditos e pagamentos por parlamentar</h2>
              <p>Valores acumulados até {{ store.year() }}.</p>
            </div>
            <span class="chart-period">R$</span>
          </div>
          <div class="legend" aria-label="Legenda do gráfico por parlamentar">
            <span><i class="legend-swatch received" aria-hidden="true"></i>Crédito recebido</span>
            <span><i class="legend-swatch paid" aria-hidden="true"></i>Pago líquido</span>
          </div>
          @if (authorRows().length) {
            <ol class="author-chart" aria-label="Créditos e pagamentos por parlamentar">
              @for (row of authorRows(); track row.id) {
                <li class="author-row">
                  <strong class="author-name">{{ row.name }}</strong>
                  <div class="author-bars" aria-hidden="true">
                    <span class="author-track">
                      <span class="author-fill credit" [style.width.%]="row.receivedWidth"></span>
                    </span>
                    <span class="author-track">
                      <span class="author-fill paid" [style.width.%]="row.paidWidth"></span>
                    </span>
                  </div>
                  <div class="author-values">
                    <span>Recebido {{ row.received | money }}</span>
                    <span>Pago {{ row.paid | money }}</span>
                  </div>
                </li>
              }
            </ol>
          } @else {
            <div class="chart-empty">
              <strong>Sem emendas recebidas até {{ store.year() }}</strong>
              <p>Os parlamentares aparecerão aqui quando houver crédito cadastrado.</p>
            </div>
          }
        </section>
      </div>

      <section class="table-section" aria-labelledby="author-table-title">
        <div class="section-heading">
          <h2 id="author-table-title">Resumo por parlamentar</h2>
          <span>Execução acumulada · caixa em {{ store.year() }}</span>
        </div>
        <div class="table-wrap">
          <table aria-label="Resumo acumulado de execução e caixa por parlamentar">
            <thead>
              <tr>
                <th>Parlamentar</th>
                <th class="numeric">Crédito recebido</th>
                <th class="numeric">Empenhado</th>
                <th class="numeric">Liquidado</th>
                <th class="numeric">Pago líquido</th>
                <th class="numeric">Saldo de caixa</th>
              </tr>
            </thead>
            <tbody>
              @for (row of authorRows(); track row.id) {
                <tr>
                  <td>{{ row.name }}</td>
                  <td class="numeric">{{ row.received | money }}</td>
                  <td class="numeric">{{ row.committed | money }}</td>
                  <td class="numeric">{{ row.liquidated | money }}</td>
                  <td class="numeric">{{ row.paid | money }}</td>
                  <td class="numeric">{{ row.closing | money }}</td>
                </tr>
              }
              <tr class="total-row">
                <td>Total geral</td>
                <td class="numeric">{{ cumulativeTotals().received | money }}</td>
                <td class="numeric">{{ cumulativeTotals().committed | money }}</td>
                <td class="numeric">{{ cumulativeTotals().liquidated | money }}</td>
                <td class="numeric">{{ cumulativeTotals().paid | money }}</td>
                <td class="numeric">{{ annualSummary().closing | money }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="table-note">
          O saldo de caixa inclui recursos de exercícios anteriores. Empenho, liquidação e pagamento
          são etapas da execução e não devem ser somadas entre si.
        </p>
      </section>

      <section class="table-section" aria-labelledby="object-table-title">
        <div class="section-heading">
          <h2 id="object-table-title">Execução por emenda e objeto</h2>
          <span>{{ objectRows().length }} {{ objectRows().length === 1 ? 'objeto' : 'objetos' }}</span>
        </div>
        @if (objectRows().length) {
          <div class="table-wrap">
            <table aria-label="Recebimentos e execução detalhada por emenda e objeto">
              <thead>
                <tr>
                  <th>Parlamentar · emenda · objeto</th>
                  <th class="numeric">Recebido</th>
                  <th class="numeric">Empenhado</th>
                  <th class="numeric">Liquidado</th>
                  <th class="numeric">Pago líquido</th>
                  <th class="numeric">Execução</th>
                  <th class="numeric">Saldo do recurso</th>
                </tr>
              </thead>
              <tbody>
                @for (row of objectRows(); track row.id) {
                  <tr>
                    <td>
                      <span class="cell-main">{{ row.author }}</span>
                      <span class="cell-sub">{{ row.amendment }} · {{ row.object }}</span>
                    </td>
                    <td class="numeric">{{ row.received | money }}</td>
                    <td class="numeric">{{ row.committed | money }}</td>
                    <td class="numeric">{{ row.liquidated | money }}</td>
                    <td class="numeric">{{ row.paid | money }}</td>
                    <td class="numeric execution-rate">
                      <span class="rate-line">
                        <span class="rate-track" aria-hidden="true">
                          <span class="rate-fill" [style.width.%]="row.executionWidth"></span>
                        </span>
                        {{ row.executionLabel }}
                      </span>
                    </td>
                    <td class="numeric">{{ row.closing | money }}</td>
                  </tr>
                }
                <tr class="total-row">
                  <td>Total geral</td>
                  <td class="numeric">{{ cumulativeTotals().received | money }}</td>
                  <td class="numeric">{{ cumulativeTotals().committed | money }}</td>
                  <td class="numeric">{{ cumulativeTotals().liquidated | money }}</td>
                  <td class="numeric">{{ cumulativeTotals().paid | money }}</td>
                  <td class="numeric">{{ overallExecution().label }}</td>
                  <td class="numeric">{{ annualSummary().closing | money }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="table-note">
            Execução = pago líquido ÷ crédito recebido. O saldo do recurso considera créditos e
            pagamentos líquidos de cada objeto.
          </p>
        } @else {
          <div class="empty-state">
            <strong>Nenhum objeto com crédito até {{ store.year() }}</strong>
            <p>Cadastre um recebimento para acompanhar aqui os valores de cada objeto.</p>
          </div>
        }
      </section>

      <section class="table-section" aria-labelledby="recent-title">
        <div class="section-heading">
          <h2 id="recent-title">Movimentações recentes</h2>
          <span>Registros do exercício {{ store.year() }}</span>
        </div>
        @if (recentRows().length) {
          <div class="table-wrap">
            <table aria-label="Movimentações financeiras recentes">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Etapa</th>
                  <th>Parlamentar · emenda · objeto</th>
                  <th class="numeric">Valor</th>
                </tr>
              </thead>
              <tbody>
                @for (row of recentRows(); track row.id) {
                  <tr>
                    <td>{{ row.dateLabel }}</td>
                    <td><span class="activity-type">{{ row.stage }}</span></td>
                    <td>
                      <a class="movement-link" [routerLink]="['/recebimentos', row.receiptId]">
                        <span class="cell-main">{{ row.author }}</span>
                        <span class="cell-sub">{{ row.amendment }} · {{ row.object }}</span>
                      </a>
                    </td>
                    <td class="numeric">{{ row.amount | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            <strong>Nenhuma movimentação registrada em {{ store.year() }}</strong>
            <p>Recebimentos e etapas da execução aparecerão aqui quando forem cadastrados.</p>
          </div>
        }
      </section>
    </section>
  `,
  styles: `
    :host { display: block; }
    .dashboard { max-width: 1540px; }
    .eyebrow { margin: 0 0 6px; color: var(--app-muted); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
    .dashboard-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 22px; margin: 0 0 5px; }
    .author-filter { width: min(100%, 360px); }
    .filter-context { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 19px; color: var(--app-muted); font-size: 12px; }
    .filter-context strong { color: var(--app-text); font-weight: 500; }
    .context-divider { color: var(--app-control); }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 22px 0 9px; }
    .section-heading h2, .chart-heading h2 { margin: 0; font-size: 17px; font-weight: 500; line-height: 1.35; }
    .section-heading > span { color: var(--app-muted); font-size: 11px; text-align: right; }
    .balance-note, .section-note, .table-note { margin: 8px 0 0; color: var(--app-muted); font-size: 11px; line-height: 1.5; }
    .execution-section { margin-top: 22px; }
    .execution-section .section-heading { margin-top: 0; }
    .execution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 12px; padding: 13px 0 15px; border-top: 1px solid var(--app-line); border-bottom: 1px solid var(--app-line); }
    .progress-item { min-width: 0; }
    .progress-heading, .progress-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .progress-heading { margin-bottom: 8px; }
    .progress-heading span, .progress-caption span { color: var(--app-muted); font-size: 11px; }
    .progress-heading strong { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .progress-track { display: block; height: 8px; overflow: hidden; border-radius: 2px; background: var(--app-background); }
    .progress-fill { display: block; height: 100%; border-radius: inherit; }
    .progress-fill.committed { background: #315f82; }
    .progress-fill.liquidated { background: #77947f; }
    .progress-fill.paid { background: #bd8552; }
    .progress-caption { margin-top: 6px; font-size: 10px; }
    .progress-caption strong { font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .charts-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr); gap: 18px; align-items: start; margin-top: 22px; }
    .chart-panel { min-width: 0; padding: 19px 20px 14px; border: 1px solid var(--app-line); border-radius: 5px; background: var(--app-surface); }
    .chart-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .chart-heading h2 { font-size: 16px; }
    .chart-heading p { margin: 5px 0 0; color: var(--app-muted); font-size: 11px; }
    .chart-period { color: var(--app-muted); font-size: 10px; white-space: nowrap; }
    .legend { display: flex; flex-wrap: wrap; gap: 13px; margin: 14px 0 11px; color: var(--app-muted); font-size: 10px; }
    .legend > span { display: inline-flex; align-items: center; gap: 6px; }
    .legend-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 1px; }
    .legend-swatch.received, .month-bar.received, .author-fill.credit { background: #315f82; }
    .legend-swatch.paid, .month-bar.paid, .author-fill.paid { background: #77947f; }
    .legend-swatch.reversed, .month-bar.reversed { background: #bd8552; }
    .monthly-chart { margin: 0; }
    .plot-layout { display: grid; grid-template-columns: 65px minmax(0, 1fr); gap: 8px; }
    .y-axis { display: flex; height: 192px; flex-direction: column; justify-content: space-between; padding: 0 0 20px; color: var(--app-muted); font-size: 8px; text-align: right; }
    .month-groups { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px; height: 192px; border-bottom: 1px solid var(--app-line); background: repeating-linear-gradient(to top, transparent 0 calc(25% - 1px), var(--app-line) calc(25% - 1px) 25%); }
    .month-group { display: grid; grid-template-rows: minmax(0, 1fr) 20px; min-width: 0; height: 100%; }
    .month-bars { display: flex; align-items: flex-end; justify-content: center; gap: 2px; min-height: 0; padding-top: 1px; }
    .month-bar { display: block; width: min(8px, 30%); min-height: 0; border-radius: 2px 2px 0 0; }
    .month-name { align-self: end; color: var(--app-muted); font-size: 8px; text-align: center; }
    .chart-totals { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 7px 12px; margin: 7px 0 0 73px; color: var(--app-muted); font-size: 9px; }
    .month-details { margin-top: 8px; border-top: 1px solid var(--app-line); color: var(--app-muted); font-size: 11px; }
    .month-details summary { padding: 8px 0; color: var(--app-primary); cursor: pointer; }
    .author-chart { display: grid; margin: 0; padding: 0; list-style: none; }
    .author-row { display: grid; grid-template-columns: minmax(112px, 130px) minmax(0, 1fr) minmax(118px, auto); align-items: center; gap: 9px; min-height: 56px; border-top: 1px solid var(--app-line); }
    .author-name { font-size: 10px; font-weight: 500; }
    .author-bars { display: grid; gap: 6px; min-width: 0; }
    .author-track { display: block; height: 6px; overflow: hidden; border-radius: 2px; background: var(--app-background); }
    .author-fill { display: block; height: 100%; border-radius: inherit; }
    .author-values { display: grid; gap: 3px; color: var(--app-text); font-size: 9px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .table-section { margin-top: 24px; }
    .table-section .section-heading { margin-top: 0; }
    .table-wrap { overflow-x: auto; border-top: 1px solid var(--app-line); }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 9px 8px; color: var(--app-muted); font-size: 10px; font-weight: 500; text-align: left; white-space: nowrap; }
    td { padding: 9px 8px; border-top: 1px solid var(--app-line); font-size: 12px; vertical-align: middle; }
    td.numeric, th.numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .total-row td { background: var(--app-background); font-weight: 500; }
    .cell-main { display: block; color: var(--app-text); font-weight: 500; }
    .cell-sub { display: block; margin-top: 3px; color: var(--app-muted); font-size: 10px; }
    .execution-rate { min-width: 125px; }
    .rate-line { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
    .rate-track { display: block; width: 45px; height: 5px; overflow: hidden; border-radius: 2px; background: var(--app-background); }
    .rate-fill { display: block; height: 100%; border-radius: inherit; background: #77947f; }
    .activity-type { color: var(--app-primary); font-weight: 500; white-space: nowrap; }
    .movement-link { text-decoration: none; }
    .movement-link:hover .cell-main { text-decoration: underline; }
    .empty-state, .chart-empty { padding: 22px 14px; border-top: 1px solid var(--app-line); text-align: center; }
    .empty-state strong, .chart-empty strong { font-size: 13px; font-weight: 500; }
    .empty-state p, .chart-empty p { margin: 6px 0 0; color: var(--app-muted); font-size: 12px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 1120px) { .charts-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) {
      .execution-grid { grid-template-columns: minmax(0, 1fr); gap: 13px; }
      .chart-panel { padding: 17px 14px 12px; }
      .month-groups { grid-template-columns: repeat(6, minmax(0, 1fr)); height: 220px; }
      .y-axis { height: 220px; }
      .month-bar { width: min(11px, 34%); }
      .author-row { grid-template-columns: minmax(96px, 125px) minmax(0, 1fr) minmax(105px, auto); gap: 7px; }
      th, td { padding-inline: 6px; }
    }
    @media (max-width: 480px) {
      .section-heading { align-items: flex-start; }
      .section-heading h2 { font-size: 15px; }
      .section-heading > span { max-width: 45%; font-size: 10px; }
      .progress-heading { align-items: flex-start; }
      .progress-heading strong { font-size: 11px; }
      .chart-totals { margin-left: 0; }
      .author-row { grid-template-columns: minmax(90px, 1fr) minmax(60px, .8fr); padding: 7px 0; }
      .author-name { grid-column: 1; grid-row: 1 / span 2; }
      .author-bars { grid-column: 2; grid-row: 1; }
      .author-values { grid-column: 2; display: flex; justify-content: space-between; gap: 5px; font-size: 8px; }
    }
  `,
})
export class DashboardPage {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly selectedAuthorId = computed(() => {
    const id = this.queryParams().get('parlamentar') ?? '';
    return this.store.authors().some((author) => author.id === id) ? id : '';
  });
  readonly selectedAuthor = computed<Author | null>(
    () => this.store.authors().find((author) => author.id === this.selectedAuthorId()) ?? null,
  );
  readonly annualSummary = computed(() =>
    this.store.annualSummary(this.store.year(), this.selectedAuthor()?.id),
  );
  readonly netPaidInYear = computed(() =>
    this.add(
      this.annualSummary().paid,
      this.negate(this.annualSummary().reversed),
    ),
  );
  readonly scopedReceipts = computed(() => {
    const cutoff = `${this.store.year()}-12-31`;
    const authorId = this.selectedAuthor()?.id;
    return this.store
      .receipts()
      .filter(
        (receipt) =>
          receipt.creditDate <= cutoff &&
          (!authorId || this.store.receiptAuthor(receipt.id)?.id === authorId),
      );
  });
  readonly cumulativeTotals = computed(() => this.totalsForReceipts(this.scopedReceipts()));
  readonly overallExecution = computed(() =>
    executionProgress(this.cumulativeTotals().paid, this.cumulativeTotals().received),
  );
  readonly progressRows = computed<ProgressRow[]>(() => {
    const totals = this.cumulativeTotals();
    return [
      this.progressRow('committed', 'Empenhado', totals.committed, totals.toCommit, 'Disponível para empenhar', totals.received),
      this.progressRow('liquidated', 'Liquidado', totals.liquidated, totals.toLiquidate, 'Empenhado a liquidar', totals.received),
      this.progressRow('paid', 'Pago líquido', totals.paid, totals.toPay, 'Liquidado a pagar', totals.received),
    ];
  });
  readonly authorRows = computed(() => {
    const cutoff = `${this.store.year()}-12-31`;
    const selectedId = this.selectedAuthor()?.id;
    const authors = selectedId
      ? this.store.authors().filter((author) => author.id === selectedId)
      : this.store.authors();
    const rows: AuthorRow[] = authors
      .map((author) => {
        const receipts = this.store.receipts().filter(
          (receipt) =>
            receipt.creditDate <= cutoff &&
            this.store.receiptAuthor(receipt.id)?.id === author.id,
        );
        const totals = this.totalsForReceipts(receipts);
        return {
          id: author.id,
          name: author.name,
          ...totals,
          closing: this.store.annualSummary(this.store.year(), author.id).closing,
          receivedWidth: 0,
          paidWidth: 0,
        };
      })
      .filter(
        (row) =>
          toCents(row.received) > 0n || toCents(row.closing) > 0n || row.id === selectedId,
      );
    const maximum = rows.reduce((max, row) => {
      const received = toCents(row.received);
      const paid = toCents(row.paid);
      return received > max ? (paid > received ? paid : received) : paid > max ? paid : max;
    }, 0n);
    return rows
      .map((row) => ({
        ...row,
        receivedWidth: this.barWidth(row.received, maximum),
        paidWidth: this.barWidth(row.paid, maximum),
      }))
      .sort((a, b) => {
        const left = toCents(a.received);
        const right = toCents(b.received);
        return left === right ? a.name.localeCompare(b.name, 'pt-BR') : left > right ? -1 : 1;
      });
  });
  readonly monthlyBaseRows = computed(() => {
    const year = this.store.year();
    const selectedId = this.selectedAuthor()?.id;
    const months: MonthAccumulator[] = Array.from({ length: 12 }, () => ({
      received: 0n,
      paid: 0n,
      reversed: 0n,
    }));
    const eligible = new Map<string, Receipt>();
    for (const receipt of this.scopedReceipts()) eligible.set(receipt.id, receipt);

    for (const receipt of eligible.values()) {
      if (Number(receipt.creditDate.slice(0, 4)) === year)
        months[Number(receipt.creditDate.slice(5, 7)) - 1].received += toCents(receipt.amount);
    }
    for (const payment of this.store.payments()) {
      const expense = this.store.expenses().find((item) => item.id === payment.expenseId);
      if (!expense || !eligible.has(expense.receiptId)) continue;
      const paymentYear = Number(payment.date.slice(0, 4));
      if (paymentYear === year) months[Number(payment.date.slice(5, 7)) - 1].paid += toCents(payment.amount);
      if (payment.reversal && Number(payment.reversal.date.slice(0, 4)) === year)
        months[Number(payment.reversal.date.slice(5, 7)) - 1].reversed += toCents(payment.amount);
    }
    return months.map((values, month) => ({ month, values }));
  });
  readonly monthlyScale = computed(() => {
    const max = this.monthlyBaseRows().reduce((largest, row) => {
      const values = row.values;
      return [values.received, values.paid, values.reversed].reduce(
        (current, value) => (value > current ? value : current),
        largest,
      );
    }, 0n);
    if (max === 0n) return 0n;
    const increment = 10_000_000n;
    return ((max + increment - 1n) / increment) * increment;
  });
  readonly monthlyRows = computed<MonthRow[]>(() => {
    const scale = this.monthlyScale();
    return this.monthlyBaseRows().map(({ month, values }) => {
      const received = fromCents(values.received);
      const paid = fromCents(values.paid);
      const reversed = fromCents(values.reversed);
      const [name, shortName] = MONTHS[month];
      return {
        month,
        name,
        shortName,
        received,
        paid,
        reversed,
        receivedWidth: this.ratio(values.received, scale),
        paidWidth: this.ratio(values.paid, scale),
        reversedWidth: this.ratio(values.reversed, scale),
        accessibleLabel: `${name}: recebido ${brl(received)}, pagamentos ${brl(paid)}, estornos ${brl(reversed)}`,
      };
    });
  });
  readonly monthlyAxisLabels = computed(() => {
    const scale = this.monthlyScale();
    return [scale, (scale * 3n) / 4n, scale / 2n, scale / 4n, 0n].map((amount) =>
      this.compactMoney(amount),
    );
  });
  readonly hasMonthlyMovements = computed(() =>
    this.monthlyRows().some(
      (row) =>
        toCents(row.received) > 0n || toCents(row.paid) > 0n || toCents(row.reversed) > 0n,
    ),
  );
  readonly objectRows = computed(() => {
    const groups = new Map<string, ObjectAccumulator>();
    for (const receipt of this.scopedReceipts()) {
      const author = this.store.receiptAuthor(receipt.id);
      const amendment = this.store.amendments().find((item) => item.id === receipt.amendmentId);
      if (!author || !amendment) continue;
      const key = JSON.stringify([
        amendment.id,
        receipt.object.trim().toLocaleLowerCase('pt-BR'),
      ]);
      const group =
        groups.get(key) ??
        this.createObjectAccumulator(key, author, amendment, receipt.object.trim());
      const summary = this.store.receiptSummary(receipt.id);
      const paid = this.subtract(summary.liquidated, summary.toPay);
      group.totals = {
        received: this.add(group.totals.received, receipt.amount),
        committed: this.add(group.totals.committed, summary.committed),
        liquidated: this.add(group.totals.liquidated, summary.liquidated),
        paid: this.add(group.totals.paid, paid),
        toCommit: this.add(group.totals.toCommit, summary.toCommit),
        toLiquidate: this.add(group.totals.toLiquidate, summary.toLiquidate),
        toPay: this.add(group.totals.toPay, summary.toPay),
      };
      group.closing += toCents(summary.closing);
      groups.set(key, group);
    }
    return [...groups.values()]
      .map((group) => {
        const progress = executionProgress(group.totals.paid, group.totals.received);
        return {
          id: group.id,
          author: group.author,
          amendment: group.amendment,
          object: group.object,
          ...group.totals,
          closing: fromCents(group.closing),
          executionWidth: progress.width,
          executionLabel: progress.label,
        };
      })
      .sort(
        (a, b) =>
          a.author.localeCompare(b.author, 'pt-BR') ||
          a.amendment.localeCompare(b.amendment, 'pt-BR') ||
          a.object.localeCompare(b.object, 'pt-BR'),
      );
  });
  readonly recentRows = computed(() => {
    const year = this.store.year();
    const cutoff = `${year}-12-31`;
    const scoped = new Map(this.scopedReceipts().map((receipt) => [receipt.id, receipt]));
    const rows: RecentRow[] = [];
    const addRow = (id: string, date: string, stage: string, receipt: Receipt, amount: string) => {
      const author = this.store.receiptAuthor(receipt.id);
      const amendment = this.store.amendments().find((item) => item.id === receipt.amendmentId);
      if (author && amendment && date.slice(0, 4) === String(year) && date <= cutoff)
        rows.push({
          id,
          date,
          dateLabel: date.split('-').reverse().join('/'),
          stage,
          author: author.name,
          amendment: amendment.number,
          object: receipt.object,
          amount,
          receiptId: receipt.id,
        });
    };
    for (const receipt of scoped.values()) addRow(receipt.id, receipt.creditDate, 'Recebimento', receipt, receipt.amount);
    for (const expense of this.store.expenses()) {
      const receipt = scoped.get(expense.receiptId);
      if (receipt) addRow(expense.id, expense.commitmentDate, 'Empenho', receipt, expense.amount);
    }
    for (const liquidation of this.store.liquidations()) {
      const expense = this.store.expenses().find((item) => item.id === liquidation.expenseId);
      const receipt = expense ? scoped.get(expense.receiptId) : undefined;
      if (receipt) addRow(liquidation.id, liquidation.date, 'Liquidação', receipt, liquidation.amount);
    }
    for (const payment of this.store.payments()) {
      const expense = this.store.expenses().find((item) => item.id === payment.expenseId);
      const receipt = expense ? scoped.get(expense.receiptId) : undefined;
      if (!receipt) continue;
      addRow(payment.id, payment.date, 'Pagamento', receipt, payment.amount);
      if (payment.reversal)
        addRow(`${payment.id}-estorno`, payment.reversal.date, 'Estorno', receipt, payment.amount);
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);
  });

  selectAuthor(authorId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { parlamentar: authorId || null },
      replaceUrl: true,
    });
  }

  rowNetPaid(row: MonthRow): string {
    return this.subtract(row.paid, row.reversed);
  }

  private progressRow(
    id: ProgressRow['id'],
    label: string,
    amount: string,
    pendingAmount: string,
    pendingLabel: string,
    base: string,
  ): ProgressRow {
    const progress = executionProgress(amount, base);
    return { id, label, amount, width: progress.width, percentage: progress.label, pendingLabel, pendingAmount };
  }

  private totalsForReceipts(receipts: Receipt[]): CumulativeTotals {
    return receipts.reduce((total, receipt) => {
      const summary = this.store.receiptSummary(receipt.id);
      const paid = this.subtract(summary.liquidated, summary.toPay);
      return {
        received: this.add(total.received, receipt.amount),
        committed: this.add(total.committed, summary.committed),
        liquidated: this.add(total.liquidated, summary.liquidated),
        paid: this.add(total.paid, paid),
        toCommit: this.add(total.toCommit, summary.toCommit),
        toLiquidate: this.add(total.toLiquidate, summary.toLiquidate),
        toPay: this.add(total.toPay, summary.toPay),
      };
    }, { ...ZERO_TOTALS });
  }

  private createObjectAccumulator(
    id: string,
    author: Author,
    amendment: Amendment,
    object: string,
  ): ObjectAccumulator {
    return {
      id,
      author: author.name,
      amendment: amendment.number,
      object,
      totals: { ...ZERO_TOTALS },
      closing: 0n,
    };
  }

  private add(left: string, right: string): string {
    return fromCents(toCents(left) + toCents(right));
  }

  private subtract(left: string, right: string): string {
    return fromCents(toCents(left) - toCents(right));
  }

  private negate(value: string): string {
    return fromCents(-toCents(value));
  }

  private barWidth(value: string, maximum: bigint): number {
    return this.ratio(toCents(value), maximum);
  }

  private ratio(value: bigint, maximum: bigint): number {
    if (maximum <= 0n) return 0;
    return Number((value * 10000n) / maximum) / 100;
  }

  private compactMoney(cents: bigint): string {
    if (cents >= 100_000n) {
      const tenths = (cents + 5_000n) / 10_000n;
      return `R$ ${this.groupDigits(tenths / 10n)},${tenths % 10n} mil`;
    }
    return brl(fromCents(cents));
  }

  private groupDigits(value: bigint): string {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
}
