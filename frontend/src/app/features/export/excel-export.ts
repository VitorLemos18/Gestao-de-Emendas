import type { Workbook, Worksheet } from 'exceljs';
import type {
  Amendment,
  AuditEntry,
  Author,
  Expense,
  ExpenseSummary,
  Liquidation,
  Payment,
  Receipt,
} from '../../core/models';
import { fromCents, toCents } from '../../core/money';

export type ReportScope = 'general' | 'author';

export interface LifetimeReceiptSummary {
  credit: string;
  committed: string;
  liquidated: string;
  grossPaid: string;
  reversed: string;
  netPaid: string;
  closing: string;
  toCommit: string;
  toLiquidate: string;
  toPay: string;
}

export interface AnnualBalanceLine {
  receiptId: string;
  year: number;
  opening: string;
  received: string;
  paid: string;
  reversed: string;
  closing: string;
}

export interface DemoExportSnapshot {
  scope: ReportScope;
  authorId?: string;
  authorName?: string;
  generatedAt: string;
  authors: readonly Author[];
  amendments: readonly Amendment[];
  receipts: readonly Receipt[];
  expenses: readonly Expense[];
  liquidations: readonly Liquidation[];
  payments: readonly Payment[];
  lifetime: Readonly<Record<string, LifetimeReceiptSummary>>;
  expenseSummaries: Readonly<Record<string, ExpenseSummary>>;
  annualBalances: readonly AnnualBalanceLine[];
  audit: readonly AuditEntry[];
}

const BRL_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';
const SCOPE_TEXT =
  'Todos os exercícios e registros disponíveis. A cópia não depende do exercício nem da página selecionados na navegação.';
const RECEIPT_HEADERS = [
  'Parlamentar',
  'Emenda',
  'Ano da emenda',
  'Tipo',
  'Ação',
  'Elemento de despesa',
  'Fonte de recurso',
  'Objeto',
  'Data do crédito',
  'Conta bancária',
  'Crédito original',
  'Empenhado',
  'Liquidado',
  'Pago bruto',
  'Estornado',
  'Pago líquido',
  'Saldo de caixa',
  'A empenhar',
  'A liquidar',
  'A pagar',
];

export async function buildReportWorkbook(snapshot: DemoExportSnapshot): Promise<Workbook> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const reportLabel =
    snapshot.scope === 'general' ? 'Relatório geral' : 'Relatório por parlamentar';
  workbook.creator = 'Gestão de emendas';
  workbook.subject = 'Relatório de acompanhamento de emendas';
  workbook.title = reportLabel + (snapshot.authorName ? ' — ' + snapshot.authorName : '');
  workbook.created = new Date(snapshot.generatedAt);
  workbook.modified = new Date(snapshot.generatedAt);

  const summaryName = snapshot.scope === 'general' ? 'Geral' : 'Resumo';
  const fixedNames = [
    'Recebimentos',
    'Saldos por ano',
    'Emendas',
    'Empenhos',
    'Liquidações',
    'Pagamentos e estornos',
    'Histórico',
  ];
  const usedNames = new Set(
    [summaryName, ...fixedNames].map((name) => name.toLocaleLowerCase('pt-BR')),
  );

  writeSummary(workbook.addWorksheet(summaryName), snapshot, reportLabel);

  writeReceipts(workbook.addWorksheet('Recebimentos'), snapshot, reportLabel);
  writeAnnualBalances(workbook.addWorksheet('Saldos por ano'), snapshot, reportLabel);
  writeAmendments(workbook.addWorksheet('Emendas'), snapshot, reportLabel);
  writeExpenses(workbook.addWorksheet('Empenhos'), snapshot, reportLabel);
  writeLiquidations(workbook.addWorksheet('Liquidações'), snapshot, reportLabel);
  writePayments(workbook.addWorksheet('Pagamentos e estornos'), snapshot, reportLabel);

  if (snapshot.scope === 'general') {
    for (const author of snapshot.authors) {
      const sheet = workbook.addWorksheet(uniqueSheetName(author.name, usedNames));
      writeReceipts(
        sheet,
        snapshot,
        'Parlamentar: ' + author.name,
        (receipt) =>
          snapshot.amendments.find((amendment) => amendment.id === receipt.amendmentId)
            ?.authorId === author.id,
      );
    }
  }

  writeHistory(workbook.addWorksheet('Histórico'), snapshot, reportLabel);
  return workbook;
}

