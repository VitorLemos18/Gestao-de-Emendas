import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DemoStore } from '../../core/demo-store';
import { Amendment, AnnualSummary, Author, Receipt, ReceiptSummary } from '../../core/models';
import { fromCents, toCents } from '../../core/money';
import { DateBrPipe, MoneyPipe } from '../../shared/format';
import { executionProgress } from '../../shared/execution-progress';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';
import { WorkflowNextStepDialog } from '../../shared/workflow-next-step-dialog';
import { CatalogAmendmentDialog, CatalogAuthorDialog } from './catalog-page';

interface ReceiptView {
  receipt: Receipt;
  summary: ReceiptSummary;
  paid: string;
}

interface AmendmentView {
  amendment: Amendment;
  receipts: ReceiptView[];
  futureReceiptCount: number;
  credit: string;
  committed: string;
  liquidated: string;
  paid: string;
  annual: AnnualSummary;
}

@Component({
  selector: 'app-parliamentarian-explorer',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatTooltipModule,
    MoneyPipe,
    DateBrPipe,
  ],
  template: `
    <section class="page explorer-page">
      @if (!selectedAuthor()) {
        <header class="page-head">
          <div>
            <h1 class="page-title">Parlamentares</h1>
            <p class="page-intro">Selecione um nome para consultar as emendas e acompanhar cada valor recebido e executado.</p>
          </div>
          <div class="page-actions">
            <button mat-stroked-button type="button" (click)="openHelp()">Como funciona?</button>
            @if (store.canWrite()) {
              <button mat-flat-button type="button" (click)="newAuthor()">Novo parlamentar</button>
            }
          </div>
        </header>

        <div class="explorer-toolbar">
          <label class="explorer-search">
            <span>Buscar parlamentar</span>
            <input type="search" [value]="search()" (input)="onSearch($event)"
                   placeholder="Digite o nome" aria-label="Buscar parlamentar pelo nome" />
          </label>
          <span class="muted">{{ visibleAuthors().length }} {{ visibleAuthors().length === 1 ? 'nome encontrado' : 'nomes encontrados' }}</span>
        </div>

        @if (pagedAuthors().length) {
          <ul class="parliamentarian-list" aria-label="Parlamentares cadastrados">
            @for (author of pagedAuthors(); track author.id) {
              <li>
                <button class="parliamentarian-row" type="button" (click)="openAuthor(author)"
                        [attr.aria-label]="'Abrir emendas de ' + author.name">
                  <span>{{ author.name }}</span>
                  <span class="row-action">Ver emendas <span aria-hidden="true">›</span></span>
                </button>
              </li>
            }
          </ul>
          <mat-paginator [length]="visibleAuthors().length" [pageIndex]="safePage()" [pageSize]="pageSize()"
                         [pageSizeOptions]="[10, 25, 50]" (page)="changePage($event)"
                         aria-label="Paginação dos parlamentares"></mat-paginator>
        } @else {
          <div class="empty-state explorer-empty">
            <strong>{{ store.authors().length ? 'Nenhum parlamentar encontrado' : 'Nenhum parlamentar cadastrado' }}</strong>
            <p>{{ store.authors().length ? 'Confira a busca ou limpe o campo para ver todos os nomes.' : 'Cadastre um parlamentar para começar a organizar as emendas.' }}</p>
            @if (search()) { <button mat-button type="button" (click)="search.set(''); pageIndex.set(0)">Limpar busca</button> }
            @else if (store.canWrite()) { <button mat-flat-button type="button" (click)="newAuthor()">Cadastrar parlamentar</button> }
          </div>
        }
      } @else {
        <header class="page-head explorer-detail-head">
          <div>
            <button mat-button class="back-link" type="button" (click)="backToAuthors()">‹ Parlamentares</button>
            <h1 class="page-title">{{ selectedAuthor()?.name }}</h1>
            <p class="page-intro">Emendas e execução financeira acumulada até {{ store.year() }}.</p>
          </div>
          <div class="page-actions">
            <button mat-stroked-button type="button" (click)="openHelp()">Como funciona?</button>
            @if (store.canWrite() && authorAmendments().length) {
              <button mat-flat-button type="button" (click)="newAmendment()">Nova emenda</button>
            }
          </div>
        </header>

        @if (authorAmendments().length) {
          <section class="amendment-list" aria-label="Emendas do parlamentar">
            @for (view of authorAmendments(); track view.amendment.id) {
              <article class="amendment-entry">
                <button class="amendment-summary" type="button" (click)="toggleAmendment(view.amendment.id)"
                        [attr.aria-expanded]="expandedId() === view.amendment.id"
                        [attr.aria-controls]="'amendment-detail-' + view.amendment.id">
                  <span class="amendment-identity">
                    <strong>Emenda {{ view.amendment.number }}</strong>
                    <span class="muted">Exercício {{ view.amendment.year }} · {{ view.receipts.length }} {{ view.receipts.length === 1 ? 'objeto com crédito' : 'objetos com crédito' }} até {{ store.year() }}</span>
                  </span>
                  <span class="amendment-credit">
                    <span>Crédito recebido</span>
                    <strong>{{ view.credit | money }}</strong>
                  </span>
                  <span class="amendment-execution">
                    <span>Pago líquido acumulado</span>
                    <strong>{{ progress(view.paid, view.credit).label }}</strong>
                  </span>
                  <span class="expand-indicator" aria-hidden="true">{{ expandedId() === view.amendment.id ? '−' : '+' }}</span>
                </button>

                @if (expandedId() === view.amendment.id) {
                  <div class="amendment-detail" [id]="'amendment-detail-' + view.amendment.id">
                    @if (view.amendment.mirrorDocument) {
                      <div class="mirror-document-row">
                        <span>Documento oficial da emenda</span>
                        <a [href]="mirrorPdfUrl(view.amendment.id, view.amendment.mirrorDocument.id)"
                           target="_blank" rel="noopener">
                          Abrir espelho em PDF · {{ view.amendment.mirrorDocument.fileName }}
                        </a>
                      </div>
                    }
                    @if (hasCredit(view.credit)) {
                      <div class="execution-overview">
                        <div class="execution-title">
                          <div>
                            <h2>Execução da emenda</h2>
                            <p>Percentuais calculados sobre os créditos recebidos até {{ store.year() }}.</p>
                          </div>
                          <span class="execution-total">Total recebido <strong>{{ view.credit | money }}</strong></span>
                        </div>
                        <div class="main-progress">
                          <div class="main-progress-label">
                            <span>Pago líquido acumulado</span>
                            <strong>{{ view.paid | money }} <span>({{ progress(view.paid, view.credit).label }})</span></strong>
                          </div>
                          <div class="progress-track" role="progressbar" aria-label="Percentual pago líquido acumulado"
                               aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="progress(view.paid, view.credit).width"
                               [attr.aria-valuetext]="progress(view.paid, view.credit).label">
                            <span [style.width.%]="progress(view.paid, view.credit).width"></span>
                          </div>
                        </div>
                        <div class="stage-grid" aria-label="Etapas acumuladas">
                          <div class="stage-item">
                            <span>Empenhado</span><strong>{{ view.committed | money }}</strong>
                            <small>{{ progress(view.committed, view.credit).label }} do recebido</small>
                          </div>
                          <div class="stage-item">
                            <span>Liquidado</span><strong>{{ view.liquidated | money }}</strong>
                            <small>{{ progress(view.liquidated, view.credit).label }} do recebido</small>
                          </div>
                          <div class="stage-item stage-paid">
                            <span>Pago líquido</span><strong>{{ view.paid | money }}</strong>
                            <small>{{ progress(view.paid, view.credit).label }} do recebido</small>
                          </div>
                        </div>
                        <p class="progress-note">O percentual principal usa o valor pago, descontando estornos. Empenho e liquidação aparecem separados porque são etapas anteriores ao pagamento.</p>
                      </div>

                      <div class="objects-heading">
                        <div>
                          <h3>Objetos e saldo por recebimento</h3>
                          <p>Cada objeto é acompanhado separadamente, mesmo quando pertence à mesma emenda.</p>
                        </div>
                      </div>
                      <div class="object-table-wrap">
                        <table class="object-table">
                          <thead>
                            <tr><th>Objeto e origem</th><th>Crédito</th><th class="numeric">Recebido</th><th class="numeric">Empenhado</th><th class="numeric">Liquidado</th><th class="numeric">Pago líquido</th><th class="numeric">Saldo de caixa</th><th></th></tr>
                          </thead>
                          <tbody>
                            @for (item of view.receipts; track item.receipt.id) {
                              <tr>
                                <td>
                                  <strong>{{ item.receipt.object }}</strong>
                                  <span>Ação: {{ item.receipt.action }} · Elemento: {{ item.receipt.expenseElement || 'não informado' }}</span>
                                  <span>Fonte de recurso: {{ item.receipt.source }}</span>
                                  <span>{{ item.receipt.type }} · {{ item.receipt.account }}</span>
                                </td>
                                <td>{{ item.receipt.creditDate | dateBr }}</td>
                                <td class="numeric">{{ item.receipt.amount | money }}</td>
                                <td class="numeric">{{ item.summary.committed | money }}</td>
                                <td class="numeric">{{ item.summary.liquidated | money }}</td>
                                <td class="numeric">{{ item.paid | money }}</td>
                                <td class="numeric">{{ item.summary.closing | money }}</td>
                                <td><a mat-button [routerLink]="['/recebimentos', item.receipt.id]">Abrir</a></td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      @if (view.futureReceiptCount) {
                        <p class="muted future-credit-note">{{ view.futureReceiptCount }} {{ view.futureReceiptCount === 1 ? 'crédito está' : 'créditos estão' }} fora do exercício selecionado e não entra{{ view.futureReceiptCount === 1 ? '' : 'm' }} nesses totais.</p>
                      }
                      <div class="cash-summary">
                        <span>Saldo anterior <strong>{{ view.annual.opening | money }}</strong></span>
                        <span>Recebido em {{ store.year() }} <strong>{{ view.annual.received | money }}</strong></span>
                        <span>Pago em {{ store.year() }} <strong>{{ view.annual.paid | money }}</strong></span>
                        <span>Estornado em {{ store.year() }} <strong>{{ view.annual.reversed | money }}</strong></span>
                        <span class="cash-closing">Saldo de caixa <strong>{{ view.annual.closing | money }}</strong></span>
                      </div>
                    } @else {
                      <div class="empty-state no-credit">
                        <strong>Esta emenda ainda não tem crédito recebido até {{ store.year() }}.</strong>
                        <p>Quando um valor entrar, registre um recebimento para cada objeto. Assim, a execução e o saldo serão acompanhados separadamente.</p>
                        @if (store.canWrite()) {
                          <button mat-flat-button type="button" (click)="newReceipt(view.amendment.id)">Registrar recebimento</button>
                        }
                      </div>
                    }
                  </div>
                }
              </article>
            }
          </section>
        } @else {
          <div class="empty-state explorer-empty">
            <strong>Este parlamentar ainda não tem emendas cadastradas</strong>
            <p>Cadastre uma emenda para depois registrar cada crédito e seu objeto.</p>
            @if (store.canWrite()) { <button mat-flat-button type="button" (click)="newAmendment()">Cadastrar emenda</button> }
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .explorer-toolbar { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin:26px 0 10px; }
    .explorer-search { display:grid; gap:6px; width:min(420px, 100%); color:var(--app-text); font-size:12px; }
    .explorer-search input { width:100%; height:43px; box-sizing:border-box; border:1px solid var(--app-control); border-radius:4px; padding:0 12px; color:var(--app-text); background:var(--app-surface); font:inherit; font-size:14px; outline:none; }
    .explorer-search input:focus { border:2px solid var(--app-primary); padding-left:11px; }
    .parliamentarian-list { list-style:none; margin:0; padding:0; border-top:1px solid var(--app-line); }
    .parliamentarian-list li { border-bottom:1px solid var(--app-line); }
    .parliamentarian-row { width:100%; min-height:66px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:14px 8px 14px 2px; border:0; background:transparent; color:var(--app-text); text-align:left; font:inherit; font-size:16px; cursor:pointer; }
    .parliamentarian-row:hover { color:var(--app-primary); background:var(--app-background); }
    .parliamentarian-row:focus-visible, .amendment-summary:focus-visible { outline:3px solid var(--app-primary); outline-offset:2px; }
    .row-action { color:var(--app-primary); font-size:13px; font-weight:500; white-space:nowrap; }
    .row-action span { padding-left:7px; font-size:20px; vertical-align:-1px; }
    .explorer-empty { border-top:1px solid var(--app-line); margin-top:18px; }
    .explorer-detail-head { margin-bottom:25px; }
    .back-link { margin:0 0 6px -10px; color:var(--app-primary); }
    .amendment-list { border-top:1px solid var(--app-line); }
    .amendment-entry { border-bottom:1px solid var(--app-line); }
    .amendment-summary { width:100%; display:grid; grid-template-columns:minmax(250px, 1fr) minmax(145px, .45fr) minmax(170px, .45fr) 24px; align-items:center; gap:18px; padding:18px 8px; border:0; background:transparent; color:var(--app-text); text-align:left; cursor:pointer; font:inherit; }
    .amendment-summary:hover { background:var(--app-background); }
    .amendment-identity, .amendment-credit, .amendment-execution { display:grid; gap:5px; }
    .amendment-identity strong { font-size:16px; font-weight:500; overflow-wrap:anywhere; }
    .amendment-identity .muted { font-size:12px; }
    .amendment-credit > span, .amendment-execution > span { color:var(--app-muted); font-size:11px; }
    .amendment-credit strong, .amendment-execution strong { font-size:15px; font-weight:500; font-variant-numeric:tabular-nums; }
    .amendment-execution strong { color:var(--app-primary); }
    .expand-indicator { color:var(--app-primary); font-size:19px; text-align:center; }
    .amendment-detail { padding:3px 8px 23px; }
    .mirror-document-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; padding:12px 0; border-top:1px solid var(--app-line); color:var(--app-muted); font-size:12px; }
    .mirror-document-row a { color:var(--app-primary); font-weight:500; overflow-wrap:anywhere; }
    .execution-overview { padding:18px 0 20px; border-top:1px solid var(--app-line); }
    .execution-title, .main-progress-label { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
    .execution-title h2 { margin:0; font-size:18px; line-height:1.3; font-weight:500; }
    .execution-title p, .objects-heading p { margin:5px 0 0; color:var(--app-muted); font-size:12px; }
    .execution-total { display:grid; gap:3px; text-align:right; color:var(--app-muted); font-size:11px; }
    .execution-total strong { color:var(--app-text); font-size:15px; font-weight:500; }
    .main-progress { margin-top:22px; }
    .main-progress-label { align-items:center; margin-bottom:8px; font-size:13px; }
    .main-progress-label strong { font-size:15px; font-weight:500; font-variant-numeric:tabular-nums; }
    .main-progress-label strong span { color:var(--app-primary); }
    .progress-track { height:9px; overflow:hidden; border-radius:5px; background:var(--app-tint); }
    .progress-track > span { display:block; height:100%; min-width:0; border-radius:inherit; background:var(--app-primary); transition:width .18s ease-out; }
    .stage-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); margin-top:20px; border-top:1px solid var(--app-line); border-bottom:1px solid var(--app-line); }
    .stage-item { display:grid; gap:5px; padding:13px 14px 13px 0; }
    .stage-item + .stage-item { padding-left:14px; border-left:1px solid var(--app-line); }
    .stage-item > span { color:var(--app-muted); font-size:12px; }
    .stage-item strong { font-size:16px; font-weight:500; font-variant-numeric:tabular-nums; }
    .stage-item small { color:var(--app-muted); font-size:11px; }
    .stage-paid strong { color:var(--app-primary); }
    .progress-note { margin:10px 0 0; color:var(--app-muted); font-size:11px; }
    .objects-heading { margin:21px 0 11px; }
    .objects-heading h3 { margin:0; font-size:15px; font-weight:500; }
    .object-table-wrap { overflow-x:auto; }
    .object-table { width:100%; min-width:980px; border-collapse:collapse; }
    .object-table th, .object-table td { padding:11px 10px; border-bottom:1px solid var(--app-line); text-align:left; vertical-align:middle; font-size:12px; }
    .object-table th { color:var(--app-muted); font-size:11px; font-weight:500; white-space:nowrap; }
    .object-table td.numeric { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .object-table td:first-child { min-width:200px; }
    .object-table td:first-child strong, .object-table td:first-child span { display:block; margin-bottom:3px; }
    .object-table td:first-child strong { font-weight:500; }
    .object-table td:first-child span { color:var(--app-muted); font-size:11px; }
    .object-table a { color:var(--app-primary); font-size:12px; }
    .future-credit-note { margin:9px 0; font-size:11px; }
    .cash-summary { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)) 1.2fr; gap:12px; margin-top:20px; padding:14px 0; border-top:1px solid var(--app-line); border-bottom:1px solid var(--app-line); }
    .cash-summary > span { display:grid; gap:5px; color:var(--app-muted); font-size:11px; }
    .cash-summary strong { color:var(--app-text); font-size:13px; font-weight:500; font-variant-numeric:tabular-nums; }
    .cash-summary .cash-closing { border-left:1px solid var(--app-line); padding-left:14px; }
    .cash-summary .cash-closing strong { color:var(--app-primary); }
    .no-credit { padding:25px 12px; text-align:left; }
    .no-credit p { max-width:680px; }
    @media (max-width:900px) {
      .amendment-summary { grid-template-columns:minmax(190px,1fr) minmax(130px,.5fr) minmax(150px,.5fr) 20px; gap:10px; }
      .cash-summary { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .cash-summary .cash-closing { border:0; padding:0; }
    }
    @media (max-width:700px) {
      .explorer-toolbar { align-items:stretch; flex-direction:column; gap:8px; }
      .explorer-search { width:100%; }
      .explorer-detail-head { align-items:flex-start; }
      .amendment-summary { grid-template-columns:minmax(0,1fr) 24px; gap:9px 12px; padding:16px 4px; }
      .amendment-credit, .amendment-execution { grid-column:1; grid-template-columns:1fr auto; align-items:center; }
      .amendment-credit { margin-top:4px; }
      .amendment-execution { margin-bottom:3px; }
      .amendment-credit > span, .amendment-execution > span { font-size:11px; }
      .amendment-credit strong, .amendment-execution strong { font-size:13px; }
      .expand-indicator { grid-column:2; grid-row:1 / span 3; }
      .execution-title { align-items:flex-start; flex-direction:column; gap:10px; }
      .execution-total { grid-template-columns:auto auto; align-items:center; gap:10px; text-align:left; }
      .main-progress-label { align-items:flex-start; flex-direction:column; gap:4px; }
      .stage-grid { grid-template-columns:1fr; }
      .stage-item, .stage-item + .stage-item { grid-template-columns:1fr auto; align-items:center; gap:4px 10px; padding:10px 0; border-left:0; }
      .stage-item small { grid-column:1 / -1; }
      .cash-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .cash-summary .cash-closing { grid-column:1 / -1; padding-top:9px; border-top:1px solid var(--app-line); }
    }
    @media (prefers-reduced-motion: reduce) { .progress-track > span { transition:none; } }`],
})
export class ParliamentarianExplorer {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly search = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly selectedAuthorId = signal(this.route.snapshot.queryParamMap.get('parlamentar'));
  readonly expandedId = signal(this.route.snapshot.queryParamMap.get('emenda'));
  readonly pageIndex = signal(Math.max(0, Number(this.route.snapshot.queryParamMap.get('pagina')) || 0));
  readonly pageSize = signal([10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limite')))
    ? Number(this.route.snapshot.queryParamMap.get('limite')) : 10);
  readonly selectedAuthor = computed(() => this.store.authors().find(a => a.id === this.selectedAuthorId()) ?? null);
  readonly visibleAuthors = computed(() => this.store.authors()
    .filter(a => a.name.toLocaleLowerCase('pt-BR').includes(this.search().trim().toLocaleLowerCase('pt-BR')))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  readonly safePage = computed(() => Math.min(this.pageIndex(), Math.max(0, Math.ceil(this.visibleAuthors().length / this.pageSize()) - 1)));
  readonly pagedAuthors = computed(() => this.visibleAuthors().slice(this.safePage() * this.pageSize(), (this.safePage() + 1) * this.pageSize()));
  readonly authorAmendments = computed<AmendmentView[]>(() => {
    const authorId = this.selectedAuthorId();
    if (!authorId) return [];
    const year = this.store.year();
    const cutoff = year + '-12-31';
    return this.store.amendments().filter(a => a.authorId === authorId)
      .sort((a, b) => b.year - a.year || a.number.localeCompare(b.number, 'pt-BR'))
      .map(amendment => {
        const allReceipts = this.store.receipts().filter(r => r.amendmentId === amendment.id);
        const receipts = allReceipts.filter(r => r.creditDate <= cutoff)
          .sort((a, b) => a.creditDate.localeCompare(b.creditDate) || a.object.localeCompare(b.object, 'pt-BR'));
        const receiptViews: ReceiptView[] = receipts.map(receipt => {
          const summary = this.store.receiptSummary(receipt.id, year);
          const expenses = this.store.expenses().filter(e => e.receiptId === receipt.id);
          const expenseSummaries = expenses.map(e => this.store.expenseSummary(e.id, year));
          return {
            receipt,
            summary,
            paid: this.sum(expenseSummaries.map(s => s.paid)),
          };
        });
        const credit = this.sum(receipts.map(r => r.amount));
        const committed = this.sum(receiptViews.map(r => r.summary.committed));
        const liquidated = this.sum(receiptViews.map(r => r.summary.liquidated));
        const paid = this.sum(receiptViews.map(r => r.paid));
        const annual: AnnualSummary = {
          opening: this.sum(receiptViews.map(r => r.summary.opening)),
          received: this.sum(receiptViews.map(r => r.summary.received)),
          paid: this.sum(receiptViews.map(r => r.summary.paid)),
          reversed: this.sum(receiptViews.map(r => r.summary.reversed)),
          closing: this.sum(receiptViews.map(r => r.summary.closing)),
        };
        return { amendment, receipts: receiptViews, futureReceiptCount: allReceipts.length - receipts.length, credit, committed, liquidated, paid, annual };
      });
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const search = params.get('q') ?? '';
      if (search !== this.search()) this.search.set(search);
      this.selectedAuthorId.set(params.get('parlamentar'));
      this.expandedId.set(params.get('emenda'));
      this.pageIndex.set(Math.max(0, Number(params.get('pagina')) || 0));
      const size = Number(params.get('limite'));
      if ([10, 25, 50].includes(size)) this.pageSize.set(size);
    });
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.pageIndex.set(0);
    this.writeQuery({ q: this.search() || null, pagina: null }, true);
  }

  openAuthor(author: Author): void {
    this.selectedAuthorId.set(author.id);
    this.expandedId.set(null);
    this.writeQuery({ parlamentar: author.id, emenda: null, pagina: null }, false);
  }

  backToAuthors(): void {
    this.selectedAuthorId.set(null);
    this.expandedId.set(null);
    this.writeQuery({ parlamentar: null, emenda: null }, false);
  }

  toggleAmendment(id: string): void {
    const nextId = this.expandedId() === id ? null : id;
    this.expandedId.set(nextId);
    this.writeQuery({ emenda: nextId }, false);
  }

  changePage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.writeQuery({ pagina: event.pageIndex || null, limite: event.pageSize === 10 ? null : event.pageSize }, true);
  }

