import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { brl, fromCents, toCents } from '../../core/money';
import type { DemoExportSnapshot } from './excel-export';

const NAVY: [number, number, number] = [35, 77, 115];
const INK: [number, number, number] = [42, 52, 61];
const MUTED: [number, number, number] = [92, 104, 115];
const LINE: [number, number, number] = [220, 226, 232];
const LIGHT: [number, number, number] = [244, 247, 250];

export function buildDemoPdf(snapshot: DemoExportSnapshot): jsPDF {
  const document = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const title =
    snapshot.scope === 'general' ? 'Relatório geral de emendas' : 'Relatório por parlamentar';
  const subtitle =
    snapshot.scope === 'author'
      ? (snapshot.authorName ?? 'Parlamentar selecionado')
      : 'Todos os parlamentares';
  document.setProperties({
    title: title + ' - ' + subtitle,
    subject: 'Relatório de acompanhamento de emendas',
    author: 'Gestão de emendas',
    creator: 'Gestão de emendas',
  });

  writeCover(document, snapshot, title, subtitle);
  if (snapshot.scope === 'general') writeAuthorSummary(document, snapshot);
  writeReceipts(document, snapshot);
  writeAnnualBalances(document, snapshot);
  writeAmendments(document, snapshot);
  writeExpenses(document, snapshot);
  writeLiquidations(document, snapshot);
  writePayments(document, snapshot);
  writeHistory(document, snapshot);
  writePageNumbers(document);
  return document;
}

function writeCover(
  document: jsPDF,
  snapshot: DemoExportSnapshot,
  title: string,
  subtitle: string,
): void {
  const width = document.internal.pageSize.getWidth();
  document.setFillColor(...NAVY);
  document.rect(0, 0, width, 31, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(9);
  document.text('GESTÃO DE EMENDAS', 12, 11);
  document.setFontSize(18);
  document.text(title, 12, 21);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.text(subtitle, 12, 27);
  document.setTextColor(...MUTED);
  document.text('Relatório consolidado · histórico disponível no sistema', 12, 39);
  document.text('Gerado em ' + dateTimeBR(snapshot.generatedAt), width - 12, 39, {
    align: 'right',
  });

  const lines = Object.values(snapshot.lifetime);
  const totals = {
    credit: sum(lines.map((line) => line.credit)),
    committed: sum(lines.map((line) => line.committed)),
    liquidated: sum(lines.map((line) => line.liquidated)),
    grossPaid: sum(lines.map((line) => line.grossPaid)),
    reversed: sum(lines.map((line) => line.reversed)),
    netPaid: sum(lines.map((line) => line.netPaid)),
    closing: sum(lines.map((line) => line.closing)),
    toCommit: sum(lines.map((line) => line.toCommit)),
    toLiquidate: sum(lines.map((line) => line.toLiquidate)),
    toPay: sum(lines.map((line) => line.toPay)),
  };
  const metrics: [string, string, string, string][] = [
    ['Registros', 'Parlamentares', count(snapshot.authors.length), ''],
    ['Registros', 'Emendas', count(snapshot.amendments.length), ''],
    ['Registros', 'Recebimentos / objetos', count(snapshot.receipts.length), ''],
    ['Registros', 'Empenhos', count(snapshot.expenses.length), ''],
    ['Registros', 'Liquidações', count(snapshot.liquidations.length), ''],
    ['Registros', 'Pagamentos', count(snapshot.payments.length), ''],
    [
      'Registros',
      'Estornos',
      count(snapshot.payments.filter((payment) => payment.reversal).length),
      '',
    ],
    ['Execução acumulada', 'Crédito original', '', brl(totals.credit)],
    ['Execução acumulada', 'Empenhado', '', brl(totals.committed)],
    ['Execução acumulada', 'Liquidado', '', brl(totals.liquidated)],
    ['Execução acumulada', 'Pago bruto', '', brl(totals.grossPaid)],
    ['Execução acumulada', 'Estornado', '', brl(totals.reversed)],
    ['Execução acumulada', 'Pago líquido', '', brl(totals.netPaid)],
    ['Posição atual', 'Saldo de caixa', '', brl(totals.closing)],
    ['Posição atual', 'Disponível para empenhar', '', brl(totals.toCommit)],
    ['Posição atual', 'Empenhado aguardando liquidação', '', brl(totals.toLiquidate)],
    ['Posição atual', 'Liquidado aguardando pagamento', '', brl(totals.toPay)],
  ];

  document.setFont('helvetica', 'normal');
  document.setFontSize(7);
  document.setTextColor(...MUTED);
  document.text(
    'As etapas de execução e a posição atual são indicadores distintos; não some os valores entre si.',
    12,
    43,
  );
  autoTable(document, {
    head: [['Grupo', 'Indicador', 'Quantidade', 'Valor (R$)']],
    body: metrics,
    startY: 47,
    margin: { left: 12, right: 12, bottom: 15 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.7,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.15,
    },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 120 },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 68, halign: 'right' },
    },
  });

  const coverTable = document as jsPDF & { lastAutoTable?: { finalY: number } };
  const glossaryTitleY = (coverTable.lastAutoTable?.finalY ?? 155) + 5;
  document.setFont('helvetica', 'bold');
  document.setFontSize(8);
  document.setTextColor(...NAVY);
  document.text('Como interpretar a posição atual', 12, glossaryTitleY);
  autoTable(document, {
    body: [
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
    ],
    startY: glossaryTitleY + 2,
    margin: { left: 12, right: 12, bottom: 12 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.1,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold', textColor: NAVY },
      1: { cellWidth: 212 },
    },
    alternateRowStyles: { fillColor: LIGHT },
  });
}

