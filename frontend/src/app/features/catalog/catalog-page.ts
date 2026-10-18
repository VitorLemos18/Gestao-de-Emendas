import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DemoStore } from '../../core/demo-store';
import { Author } from '../../core/models';
import { MoneyPipe, DateBrPipe } from '../../shared/format';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { WorkflowHelpDialog } from '../../shared/workflow-help-dialog';
import { WorkflowNextStepDialog } from '../../shared/workflow-next-step-dialog';

const FORM_IMPORTS = [
  ReactiveFormsModule,
  MatButtonModule,
  MatDialogModule,
  MatFormFieldModule,
  MatInputModule,
  MatTooltipModule,
];

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [
    ...FORM_IMPORTS,
    RouterLink,
    MatAutocompleteModule,
    MatTableModule,
    MatTabsModule,
    MatPaginatorModule,
    MoneyPipe,
    DateBrPipe,
  ],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Parlamentares e emendas</h1>
          <p class="page-intro">
            Cadastre a origem dos recursos e consulte os recebimentos separados por objeto.
          </p>
        </div>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="openHelp()">Como funciona?</button>
          @if (store.canWrite()) {
            <button
              mat-flat-button
              type="button"
              (click)="tab() === 0 ? newAuthor() : newAmendment()"
            >
              {{ tab() === 0 ? 'Novo parlamentar' : 'Nova emenda' }}
            </button>
          }
        </div>
      </header>
      <mat-tab-group
        [selectedIndex]="tab()"
        (selectedIndexChange)="changeTab($event)"
        animationDuration="0ms"
      >
        <mat-tab label="Parlamentares">
          <div class="toolbar catalog-toolbar">
            <mat-form-field appearance="outline" class="search"
              ><mat-label>Buscar parlamentar</mat-label
              ><input
                #authorSearchInput
                matInput
                [formControl]="authorSearch"
                placeholder="Nome, partido ou cargo"
              />
              @if (authorSearch.value) {
                <button
                  matSuffix
                  mat-button
                  aria-label="Limpar busca de parlamentar"
                  (click)="authorSearch.setValue(''); authorSearchInput.focus()"
                >
                  Limpar
                </button>
              }</mat-form-field
            ><span class="muted"
              >{{ visibleAuthors().length }} parlamentares · saldo em {{ store.year() }}</span
            >
          </div>
          <div class="table-wrap">
            <table mat-table [dataSource]="pagedAuthors()" class="work-table">
              <ng-container matColumnDef="name"
                ><th mat-header-cell *matHeaderCellDef>Parlamentar</th>
                <td mat-cell *matCellDef="let author">
                  <strong>{{ author.name }}</strong>
                </td></ng-container
              >
              <ng-container matColumnDef="amendments"
                ><th mat-header-cell *matHeaderCellDef>Emendas</th>
                <td mat-cell *matCellDef="let author">
                  {{ amendmentCount(author.id) }}
                </td></ng-container
              >
              <ng-container matColumnDef="receipts"
                ><th mat-header-cell *matHeaderCellDef>Recebimentos</th>
                <td mat-cell *matCellDef="let author">
                  {{ receiptCount(author.id) }}
                </td></ng-container
              >
              <ng-container matColumnDef="balance"
                ><th mat-header-cell *matHeaderCellDef class="numeric">
                  Saldo de caixa em {{ store.year() }}
                </th>
                <td mat-cell *matCellDef="let author" class="numeric">
                  {{ store.annualSummary(store.year(), author.id).closing | money }}
                </td></ng-container
              >
              <ng-container matColumnDef="actions"
                ><th mat-header-cell *matHeaderCellDef>Consulta</th>
                <td mat-cell *matCellDef="let author">
                  <button mat-button (click)="showAuthor(author)">Ver emendas</button>
                </td></ng-container
              >
              <tr mat-header-row *matHeaderRowDef="authorColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: authorColumns"></tr>
              <tr *matNoDataRow>
                <td colspan="5" class="empty-state">
                  <strong>{{
                    store.authors().length
                      ? 'Nenhum parlamentar corresponde à busca'
                      : 'Nenhum parlamentar cadastrado'
                  }}</strong>
                  <p>
                    {{
                      store.authors().length
                        ? 'Altere ou limpe a busca.'
                        : 'Parlamentares cadastrados aparecerão aqui.'
                    }}
                  </p>
                </td>
              </tr>
            </table>
          </div>
          <mat-paginator
            [length]="visibleAuthors().length"
            [pageIndex]="safeAuthorPage()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 25, 50]"
            (page)="changePage($event, 'authors')"
            aria-label="Paginação dos parlamentares"
          ></mat-paginator>
        </mat-tab>
        <mat-tab label="Emendas">
          <div class="toolbar catalog-toolbar">
            <mat-form-field appearance="outline" class="search"
              ><mat-label>Buscar emenda</mat-label
              ><input
                #amendmentSearchInput
                matInput
                [formControl]="amendmentSearch"
                placeholder="Número, ano, descrição ou parlamentar"
              />
              @if (amendmentSearch.value) {
                <button
                  matSuffix
                  mat-button
                  aria-label="Limpar busca de emenda"
                  (click)="amendmentSearch.setValue(''); amendmentSearchInput.focus()"
                >
                  Limpar
                </button>
              }
            </mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>Parlamentar</mat-label
              ><input
                #filterInput
                matInput
                [formControl]="authorFilter"
                [matAutocomplete]="authorOptions"
                placeholder="Pesquisar parlamentar"
              />
              @if (authorFilter.value) {
                <button
                  matSuffix
                  mat-button
                  type="button"
                  (click)="clearAuthorFilter(); filterInput.focus()"
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
                @for (author of filteredAuthors(); track author.id) {
                  <mat-option [value]="author">{{ author.name }}</mat-option>
                }
                @if (!filteredAuthors().length) {
                  <mat-option disabled>Nenhum parlamentar encontrado</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>
          @if (selectedAuthor()) {
            <p class="muted">
              Emendas de <strong>{{ selectedAuthor()!.name }}</strong>
              <button mat-button type="button" (click)="clearAuthorFilter()">Mostrar todos</button>
            </p>
          }
          <div class="table-wrap">
            <table mat-table [dataSource]="pagedAmendments()" class="work-table">
              <ng-container matColumnDef="number"
                ><th mat-header-cell *matHeaderCellDef>Emenda / proposta</th>
                <td mat-cell *matCellDef="let amendment">
                  <button mat-button (click)="selectAmendment(amendment.id)">
                    {{ amendment.number }}
                  </button>
                </td></ng-container
              >
              <ng-container matColumnDef="year"
                ><th mat-header-cell *matHeaderCellDef>Ano da emenda</th>
                <td mat-cell *matCellDef="let amendment">{{ amendment.year }}</td></ng-container
              >
              <ng-container matColumnDef="author"
                ><th mat-header-cell *matHeaderCellDef>Parlamentar</th>
                <td mat-cell *matCellDef="let amendment">
                  {{ store.authorName(amendment.authorId) }}
                </td></ng-container
              >
              <ng-container matColumnDef="mirror"
                ><th mat-header-cell *matHeaderCellDef>Espelho da emenda</th>
                <td mat-cell *matCellDef="let amendment">
                  @if (amendment.mirrorDocument) {
                    <a [href]="mirrorPdfUrl(amendment.id, amendment.mirrorDocument.id)"
                       target="_blank" rel="noopener"
                       [matTooltip]="'Abrir ' + amendment.mirrorDocument.fileName">Abrir PDF</a>
                  } @else {
                    <span class="muted">Não anexado</span>
                  }
                </td></ng-container
              >
              <ng-container matColumnDef="receipts"
                ><th mat-header-cell *matHeaderCellDef>Recebimentos</th>
                <td mat-cell *matCellDef="let amendment">
                  {{ amendmentReceiptCount(amendment.id) }}
                </td></ng-container
              >
              <ng-container matColumnDef="actions"
                ><th mat-header-cell *matHeaderCellDef>Ações</th>
                <td mat-cell *matCellDef="let amendment">
                  <button mat-button (click)="selectAmendment(amendment.id)">Ver objetos</button>
                </td></ng-container
              >
              <tr mat-header-row *matHeaderRowDef="amendmentColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: amendmentColumns"></tr>
              <tr *matNoDataRow>
                <td colspan="6" class="empty-state">
                  <strong>{{
                    store.amendments().length
                      ? 'Nenhuma emenda corresponde aos filtros'
                      : 'Nenhuma emenda cadastrada'
                  }}</strong>
                  <p>Altere os filtros ou cadastre uma emenda para este parlamentar.</p>
                </td>
              </tr>
            </table>
          </div>
          <mat-paginator
            [length]="visibleAmendments().length"
            [pageIndex]="safeAmendmentPage()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 25, 50]"
            (page)="changePage($event, 'amendments')"
            aria-label="Paginação das emendas"
          ></mat-paginator>
          @if (selectedAmendment(); as amendment) {
            <div class="detail-heading">
              <div>
                <div class="section-heading">
                  <h2>Recebimentos da emenda {{ amendment.number }}</h2>
                </div>
                <p class="muted">
                  {{ store.authorName(amendment.authorId) }} · ano da emenda {{ amendment.year }}
                </p>
              </div>
              <button mat-button type="button" (click)="selectAmendment(null)">
                Fechar consulta
              </button>
            </div>
            <div class="table-wrap">
              <table class="work-table">
                <thead>
                  <tr>
                    <th>Objeto</th>
                    <th>Data do crédito / conta</th>
                    <th class="numeric">Valor recebido</th>
                    <th class="numeric">Saldo de caixa em {{ store.year() }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (receipt of pagedReceipts(); track receipt.id) {
                    <tr>
                      <td>
                        <a [routerLink]="['/recebimentos', receipt.id]">{{ receipt.object }}</a>
                      </td>
                      <td>
                        {{ receipt.creditDate | dateBr }}
                        <div class="muted">Conta {{ receipt.account }}</div>
                      </td>
                      <td class="numeric">{{ receipt.amount | money }}</td>
                      <td class="numeric">
                        {{ store.receiptSummary(receipt.id, store.year()).closing | money }}
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4" class="empty-state">
                        Esta emenda ainda não tem recebimentos.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <mat-paginator
              [length]="amendmentReceipts().length"
              [pageIndex]="safeReceiptPage()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[10, 25, 50]"
              (page)="changePage($event, 'receipts')"
              aria-label="Paginação dos recebimentos da emenda"
            ></mat-paginator>
            @if (store.canWrite()) {
              <div class="form-actions">
                <a
                  mat-stroked-button
                  routerLink="/recebimentos/novo"
                  [queryParams]="{ emenda: amendment.id }"
                  >Novo recebimento desta emenda</a
                >
              </div>
            }
          }
        </mat-tab>
      </mat-tab-group>
      <p class="muted catalog-note">
        Os cadastros ficam registrados no sistema e podem ser consultados nos relatórios.
        Parlamentares e emendas possuem criação e consulta; não há exclusão financeira.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .catalog-toolbar {
      margin-top: 24px;
    }
    .page-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .search {
      flex: 1;
      min-width: min(100%, 260px);
    }
    .catalog-toolbar > mat-form-field:not(.search) {
      min-width: min(100%, 300px);
    }
    .detail-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: 24px;
    }
    .detail-heading h2 {
      margin: 0 0 6px;
    }
    .catalog-note {
      margin-top: 22px;
    }
    th.numeric,
    td.numeric {
      text-align: right;
    }
  `,
})
export class CatalogPage {
  readonly store = inject(DemoStore);
  private readonly dialogs = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly tab = signal(this.route.snapshot.queryParamMap.get('aba') === 'emendas' ? 1 : 0);
  readonly authorSearch = new FormControl(this.route.snapshot.queryParamMap.get('qAutor') ?? '', {
    nonNullable: true,
  });
  readonly amendmentSearch = new FormControl(
    this.route.snapshot.queryParamMap.get('qEmenda') ?? '',
    { nonNullable: true },
  );
  readonly authorFilter = new FormControl<Author | string | null>(
    this.store.authors().find((a) => a.id === this.route.snapshot.queryParamMap.get('autor')) ??
      null,
  );
  private readonly authorQuery = toSignal(this.authorSearch.valueChanges, {
    initialValue: this.authorSearch.value,
  });
  private readonly amendmentQuery = toSignal(this.amendmentSearch.valueChanges, {
    initialValue: this.amendmentSearch.value,
  });
  private readonly filterQuery = toSignal(this.authorFilter.valueChanges, {
    initialValue: this.authorFilter.value,
  });
  readonly selectedAuthor = computed(() => {
    const value = this.filterQuery();
    return value && typeof value === 'object' ? value : null;
  });
  readonly selectedAmendmentId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('emenda'),
  );
  readonly authorPage = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pAutor')) || 0)),
  );
  readonly amendmentPage = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pEmenda')) || 0)),
  );
  readonly receiptPage = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pRecebimentos')) || 0)),
  );
  readonly pageSize = signal(
    [10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limite')))
      ? Number(this.route.snapshot.queryParamMap.get('limite'))
      : 10,
  );
  readonly selectedAmendment = computed(() =>
    this.store.amendments().find((a) => a.id === this.selectedAmendmentId()),
  );
  readonly amendmentReceipts = computed(() =>
    this.store.receipts().filter((r) => r.amendmentId === this.selectedAmendmentId()),
  );
  readonly displayAuthor = (author: Author | string | null): string =>
    typeof author === 'string' ? author : (author?.name ?? '');
  readonly filteredAuthors = computed(() =>
    this.store
      .authors()
      .filter((a) =>
        a.name
          .toLocaleLowerCase('pt-BR')
          .includes(this.displayAuthor(this.filterQuery()).toLocaleLowerCase('pt-BR')),
      ),
  );
  readonly visibleAuthors = computed(() =>
    this.store
      .authors()
    .filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(this.authorQuery().toLocaleLowerCase('pt-BR'))),
  );
  readonly visibleAmendments = computed(() =>
    this.store
      .amendments()
      .filter(
        (a) =>
          (!this.selectedAuthor() || a.authorId === this.selectedAuthor()!.id) &&
          [a.number, a.year, this.store.authorName(a.authorId)]
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(this.amendmentQuery().toLocaleLowerCase('pt-BR')),
      ),
  );
  readonly safeAuthorPage = computed(() =>
    Math.min(
      this.authorPage(),
      Math.max(0, Math.ceil(this.visibleAuthors().length / this.pageSize()) - 1),
    ),
  );
  readonly safeAmendmentPage = computed(() =>
    Math.min(
      this.amendmentPage(),
      Math.max(0, Math.ceil(this.visibleAmendments().length / this.pageSize()) - 1),
    ),
  );
  readonly safeReceiptPage = computed(() =>
    Math.min(
      this.receiptPage(),
      Math.max(0, Math.ceil(this.amendmentReceipts().length / this.pageSize()) - 1),
    ),
  );
  readonly pagedAuthors = computed(() =>
    this.visibleAuthors().slice(
      this.safeAuthorPage() * this.pageSize(),
      (this.safeAuthorPage() + 1) * this.pageSize(),
    ),
  );
  readonly pagedAmendments = computed(() =>
    this.visibleAmendments().slice(
      this.safeAmendmentPage() * this.pageSize(),
      (this.safeAmendmentPage() + 1) * this.pageSize(),
    ),
  );
  readonly pagedReceipts = computed(() =>
    this.amendmentReceipts().slice(
      this.safeReceiptPage() * this.pageSize(),
      (this.safeReceiptPage() + 1) * this.pageSize(),
    ),
  );
  readonly authorColumns = ['name', 'amendments', 'receipts', 'balance', 'actions'];
  readonly amendmentColumns = ['number', 'year', 'author', 'mirror', 'receipts', 'actions'];
  constructor() {
    this.authorSearch.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.authorPage.set(0);
      this.persist();
    });
    this.amendmentSearch.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.amendmentPage.set(0);
      this.persist();
    });
  }
  changeTab(index: number): void {
    this.tab.set(index);
    this.persist();
  }
  mirrorPdfUrl(amendmentId: string, documentId: string): string {
    return `/api/v1/amendments/${amendmentId}/mirror-documents/${documentId}`;
  }
  showAuthor(author: Author): void {
    this.tab.set(1);
    this.selectAuthor(author);
  }
  selectAuthor(author: Author): void {
    this.authorFilter.setValue(author);
    this.selectedAmendmentId.set(null);
    this.amendmentPage.set(0);
    this.persist();
  }
  clearAuthorFilter(): void {
    this.authorFilter.setValue(null);
    this.selectedAmendmentId.set(null);
    this.amendmentPage.set(0);
    this.persist();
  }
  selectAmendment(id: string | null): void {
    this.selectedAmendmentId.set(id);
    this.receiptPage.set(0);
    this.persist();
  }
  changePage(event: PageEvent, table: 'authors' | 'amendments' | 'receipts'): void {
    this.pageSize.set(event.pageSize);
    (table === 'authors'
      ? this.authorPage
      : table === 'amendments'
        ? this.amendmentPage
        : this.receiptPage
    ).set(event.pageIndex);
    this.persist();
  }
  private persist(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        aba: this.tab() ? 'emendas' : null,
        autor: this.selectedAuthor()?.id ?? null,
        qAutor: this.authorSearch.value || null,
        qEmenda: this.amendmentSearch.value || null,
        emenda: this.selectedAmendmentId(),
        pAutor: this.safeAuthorPage() || null,
        pEmenda: this.safeAmendmentPage() || null,
        pRecebimentos: this.safeReceiptPage() || null,
        limite: this.pageSize() === 10 ? null : this.pageSize(),
      },
      replaceUrl: true,
    });
  }
  amendmentCount(authorId: string): number {
    return this.store.amendments().filter((a) => a.authorId === authorId).length;
  }
  receiptCount(authorId: string): number {
    return this.store.receipts().filter((r) => this.store.receiptAuthor(r.id)?.id === authorId)
      .length;
  }
  amendmentReceiptCount(id: string): number {
    return this.store.receipts().filter((r) => r.amendmentId === id).length;
  }
  newAuthor(): void {
    if (!this.store.canWrite()) return;
    this.dialogs
      .open(CatalogAuthorDialog, {
        width: '620px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((id) => {
        if (id) {
          this.authorSearch.setValue('');
          this.dialogs
            .open(WorkflowNextStepDialog, {
              data: {
                title: 'Parlamentar cadastrado',
                message:
                  'Agora vincule uma emenda a este parlamentar para depois registrar os créditos recebidos.',
                actionLabel: 'Cadastrar emenda',
              },
              width: '520px',
              maxWidth: 'calc(100vw - 24px)',
            })
            .afterClosed()
            .subscribe((continueFlow) => {
              if (continueFlow) this.newAmendment(id);
            });
        }
      });
  }
  openHelp(): void {
    this.dialogs.open(WorkflowHelpDialog, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '92dvh',
    });
  }
  newAmendment(authorId?: string): void {
    if (!this.store.canWrite()) return;
    if (!this.store.authors().length) {
      this.snack.open('Cadastre um parlamentar antes de criar a emenda.', 'Fechar', {
        duration: 5000,
      });
      return;
    }
    this.dialogs
      .open(CatalogAmendmentDialog, {
        data: { authorId: authorId ?? this.selectedAuthor()?.id },
        width: '680px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((id) => {
        if (id) {
          this.tab.set(1);
          this.selectedAmendmentId.set(id);
          this.amendmentSearch.setValue('');
          this.persist();
          this.dialogs
            .open(WorkflowNextStepDialog, {
              data: {
                title: 'Emenda cadastrada',
                message:
                  'Agora lance o valor que entrou. Se a mesma emenda atender insumos e locomoção, crie um recebimento separado para cada objeto.',
                actionLabel: 'Cadastrar recebimento',
              },
              width: '520px',
              maxWidth: 'calc(100vw - 24px)',
            })
            .afterClosed()
            .subscribe((continueFlow) => {
              if (continueFlow)
                void this.router.navigate(['/recebimentos/novo'], { queryParams: { emenda: id } });
            });
        }
      });
  }
}

@Component({
  selector: 'app-catalog-author-dialog',
  standalone: true,
  imports: FORM_IMPORTS,
  template: `<h2 mat-dialog-title>Novo parlamentar</h2>
    <mat-dialog-content
      ><p class="muted">
        Informe o nome usado nos documentos da emenda. Depois, você poderá vinculá-lo a uma ou mais
        emendas.
      </p>
      <form id="author-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) {
          <p class="error-banner" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="full-width"
            ><mat-label>Nome do parlamentar</mat-label
            ><input
              matInput
              formControlName="name"
              maxlength="160"
              required
              matTooltip="Use o nome oficial do parlamentar para facilitar a busca e a conferência dos relatórios."
            /><mat-hint>Esse nome será exibido nos recebimentos e relatórios.</mat-hint
            ><mat-error>Informe o nome do parlamentar.</mat-error></mat-form-field
          >
        </div>
      </form>
    ><mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="cancel()">Cancelar</button
      ><button mat-flat-button type="submit" form="author-form" [disabled]="saving()">
        {{ saving() ? 'Salvando…' : 'Salvar parlamentar' }}
      </button></mat-dialog-actions
    >`,
})
export class CatalogAuthorDialog {
  private readonly store = inject(DemoStore);
  private readonly ref = inject(MatDialogRef<CatalogAuthorDialog>);
  private readonly dialogs = inject(MatDialog);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(160), Validators.pattern(/\S/)]],
  });
  constructor() {
    const destroy = inject(DestroyRef);
    this.ref
      .backdropClick()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => this.cancel());
    this.ref
      .keydownEvents()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe((e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      });
  }
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      this.error.set('Confira o nome do parlamentar.');
      this.element.nativeElement.querySelector<HTMLInputElement>('input.ng-invalid')?.focus();
      return;
    }
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      this.ref.close(await this.store.createAuthor(value.name.trim()));
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Não foi possível cadastrar o parlamentar.',
      );
    } finally {
      this.saving.set(false);
    }
  }
  cancel(): void {
    if (!this.form.dirty) {
      this.ref.close();
      return;
    }
    this.dialogs
      .open(ConfirmDialog, {
        data: {
          title: 'Descartar alterações?',
          message: 'O parlamentar ainda não foi salvo.',
          confirmLabel: 'Descartar e sair',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.ref.close();
      });
  }
}

@Component({
  selector: 'app-catalog-amendment-dialog',
  standalone: true,
  imports: [...FORM_IMPORTS, MatAutocompleteModule],
  template: `<h2 mat-dialog-title>Nova emenda</h2>
    <mat-dialog-content
      ><p class="muted">
        Vincule o número oficial da proposta ao parlamentar. Depois, registre cada objeto recebido
        em um lançamento separado.
      </p>
      <form id="amendment-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) {
          <p class="error-banner" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="full-width"
            ><mat-label>Parlamentar</mat-label
            ><input
              matInput
              formControlName="author"
              [matAutocomplete]="options"
              required
              placeholder="Digite para pesquisar"
              matTooltip="Escolha o parlamentar que indicou esta emenda. A lista é pesquisável."
            />
            <mat-autocomplete
              #options="matAutocomplete"
              [displayWith]="displayAuthor"
              [requireSelection]="true"
            >
              @for (author of matchingAuthors(); track author.id) {
                <mat-option [value]="author">{{ author.name }}</mat-option>
              }
              @if (!matchingAuthors().length) {
                <mat-option disabled>Nenhum parlamentar encontrado</mat-option>
              }</mat-autocomplete
            ><mat-error>Selecione um parlamentar cadastrado.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>Número da emenda / proposta</mat-label
            ><input
              matInput
              formControlName="number"
              maxlength="100"
              required
              matTooltip="Copie o número da proposta ou emenda conforme o documento oficial."
            /><mat-hint>Use o mesmo identificador que aparece no documento da emenda.</mat-hint
            ><mat-error>Informe o número da emenda.</mat-error></mat-form-field
          >
          <mat-form-field appearance="outline"
            ><mat-label>Ano da emenda</mat-label
            ><input
              matInput
              type="number"
              formControlName="year"
              min="2000"
              max="2100"
              required
            /><mat-error>Informe um ano inteiro de 2000 a 2100.</mat-error></mat-form-field
          >
        </div>
      </form>
        <section class="mirror-upload" aria-labelledby="mirror-upload-title">
          <div class="mirror-upload-copy">
            <strong id="mirror-upload-title">Espelho da emenda (PDF) <span aria-hidden="true">*</span></strong>
            <p>Anexe o documento oficial da proposta. Tamanho máximo: 10 MB.</p>
          </div>
          <label class="mirror-file-button">
            <input
              type="file"
              accept="application/pdf,.pdf"
              (change)="selectMirrorPdf($event)"
              aria-label="Selecionar PDF do espelho da emenda"
            />
            Selecionar PDF
          </label>
          @if (mirrorPdf()) {
            <div class="mirror-file-selected">
              <span>{{ mirrorPdf()!.name }} · {{ fileSize(mirrorPdf()!.size) }}</span>
              <button mat-button type="button" (click)="removeMirrorPdf()">Remover</button>
            </div>
          }
          @if (mirrorPdfError()) {
            <p class="mirror-file-error" role="alert">{{ mirrorPdfError() }}</p>
          }
        </section>
      </mat-dialog-content
    ><mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="cancel()">Cancelar</button
      ><button mat-flat-button type="submit" form="amendment-form" [disabled]="saving()">
        {{ saving() ? 'Salvando…' : 'Salvar emenda' }}
      </button></mat-dialog-actions
    >`,
  styles: [`
    .mirror-upload { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 16px; align-items:center; margin:8px 0 4px; padding:14px 16px; border:1px solid var(--app-line); border-radius:8px; background:var(--app-surface-soft, #f7f9fb); }
    .mirror-upload-copy strong { color:var(--app-text); font-size:13px; font-weight:500; }
    .mirror-upload-copy strong span { color:var(--app-danger, #b42318); }
    .mirror-upload-copy p { margin:4px 0 0; color:var(--app-muted); font-size:12px; }
    .mirror-file-button { position:relative; display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:0 14px; border:1px solid var(--app-primary); border-radius:4px; color:var(--app-primary); background:#fff; font-size:13px; font-weight:500; cursor:pointer; overflow:hidden; }
    .mirror-file-button input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
    .mirror-file-button:focus-within { outline:3px solid color-mix(in srgb, var(--app-primary) 28%, transparent); outline-offset:2px; }
    .mirror-file-selected { grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between; gap:12px; min-width:0; padding-top:7px; border-top:1px solid var(--app-line); color:var(--app-text); font-size:12px; }
    .mirror-file-selected span { overflow-wrap:anywhere; }
    .mirror-file-error { grid-column:1 / -1; margin:0; color:var(--app-danger, #b42318); font-size:12px; }
    @media (max-width:520px) { .mirror-upload { grid-template-columns:1fr; } .mirror-file-button { justify-self:start; } }
  `],
})
export class CatalogAmendmentDialog {
  private readonly store = inject(DemoStore);
  private readonly ref = inject(MatDialogRef<CatalogAmendmentDialog>);
  private readonly dialogs = inject(MatDialog);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly data = inject<{ authorId?: string }>(MAT_DIALOG_DATA);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly mirrorPdf = signal<File | null>(null);
  readonly mirrorPdfError = signal('');
  readonly form = inject(FormBuilder).group({
    author: new FormControl<Author | string | null>(
      this.store.authors().find((a) => a.id === this.data.authorId) ?? null,
      [
        Validators.required,
        (control) =>
          typeof control.value === 'object' && control.value?.id ? null : { selection: true },
      ],
    ),
    number: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)],
    }),
    year: new FormControl(this.store.year(), {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(2000),
        Validators.max(2100),
        (control) => (Number.isInteger(control.value) ? null : { integer: true }),
      ],
    }),
  });
  readonly displayAuthor = (value: Author | string | null): string =>
    typeof value === 'string' ? value : (value?.name ?? '');
  private readonly authorValue = toSignal(this.form.controls.author.valueChanges, {
    initialValue: this.form.controls.author.value,
  });
  readonly matchingAuthors = computed(() =>
    this.store
      .authors()
      .filter((a) =>
        a.name
          .toLocaleLowerCase('pt-BR')
          .includes(this.displayAuthor(this.authorValue()).toLocaleLowerCase('pt-BR')),
      ),
  );
  async selectMirrorPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.mirrorPdfError.set('');
    if (!file) return;
    if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.pdf')) {
      this.mirrorPdfError.set('Selecione um arquivo com extensão PDF.');
      input.value = '';
      this.mirrorPdf.set(null);
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      this.mirrorPdfError.set(file.size === 0
        ? 'O arquivo selecionado está vazio.'
        : 'O PDF deve ter no máximo 10 MB.');
      input.value = '';
      this.mirrorPdf.set(null);
      return;
    }
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (signature.length < 5 || new TextDecoder().decode(signature) !== '%PDF-') {
      this.mirrorPdfError.set('O arquivo selecionado não parece ser um PDF válido.');
      input.value = '';
      this.mirrorPdf.set(null);
      return;
    }
    this.mirrorPdf.set(file);
    this.form.markAsDirty();
  }
  removeMirrorPdf(): void {
    this.mirrorPdf.set(null);
    this.mirrorPdfError.set('');
    const input = this.element.nativeElement.querySelector<HTMLInputElement>('input[type="file"]');
    if (input) input.value = '';
  }
  fileSize(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  constructor() {
    const destroy = inject(DestroyRef);
    this.ref
      .backdropClick()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => this.cancel());
    this.ref
      .keydownEvents()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe((e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      });
  }
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      this.error.set('Confira os campos destacados.');
      this.element.nativeElement.querySelector<HTMLInputElement>('input.ng-invalid')?.focus();
      return;
    }
    if (!this.mirrorPdf()) {
      this.mirrorPdfError.set('Anexe o espelho da emenda em PDF para continuar.');
      this.element.nativeElement.querySelector<HTMLInputElement>('input[type="file"]')?.focus();
      return;
    }
    const value = this.form.getRawValue();
    if (!value.author || typeof value.author === 'string') return;
    this.saving.set(true);
    try {
      this.ref.close(await this.store.createAmendment({
        authorId: value.author.id,
        number: value.number.trim(),
        year: value.year,
        description: '',
      }, this.mirrorPdf()!));
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Não foi possível cadastrar a emenda.',
      );
    } finally {
      this.saving.set(false);
    }
  }
  cancel(): void {
    if (!this.form.dirty) {
      this.ref.close();
      return;
    }
    this.dialogs
      .open(ConfirmDialog, {
        data: {
          title: 'Descartar alterações?',
          message: 'A emenda ainda não foi salva.',
          confirmLabel: 'Descartar e sair',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.ref.close();
      });
  }
}
