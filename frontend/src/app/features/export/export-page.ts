import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DemoStore } from '../../core/demo-store';
import { fromCents, toCents } from '../../core/money';
import { MoneyPipe } from '../../shared/format';
import {
  AnnualBalanceLine,
  DemoExportSnapshot,
  LifetimeReceiptSummary,
  ReportScope,
} from './excel-export';

@Component({
  selector: 'app-export-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatSelectModule,
    MoneyPipe,
  ],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Exportar relatórios</h1>
          <p class="page-intro">
            Gere uma cópia para conferência de todos os parlamentares ou de um parlamentar.
          </p>
        </div>
        <a mat-stroked-button routerLink="/saldos">Conferir saldos anuais</a>
      </header>

      @if (store.canExport()) {
        <fieldset class="scope-picker" [disabled]="busy()">
          <legend>Escolha o escopo do relatório</legend>
          <label class="scope-option" [class.selected]="scope() === 'general'">
            <input
              type="radio"
              name="report-scope"
              value="general"
              [checked]="scope() === 'general'"
              (change)="setScope('general')"
            />
            <span>
              <strong>Relatório geral</strong>
              <small>Todos os parlamentares, emendas e movimentações.</small>
            </span>
          </label>
          <label class="scope-option" [class.selected]="scope() === 'author'">
            <input
              type="radio"
              name="report-scope"
              value="author"
              [checked]="scope() === 'author'"
              (change)="setScope('author')"
            />
            <span>
              <strong>Por parlamentar</strong>
              <small>Um arquivo completo para o parlamentar escolhido.</small>
            </span>
          </label>
        </fieldset>

        @if (scope() === 'author') {
          <mat-form-field appearance="outline" class="author-picker" subscriptSizing="dynamic">
            <mat-label>Parlamentar</mat-label>
            <mat-select
              [value]="authorId()"
              [disabled]="busy()"
              (selectionChange)="setAuthor($event.value)"
              aria-label="Selecione o parlamentar do relatório"
            >
              @for (author of store.authors(); track author.id) {
                <mat-option [value]="author.id">{{ author.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        @if (snapshot(); as data) {
          <div class="report-overview">
            <div class="overview-heading">
              <div>
                <span class="eyebrow">Escopo do arquivo</span>
                <h2>
                  {{ data.scope === 'general' ? 'Todos os parlamentares' : data.authorName }}
                </h2>
              </div>
              <span class="all-years">Todos os exercícios</span>
            </div>
            <p class="scope-note">
              Inclui todos os exercícios e registros disponíveis neste escopo, mesmo que não estejam
              na página atual. O arquivo reúne recebimentos, execução financeira e trilha de
              auditoria.
            </p>
            <h3 class="summary-label">Quantidade de registros</h3>
            <dl class="report-counts">
              <div>
                <dt>Emendas</dt>
                <dd>{{ data.amendments.length }}</dd>
              </div>
              <div>
                <dt>Recebimentos / objetos</dt>
                <dd>{{ data.receipts.length }}</dd>
              </div>
              <div>
                <dt>Empenhos</dt>
                <dd>{{ data.expenses.length }}</dd>
              </div>
              <div>
                <dt>Liquidações</dt>
                <dd>{{ data.liquidations.length }}</dd>
              </div>
              <div>
                <dt>Pagamentos</dt>
                <dd>{{ data.payments.length }}</dd>
              </div>
              <div>
                <dt>Estornos</dt>
                <dd>{{ data.payments.filter((payment) => payment.reversal).length }}</dd>
              </div>
              <div>
                <dt>Eventos no histórico</dt>
                <dd>{{ data.audit.length }}</dd>
              </div>
            </dl>
            <h3 class="summary-label financial-heading">Totais financeiros · período completo</h3>
            <div class="financial-line">
              <span
                >Crédito original <strong>{{ totals()?.credit ?? '0.00' | money }}</strong></span
              >
              <span
                >Pago líquido <strong>{{ totals()?.netPaid ?? '0.00' | money }}</strong></span
              >
              <span
                >Saldo de caixa <strong>{{ totals()?.closing ?? '0.00' | money }}</strong></span
              >
            </div>
            <p class="muted totals-note">
              Pago líquido já desconta os estornos. As quantidades acima são contagens; os valores
              financeiros abrangem todos os exercícios do arquivo.
            </p>
          </div>

          <div class="section-heading"><h2>Conteúdo do relatório</h2></div>
          <div class="table-wrap">
            <table class="work-table" aria-label="Seções e abas incluídas nos relatórios">
              <thead>
                <tr>
                  <th>Aba / seção</th>
                  <th>Conteúdo</th>
                </tr>
              </thead>
              <tbody>
                @for (sheet of sheetPreview(); track sheet.name) {
                  <tr>
                    <td>
                      <strong>{{ sheet.name }}</strong>
                    </td>
                    <td>{{ sheet.description }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="muted format-note">
            O Excel usa valores monetários numéricos, datas e contas/documentos como texto para
            preservar zeros à esquerda. O PDF organiza as mesmas informações em páginas de leitura,
            com cabeçalhos repetidos e paginação. Os saldos por ano mostram a continuidade entre
            exercícios. Excel e PDF usam o mesmo escopo selecionado.
          </p>

          <div class="export-progress" aria-live="polite">
            @if (busy()) {
              <mat-progress-bar
                mode="indeterminate"
                aria-label="Preparando relatório"
              ></mat-progress-bar>
              <p>{{ preparing() === 'pdf' ? 'Preparando o PDF…' : 'Preparando o Excel…' }}</p>
            }
          </div>
          @if (error()) {
            <div class="error-banner" role="alert">
              <strong>O arquivo não foi gerado.</strong>
              <p>{{ error() }} Tente novamente.</p>
            </div>
          }
          @if (lastFile()) {
            <p class="export-result" role="status">
              Arquivo gerado: <strong>{{ lastFile() }}</strong
              >. O navegador recebeu o download.
            </p>
          }
          <div class="form-actions">
            <button mat-flat-button type="button" [disabled]="busy()" (click)="download()">
              {{ preparing() === 'excel' ? 'Preparando Excel…' : downloadLabel() }}
            </button>
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="downloadPdf()">
              {{ preparing() === 'pdf' ? 'Preparando PDF…' : pdfDownloadLabel() }}
            </button>
          </div>
        } @else if (scope() === 'author') {
          <div class="empty-state">
            <h2>Escolha um parlamentar</h2>
            <p>
              O arquivo será limitado ao parlamentar selecionado e reunirá todo o histórico dele.
            </p>
          </div>
        }

        <p class="muted export-note">
          A exportação gera uma cópia para consulta e conferência; não altera os cadastros nem
          substitui o backup recuperável do banco.
        </p>
      } @else {
        <div class="empty-state">
          <h2>Exportação disponível para Administrador e Operador</h2>
          <p>O perfil Consulta pode conferir saldos e registros na própria interface.</p>
          <a mat-button routerLink="/saldos">Consultar saldos</a>
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .scope-picker {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      border: 0;
      padding: 0;
      margin: 0 0 20px;
    }
    .scope-picker legend {
      grid-column: 1 / -1;
      padding: 0;
      margin-bottom: 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--app-ink);
    }
    .scope-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-height: 82px;
      border: 1px solid var(--app-border);
      border-radius: 6px;
      padding: 16px;
      cursor: pointer;
      background: var(--app-surface);
    }
    .scope-option.selected {
      border-color: var(--app-blue);
      box-shadow: inset 0 0 0 1px var(--app-blue);
      background: var(--app-tint);
    }
    .scope-option input {
      width: 17px;
      height: 17px;
      accent-color: var(--app-blue);
      margin: 2px 0 0;
      flex: 0 0 auto;
    }
    .scope-option span {
      display: grid;
      gap: 6px;
    }
    .scope-option strong {
      font-size: 14px;
      font-weight: 600;
    }
    .scope-option small {
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .author-picker {
      width: min(100%, 420px);
      margin-bottom: 20px;
    }
    .report-overview {
      padding: 18px 20px 16px;
      border: 1px solid var(--app-border);
      border-radius: 6px;
      margin-bottom: 28px;
      background: var(--app-surface);
    }
    .overview-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .eyebrow {
      color: var(--app-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.045em;
    }
    .overview-heading h2 {
      margin: 4px 0 0;
      font-size: 18px;
      font-weight: 600;
    }
    .all-years {
      padding: 6px 10px;
      border-radius: 4px;
      color: var(--app-blue);
      background: var(--app-tint);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .scope-note {
      margin: 12px 0 18px;
      max-width: 90ch;
      color: var(--app-muted);
      font-size: 13px;
      line-height: 1.55;
    }
    .report-counts {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 0 20px;
      margin: 0;
    }
    .summary-label {
      margin: 0 0 4px;
      color: var(--app-ink);
      font-size: 12px;
      font-weight: 600;
    }
    .financial-heading {
      margin-top: 18px;
    }
    .report-counts > div {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 0;
      border-top: 1px solid var(--app-border);
      font-size: 12px;
    }
    .report-counts dt {
      color: var(--app-muted);
    }
    .report-counts dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .financial-line {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 28px;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--app-border);
      font-size: 13px;
    }
    .financial-line span {
      display: flex;
      gap: 7px;
      color: var(--app-muted);
    }
    .financial-line strong {
      color: var(--app-ink);
      font-weight: 600;
    }
    .totals-note {
      margin: 10px 0 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .format-note {
      margin-top: 14px;
      font-size: 12px;
      line-height: 1.55;
    }
    .export-progress {
      min-height: 46px;
      margin-top: 18px;
    }
    .export-progress p {
      margin: 8px 0;
    }
    .export-result {
      padding: 14px;
      background: var(--app-tint);
      overflow-wrap: anywhere;
    }
    .export-note {
      max-width: 90ch;
      margin-top: 18px;
    }
    .form-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .form-actions button {
      min-width: 210px;
    }
    @media (max-width: 800px) {
      .report-counts {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }
    }
    @media (max-width: 600px) {
      .scope-picker {
        grid-template-columns: 1fr;
      }
      .scope-option {
        min-height: 0;
      }
      .overview-heading {
        align-items: flex-start;
      }
      .financial-line {
        display: grid;
        gap: 8px;
      }
      .report-counts {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ExportPage {
  readonly store = inject(DemoStore);
  private readonly snack = inject(MatSnackBar);
  readonly scope = signal<ReportScope>('general');
  readonly authorId = signal('');
  readonly busy = signal(false);
  readonly preparing = signal<'excel' | 'pdf' | null>(null);
  readonly error = signal('');
  readonly lastFile = signal('');

  readonly snapshot = computed<DemoExportSnapshot | null>(() => {
    const scope = this.scope();
    const authorId = scope === 'author' ? this.authorId() : undefined;
    const allAuthors = this.store.authors();
    const selectedAuthor = authorId
      ? allAuthors.find((author) => author.id === authorId)
      : undefined;
    if (scope === 'author' && !selectedAuthor) return null;

    const allAmendments = this.store.amendments();
    const amendments =
      scope === 'general'
        ? allAmendments
        : allAmendments.filter((amendment) => amendment.authorId === authorId);
    const amendmentIds = new Set(amendments.map((amendment) => amendment.id));
    const authors =
      scope === 'general' ? allAuthors : allAuthors.filter((author) => author.id === authorId);
    const receipts = this.store
      .receipts()
      .filter((receipt) => amendmentIds.has(receipt.amendmentId));
    const receiptIds = new Set(receipts.map((receipt) => receipt.id));
    const expenses = this.store.expenses().filter((expense) => receiptIds.has(expense.receiptId));
    const expenseIds = new Set(expenses.map((expense) => expense.id));
    const liquidations = this.store.liquidations().filter((item) => expenseIds.has(item.expenseId));
    const payments = this.store.payments().filter((item) => expenseIds.has(item.expenseId));
    const audit = this.store.audit().filter((entry) => {
      if (scope === 'general') return true;
      if (entry.receiptId) return receiptIds.has(entry.receiptId);
      if (entry.entityType === 'parliamentarian') return entry.entityId === authorId;
      if (entry.entityType === 'amendment') return amendmentIds.has(entry.entityId);
      return false;
    });

    const expenseSummaries = Object.fromEntries(
      expenses.map((expense) => [expense.id, this.store.expenseSummary(expense.id, 2100)]),
    );
    const lifetime = Object.fromEntries(
      receipts.map((receipt) => {
        const summary = this.store.receiptSummary(receipt.id, 2100);
        const relatedExpenses = expenses.filter((expense) => expense.receiptId === receipt.id);
        const expenseLines = relatedExpenses.map((expense) => expenseSummaries[expense.id]);
        const line: LifetimeReceiptSummary = {
          credit: receipt.amount,
          committed: summary.committed,
          liquidated: summary.liquidated,
          grossPaid: sum(expenseLines.map((item) => item.grossPaid)),
          reversed: sum(expenseLines.map((item) => item.reversed)),
          netPaid: sum(expenseLines.map((item) => item.paid)),
          closing: summary.closing,
          toCommit: summary.toCommit,
          toLiquidate: summary.toLiquidate,
          toPay: summary.toPay,
        };
        return [receipt.id, line];
      }),
    );

    const annualBalances: AnnualBalanceLine[] = [];
    for (const receipt of receipts) {
      const relatedExpenseIds = new Set(
        expenses.filter((expense) => expense.receiptId === receipt.id).map((expense) => expense.id),
      );
      const dates = [
        receipt.creditDate,
        ...expenses
          .filter((expense) => expense.receiptId === receipt.id)
          .map((expense) => expense.commitmentDate),
        ...liquidations
          .filter((item) => relatedExpenseIds.has(item.expenseId))
          .map((item) => item.date),
        ...payments
          .filter((item) => relatedExpenseIds.has(item.expenseId))
          .flatMap((item) => (item.reversal ? [item.date, item.reversal.date] : [item.date])),
      ];
      const firstYear = Number(receipt.creditDate.slice(0, 4));
      const lastYear = Math.max(...dates.map((date) => Number(date.slice(0, 4))));
      for (let year = firstYear; year <= lastYear; year++) {
        const annual = this.store.receiptSummary(receipt.id, year);
        annualBalances.push({ receiptId: receipt.id, year, ...annual });
      }
    }

    return {
      scope,
      authorId,
      authorName: selectedAuthor?.name,
      generatedAt: new Date().toISOString(),
      authors,
      amendments,
      receipts,
      expenses,
      liquidations,
      payments,
      lifetime,
      expenseSummaries,
      annualBalances,
      audit,
    };
  });

  readonly totals = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    const lines = Object.values(snapshot.lifetime);
    return {
      credit: sum(lines.map((line) => line.credit)),
      netPaid: sum(lines.map((line) => line.netPaid)),
      closing: sum(lines.map((line) => line.closing)),
    };
  });

  readonly sheetPreview = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    const sheets = [
      {
        name: snapshot.scope === 'general' ? 'Geral' : 'Resumo',
        description:
          'Totais acumulados do escopo, com contagem de registros e situação financeira.',
      },
      {
        name: 'Recebimentos',
        description:
          'Um registro por objeto, com crédito original, valores executados e saldo final.',
      },
      {
        name: 'Saldos por ano',
        description:
          'Saldo anterior, créditos, pagamentos, estornos e saldo final por objeto e exercício.',
      },
      {
        name: 'Emendas',
        description: 'Cadastro da emenda, parlamentar e total recebido por proposta.',
      },
      {
        name: 'Empenhos',
        description: 'Parlamentar, emenda e objeto, empenho, fornecedor, Nota de Empenho, data e valor.',
      },
      { name: 'Liquidações', description: 'Data, documento e valor de cada liquidação.' },
      {
        name: 'Pagamentos e estornos',
        description: 'Cada pagamento e estorno como evento separado, com seu efeito no caixa.',
      },
    ];
    if (snapshot.scope === 'general') {
      sheets.push({
        name: 'Resumo por parlamentar',
        description:
          'No PDF, consolida crédito, empenhado, pago líquido e saldo de cada parlamentar.',
      });
      for (const author of snapshot.authors) {
        sheets.push({
          name: author.name,
          description: 'Recebimentos e saldos acumulados deste parlamentar, por objeto.',
        });
      }
    }
    sheets.push({
      name: 'Histórico',
      description:
        'Eventos do escopo com responsável, data, registro afetado e justificativa quando informada.',
    });
    return sheets;
  });

  downloadLabel(): string {
    const author = this.snapshot()?.authorName;
    return this.scope() === 'general'
      ? 'Gerar relatório geral'
      : 'Gerar relatório de ' + (author ?? 'parlamentar');
  }

  pdfDownloadLabel(): string {
    const author = this.snapshot()?.authorName;
    return this.scope() === 'general'
      ? 'Gerar PDF geral'
      : 'Gerar PDF de ' + (author ?? 'parlamentar');
  }

  setScope(scope: ReportScope): void {
    if (this.scope() === scope) return;
    this.scope.set(scope);
    this.clearExportStatus();
  }

  setAuthor(authorId: string): void {
    if (this.authorId() === authorId) return;
    this.authorId.set(authorId);
    this.clearExportStatus();
  }

  private clearExportStatus(): void {
    this.error.set('');
    this.lastFile.set('');
  }

  async download(): Promise<void> {
    if (!this.store.canExport() || this.busy()) return;
    const snapshot = this.snapshot();
    if (!snapshot) return;
    this.busy.set(true);
    this.preparing.set('excel');
    this.error.set('');
    this.lastFile.set('');
    try {
      if (!this.store.canExport()) throw new Error('Seu perfil atual não permite exportar.');
      const { buildReportWorkbook } = await import('./excel-export');
      const workbook = await buildReportWorkbook(snapshot);
      const buffer = await workbook.xlsx.writeBuffer();
      if (!this.store.canExport()) throw new Error('Seu perfil atual não permite exportar.');
      const blob = new Blob([new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = this.filename(snapshot, 'xlsx');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.lastFile.set(filename);
      this.snack.open('Relatório Excel gerado com o histórico disponível.', 'Fechar', {
        duration: 5000,
      });
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Não foi possível preparar o relatório Excel.',
      );
    } finally {
      this.busy.set(false);
      this.preparing.set(null);
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.store.canExport() || this.busy()) return;
    const snapshot = this.snapshot();
    if (!snapshot) return;
    this.busy.set(true);
    this.preparing.set('pdf');
    this.error.set('');
    this.lastFile.set('');
    try {
      const { buildDemoPdf } = await import('./pdf-export');
      const document = buildDemoPdf(snapshot);
      if (!this.store.canExport()) throw new Error('Seu perfil atual não permite exportar.');
      const filename = this.filename(snapshot, 'pdf');
      document.save(filename);
      this.lastFile.set(filename);
      this.snack.open('Relatório PDF gerado com os dados carregados do sistema.', 'Fechar', {
        duration: 5000,
      });
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Não foi possível preparar o relatório PDF.',
      );
    } finally {
      this.busy.set(false);
      this.preparing.set(null);
    }
  }

  private filename(snapshot: DemoExportSnapshot, extension: 'xlsx' | 'pdf'): string {
    const period = 'todos-exercicios';
    if (snapshot.scope === 'general') return `relatorio-geral-${period}.` + extension;
    const slug = (snapshot.authorName ?? 'parlamentar')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `relatorio-${period}-` + (slug || 'selecionado') + '.' + extension;
  }
}

function sum(values: readonly string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}