function writeAuthorSummary(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const rows = snapshot.authors.map((author) => {
    const amendments = snapshot.amendments.filter((item) => item.authorId === author.id);
    const amendmentIds = new Set(amendments.map((item) => item.id));
    const receipts = snapshot.receipts.filter((receipt) => amendmentIds.has(receipt.amendmentId));
    const lines = receipts.map((receipt) => snapshot.lifetime[receipt.id]).filter(Boolean);
    return [
      author.name,
      count(amendments.length),
      count(receipts.length),
      brl(sum(lines.map((line) => line.credit))),
      brl(sum(lines.map((line) => line.committed))),
      brl(sum(lines.map((line) => line.netPaid))),
      brl(sum(lines.map((line) => line.closing))),
    ];
  });
  const lifetimeLines = snapshot.receipts
    .map((receipt) => snapshot.lifetime[receipt.id])
    .filter((line) => line !== undefined);
  const totals = {
    amendments: count(snapshot.amendments.length),
    receipts: count(snapshot.receipts.length),
    credit: brl(sum(lifetimeLines.map((line) => line.credit))),
    committed: brl(sum(lifetimeLines.map((line) => line.committed))),
    netPaid: brl(sum(lifetimeLines.map((line) => line.netPaid))),
    closing: brl(sum(lifetimeLines.map((line) => line.closing))),
  };
  addTable(
    document,
    snapshot,
    'Resumo por parlamentar',
    [
      'Parlamentar',
      'Emendas',
      'Recebimentos',
      'Crédito original',
      'Empenhado',
      'Pago líquido',
      'Saldo de caixa',
    ],
    rows,
    [3, 4, 5, 6],
    rows.length
      ? [
          'TOTAL NO ESCOPO',
          totals.amendments,
          totals.receipts,
          totals.credit,
          totals.committed,
          totals.netPaid,
          totals.closing,
        ]
      : undefined,
  );
}

