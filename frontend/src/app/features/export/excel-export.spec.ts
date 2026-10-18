import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { buildReportWorkbook, DemoExportSnapshot } from './excel-export';
import { buildDemoPdf } from './pdf-export';

const snapshot: DemoExportSnapshot = {
  scope: 'general',
  generatedAt: '2026-10-16T12:00:00.000Z',
  authors: [
    { id: 'a1', name: 'Ana / Ribeiro: Saúde [demonstração]', party: '', office: '' },
    { id: 'a2', name: 'Ana / Ribeiro: Saúde [demonstração]', party: '', office: '' },
    { id: 'a3', name: 'Geral', party: '', office: '' },
  ],
  amendments: [
    { id: 'm1', authorId: 'a1', number: '0001/2025', year: 2025, description: 'Exemplo' },
  ],
  receipts: [
    {
      id: 'r1',
      amendmentId: 'm1',
      type: 'Federal',
      action: 'PAP',
      expenseElement: '3.3.90.30 - Material de consumo',
      source: 'FONTE-DEMO',
      object: '=1+1',
      creditDate: '2025-12-10',
      account: '000123-X',
      amount: '100000.50',
      version: 1,
    },
  ],
  expenses: [
    {
      id: 'e1',
      receiptId: 'r1',
      description: 'Material de consumo',
      supplier: 'Fornecedor exemplo',
      document: 'EMP 000001',
      commitmentDate: '2025-12-12',
      amount: '40000.00',
      observations: 'Compra autorizada no processo 12/2026.',
    },
  ],
  liquidations: [
    {
      id: 'l1', expenseId: 'e1', date: '2025-12-20', amount: '40000.00',
      document: 'LIQ 000001', destinationAccount: '000321-8', observations: 'Materiais recebidos e conferidos.',
    },
  ],
  payments: [
    {
      id: 'p1', expenseId: 'e1', date: '2025-12-21', amount: '20000.00', document: 'OF 000001',
      destinationAccount: '000321-8', protocolNumber: '2025.001', observations: 'Pagamento conferido.',
    },
    { id: 'p2', expenseId: 'e1', date: '2026-03-10', amount: '15000.00', document: 'OF 000002' },
  ],
  lifetime: {
    r1: {
      credit: '100000.50',
      committed: '40000.00',
      liquidated: '40000.00',
      grossPaid: '35000.00',
      reversed: '0.00',
      netPaid: '35000.00',
      closing: '65000.50',
      toCommit: '60000.50',
      toLiquidate: '0.00',
      toPay: '5000.00',
    },
  },
  expenseSummaries: {
    e1: {
      committed: '40000.00',
      liquidated: '40000.00',
      paid: '35000.00',
      grossPaid: '35000.00',
      reversed: '0.00',
      toLiquidate: '0.00',
      toPay: '5000.00',
    },
  },
  annualBalances: [
    {
      receiptId: 'r1',
      year: 2025,
      opening: '0.00',
      received: '100000.50',
      paid: '20000.00',
      reversed: '0.00',
      closing: '80000.50',
    },
    {
      receiptId: 'r1',
      year: 2026,
      opening: '80000.50',
      received: '0.00',
      paid: '15000.00',
      reversed: '0.00',
      closing: '65000.50',
    },
  ],
  audit: [
    {
      id: 'h1',
      timestamp: '2026-10-16T12:00:00Z',
      actor: 'Operador de demonstração',
      action: 'UPDATE',
      entityType: 'receipt',
      entityId: 'r1',
      receiptId: 'r1',
      description: 'Conta corrigida',
      reason: 'Conferência do cadastro',
      changes: [{ field: 'account', before: '000122-X', after: '000123-X' }],
    },
  ],
};