function writeSummary(sheet: Worksheet, snapshot: DemoExportSnapshot, reportLabel: string): void {
  const title =
    snapshot.scope === 'general' ? 'Relatório geral de emendas' : 'Relatório por parlamentar';
  sheet.addRow(['Gestão de emendas']);
  sheet.addRow([title + (snapshot.authorName ? ' · ' + snapshot.authorName : '')]);
  sheet.addRow(['Cópia para consulta e conferência. Não substitui o backup recuperável do banco.']);
  sheet.addRow([SCOPE_TEXT]);
  sheet.addRow([
    'As etapas de execução e a posição atual são indicadores distintos; não some os valores entre si.',
  ]);
  sheet.addRow(['Grupo', 'Indicador', 'Quantidade', 'Valor (R$)']);
  for (const row of [1, 2, 3, 4, 5]) sheet.mergeCells(row, 1, row, 4);
  styleTop(sheet, 4, [26, 38, 18, 24]);
  sheet.getRow(5).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF525D68' } };
  sheet.getRow(5).height = 22;
  sheet.getRow(5).alignment = { vertical: 'middle', wrapText: true };
  const lifetime = Object.values(snapshot.lifetime);
  const totals = {
    credit: sum(lifetime.map((line) => line.credit)),
    committed: sum(lifetime.map((line) => line.committed)),
    liquidated: sum(lifetime.map((line) => line.liquidated)),
    grossPaid: sum(lifetime.map((line) => line.grossPaid)),
    reversed: sum(lifetime.map((line) => line.reversed)),
    netPaid: sum(lifetime.map((line) => line.netPaid)),
    closing: sum(lifetime.map((line) => line.closing)),
    toCommit: sum(lifetime.map((line) => line.toCommit)),
    toLiquidate: sum(lifetime.map((line) => line.toLiquidate)),
    toPay: sum(lifetime.map((line) => line.toPay)),
  };
  const indicators: [string, string, number | null, number | null][] = [
    ['Registros', 'Parlamentares', snapshot.authors.length, null],
    ['Registros', 'Emendas', snapshot.amendments.length, null],
    ['Registros', 'Recebimentos / objetos', snapshot.receipts.length, null],
    ['Registros', 'Empenhos', snapshot.expenses.length, null],
    ['Registros', 'Liquidações', snapshot.liquidations.length, null],
    ['Registros', 'Pagamentos', snapshot.payments.length, null],
    ['Registros', 'Estornos', snapshot.payments.filter((payment) => payment.reversal).length, null],
    ['Execução acumulada', 'Crédito original', null, cellMoney(totals.credit)],
    ['Execução acumulada', 'Empenhado', null, cellMoney(totals.committed)],
    ['Execução acumulada', 'Liquidado', null, cellMoney(totals.liquidated)],
    ['Execução acumulada', 'Pago bruto', null, cellMoney(totals.grossPaid)],
    ['Execução acumulada', 'Estornado', null, cellMoney(totals.reversed)],
    ['Execução acumulada', 'Pago líquido', null, cellMoney(totals.netPaid)],
    ['Posição atual', 'Saldo de caixa', null, cellMoney(totals.closing)],
    ['Posição atual', 'Disponível para empenhar', null, cellMoney(totals.toCommit)],
    ['Posição atual', 'Empenhado aguardando liquidação', null, cellMoney(totals.toLiquidate)],
    ['Posição atual', 'Liquidado aguardando pagamento', null, cellMoney(totals.toPay)],
  ];
  for (const indicator of indicators) {
    const row = sheet.addRow(indicator);
    row.getCell(3).numFmt = '#,##0';
    row.getCell(4).numFmt = BRL_FORMAT;
  }
  sheet.addRow([]);
  sheet.addRow(['Escopo', reportLabel + (snapshot.authorName ? ' · ' + snapshot.authorName : '')]);
  sheet.addRow(['Gerado em', new Date(snapshot.generatedAt)]);
  sheet.getCell(`B${sheet.rowCount}`).numFmt = 'dd/mm/yyyy hh:mm';
  sheet.addRow([]);
  const glossaryHeading = sheet.addRow(['Como interpretar a posição atual']);
  sheet.mergeCells(glossaryHeading.number, 1, glossaryHeading.number, 4);
  glossaryHeading.height = 24;
  glossaryHeading.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  glossaryHeading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF234D73' } };
  glossaryHeading.alignment = { vertical: 'middle' };
  const glossary = [
    [
      'Saldo de caixa',
      'Recursos remanescentes após pagamentos líquidos e estornos, considerando saldos de exercícios anteriores.',
    ],
    ['Disponível para empenhar', 'Crédito recebido que ainda não foi comprometido por empenho.'],
    [
      'Empenhado aguardando liquidação',
      'Valor comprometido por empenho que ainda não foi liquidado.',
    ],
    ['Liquidado aguardando pagamento', 'Valor liquidado que ainda não foi pago.'],
  ];
  for (const [indicator, explanation] of glossary) {
    const row = sheet.addRow([indicator, explanation]);
    sheet.mergeCells(row.number, 2, row.number, 4);
    row.height = 30;
    row.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF234D73' } };
    row.getCell(1).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(2).font = { name: 'Calibri', size: 10, color: { argb: 'FF2A343D' } };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    if (row.number % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
      });
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 6 }];
  sheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.headerFooter.oddFooter = 'Relatório de acompanhamento · Página &P de &N';
}

