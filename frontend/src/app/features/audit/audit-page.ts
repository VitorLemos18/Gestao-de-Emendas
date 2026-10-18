import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { DemoStore } from '../../core/demo-store';
import { AuditEntry, Role, ROLE_LABEL } from '../../core/models';
import { brl } from '../../core/money';
import { DateBrPipe } from '../../shared/format';

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DateBrPipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
  ],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Histórico de auditoria</h1>
          <p class="page-intro">
            Trilha das ações feitas no sistema, com responsável, horário e registro afetado.
          </p>
        </div>
      </header>
      <p class="audit-explainer">
        <strong>O que você encontra aqui:</strong> cadastros, correções, empenhos, liquidações,
        pagamentos, estornos e exportações. Quando houver justificativa, ela aparece separada do
        evento; em “Detalhes”, confira os valores antes e depois. Este histórico registra ações do
        sistema e não é um extrato de caixa.
      </p>
      <div class="toolbar">
        <mat-form-field appearance="outline" class="search"
          ><mat-label>Buscar no histórico</mat-label
          ><input
            #searchInput
            matInput
            [formControl]="search"
            placeholder="Responsável, registro, ação ou justificativa"
            (input)="page.set(0)"
          />
          @if (search.value) {
            <button
              mat-button
              matSuffix
              type="button"
              aria-label="Limpar busca do histórico"
              (click)="search.setValue(''); page.set(0); searchInput.focus()"
            >
              Limpar
            </button>
          }
        </mat-form-field>
        <mat-form-field appearance="outline"
          ><mat-label>Tipo de registro</mat-label
          ><mat-select [value]="entityType()" (selectionChange)="setEntityType($event.value)"
            ><mat-option value="">Todos os tipos</mat-option>
            @for (type of entityTypes(); track type) {
              <mat-option [value]="type">{{ entityLabel(type) }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        @if (search.value || entityType()) {
          <button mat-button type="button" (click)="clear()">Limpar filtros</button>
        }
      </div>
      <p class="muted">
        {{ filtered().length }}
        {{ filtered().length === 1 ? 'evento encontrado' : 'eventos encontrados' }} · horários em
        Brasília (UTC−3)
      </p>
      <div class="table-wrap">
        <table class="work-table">
          <thead>
            <tr>
              <th>Data e responsável</th>
              <th>Evento / registro afetado</th>
              <th>Justificativa ou contexto</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of paged(); track entry.id) {
              <tr>
                <td class="timestamp">
                  {{ entry.timestamp | dateBr }}
                  <div class="muted">{{ entry.actor }}</div>
                </td>
                <td>
                  <strong>{{ actionLabel(entry.action) }}</strong>
                  <div class="muted">
                    {{ entityLabel(entry.entityType) }} ·
                    {{ entry.description || 'Registro sem descrição adicional' }}
                  </div>
                  @if (entry.receiptId) {
                    <a [routerLink]="['/recebimentos', entry.receiptId]">Abrir recebimento</a>
                  }
                </td>
                <td>
                  @if (entry.reason) {
                    {{ entry.reason }}
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (entry.changes.length) {
                    <button
                      mat-button
                      type="button"
                      (click)="toggle(entry.id)"
                      [attr.aria-expanded]="expanded() === entry.id"
                      [attr.aria-controls]="'audit-' + entry.id"
                    >
                      {{
                        expanded() === entry.id
                          ? 'Ocultar detalhes'
                          : isCreation(entry)
                            ? 'Ver dados registrados'
                            : 'Ver antes e depois'
                      }}
                    </button>
                  } @else {
                    <span class="muted">{{
                      isCreation(entry) ? 'Registro criado' : 'Operação registrada'
                    }}</span>
                  }
                </td>
              </tr>
              @if (expanded() === entry.id) {
                <tr class="change-row">
                  <td colspan="4">
                    <div [id]="'audit-' + entry.id">
                      <table class="work-table change-table">
                        <caption>
                          {{
                            isCreation(entry) ? 'Dados registrados:' : 'Campos alterados:'
                          }}
                          {{
                            entry.description
                          }}
                        </caption>
                        <thead>
                          <tr>
                            <th>Campo</th>
                            @if (isCreation(entry)) {
                              <th>Valor registrado</th>
                            } @else {
                              <th>Antes</th>
                              <th>Depois</th>
                            }
                          </tr>
                        </thead>
                        <tbody>
                          @for (change of entry.changes; track $index) {
                            <tr>
                              <th scope="row">{{ fieldLabel(change.field) }}</th>
                              @if (isCreation(entry)) {
                                <td>{{ changeValue(change.field, change.after) }}</td>
                              } @else {
                                <td>{{ changeValue(change.field, change.before) }}</td>
                                <td>{{ changeValue(change.field, change.after) }}</td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr>
                <td colspan="4" class="empty-state">
                  <strong>{{
                    store.audit().length
                      ? 'Nenhum evento corresponde aos filtros'
                      : 'Nenhum evento registrado'
                  }}</strong>
                  <p>
                    {{
                      store.audit().length
                        ? 'Limpe a busca ou escolha outro tipo de registro.'
                        : 'As ações registradas no sistema aparecerão aqui.'
                    }}
                  </p>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <mat-paginator
        [length]="filtered().length"
        [pageIndex]="safePage()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="[10, 25, 50]"
        (page)="changePage($event)"
        aria-label="Paginação do histórico"
      ></mat-paginator>
      <p class="muted">
        Consulta somente de leitura. Cada evento é gravado junto com a operação correspondente.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .search {
      flex: 1;
      min-width: min(100%, 280px);
    }
    .audit-explainer {
      max-width: 100ch;
      margin: 0 0 20px;
      padding: 12px 14px;
      border-left: 3px solid var(--app-blue);
      color: var(--app-muted);
      background: var(--app-tint);
      font-size: 13px;
      line-height: 1.6;
    }
    .audit-explainer strong {
      color: var(--app-ink);
      font-weight: 600;
    }
    .timestamp {
      min-width: 160px;
    }
    .change-row > td {
      padding: 0 20px 20px;
      background: var(--app-background);
    }
    .change-table {
      background: var(--app-surface);
      table-layout: fixed;
    }
    .change-table td {
      overflow-wrap: anywhere;
    }
    .change-table caption {
      text-align: left;
      padding: 14px 0;
      font-weight: 500;
    }
    .change-table th:first-child {
      width: 24%;
    }
  `,
})
export class AuditPage {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly search = new FormControl(this.route.snapshot.queryParamMap.get('q') ?? '', {
    nonNullable: true,
  });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: this.search.value });
  readonly entityType = signal(this.route.snapshot.queryParamMap.get('tipo') ?? '');
  readonly page = signal(
    Math.max(0, Math.floor(Number(this.route.snapshot.queryParamMap.get('pagina')) || 0)),
  );
  readonly pageSize = signal(
    [10, 25, 50].includes(Number(this.route.snapshot.queryParamMap.get('limite')))
      ? Number(this.route.snapshot.queryParamMap.get('limite'))
      : 10,
  );
  readonly expanded = signal<string | null>(null);
  readonly entityTypes = computed(() =>
    [...new Set(this.store.audit().map((e) => e.entityType))].sort(),
  );
  readonly filtered = computed(() => {
    const q = this.query().toLocaleLowerCase('pt-BR');
    return this.store
      .audit()
      .filter(
        (e) =>
          (!this.entityType() || e.entityType === this.entityType()) &&
          [
            e.actor,
            e.description,
            e.reason ?? '',
            this.actionLabel(e.action),
            this.entityLabel(e.entityType),
            ...e.changes.flatMap((c) => [c.field, c.before, c.after]),
          ]
            .join(' ')
            .toLocaleLowerCase('pt-BR')
            .includes(q),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  });
  readonly safePage = computed(() =>
    Math.min(this.page(), Math.max(0, Math.ceil(this.filtered().length / this.pageSize()) - 1)),
  );
  readonly paged = computed(() =>
    this.filtered().slice(
      this.safePage() * this.pageSize(),
      (this.safePage() + 1) * this.pageSize(),
    ),
  );
  constructor() {
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.page.set(0);
      this.persist();
    });
  }
  toggle(id: string): void {
    this.expanded.update((value) => (value === id ? null : id));
  }
  clear(): void {
    this.entityType.set('');
    this.page.set(0);
    this.search.setValue('');
    this.persist();
  }
  setEntityType(value: string): void {
    this.entityType.set(value);
    this.page.set(0);
    this.persist();
  }
  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.expanded.set(null);
    this.persist();
  }
  private persist(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        tipo: this.entityType() || null,
        pagina: this.safePage() || null,
        limite: this.pageSize() === 10 ? null : this.pageSize(),
      },
      replaceUrl: true,
    });
  }
  isCreation(entry: AuditEntry): boolean {
    return /create|cria|cadast|inclu|empenho registrado|liquidação registrada|pagamento registrado|relatório exportado|acesso inicial criado/i.test(
      entry.action,
    );
  }
  actionLabel(action: string): string {
    return (
      (
        {
          CREATE: 'Cadastro',
          UPDATE: 'Alteração',
          REVERSE: 'Estorno',
          REVERSAL: 'Estorno',
          PAYMENT: 'Pagamento',
          LIQUIDATE: 'Liquidação',
          COMMIT: 'Empenho registrado',
          PAY: 'Pagamento registrado',
          PASSWORD_RESET: 'Senha redefinida',
          PASSWORD_CHANGE: 'Senha alterada',
          BOOTSTRAP: 'Acesso inicial criado',
          EXPORT: 'Relatório exportado',
          LOGIN: 'Acesso realizado',
        } as Record<string, string>
      )[action] ?? action
    );
  }
  entityLabel(entity: string): string {
    return (
      (
        {
          parliamentarian: 'Parlamentar',
          author: 'Parlamentar',
          amendment: 'Emenda',
          receipt: 'Recebimento',
          expense: 'Empenho',
          liquidation: 'Liquidação',
          payment: 'Pagamento',
          reversal: 'Estorno',
          user: 'Usuário',
          report: 'Relatório',
        } as Record<string, string>
      )[entity] ?? entity
    );
  }
  fieldLabel(field: string): string {
    return (
      (
        {
          name: 'Nome',
          email: 'E-mail',
          role: 'Perfil',
          active: 'Situação',
          must_change_password: 'Troca de senha obrigatória',
          type: 'Tipo',
          source: 'Fonte de recurso',
          action: 'Ação',
          block_action: 'Ação',
          expense_element: 'Elemento de despesa',
          object: 'Objeto',
          account: 'Conta bancária',
          amount: 'Valor',
          creditDate: 'Data do crédito',
          document: 'Documento',
          description: 'Descrição',
          date: 'Data',
          reason: 'Motivo',
          supplier: 'Fornecedor',
          number: 'Número da emenda',
          year: 'Ano da emenda',
        } as Record<string, string>
      )[field] ?? field
    );
  }
  changeValue(field: string, value: string): string {
    if (!value) return 'Não informado';
    if (/perfil|role/i.test(field) && value in ROLE_LABEL) return ROLE_LABEL[value as Role];
    if (/ativo|active|situação/i.test(field) && ['true', 'false'].includes(value))
      return value === 'true' ? 'Ativo' : 'Inativo';
    if (/^(amount|valor)$/i.test(field) && /^-?\d+(?:\.\d{1,2})?$/.test(value)) return brl(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
    return value;
  }
}