  progress(value: string, base: string): { width: number; label: string } {
    return executionProgress(value, base);
  }

  hasCredit(value: string): boolean {
    return toCents(value) > 0n;
  }

  mirrorPdfUrl(amendmentId: string, documentId: string): string {
    return `/api/v1/amendments/${amendmentId}/mirror-documents/${documentId}`;
  }

  async newAuthor(): Promise<void> {
    if (!this.store.canWrite()) return;
    const id = await firstValueFrom(this.dialogs.open(CatalogAuthorDialog, {
      width: '620px', maxWidth: 'calc(100vw - 32px)', disableClose: true,
    }).afterClosed());
    if (!id) return;
    this.search.set('');
    const author = this.store.authors().find(a => a.id === id);
    if (author) this.openAuthor(author);
    this.dialogs.open(WorkflowNextStepDialog, {
      data: {
        title: 'Parlamentar cadastrado',
        message: 'Agora vincule uma emenda a este parlamentar para depois registrar os créditos recebidos.',
        actionLabel: 'Cadastrar emenda',
      },
      width: '520px', maxWidth: 'calc(100vw - 24px)',
    }).afterClosed().subscribe(continueFlow => { if (continueFlow) void this.newAmendment(id); });
  }

  openHelp(): void {
    this.dialogs.open(WorkflowHelpDialog, { width: '720px', maxWidth: 'calc(100vw - 24px)', maxHeight: '92dvh' });
  }