function writeReceipts(
  sheet: Worksheet,
  snapshot: DemoExportSnapshot,
  subtitle: string,
  include: (receipt: Receipt) => boolean = () => true,
): void {
  const rows = snapshot.receipts.filter(include);
  setupTable(
    sheet,
    subtitle,
    RECEIPT_HEADERS,
    [28, 23, 16, 15, 24, 30, 23, 48, 17, 21, 20, 18, 18, 18, 18, 18, 20, 18, 18, 18],
  );
  for (const receipt of rows) {
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const summary = snapshot.lifetime[receipt.id];
    const row = sheet.addRow([
      author?.name ?? 'Parlamentar não encontrado',
      amendment?.number ?? '',
      amendment?.year ?? '',
      receipt.type,
      receipt.action,
      receipt.expenseElement ?? 'Não informado no cadastro anterior',
      receipt.source,
      receipt.object,
      dateOnly(receipt.creditDate),
      receipt.account,
      cellMoney(summary?.credit ?? receipt.amount),
      cellMoney(summary?.committed ?? '0.00'),
      cellMoney(summary?.liquidated ?? '0.00'),
      cellMoney(summary?.grossPaid ?? '0.00'),
      cellMoney(summary?.reversed ?? '0.00'),
      cellMoney(summary?.netPaid ?? '0.00'),
      cellMoney(summary?.closing ?? '0.00'),
      cellMoney(summary?.toCommit ?? '0.00'),
      cellMoney(summary?.toLiquidate ?? '0.00'),
      cellMoney(summary?.toPay ?? '0.00'),
    ]);
    row.getCell(9).numFmt = DATE_FORMAT;
    row.getCell(2).numFmt = '@';
    row.getCell(10).numFmt = '@';
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    for (let column = 11; column <= 20; column++) row.getCell(column).numFmt = BRL_FORMAT;
  }
  finishTable(
    sheet,
    rows.length,
    RECEIPT_HEADERS.length,
    'Nenhum recebimento cadastrado neste escopo.',
  );
}

