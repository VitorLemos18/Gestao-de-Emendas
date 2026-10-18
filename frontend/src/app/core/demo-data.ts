import { Amendment, AuditEntry, Author, DemoUser, Expense, Liquidation, Payment, Receipt } from './models';

export interface DemoData {
  authors: Author[];
  amendments: Amendment[];
  receipts: Receipt[];
  expenses: Expense[];
  liquidations: Liquidation[];
  payments: Payment[];
  users: DemoUser[];
  audit: AuditEntry[];
}

/** Dados fictícios do modelo aprovado. Partido/cargo/descrição são enriquecimentos da prévia. */
export function createDemoData(): DemoData {
  const authors: Author[] = [
    { id: 'kat', name: 'Delegada Katarina', party: '', office: 'Parlamentar · exemplo' },
    { id: 'yan', name: 'Yandra Moura', party: '', office: 'Parlamentar · exemplo' },
    { id: 'lae', name: 'Laércio Oliveira', party: '', office: 'Parlamentar · exemplo' },
  ];
  const amendments: Amendment[] = [
    { id: 'a1', authorId: 'kat', number: 'DEMO-001/2025', year: 2025, description: '' },
    { id: 'a2', authorId: 'kat', number: 'DEMO-002/2026', year: 2026, description: '' },
    { id: 'a3', authorId: 'yan', number: 'DEMO-003/2025', year: 2025, description: '' },
    { id: 'a4', authorId: 'yan', number: 'DEMO-004/2026', year: 2026, description: '' },
    { id: 'a5', authorId: 'lae', number: 'DEMO-005/2026', year: 2026, description: '' },
    { id: 'a6', authorId: 'lae', number: 'DEMO-006/2025', year: 2025, description: '' },
  ];
  const receipts: Receipt[] = [
    { id: 'r1', amendmentId: 'a1', type: 'Federal', action: 'PAP', expenseElement: '3.3.90.30 - Material de consumo', source: 'EX-FONTE-01', object: 'Aquisição de insumos', creditDate: '2025-12-01', account: '000123-X', amount: '100000.00', version: 1 },
    { id: 'r2', amendmentId: 'a2', type: 'Federal', action: 'PAP', expenseElement: '3.3.90.39 - Outros serviços', source: 'EX-FONTE-01', object: 'Locomoção', creditDate: '2026-06-01', account: '000124-X', amount: '300000.00', version: 1 },
    { id: 'r3', amendmentId: 'a3', type: 'Federal', action: 'PAP', expenseElement: '4.4.90.52 - Equipamentos', source: 'EX-FONTE-02', object: 'Aquisição de equipamentos', creditDate: '2025-11-10', account: '000125-X', amount: '150000.00', version: 1 },
    { id: 'r4', amendmentId: 'a4', type: 'Federal', action: 'PAP', expenseElement: '3.3.90.39 - Outros serviços', source: 'EX-FONTE-01', object: 'Serviços de internet', creditDate: '2026-04-01', account: '000126-X', amount: '80000.00', version: 1 },
    { id: 'r5', amendmentId: 'a5', type: 'Federal', action: 'PAP', expenseElement: '3.3.90.30 - Material de consumo', source: 'EX-FONTE-01', object: 'Insumos odontológicos', creditDate: '2026-07-01', account: '000127-X', amount: '200000.00', version: 1 },
    { id: 'r6', amendmentId: 'a6', type: 'Federal', action: 'PAP', expenseElement: '3.3.90.39 - Outros serviços', source: 'EX-FONTE-01', object: 'Locação de veículos', creditDate: '2025-10-10', account: '000128-X', amount: '120000.00', version: 1 },
  ];
  const expenses: Expense[] = [
    { id: 'e1', receiptId: 'r1', description: 'Material médico-hospitalar e de consumo', supplier: 'Fornecedores A e B · exemplo', document: 'EMP 000001', commitmentDate: '2025-12-02', amount: '30000.00' },
    { id: 'e2', receiptId: 'r2', description: 'Serviço de locomoção', supplier: 'Fornecedor C', document: 'EMP 000002', commitmentDate: '2026-06-05', amount: '100000.00' },
    { id: 'e3', receiptId: 'r3', description: 'Equipamentos para UBS', supplier: 'Fornecedor D', document: 'EMP 000003', commitmentDate: '2025-11-11', amount: '70000.00' },
    { id: 'e4', receiptId: 'r4', description: 'Serviço de internet', supplier: 'Fornecedor E', document: 'EMP 000004', commitmentDate: '2026-04-02', amount: '20000.00' },
    { id: 'e5', receiptId: 'r5', description: 'Material odontológico', supplier: 'Fornecedor F', document: 'EMP 000005', commitmentDate: '2026-07-02', amount: '30000.00' },
    { id: 'e6', receiptId: 'r6', description: 'Locação de veículos', supplier: 'Fornecedor G', document: 'EMP 000006', commitmentDate: '2025-10-11', amount: '30000.00' },
  ];
  const liquidations: Liquidation[] = [
    { id: 'l1', expenseId: 'e1', date: '2025-12-14', amount: '20000.00', document: 'LIQ 000021', destinationAccount: '000001-1' },
    { id: 'l2', expenseId: 'e1', date: '2026-03-09', amount: '10000.00', document: 'LIQ 000038', destinationAccount: '000001-1' },
    { id: 'l3', expenseId: 'e2', date: '2026-09-10', amount: '50000.00', document: 'LIQ 000109', destinationAccount: '000002-2' },
    { id: 'l4', expenseId: 'e2', date: '2026-10-10', amount: '25000.00', document: 'LIQ 000117', destinationAccount: '000002-2' },
    { id: 'l5', expenseId: 'e3', date: '2025-12-11', amount: '30000.00', document: 'LIQ 000017', destinationAccount: '000003-3' },
    { id: 'l6', expenseId: 'e3', date: '2026-04-14', amount: '40000.00', document: 'LIQ 000047', destinationAccount: '000003-3' },
    { id: 'l7', expenseId: 'e4', date: '2026-07-11', amount: '20000.00', document: 'LIQ 000081', destinationAccount: '000004-4' },
    { id: 'l8', expenseId: 'e5', date: '2026-08-09', amount: '30000.00', document: 'LIQ 000094', destinationAccount: '000005-5' },
    { id: 'l9', expenseId: 'e6', date: '2025-11-24', amount: '10000.00', document: 'LIQ 000012', destinationAccount: '000006-6' },
    { id: 'l10', expenseId: 'e6', date: '2026-05-11', amount: '20000.00', document: 'LIQ 000063', destinationAccount: '000006-6' },
  ];
  const payments: Payment[] = [
    { id: 'p1', expenseId: 'e1', date: '2025-12-15', amount: '20000.00', document: 'NF 000021', destinationAccount: '000001-1' },
    { id: 'p2', expenseId: 'e1', date: '2026-03-10', amount: '10000.00', document: 'NF 000038', destinationAccount: '000001-1' },
    { id: 'p3', expenseId: 'e2', date: '2026-09-15', amount: '50000.00', document: 'NF 000109', destinationAccount: '000002-2' },
    { id: 'p4', expenseId: 'e3', date: '2025-12-12', amount: '30000.00', document: 'NF 000017', destinationAccount: '000003-3' },
    { id: 'p5', expenseId: 'e3', date: '2026-04-15', amount: '40000.00', document: 'NF 000047', destinationAccount: '000003-3' },
    { id: 'p6', expenseId: 'e4', date: '2026-07-12', amount: '20000.00', document: 'NF 000081', destinationAccount: '000004-4' },
    { id: 'p7', expenseId: 'e5', date: '2026-08-10', amount: '30000.00', document: 'NF 000094', destinationAccount: '000005-5' },
    { id: 'p8', expenseId: 'e6', date: '2025-11-25', amount: '10000.00', document: 'NF 000012', destinationAccount: '000006-6' },
    { id: 'p9', expenseId: 'e6', date: '2026-05-12', amount: '20000.00', document: 'NF 000063', destinationAccount: '000006-6' },
  ];
  const users: DemoUser[] = [
    { id: 'u1', name: 'Administrador de exemplo', email: 'admin@example.test', role: 'ADMIN', active: true },
    { id: 'u2', name: 'Operador de exemplo', email: 'operador@example.test', role: 'OPERATOR', active: true },
    { id: 'u3', name: 'Consulta de exemplo', email: 'consulta@example.test', role: 'VIEWER', active: true },
  ];
  const audit: AuditEntry[] = [];
  function event(id: string, date: string, action: string, entityType: string, entityId: string, receiptId: string, description: string): void {
    audit.push({ id, timestamp: `${date}T12:00:00.000Z`, actor: 'Operador de exemplo', action, entityType, entityId, receiptId, description, changes: [] });
  }
  receipts.forEach(r => event(`audit-${r.id}`, r.creditDate, 'Recebimento cadastrado', 'receipt', r.id, r.id, r.object));
  expenses.forEach(e => event(`audit-${e.id}`, e.commitmentDate, 'Empenho registrado', 'expense', e.id, e.receiptId, e.description));
  liquidations.forEach(l => event(`audit-${l.id}`, l.date, 'Liquidação registrada', 'liquidation', l.id, expenses.find(e => e.id === l.expenseId)!.receiptId, l.document));
  payments.forEach(p => event(`audit-${p.id}`, p.date, 'Pagamento registrado', 'payment', p.id, expenses.find(e => e.id === p.expenseId)!.receiptId, p.document));
  audit.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id));
  return { authors, amendments, receipts, expenses, liquidations, payments, users, audit };
}