describe('Relatórios Excel', () => {
  it('gera o relatório geral completo com valores numéricos, datas, identificadores e saldos entre exercícios', async () => {
    const workbook = await buildReportWorkbook(snapshot);
    const bytes = await workbook.xlsx.writeBuffer();
    const reopened = new Workbook();
    await reopened.xlsx.load(bytes);

    expect(reopened.worksheets).toHaveLength(11);
    expect(new Set(reopened.worksheets.map((sheet) => sheet.name.toLocaleLowerCase())).size).toBe(
      11,
    );
    expect(
      reopened.worksheets.every(
        (sheet) => sheet.name.length <= 31 && !/[\\\\/*?:\\[\\]]/.test(sheet.name),
      ),
    ).toBe(true);

    const general = reopened.getWorksheet('Geral')!;
    expect(general.getCell('A1').value).toBe('Gestão de emendas');
    expect(general.getCell('A6').value).toBe('Grupo');
    expect(general.getCell('C7').value).toBe(3);
    expect(general.getCell('D14').value).toBe(100000.5);
    expect(general.getCell('D20').value).toBe(65000.5);
    expect(general.getCell('D14').numFmt).toContain('R$');
    expect(general.getCell('A28').value).toBe('Como interpretar a posição atual');
    expect(general.getCell('A29').value).toBe('Saldo de caixa');
    expect(general.getCell('B29').value).toContain('saldos de exercícios anteriores');
    expect(general.getCell('A30').value).toBe('Disponível para empenhar');
    expect(general.getCell('A31').value).toBe('Empenhado aguardando liquidação');
    expect(general.getCell('A32').value).toBe('Liquidado aguardando pagamento');

    const receipts = reopened.getWorksheet('Recebimentos')!;
    expect(receipts.getCell('E7').value).toBe('PAP');
    expect(receipts.getCell('F7').value).toBe('3.3.90.30 - Material de consumo');
    expect(receipts.getCell('G7').value).toBe('FONTE-DEMO');
    expect(receipts.getCell('H7').value).toBe('=1+1');
    expect(receipts.getCell('I7').value).toBeInstanceOf(Date);
    expect((receipts.getCell('I7').value as Date).toISOString().slice(0, 10)).toBe('2025-12-10');
    expect(receipts.getCell('J7').value).toBe('000123-X');
    expect(receipts.getCell('K7').value).toBe(100000.5);
    expect(receipts.getCell('Q7').value).toBe(65000.5);
    expect(receipts.getCell('K7').numFmt).toContain('R$');

    const balances = reopened.getWorksheet('Saldos por ano')!;
    expect(balances.getCell('A7').value).toBe(2025);
    expect(balances.getCell('I7').value).toBe(80000.5);
    expect(balances.getCell('A8').value).toBe(2026);
    expect(balances.getCell('E8').value).toBe(80000.5);
    expect(balances.getCell('G8').value).toBe(15000);
    expect(balances.getCell('I8').value).toBe(65000.5);

    const amendments = reopened.getWorksheet('Emendas')!;
    expect(amendments.getCell('A8').value).toContain('TOTAL NO ESCOPO');
    expect(amendments.getCell('E8').value).toBe(1);
    expect(amendments.getCell('F8').value).toBe(100000.5);

    const payments = reopened.getWorksheet('Pagamentos e estornos')!;
    expect(payments.getCell('A7').value).toBe('Pagamento');
    expect(payments.getCell('I7').value).toBe('000321-8');
    expect(payments.getCell('J7').value).toBe('2025.001');
    expect(payments.getCell('L7').value).toBe(-20000);
    expect(payments.getCell('L7').numFmt).toContain('R$');
    expect(payments.getCell('N7').value).toBe('Pagamento conferido.');
    const expenses = reopened.getWorksheet('Empenhos')!;
    expect(expenses.columnCount).toBe(5);
    expect(expenses.getCell('A6').value).toBe('Parlamentar');
    expect(expenses.getCell('B6').value).toBe('Número da emenda e objeto');
    expect(expenses.getCell('C6').value).toBe('Número do empenho, fornecedor e documento');
    expect(expenses.getCell('D6').value).toBe('Data do empenho');
    expect(expenses.getCell('E6').value).toBe('Valor do empenho');
    expect(expenses.getCell('B7').value).toContain('Objeto: =1+1');
    expect(expenses.getCell('C7').value).toContain('Nº do empenho: EMP 000001');
    expect(expenses.getCell('C7').value).toContain('Fornecedor: Fornecedor exemplo');
    expect(expenses.getCell('C7').value).toContain('Nota de Empenho (PDF): Não anexada');
    expect(expenses.getCell('D7').value).toBeInstanceOf(Date);
    expect(expenses.getCell('E7').value).toBe(40000);
    expect(expenses.getCell('E7').numFmt).toContain('R$');
    expect(reopened.getWorksheet('Liquidações')!.getCell('H7').value).toBe('000321-8');
    expect(reopened.getWorksheet('Liquidações')!.getCell('I7').value).toBe(
      'Materiais recebidos e conferidos.',
    );

    const history = reopened.getWorksheet('Histórico')!;
    expect(history.getCell('A7').value).toBeInstanceOf(Date);
    expect(history.getCell('B7').value).toBe('Operador de demonstração');
    expect(history.getCell('F7').value).toBe('Conferência do cadastro');
    expect(history.getCell('H7').value).toBe('000122-X');
    expect(history.getCell('I7').value).toBe('000123-X');
  });

  it('gera um arquivo separado e limitado ao parlamentar selecionado', async () => {
    const authorSnapshot: DemoExportSnapshot = {
      ...snapshot,
      scope: 'author',
      authorId: 'a1',
      authorName: 'Ana Ribeiro',
      authors: [snapshot.authors[0]],
    };
    const workbook = await buildReportWorkbook(authorSnapshot);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Recebimentos',
      'Saldos por ano',
      'Emendas',
      'Empenhos',
      'Liquidações',
      'Pagamentos e estornos',
      'Histórico',
    ]);
    expect(workbook.getWorksheet('Resumo')!.getCell('D14').value).toBe(100000.5);
    expect(workbook.getWorksheet('Resumo')!.getCell('A28').value).toBe(
      'Como interpretar a posição atual',
    );
    expect(workbook.getWorksheet('Recebimentos')!.getCell('A7').value).toBe(
      'Ana / Ribeiro: Saúde [demonstração]',
    );
  });

  it('gera PDFs válidos para os dois escopos, com uma página por seção detalhada', () => {
    const generalPdf = buildDemoPdf(snapshot);
    const generalBytes = new Uint8Array(generalPdf.output('arraybuffer'));
    expect(new TextDecoder().decode(generalBytes.slice(0, 5))).toBe('%PDF-');
    expect(generalPdf.getNumberOfPages()).toBe(9);

    const authorPdf = buildDemoPdf({
      ...snapshot,
      scope: 'author',
      authorId: 'a1',
      authorName: 'Ana Ribeiro',
      authors: [snapshot.authors[0]],
    });
    const authorBytes = new Uint8Array(authorPdf.output('arraybuffer'));
    expect(new TextDecoder().decode(authorBytes.slice(0, 5))).toBe('%PDF-');
    expect(authorPdf.getNumberOfPages()).toBe(8);
  });
});