function writeAnnualBalances(
  sheet: Worksheet,
  snapshot: DemoExportSnapshot,
  subtitle: string,
): void {
  const headers = [
    'Ano',
    'Parlamentar',
    'Emenda',
    'Objeto',
    'Saldo anterior',
    'Créditos no ano',
    'Pagamentos no ano',
    'Estornos no ano',
    'Saldo final',
  ];
  setupTable(sheet, subtitle, headers, [12, 28, 23, 48, 21, 21, 21, 21, 21]);
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const rows = snapshot.annualBalances
    .filter((line) => receiptIds.has(line.receiptId))
    .sort((a, b) => a.year - b.year || a.receiptId.localeCompare(b.receiptId));
  for (const line of rows) {
    const receipt = snapshot.receipts.find((item) => item.id === line.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const row = sheet.addRow([
      line.year,
      author?.name ?? '',
      amendment?.number ?? '',
      receipt.object,
      cellMoney(line.opening),
      cellMoney(line.received),
      cellMoney(line.paid),
      cellMoney(line.reversed),
      cellMoney(line.closing),
    ]);
    row.getCell(3).numFmt = '@';
    for (let column = 5; column <= 9; column++) row.getCell(column).numFmt = BRL_FORMAT;
  }
  finishTable(sheet, rows.length, headers.length, 'Nenhum saldo por exercício neste escopo.');
}

function writeAmendments(sheet: Worksheet, snapshot: DemoExportSnapshot, subtitle: string): void {
  const headers = [
    'Parlamentar',
    'Número da emenda',
    'Ano',
    'Descrição',
    'Recebimentos / objetos',
    'Crédito total',
  ];
  setupTable(sheet, subtitle, headers, [28, 24, 12, 48, 24, 22]);
  const amendmentIds = new Set(snapshot.amendments.map((amendment) => amendment.id));
  const includedReceipts = snapshot.receipts.filter((receipt) =>
    amendmentIds.has(receipt.amendmentId),
  );
  for (const amendment of snapshot.amendments) {
    const author = snapshot.authors.find((item) => item.id === amendment.authorId);
    const receipts = snapshot.receipts.filter((receipt) => receipt.amendmentId === amendment.id);
    const row = sheet.addRow([
      author?.name ?? '',
      amendment.number,
      amendment.year,
      amendment.description,
      receipts.length,
      cellMoney(
        sum(receipts.map((receipt) => snapshot.lifetime[receipt.id]?.credit ?? receipt.amount)),
      ),
    ]);
    row.getCell(2).numFmt = '@';
    row.getCell(6).numFmt = BRL_FORMAT;
  }
  if (snapshot.amendments.length) {
    const totalRow = sheet.addRow([
      `TOTAL NO ESCOPO (${snapshot.amendments.length} emendas)`,
      '',
      '',
      '',
      includedReceipts.length,
      cellMoney(
        sum(
          includedReceipts.map(
            (receipt) => snapshot.lifetime[receipt.id]?.credit ?? receipt.amount,
          ),
        ),
      ),
    ]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF234D73' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF234D73' } } };
    });
    totalRow.getCell(5).numFmt = '#,##0';
    totalRow.getCell(6).numFmt = BRL_FORMAT;
  }
  finishTable(
    sheet,
    snapshot.amendments.length,
    headers.length,
    'Nenhuma emenda cadastrada neste escopo.',
    snapshot.amendments.length > 0,
  );
}