  async newAmendment(authorId = this.selectedAuthorId() ?? undefined): Promise<void> {
    if (!this.store.canWrite()) return;
    if (!this.store.authors().length) {
      this.snack.open('Cadastre um parlamentar antes de criar a emenda.', 'Fechar', { duration: 5000 });
      return;
    }
    const id = await firstValueFrom(this.dialogs.open(CatalogAmendmentDialog, {
      data: { authorId }, width: '680px', maxWidth: 'calc(100vw - 32px)', disableClose: true,
    }).afterClosed());
    if (!id) return;
    this.expandedId.set(id);
    this.writeQuery({ parlamentar: authorId ?? this.selectedAuthorId(), emenda: id }, false);
    this.dialogs.open(WorkflowNextStepDialog, {
      data: {
        title: 'Emenda cadastrada',
        message: 'Agora lance o valor que entrou. Se a emenda atender objetos diferentes, registre um recebimento separado para cada objeto.',
        actionLabel: 'Cadastrar recebimento',
      },
      width: '520px', maxWidth: 'calc(100vw - 24px)',
    }).afterClosed().subscribe(continueFlow => { if (continueFlow) this.newReceipt(id); });
  }

  newReceipt(amendmentId: string): void {
    void this.router.navigate(['/recebimentos/novo'], { queryParams: { emenda: amendmentId } });
  }

  private sum(values: string[]): string {
    return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
  }

  private writeQuery(queryParams: Record<string, string | number | null>, replaceUrl: boolean): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl });
  }
}