function writeReceipts(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const rows = snapshot.receipts.map((receipt) => {
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const summary = snapshot.lifetime[receipt.id];
    return [
      author?.name ?? '',
      (amendment?.number ?? '') + (amendment?.year ? '\n' + amendment.year : ''),
      receipt.object,
      [
        receipt.type,
        'Ação: ' + receipt.action,
        receipt.expenseElement
          ? 'Elemento de despesa: ' + receipt.expenseElement
          : 'Elemento de despesa: não informado no cadastro anterior',
        'Fonte de recurso: ' + receipt.source,
      ]
        .filter(Boolean)
        .join('\n'),
      'Crédito: ' + dateBR(receipt.creditDate) + '\nConta: ' + receipt.account,
      brl(summary?.credit ?? receipt.amount),
      brl(summary?.committed ?? '0.00'),
      brl(summary?.liquidated ?? '0.00'),
      brl(summary?.netPaid ?? '0.00'),
      brl(summary?.closing ?? '0.00'),
    ];
  });
  addTable(
    document,
    snapshot,
    'Recebimentos por objeto',
    [
      'Parlamentar',
      'Emenda',
      'Objeto',
      'Tipo / fonte / bloco',
      'Crédito / conta',
      'Crédito original',
      'Empenhado',
      'Liquidado',
      'Pago líquido',
      'Saldo de caixa',
    ],
    rows,
    [5, 6, 7, 8, 9],
  );
}

function writeAnnualBalances(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const rows = [...snapshot.annualBalances]
    .filter((line) => receiptIds.has(line.receiptId))
    .sort((a, b) => a.year - b.year || a.receiptId.localeCompare(b.receiptId))
    .map((line) => {
      const receipt = snapshot.receipts.find((item) => item.id === line.receiptId)!;
      const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
      const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
      return [
        String(line.year),
        author?.name ?? '',
        amendment?.number ?? '',
        receipt.object,
        brl(line.opening),
        brl(line.received),
        brl(line.paid),
        brl(line.reversed),
        brl(line.closing),
      ];
    });
  addTable(
    document,
    snapshot,
    'Saldos por ano e objeto',
    [
      'Ano',
      'Parlamentar',
      'Emenda',
      'Objeto',
      'Saldo anterior',
      'Créditos',
      'Pagamentos',
      'Estornos',
      'Saldo final',
    ],
    rows,
    [4, 5, 6, 7, 8],
  );
}

function writeAmendments(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const amendmentIds = new Set(snapshot.amendments.map((amendment) => amendment.id));
  const includedReceipts = snapshot.receipts.filter((receipt) =>
    amendmentIds.has(receipt.amendmentId),
  );
  const rows = snapshot.amendments.map((amendment) => {
    const author = snapshot.authors.find((item) => item.id === amendment.authorId);
    const receipts = snapshot.receipts.filter((receipt) => receipt.amendmentId === amendment.id);
    return [
      author?.name ?? '',
      amendment.number,
      String(amendment.year),
      amendment.description || '-',
      count(receipts.length),
      brl(sum(receipts.map((receipt) => snapshot.lifetime[receipt.id]?.credit ?? receipt.amount))),
    ];
  });
  const totalObjects = includedReceipts.length;
  addTable(
    document,
    snapshot,
    'Emendas cadastradas',
    ['Parlamentar', 'Número', 'Ano', 'Descrição', 'Recebimentos / objetos', 'Crédito total'],
    rows,
    [5],
    rows.length
      ? [
          `TOTAL NO ESCOPO (${count(snapshot.amendments.length)} emendas)`,
          '',
          '',
          '',
          count(totalObjects),
          brl(
            sum(
              includedReceipts.map(
                (receipt) => snapshot.lifetime[receipt.id]?.credit ?? receipt.amount,
              ),
            ),
          ),
        ]
      : undefined,
  );
}

function writeExpenses(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const expenses = snapshot.expenses.filter((expense) => receiptIds.has(expense.receiptId));
  const rows = expenses.map((expense) => {
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    const summary = snapshot.expenseSummaries[expense.id];
    return [
      author?.name ?? '',
      `Nº da emenda: ${amendment?.number ?? ''}\nObjeto: ${receipt.object}`,
      [
        'Nº do empenho: ' + expense.document,
        'Despesa: ' + expense.description,
        'Fornecedor: ' + expense.supplier,
        'Nota de Empenho (PDF): ' + (expense.commitmentDocument?.fileName ?? 'Não anexada'),
        expense.observations ? 'Observações: ' + expense.observations : '',
      ]
        .filter(Boolean)
        .join('\n'),
      dateBR(expense.commitmentDate),
      brl(expense.amount),
      'Liquidado: ' +
        brl(summary?.liquidated ?? '0.00') +
        '\nPago: ' +
        brl(summary?.paid ?? '0.00'),
      'A liquidar: ' +
        brl(summary?.toLiquidate ?? '0.00') +
        '\nA pagar: ' +
        brl(summary?.toPay ?? '0.00'),
    ];
  });
  addTable(
    document,
    snapshot,
    'Empenhos',
    [
      'Parlamentar',
      'Número da emenda e objeto',
      'Número do empenho, fornecedor e documento',
      'Data do empenho',
      'Valor do empenho',
    ],
    rows,
    [4],
  );
}