function writeExpenses(sheet: Worksheet, snapshot: DemoExportSnapshot, subtitle: string): void {
  const headers = [
    'Parlamentar',
    'Número da emenda e objeto',
    'Número do empenho, fornecedor e documento',
    'Data do empenho',
    'Valor do empenho',
  ];
  setupTable(sheet, subtitle, headers, [28, 42, 76, 18, 22]);
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const expenses = snapshot.expenses.filter((expense) => receiptIds.has(expense.receiptId));
  for (const expense of expenses) {
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const row = sheet.addRow([
      author?.name ?? '',
      `Nº da emenda: ${amendment?.number ?? ''}\nObjeto: ${receipt.object}`,
      [
        `Nº do empenho: ${expense.document}`,
        `Despesa: ${expense.description}`,
        `Fornecedor: ${expense.supplier}`,
        `Nota de Empenho (PDF): ${expense.commitmentDocument?.fileName ?? 'Não anexada'}`,
        expense.observations ? `Observações: ${expense.observations}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      dateOnly(expense.commitmentDate),
      cellMoney(expense.amount),
    ]);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(4).numFmt = DATE_FORMAT;
    row.getCell(5).numFmt = BRL_FORMAT;
  }
  finishTable(sheet, expenses.length, headers.length, 'Nenhum empenho cadastrado neste escopo.');
}

function writeLiquidations(sheet: Worksheet, snapshot: DemoExportSnapshot, subtitle: string): void {
  const headers = [
    'Data',
    'Parlamentar',
    'Emenda',
    'Objeto',
    'Descrição do empenho',
    'Documento do empenho',
    'Documento da liquidação',
    'Conta de destino',
    'Observações da liquidação',
    'Valor',
  ];
  setupTable(sheet, subtitle, headers, [17, 28, 23, 40, 42, 23, 25, 24, 48, 20]);
  const receiptByExpense = new Map(snapshot.expenses.map((expense) => [expense.id, expense]));
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const liquidations = snapshot.liquidations
    .filter((item) => {
      const expense = receiptByExpense.get(item.expenseId);
      return Boolean(expense && receiptIds.has(expense.receiptId));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const liquidation of liquidations) {
    const expense = receiptByExpense.get(liquidation.expenseId)!;
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const row = sheet.addRow([
      dateOnly(liquidation.date),
      author?.name ?? '',
      amendment?.number ?? '',
      receipt.object,
      expense.description,
      expense.document,
      liquidation.document,
      liquidation.destinationAccount ?? '',
      liquidation.observations ?? '',
      cellMoney(liquidation.amount),
    ]);
    row.getCell(1).numFmt = DATE_FORMAT;
    row.getCell(3).numFmt = '@';
    row.getCell(6).numFmt = '@';
    row.getCell(7).numFmt = '@';
    row.getCell(8).numFmt = '@';
    row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(10).numFmt = BRL_FORMAT;
  }
  finishTable(
    sheet,
    liquidations.length,
    headers.length,
    'Nenhuma liquidação cadastrada neste escopo.',
  );
}

function writePayments(sheet: Worksheet, snapshot: DemoExportSnapshot, subtitle: string): void {
  const headers = [
    'Movimento',
    'Data',
    'Parlamentar',
    'Emenda',
    'Objeto',
    'Descrição do empenho',
    'Fornecedor',
    'Documento',
    'Conta de destino',
    'Número do protocolo',
    'Valor',
    'Efeito no caixa',
    'Motivo do estorno',
    'Observações do pagamento',
  ];
  setupTable(sheet, subtitle, headers, [18, 17, 28, 23, 40, 42, 30, 22, 24, 24, 20, 21, 42, 48]);
  const expenseById = new Map(snapshot.expenses.map((expense) => [expense.id, expense]));
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const events: { date: string; values: (string | number | Date)[] }[] = [];
  for (const payment of snapshot.payments) {
    const expense = expenseById.get(payment.expenseId);
    if (!expense || !receiptIds.has(expense.receiptId)) continue;
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    events.push({
      date: payment.date,
      values: [
        'Pagamento',
        dateOnly(payment.date),
        author?.name ?? '',
        amendment?.number ?? '',
        receipt.object,
        expense.description,
        expense.supplier,
        payment.document,
        payment.destinationAccount ?? '',
        payment.protocolNumber ?? '',
        cellMoney(payment.amount),
        cellMoney('-' + payment.amount),
        '',
        payment.observations ?? '',
      ],
    });
    if (payment.reversal) {
      events.push({
        date: payment.reversal.date,
        values: [
          'Estorno',
          dateOnly(payment.reversal.date),
          author?.name ?? '',
          amendment?.number ?? '',
          receipt.object,
          expense.description,
          expense.supplier,
          payment.document,
          payment.destinationAccount ?? '',
          payment.protocolNumber ?? '',
          cellMoney(payment.amount),
          cellMoney(payment.amount),
          payment.reversal.reason,
          payment.observations ?? '',
        ],
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  for (const event of events) {
    const row = sheet.addRow(event.values);
    row.getCell(2).numFmt = DATE_FORMAT;
    row.getCell(4).numFmt = '@';
    row.getCell(8).numFmt = '@';
    row.getCell(9).numFmt = '@';
    row.getCell(10).numFmt = '@';
    row.getCell(11).numFmt = BRL_FORMAT;
    row.getCell(12).numFmt = BRL_FORMAT;
    row.getCell(14).alignment = { wrapText: true, vertical: 'top' };
  }
  finishTable(
    sheet,
    events.length,
    headers.length,
    'Nenhum pagamento ou estorno cadastrado neste escopo.',
  );
}

function writeHistory(sheet: Worksheet, snapshot: DemoExportSnapshot, subtitle: string): void {
  const headers = [
    'Data e hora',
    'Responsável',
    'Ação',
    'Tipo de registro',
    'Registro / contexto',
    'Justificativa ou contexto',
    'Campo',
    'Valor anterior',
    'Valor novo / registrado',
  ];
  setupTable(sheet, subtitle, headers, [23, 28, 30, 20, 45, 45, 24, 45, 45]);
  const entries = [...snapshot.audit].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const entry of entries) {
    const changes = entry.changes.length
      ? entry.changes
      : [
          {
            field: isCreatedAuditEvent(entry.action) ? 'Dados registrados' : 'Operação registrada',
            before: '',
            after: '',
          },
        ];
    for (const change of changes) {
      const row = sheet.addRow([
        new Date(entry.timestamp),
        entry.actor,
        entry.action,
        entityLabel(entry.entityType),
        entry.description,
        entry.reason ?? '',
        change.field,
        change.before,
        change.after,
      ]);
      row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm:ss';
      row.alignment = { vertical: 'top', wrapText: true };
    }
  }
  finishTable(
    sheet,
    entries.length,
    headers.length,
    'Nenhum evento de histórico registrado neste escopo.',
  );
}

function isCreatedAuditEvent(action: string): boolean {
  return /create|cria|cadast|inclu|empenho registrado|liquidação registrada|pagamento registrado|relatório exportado|acesso inicial criado/i.test(
    action,
  );
}

function setupTable(sheet: Worksheet, subtitle: string, headers: string[], widths: number[]): void {
  sheet.addRow(['Gestão de emendas']);
  sheet.addRow([subtitle]);
  sheet.addRow(['Cópia para consulta e conferência. Não substitui o backup recuperável do banco.']);
  sheet.addRow([SCOPE_TEXT]);
  sheet.addRow([]);
  sheet.addRow(headers);
  for (const row of [1, 2, 3, 4]) sheet.mergeCells(row, 1, row, headers.length);
  styleTop(sheet, headers.length, widths);
}

function styleTop(sheet: Worksheet, columnCount: number, widths: number[]): void {
  sheet.getRow(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF234D73' } };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).font = { name: 'Calibri', size: 12, bold: true };
  sheet.getRow(3).font = { name: 'Calibri', size: 10, color: { argb: 'FF525D68' } };
  sheet.getRow(4).font = { name: 'Calibri', size: 10, color: { argb: 'FF525D68' } };
  const heading = sheet.getRow(6);
  heading.height = 34;
  heading.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF234D73' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.views = [{ state: 'frozen', ySplit: 6, xSplit: columnCount > 2 ? 1 : 0 }];
  sheet.pageSetup = {
    orientation: columnCount > 8 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.headerFooter.oddFooter = 'Relatório de acompanhamento · Página &P de &N';
  sheet.properties.defaultRowHeight = 26;
}

function finishTable(
  sheet: Worksheet,
  rowCount: number,
  columnCount: number,
  emptyMessage: string,
  hasTotalRow = false,
): void {
  if (!rowCount) sheet.addRow([emptyMessage]);
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: Math.max(6, sheet.rowCount - (hasTotalRow ? 1 : 0)), column: columnCount },
  };
  for (let row = 7; row <= sheet.rowCount; row++) {
    sheet.getRow(row).alignment = { vertical: 'top', wrapText: true };
  }
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[\\/*?:\[\]\u0000-\u001f]/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '')
      .trim() || 'Parlamentar';
  let candidate = base.slice(0, 31);
  let suffix = 1;
  while (used.has(candidate.toLocaleLowerCase('pt-BR'))) {
    const ending = ' (' + ++suffix + ')';
    candidate = base.slice(0, 31 - ending.length) + ending;
  }
  used.add(candidate.toLocaleLowerCase('pt-BR'));
  return candidate;
}

function dateOnly(value: string): Date {
  return new Date(value + 'T00:00:00.000Z');
}

function cellMoney(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Um valor monetário da exportação é inválido.');
  return numeric;
}

function sum(values: readonly string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

function entityLabel(value: string): string {
  return (
    (
      {
        parliamentarian: 'Parlamentar',
        amendment: 'Emenda',
        receipt: 'Recebimento',
        expense: 'Empenho',
        liquidation: 'Liquidação',
        payment: 'Pagamento',
        user: 'Usuário',
      } as Record<string, string>
    )[value] ?? value
  );
}
