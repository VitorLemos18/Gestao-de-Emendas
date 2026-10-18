import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DemoStore } from '../../core/demo-store';
import { Author } from '../../core/models';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { BalanceStrip } from '../../shared/balance-strip';

@Component({
  selector: 'app-annual-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MoneyPipe,
    DateBrPipe,
    BalanceStrip,
  ],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Saldos entre exercícios</h1>
          <p class="page-intro">
            Veja quanto entrou, quanto foi pago e o saldo que continua disponível em cada ano.
          </p>
        </div>
        <a mat-stroked-button routerLink="/recebimentos">Ver recebimentos</a>
      </header>

      <div class="toolbar">
        <mat-form-field appearance="outline"
          ><mat-label>Parlamentar</mat-label>
          <input
            #authorInput
            matInput
            [formControl]="authorControl"
            [matAutocomplete]="authorOptions"
            placeholder="Digite para pesquisar"
          />
          @if (authorControl.value) {
            <button
              matSuffix
              mat-button
              type="button"
              (click)="clearAuthor(); authorInput.focus()"
              aria-label="Limpar filtro de parlamentar"
            >
              Limpar
            </button>
          }
          <mat-autocomplete
            #authorOptions="matAutocomplete"
            [displayWith]="displayAuthor"
            [requireSelection]="true"
            (optionSelected)="selectAuthor($event.option.value)"
          >
            @for (author of matchingAuthors(); track author.id) {
              <mat-option [value]="author">{{ author.name }}</mat-option>
            }
            @if (!matchingAuthors().length) {
              <mat-option disabled>Nenhum parlamentar encontrado</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
        <p class="muted">
          Exercício <strong>{{ store.year() }}</strong> ·
          {{ selectedAuthor() ? selectedAuthor()!.name : 'Todos os parlamentares' }}
        </p>
      </div>

      <app-balance-strip [summary]="totals()" />

      <p class="muted balance-explanation">
        Saldo de caixa = saldo anterior + recebido − pago líquido + estornado. O saldo final de um
        ano passa a ser o saldo anterior do próximo; essa passagem não cria um novo recebimento.
      </p>

      <div class="section-heading"><h2>Composição por parlamentar</h2></div>
      <div class="table-wrap">
        <table mat-table [dataSource]="pagedAuthorRows()" class="work-table">
          <ng-container matColumnDef="name"
            ><th mat-header-cell *matHeaderCellDef>Parlamentar</th>
            <td mat-cell *matCellDef="let row">
              <button mat-button (click)="selectAuthor(row.author)">{{ row.author.name }}</button>
            </td></ng-container
          >
          <ng-container matColumnDef="opening"
            ><th mat-header-cell *matHeaderCellDef class="numeric">Saldo anterior</th>
            <td mat-cell *matCellDef="let row" class="numeric">
              {{ row.summary.opening | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="received"
            ><th mat-header-cell *matHeaderCellDef class="numeric">Recebido</th>
            <td mat-cell *matCellDef="let row" class="numeric">
              {{ row.summary.received | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="paid"
            ><th mat-header-cell *matHeaderCellDef class="numeric">Pago</th>
            <td mat-cell *matCellDef="let row" class="numeric">
              {{ row.summary.paid | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="reversed"
            ><th mat-header-cell *matHeaderCellDef class="numeric">Estornado</th>
            <td mat-cell *matCellDef="let row" class="numeric">
              {{ row.summary.reversed | money }}
            </td></ng-container
          >
          <ng-container matColumnDef="closing"
            ><th mat-header-cell *matHeaderCellDef class="numeric">Saldo de caixa</th>
            <td mat-cell *matCellDef="let row" class="numeric">
              <strong>{{ row.summary.closing | money }}</strong>
            </td></ng-container
          >
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
          <tr *matNoDataRow>
            <td colspan="6" class="empty-state">Nenhum parlamentar cadastrado.</td>
          </tr>
        </table>
      </div>
      <mat-paginator
        [length]="authorRows().length"
        [pageIndex]="safeAuthorPage()"
        [pageSize]="authorPageSize()"
        [pageSizeOptions]="[10, 25, 50]"
        (page)="changeAuthorPage($event)"
        aria-label="Paginação dos saldos por parlamentar"
      ></mat-paginator>

      @if (selectedAuthor()) {
        <div class="section-heading">
          <h2>Composição do saldo por recebimento</h2>
        </div>
        <p class="muted receipt-balance-note">
          {{ selectedAuthor()!.name }} · valores do exercício {{ store.year() }}. O saldo de cada
          linha segue a mesma fórmula acima.
        </p>
        <div class="table-wrap">
          <table class="work-table" aria-label="Composição anual do saldo por recebimento">
            <thead>
              <tr>
                <th>Objeto / emenda</th>
                <th>Crédito / conta</th>
                <th class="numeric">Saldo anterior</th>
                <th class="numeric">Recebido no ano</th>
                <th class="numeric">Pago líquido</th>
                <th class="numeric">Estornado</th>
                <th class="numeric">Saldo de caixa</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pagedReceiptRows(); track row.receipt.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/recebimentos', row.receipt.id]">{{ row.receipt.object }}</a>
                    <div class="muted">{{ amendmentNumber(row.receipt.amendmentId) }}</div>
                  </td>
                  <td>
                    {{ row.receipt.creditDate | dateBr }}
                    <div class="muted">Conta {{ row.receipt.account }}</div>
                  </td>
                  <td class="numeric">{{ row.summary.opening | money }}</td>
                  <td class="numeric">{{ row.summary.received | money }}</td>
                  <td class="numeric">{{ row.summary.paid | money }}</td>
                  <td class="numeric">{{ row.summary.reversed | money }}</td>
                  <td class="numeric">
                    <strong>{{ row.summary.closing | money }}</strong>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="empty-state">
                    Nenhum recebimento até o fim deste exercício.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator
          [length]="receiptRows().length"
          [pageIndex]="safeReceiptPage()"
          [pageSize]="receiptPageSize()"
          [pageSizeOptions]="[10, 25, 50]"
          (page)="changeReceiptPage($event)"
          aria-label="Paginação dos recebimentos do parlamentar"
        ></mat-paginator>
      }

      <div class="section-heading"><h2>Continuidade entre exercícios</h2></div>
      <div class="table-wrap">
        <table class="work-table">
          <thead>
            <tr>
              <th>Exercício</th>
              <th class="numeric">Saldo anterior</th>
              <th class="numeric">Recebido</th>
              <th class="numeric">Pago</th>
              <th class="numeric">Estornado</th>
              <th class="numeric">Saldo de caixa</th>
            </tr>
          </thead>
          <tbody>
            @for (row of yearRows(); track row.year) {
              <tr [class.current-year]="row.year === store.year()">
                <td>
                  <button
                    mat-button
                    (click)="chooseYear(row.year)"
                    [attr.aria-current]="row.year === store.year() ? 'true' : null"
                  >
                    {{ row.year }}
                  </button>
                </td>
                <td class="numeric">{{ row.summary.opening | money }}</td>
                <td class="numeric">{{ row.summary.received | money }}</td>
                <td class="numeric">{{ row.summary.paid | money }}</td>
                <td class="numeric">{{ row.summary.reversed | money }}</td>
                <td class="numeric">
                  <strong>{{ row.summary.closing | money }}</strong>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted report-note">
        Empenhos e liquidações mostram etapas da execução, mas não movimentam o caixa. O caixa muda
        quando há pagamento ou estorno. Confira os detalhes por recebimento para localizar a origem
        de cada valor.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .toolbar mat-form-field {
      width: min(100%, 380px);
    }
    .report-note {
      max-width: 90ch;
      margin-top: 18px;
    }
    .balance-explanation,
    .receipt-balance-note {
      max-width: 90ch;
      margin: 10px 0 22px;
      line-height: 1.55;
    }
    .receipt-balance-note {
      margin-top: -8px;
    }
    .current-year {
      background: var(--app-tint);
    }
    th.numeric,
    td.numeric {
      text-align: right;
    }
  `,
})
export class AnnualPage {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly authorControl = new FormControl<Author | string | null>(
    this.store.authors().find((a) => a.id === this.route.snapshot.queryParamMap.get('autor')) ??
      null,
  );
  private readonly authorText = toSignal(this.authorControl.valueChanges, {
    initialValue: this.authorControl.value,
  });
  readonly selectedAuthor = computed(() => {
    const value = this.authorText();
    return value && typeof value === 'object' ? value : null;
  });
  readonly authorPage = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pAutores')) || 0)),
  );
  readonly authorPageSize = signal(
    [10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limiteAutores')))
      ? Number(this.route.snapshot.queryParamMap.get('limiteAutores'))
      : 10,
  );
  readonly receiptPage = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pRecebimentos')) || 0)),
  );
  readonly receiptPageSize = signal(
    [10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limiteRecebimentos')))
      ? Number(this.route.snapshot.queryParamMap.get('limiteRecebimentos'))
      : 10,
  );
  readonly displayAuthor = (author: Author | string | null): string =>
    typeof author === 'string' ? author : (author?.name ?? '');
  readonly matchingAuthors = computed(() => {
    const term = this.displayAuthor(this.authorText()).toLocaleLowerCase('pt-BR');
    return this.store.authors().filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(term));
  });
  readonly totals = computed(() =>
    this.store.annualSummary(this.store.year(), this.selectedAuthor()?.id),
  );
  readonly authorRows = computed(() =>
    this.store
      .authors()
      .filter((a) => !this.selectedAuthor() || a.id === this.selectedAuthor()!.id)
      .map((author) => ({
        author,
        summary: this.store.annualSummary(this.store.year(), author.id),
      })),
  );
  readonly receiptRows = computed(() =>
    this.store
      .receipts()
      .filter(
        (r) =>
          r.creditDate <= `${this.store.year()}-12-31` &&
          this.store.receiptAuthor(r.id)?.id === this.selectedAuthor()?.id,
      )
      .map((receipt) => ({
        receipt,
        summary: this.store.receiptSummary(receipt.id, this.store.year()),
      })),
  );
  readonly safeAuthorPage = computed(() =>
    Math.min(
      this.authorPage(),
      Math.max(0, Math.ceil(this.authorRows().length / this.authorPageSize()) - 1),
    ),
  );
  readonly safeReceiptPage = computed(() =>
    Math.min(
      this.receiptPage(),
      Math.max(0, Math.ceil(this.receiptRows().length / this.receiptPageSize()) - 1),
    ),
  );
  readonly pagedAuthorRows = computed(() =>
    this.authorRows().slice(
      this.safeAuthorPage() * this.authorPageSize(),
      (this.safeAuthorPage() + 1) * this.authorPageSize(),
    ),
  );
  readonly pagedReceiptRows = computed(() =>
    this.receiptRows().slice(
      this.safeReceiptPage() * this.receiptPageSize(),
      (this.safeReceiptPage() + 1) * this.receiptPageSize(),
    ),
  );
  readonly yearRows = computed(() => {
    const eventYears = [
      this.store.year(),
      ...this.store.receipts().map((r) => Number(r.creditDate.slice(0, 4))),
      ...this.store
        .payments()
        .flatMap((p) => [
          Number(p.date.slice(0, 4)),
          ...(p.reversal ? [Number(p.reversal.date.slice(0, 4))] : []),
        ]),
    ];
    const min = Math.min(...eventYears),
      max = Math.max(...eventYears);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i).map((year) => ({
      year,
      summary: this.store.annualSummary(year, this.selectedAuthor()?.id),
    }));
  });
  readonly columns = ['name', 'opening', 'received', 'paid', 'reversed', 'closing'];

  constructor() {
    const year = Number(this.route.snapshot.queryParamMap.get('ano'));
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) this.store.year.set(year);
  }
  selectAuthor(author: Author): void {
    this.authorControl.setValue(author);
    this.authorPage.set(0);
    this.receiptPage.set(0);
    this.persist();
  }
  clearAuthor(): void {
    this.authorControl.setValue(null);
    this.authorPage.set(0);
    this.receiptPage.set(0);
    this.persist();
  }
  chooseYear(year: number): void {
    this.store.year.set(year);
    this.receiptPage.set(0);
    this.persist();
  }
  changeAuthorPage(event: PageEvent): void {
    this.authorPage.set(event.pageIndex);
    this.authorPageSize.set(event.pageSize);
    this.persist();
  }
  changeReceiptPage(event: PageEvent): void {
    this.receiptPage.set(event.pageIndex);
    this.receiptPageSize.set(event.pageSize);
    this.persist();
  }
  private persist(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        autor: this.selectedAuthor()?.id ?? null,
        ano: this.store.year(),
        pAutores: this.safeAuthorPage() || null,
        pRecebimentos: this.safeReceiptPage() || null,
        limiteAutores: this.authorPageSize() === 10 ? null : this.authorPageSize(),
        limiteRecebimentos: this.receiptPageSize() === 10 ? null : this.receiptPageSize(),
      },
      replaceUrl: true,
    });
  }
  amendmentNumber(id: string): string {
    return this.store.amendments().find((a) => a.id === id)?.number ?? 'Emenda não encontrada';
  }
}