function writeLiquidations(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const expenseById = new Map(snapshot.expenses.map((expense) => [expense.id, expense]));
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const liquidations = snapshot.liquidations
    .filter((liquidation) => {
      const expense = expenseById.get(liquidation.expenseId);
      return Boolean(expense && receiptIds.has(expense.receiptId));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = liquidations.map((liquidation) => {
    const expense = expenseById.get(liquidation.expenseId)!;
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    return [
      dateBR(liquidation.date),
      author?.name ?? '',
      amendment?.number ?? '',
      receipt.object,
      [
        expense.description,
        expense.supplier,
        liquidation.destinationAccount ? 'Conta de destino: ' + liquidation.destinationAccount : '',
        liquidation.observations ? 'Observações da liquidação: ' + liquidation.observations : '',
      ]
        .filter(Boolean)
        .join('\n'),
      expense.document,
      liquidation.document,
      brl(liquidation.amount),
    ];
  });
  addTable(
    document,
    snapshot,
    'Liquidações',
    [
      'Data',
      'Parlamentar',
      'Emenda',
      'Objeto',
      'Empenho / fornecedor',
      'Documento do empenho',
      'Documento da liquidação / conta',
      'Valor',
    ],
    rows,
    [7],
  );
}

function writePayments(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const expenseById = new Map(snapshot.expenses.map((expense) => [expense.id, expense]));
  const receiptIds = new Set(snapshot.receipts.map((receipt) => receipt.id));
  const rows: string[][] = [];
  for (const payment of snapshot.payments) {
    const expense = expenseById.get(payment.expenseId);
    if (!expense || !receiptIds.has(expense.receiptId)) continue;
    const receipt = snapshot.receipts.find((item) => item.id === expense.receiptId)!;
    const amendment = snapshot.amendments.find((item) => item.id === receipt.amendmentId);
    const author = snapshot.authors.find((item) => item.id === amendment?.authorId);
    rows.push([
      dateBR(payment.date),
      'Pagamento',
      author?.name ?? '',
      receipt.object,
      [
        expense.description,
        expense.supplier,
        payment.destinationAccount ? 'Conta de destino: ' + payment.destinationAccount : '',
        payment.observations ? 'Observações do pagamento: ' + payment.observations : '',
      ]
        .filter(Boolean)
        .join('\n'),
      [payment.document, payment.protocolNumber ? 'Protocolo: ' + payment.protocolNumber : '']
        .filter(Boolean)
        .join('\n'),
      brl(payment.amount),
      brl('-' + payment.amount),
      '-',
    ]);
    if (payment.reversal) {
      rows.push([
        dateBR(payment.reversal.date),
        'Estorno',
        author?.name ?? '',
        receipt.object,
        [expense.description, expense.supplier].join('\n'),
        [payment.document, payment.protocolNumber ? 'Protocolo: ' + payment.protocolNumber : '']
          .filter(Boolean)
          .join('\n'),
        brl(payment.amount),
        brl(payment.amount),
        payment.reversal.reason,
      ]);
    }
  }
  rows.sort((a, b) => parseDateBR(a[0]).localeCompare(parseDateBR(b[0])));
  addTable(
    document,
    snapshot,
    'Pagamentos e estornos',
    [
      'Data',
      'Movimento',
      'Parlamentar',
      'Objeto',
      'Empenho / fornecedor',
      'Documento',
      'Valor',
      'Efeito no caixa',
      'Motivo do estorno',
    ],
    rows,
    [6, 7],
  );
}

function writeHistory(document: jsPDF, snapshot: DemoExportSnapshot): void {
  const rows = [...snapshot.audit]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((entry) => {
      const changes = entry.changes.length
        ? entry.changes
            .map((change) => {
              const created = isCreatedAuditEvent(entry.action);
              const before = change.before && !created ? 'Antes: ' + change.before : '';
              const after = change.after
                ? (created ? 'Registrado: ' : 'Depois: ') + change.after
                : '';
              return [change.field, before, after].filter(Boolean).join(' ');
            })
            .join('\n')
        : isCreatedAuditEvent(entry.action)
          ? 'Dados registrados'
          : 'Operação registrada';
      return [
        dateTimeBR(entry.timestamp),
        entry.actor,
        entry.action,
        entityLabel(entry.entityType),
        entry.description,
        entry.reason ?? '-',
        changes,
      ];
    });
  addTable(
    document,
    snapshot,
    'Histórico de auditoria',
    [
      'Data e hora',
      'Responsável',
      'Ação',
      'Tipo de registro',
      'Registro afetado',
      'Justificativa ou contexto',
      'Mudanças / dados registrados',
    ],
    rows,
    [],
  );
}

function isCreatedAuditEvent(action: string): boolean {
  return /create|cria|cadast|inclu|empenho registrado|liquidação registrada|pagamento registrado|relatório exportado|acesso inicial criado/i.test(
    action,
  );
}

function addTable(
  document: jsPDF,
  snapshot: DemoExportSnapshot,
  sectionTitle: string,
  headers: string[],
  rows: string[][],
  rightAlignedColumns: number[],
  totalRow?: string[],
): void {
  document.addPage('a4', 'landscape');
  const scopeText =
    snapshot.scope === 'general'
      ? 'Todos os parlamentares - todos os exercícios'
      : (snapshot.authorName ?? 'Parlamentar') + ' - todos os exercícios';
  const body = rows.length
    ? rows
    : [['Nenhum registro disponível neste escopo.', ...Array(headers.length - 1).fill('')]];
  const columnStyles = Object.fromEntries(
    rightAlignedColumns.map((index) => [index, { halign: 'right' as const }]),
  );
  autoTable(document, {
    head: [headers],
    body,
    foot: totalRow ? [totalRow] : undefined,
    margin: { left: 10, right: 10, top: 22, bottom: 15 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.5,
      cellPadding: 1.4,
      overflow: 'linebreak',
      valign: 'top',
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.12,
    },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    footStyles: { fillColor: [232, 238, 244], textColor: NAVY, fontStyle: 'bold' },
    showFoot: 'lastPage',
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    willDrawPage: () => drawSectionHeader(document, sectionTitle, scopeText),
  });
}

function drawSectionHeader(document: jsPDF, title: string, scopeText: string): void {
  const width = document.internal.pageSize.getWidth();
  document.setFont('helvetica', 'bold');
  document.setFontSize(11);
  document.setTextColor(...NAVY);
  document.text(title, 10, 10);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7);
  document.setTextColor(...MUTED);
  document.text(scopeText, 10, 16);
  document.setDrawColor(...LINE);
  document.setLineWidth(0.25);
  document.line(10, 18, width - 10, 18);
}

function writePageNumbers(document: jsPDF): void {
  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    document.setPage(page);
    const width = document.internal.pageSize.getWidth();
    const height = document.internal.pageSize.getHeight();
    document.setDrawColor(...LINE);
    document.setLineWidth(0.2);
    document.line(10, height - 11, width - 10, height - 11);
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(...MUTED);
    document.text('Relatório de acompanhamento de emendas', 10, height - 6);
    document.text('Página ' + page + ' de ' + pageCount, width - 10, height - 6, {
      align: 'right',
    });
  }
}

function sum(values: readonly string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

function count(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function dateBR(value: string): string {
  const [year, month, day] = value.split('-');
  return [day, month, year].join('/');
}

function dateTimeBR(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function parseDateBR(value: string): string {
  const [day, month, year] = value.split('/');
  return [year, month, day].join('-');
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
