import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DemoStore } from '../../core/demo-store';
import { AnnualSummary, Receipt } from '../../core/models';
import { fromCents, toCents } from '../../core/money';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { BalanceStrip } from '../../shared/balance-strip';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';

@Component({
  selector: 'app-receipt-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MoneyPipe,
    DateBrPipe,
    BalanceStrip,
  ],
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Recebimentos</h1>
          <p class="page-intro">Créditos, aplicação e saldo de cada objeto.</p>
        </div>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="openHelp()">Como funciona?</button>
          @if (store.canWrite()) {
            <a mat-flat-button routerLink="/recebimentos/novo">Novo recebimento</a>
          }
        </div>
      </div>
      <div class="scope-line">
        <span>Posição até 31/12/{{ store.year() }}</span
        ><span>{{ authorLabel() }}</span>
      </div>
      @if (query() || authorId() || executionFilterValue()) {
        <p class="summary-scope">Resumo de caixa dos recebimentos encontrados com os filtros.</p>
      }
      <app-balance-strip [summary]="summary()" />
      <div class="toolbar">
        <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
          <mat-label>Buscar recebimento</mat-label>
          <input
            matInput
            type="search"
            [formControl]="search"
            placeholder="Objeto, parlamentar, emenda ou conta"
            autocomplete="off"
          />
          @if (query()) {
            <button
              matSuffix
              mat-button
              type="button"
              (click)="search.setValue('')"
              aria-label="Limpar busca"
            >
              Limpar
            </button>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="author-filter">
          <mat-label>Parlamentar</mat-label>
          <mat-select [formControl]="author"
            ><mat-option value="">Todos os parlamentares</mat-option>
            @for (item of store.authors(); track item.id) {
              <mat-option [value]="item.id">{{ item.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="execution-filter">
          <mat-label>Situação da execução</mat-label>
          <mat-select [formControl]="executionFilter">
            <mat-option value="">Todos os recebimentos ({{ executionCounts().all }})</mat-option>
            <mat-option value="commitment">
              Com saldo para empenhar ({{ executionCounts().toCommit }})
            </mat-option>
            <mat-option value="liquidation">
              Empenhado a liquidar ({{ executionCounts().toLiquidate }})
            </mat-option>
            <mat-option value="payment">
              Liquidado a pagar ({{ executionCounts().toPay }})
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>
      <div class="results-caption" aria-live="polite">
        <span
          >{{ rows().length }} recebimentos{{
            query() || authorId() || executionFilterValue() ? ' encontrados' : ''
          }}</span
        ><span>{{ previousCount() }} com saldo de exercício anterior</span>
      </div>
      <div class="table-wrap">
        <table
          mat-table
          [dataSource]="pagedRows()"
          matSort
          [matSortActive]="sort().active"
          [matSortDirection]="sort().direction"
          (matSortChange)="sort.set($event)"
          class="work-table receipts-table"
          aria-label="Recebimentos no exercício"
        >
          <ng-container matColumnDef="object"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header="object">Objeto / emenda</th>
            <td mat-cell *matCellDef="let row">
              <a class="record-link" [routerLink]="['/recebimentos', row.id]">{{ row.object }}</a
              ><span class="cell-secondary">{{ amendmentNumber(row) }}</span
              ><span class="mobile-author">{{ authorName(row) }}</span>
            </td></ng-container
          >
          <ng-container matColumnDef="author"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header="author" class="origin-column">
              Origem
            </th>
            <td mat-cell *matCellDef="let row" class="origin-column">
              {{ authorName(row)
              }}<span class="cell-secondary">Crédito em {{ row.creditDate | dateBr }}</span>
            </td></ng-container
          >
          <ng-container matColumnDef="amount"
            ><th
              mat-header-cell
              *matHeaderCellDef
              mat-sort-header="amount"
              class="numeric original-column"
            >
              Valor original
            </th>
            <td mat-cell *matCellDef="let row" class="numeric original-column">
              {{ row.amount | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="paid"
            ><th mat-header-cell *matHeaderCellDef class="numeric paid-column">Pago no ano</th>
            <td mat-cell *matCellDef="let row" class="numeric paid-column">
              {{ store.receiptSummary(row.id).paid | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="balance"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header="balance" class="numeric">
              Saldo de caixa
            </th>
            <td mat-cell *matCellDef="let row" class="numeric">
              <strong>{{ store.receiptSummary(row.id).closing | money }}</strong>
              @if (store.receiptSummary(row.id).toPay !== '0.00') {
                <span class="cell-secondary"
                  >{{ store.receiptSummary(row.id).toPay | money }} a pagar</span
                >
              }
            </td></ng-container
          >
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
      @if (!rows().length) {
        <div class="empty-state">
          <h2>
            {{
              matchingRows().length
                ? 'Nenhum recebimento nesta situação'
                : 'Nenhum recebimento encontrado'
            }}
          </h2>
          <p>
            {{
              matchingRows().length
                ? 'Escolha outra situação da execução ou limpe os filtros.'
                : 'Altere a busca, o parlamentar ou o exercício da consulta.'
            }}
          </p>
          <button mat-button (click)="clearFilters()">Limpar filtros</button>
        </div>
      }
      <mat-paginator
        [length]="rows().length"
        [pageSize]="pageSize()"
        [pageIndex]="safePageIndex()"
        [pageSizeOptions]="[5, 10, 25]"
        (page)="changePage($event)"
        aria-label="Paginação dos recebimentos"
      />
      <p class="muted table-note">
        O saldo inclui recursos de anos anteriores. Cada recebimento mantém seu objeto e sua conta.
      </p>
    </section>
  `,
  styles: `
    .scope-line,
    .results-caption {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: var(--app-muted);
    }
    .scope-line {
      margin-bottom: 10px;
    }
    .results-caption {
      margin: 18px 0 8px;
    }
    .summary-scope {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--app-muted);
    }
    .search-field {
      flex: 1;
      min-width: 220px;
    }
    .author-filter {
      width: 250px;
      max-width: 100%;
    }
    .execution-filter {
      width: 280px;
      max-width: 100%;
    }
    .table-note {
      margin-top: 14px;
      font-size: 12px;
    }
    .table-wrap .receipts-table {
      min-width: 0;
    }
    .receipts-table td:first-child {
      min-width: 190px;
      max-width: 300px;
    }
    .receipts-table strong {
      font-weight: 600;
    }
    .mobile-author {
      display: none;
    }
    @media (max-width: 1100px) {
      .paid-column {
        display: none;
      }
    }
    @media (max-width: 720px) {
      .origin-column,
      .original-column {
        display: none;
      }
      .mobile-author {
        display: block;
        font-size: 12px;
        color: var(--app-muted);
        margin-top: 4px;
      }
      .receipts-table td:first-child {
        min-width: 145px;
      }
      .search-field,
      .author-filter,
      .execution-filter {
        width: 100%;
        min-width: 0;
      }
      .scope-line,
      .results-caption {
        flex-wrap: wrap;
      }
      .toolbar {
        align-items: stretch;
      }
    }
  `,
})
export class ReceiptList {
  readonly store = inject(DemoStore);
  private readonly dialogs = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly search = new FormControl(this.route.snapshot.queryParamMap.get('q') ?? '', {
    nonNullable: true,
  });
  readonly author = new FormControl(this.route.snapshot.queryParamMap.get('autor') ?? '', {
    nonNullable: true,
  });
  readonly executionFilter = new FormControl<ReceiptExecutionFilter>(
    parseExecutionFilter(this.route.snapshot.queryParamMap.get('situacao')),
    { nonNullable: true },
  );
  readonly query = toSignal(this.search.valueChanges, { initialValue: this.search.value });
  readonly authorId = toSignal(this.author.valueChanges, { initialValue: this.author.value });
  readonly executionFilterValue = toSignal(this.executionFilter.valueChanges, {
    initialValue: this.executionFilter.value,
  });
  readonly sort = signal<Sort>({ active: 'object', direction: 'asc' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly columns = ['object', 'author', 'amount', 'paid', 'balance'];
  readonly authorLabel = computed(
    () =>
      this.store.authors().find((a) => a.id === this.authorId())?.name ?? 'Todos os parlamentares',
  );
  readonly matchingRows = computed(() => {
    const query = normalize(this.query());
    const rows = this.store
      .receipts()
      .filter(
        (r) =>
          r.creditDate <= `${this.store.year()}-12-31` &&
          (!this.authorId() || this.store.receiptAuthor(r.id)?.id === this.authorId()) &&
          (!query ||
            normalize(
              [r.object, r.account, this.authorName(r), this.amendmentNumber(r)].join(' '),
            ).includes(query)),
      );
    const sort = this.sort();
    if (!sort.direction) return rows;
    return [...rows].sort((a, b) => {
      let result: number;
      if (sort.active === 'amount' || sort.active === 'balance') {
        const x = toCents(
          sort.active === 'amount' ? a.amount : this.store.receiptSummary(a.id).closing,
        );
        const y = toCents(
          sort.active === 'amount' ? b.amount : this.store.receiptSummary(b.id).closing,
        );
        result = x < y ? -1 : x > y ? 1 : 0;
      } else
        result = (sort.active === 'author' ? this.authorName(a) : a.object).localeCompare(
          sort.active === 'author' ? this.authorName(b) : b.object,
          'pt-BR',
        );
      return sort.direction === 'asc' ? result : -result;
    });
  });
  readonly executionCounts = computed(() => {
    const counts = { all: this.matchingRows().length, toCommit: 0, toLiquidate: 0, toPay: 0 };
    for (const row of this.matchingRows()) {
      const summary = this.store.receiptSummary(row.id);
      if (toCents(summary.toCommit) > 0n) counts.toCommit++;
      if (toCents(summary.toLiquidate) > 0n) counts.toLiquidate++;
      if (toCents(summary.toPay) > 0n) counts.toPay++;
    }
    return counts;
  });
  readonly rows = computed(() => {
    const filter = this.executionFilterValue();
    if (!filter) return this.matchingRows();
    const field =
      filter === 'commitment' ? 'toCommit' : filter === 'liquidation' ? 'toLiquidate' : 'toPay';
    return this.matchingRows().filter(
      (row) => toCents(this.store.receiptSummary(row.id)[field]) > 0n,
    );
  });
  readonly previousCount = computed(
    () => this.rows().filter((r) => toCents(this.store.receiptSummary(r.id).opening) > 0n).length,
  );
  readonly safePageIndex = computed(() =>
    Math.min(this.pageIndex(), Math.max(0, Math.ceil(this.rows().length / this.pageSize()) - 1)),
  );
  readonly pagedRows = computed(() =>
    this.rows().slice(
      this.safePageIndex() * this.pageSize(),
      (this.safePageIndex() + 1) * this.pageSize(),
    ),
  );
  readonly summary = computed<AnnualSummary>(() => {
    const summary: AnnualSummary = {
      opening: '0.00',
      received: '0.00',
      paid: '0.00',
      reversed: '0.00',
      closing: '0.00',
    };
    for (const row of this.rows()) {
      const item = this.store.receiptSummary(row.id);
      for (const key of ['opening', 'received', 'paid', 'reversed', 'closing'] as const)
        summary[key] = fromCents(toCents(summary[key]) + toCents(item[key]));
    }
    return summary;
  });
  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => this.persistFilters());
    this.author.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.persistFilters());
    this.executionFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.persistFilters());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const author = params.get('autor') ?? '';
      const executionFilter = parseExecutionFilter(params.get('situacao'));
      if (author !== this.author.value) this.author.setValue(author, { emitEvent: false });
      if (executionFilter !== this.executionFilter.value)
        this.executionFilter.setValue(executionFilter, { emitEvent: false });
    });
  }

  openHelp(): void {
    this.dialogs.open(WorkflowHelpDialog, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  authorName(row: Receipt) {
    return this.store.receiptAuthor(row.id)?.name ?? 'Parlamentar não encontrado';
  }
  amendmentNumber(row: Receipt) {
    return this.store.amendments().find((a) => a.id === row.amendmentId)?.number ?? '';
  }
  clearFilters() {
    this.executionFilter.setValue('');
    this.author.setValue('');
    this.search.setValue('');
  }
  changePage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }
  private persistFilters() {
    this.pageIndex.set(0);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        autor: this.author.value || null,
        situacao: this.executionFilter.value || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

type ReceiptExecutionFilter = '' | 'commitment' | 'liquidation' | 'payment';

function parseExecutionFilter(value: string | null): ReceiptExecutionFilter {
  return value === 'commitment' || value === 'liquidation' || value === 'payment' ? value : '';
}
