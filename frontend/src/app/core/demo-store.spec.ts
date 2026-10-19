import { beforeEach, describe, expect, it } from 'vitest';
import { DemoStore } from './demo-store';

describe('simulação financeira isolada em memória', () => {
  let store: DemoStore;
  beforeEach(() => { store = new DemoStore(); });

  it('preserva o exemplo aprovado e a passagem entre exercícios', () => {
    expect(store.receipts()).toHaveLength(6);
    expect(store.expenses()).toHaveLength(6);
    expect(store.annualSummary(2025).closing).toBe('310000.00');
    expect(store.annualSummary(2026)).toEqual({
      opening: '310000.00', received: '580000.00', paid: '170000.00',
      reversed: '0.00', closing: '720000.00',
    });
    expect(store.receiptSummary('r2')).toMatchObject({
      committed: '100000.00', liquidated: '75000.00', toPay: '25000.00', closing: '250000.00',
    });
  });

  it('paga somente o objeto escolhido e guarda trilha de auditoria vinculada', () => {
    const r1 = store.receiptSummary('r1');
    const paymentId = store.addPayment({ expenseId: 'e2', date: '2026-10-16', amount: '25000.00', document: 'OB 000117' });
    expect(store.receiptSummary('r2').closing).toBe('225000.00');
    expect(store.receiptSummary('r2').toPay).toBe('0.00');
    expect(store.receiptSummary('r1')).toEqual(r1);
    expect(store.receiptAudit('r2')[0].entityId).toBe(paymentId);
  });

  it('mantém caixa inalterado ao empenhar e liquidar e respeita limites distintos', () => {
    const id = store.addExpense({ receiptId: 'r2', description: 'Nova parcela', supplier: 'Empresa demonstrativa', document: 'EMP 000200', commitmentDate: '2026-10-15', amount: '10000.00' });
    store.addLiquidation({ expenseId: id, date: '2026-10-15', amount: '6000.00', document: 'LIQ 000200', destinationAccount: '000123-4' });
    expect(store.receiptSummary('r2').closing).toBe('250000.00');
    expect(store.expenseSummary(id).toPay).toBe('6000.00');
    expect(() => store.addLiquidation({ expenseId: id, date: '2026-10-16', amount: '4000.01', document: 'LIQ 000201', destinationAccount: '000123-4' })).toThrow(/empenhado/i);
    expect(() => store.addExpense({ receiptId: 'r2', description: 'Excesso', supplier: 'Empresa', document: 'EMP 000201', commitmentDate: '2026-10-15', amount: '190000.01' })).toThrow(/recebimento/i);
    expect(() => store.addPayment({ expenseId: id, date: '2026-10-16', amount: '6000.01', document: 'OB 000200', destinationAccount: '000123-4' })).toThrow(/liquidado/i);
  });

  it('rejeita uso de liquidação futura e permite a mesma data da liquidação', () => {
    expect(() => store.addPayment({ expenseId: 'e2', date: '2026-10-09', amount: '25000.00', document: 'OB cedo' })).toThrow(/liquidado/i);
    expect(store.addPayment({ expenseId: 'e2', date: '2026-10-10', amount: '25000.00', document: 'OB mesmo dia' })).toBeTruthy();
  });

  it('estorna uma única vez no ano da devolução e bloqueia reutilização retroativa', () => {
    const payment = store.payments().find(p => p.expenseId === 'e1' && p.date.startsWith('2025'))!;
    store.reversePayment(payment.id, '2026-01-02', 'Devolução integral demonstrativa');
    expect(store.receiptSummary('r1', 2025).closing).toBe('80000.00');
    expect(store.receiptSummary('r1', 2026)).toMatchObject({ opening: '80000.00', reversed: '20000.00', closing: '90000.00' });
    expect(() => store.reversePayment(payment.id, '2026-01-03', 'Segunda devolução')).toThrow(/já.*estornado/i);
    expect(() => store.addPayment({ expenseId: 'e1', date: '2025-12-16', amount: '20000.00', document: 'OB retroativa' })).toThrow(/liquidado/i);
    expect(store.addPayment({ expenseId: 'e1', date: '2026-01-02', amount: '20000.00', document: 'OB após devolução' })).toBeTruthy();
    expect(store.expenseSummary('e1').committed).toBe('30000.00');
    expect(store.expenseSummary('e1').liquidated).toBe('30000.00');
  });

  it('confere validade de datas, precisão, positividade e limite de cada lançamento', () => {
    const receipt = store.receipts()[0];
    const { id, version, ...input } = receipt;
    expect(() => store.addReceipt({ ...input, creditDate: '2026-02-30' })).toThrow(/data/i);
    expect(() => store.addReceipt({ ...input, amount: '1.001' })).toThrow(/casas|decimal/i);
    expect(() => store.addReceipt({ ...input, amount: '0.00' })).toThrow(/zero/i);
    expect(() => store.addReceipt({ ...input, amount: '1000000000000.00' })).toThrow(/limite/i);
    const added = store.addReceipt({ ...input, amount: '999999999999.99', account: '00001-0' });
    expect(store.receipts().find(r => r.id === added)?.account).toBe('00001-0');
  });

  it('bloqueia escritas e exportação em Consulta e administração em Operador', () => {
    store.setProfile('VIEWER');
    expect(store.canWrite()).toBe(false);
    expect(store.canExport()).toBe(false);
    expect(() => store.addPayment({ expenseId: 'e2', date: '2026-10-16', amount: '1.00', document: 'OB' })).toThrow(/perfil/i);
    expect(() => store.addAuthor({ name: 'Exemplo', party: '', office: '' })).toThrow(/perfil/i);
    store.setProfile('OPERATOR');
    expect(store.canWrite()).toBe(true);
    expect(store.isAdmin()).toBe(false);
    expect(() => store.saveUser({ name: 'Outra pessoa', email: 'outro@example.test', role: 'VIEWER', active: true })).toThrow(/administrador/i);
  });

  it('permite ao administrador corrigir o crédito com justificativa e registra antes/depois', () => {
    const before = store.receipts().find(r => r.id === 'r2')!;
    store.correctReceipt('r2', { amendmentId: 'a4', type: before.type, action: before.action, expenseElement: before.expenseElement, source: before.source, object: 'Locomoção de pacientes', creditDate: '2026-05-01', account: '000124-X', amount: '320000.00' }, 'Correção conforme documento oficial');
    expect(store.receipts().find(r => r.id === 'r2')).toMatchObject({ amendmentId: 'a4', object: 'Locomoção de pacientes', creditDate: '2026-05-01', amount: '320000.00', version: before.version + 1 });
    expect(store.receiptAudit('r2')[0].changes).toContainEqual({ field: 'Valor recebido', before: '300000.00', after: '320000.00' });
    expect(store.receiptAudit('r2')[0].changes).toContainEqual({ field: 'Emenda / parlamentar', before: 'Delegada Katarina · DEMO-002/2026', after: 'Yandra Moura · DEMO-004/2026' });
    expect(() => store.correctReceipt('r2', { amount: '1.00' }, 'abc')).toThrow(/motivo/i);
    expect(() => store.correctReceipt('r2', { amount: '10000.00' }, 'Correção do valor empenhado')).toThrow(/menor que o total já empenhado/i);
    store.setProfile('OPERATOR');
    expect(() => store.correctReceipt('r2', { object: 'Alteração' }, 'Motivo suficiente')).toThrow(/administrador/i);
  });

  it('não desativa o último administrador e valida unicidade dos cadastros', () => {
    const admin = store.currentUser();
    const { id, ...input } = admin;
    expect(() => store.saveUser({ ...input, active: false }, id)).toThrow(/administrador ativo/i);
    const author = store.authors()[0];
    expect(() => store.addAuthor({ name: author.name, party: author.party, office: author.office })).toThrow(/cadastrado|existe/i);
    const amendment = store.amendments()[0];
    expect(() => store.addAmendment({ authorId: store.authors()[1].id, number: amendment.number, year: amendment.year, description: '' })).toThrow(/cadastrad|existe/i);
  });

  it('permite apenas perfil e situação na correção de usuário já cadastrado', () => {
    const { id, ...input } = store.users().find(u => u.role === 'VIEWER')!;
    expect(() => store.saveUser({ ...input, email: 'outro@example.test' }, id)).toThrow(/nome e e-mail/i);
    store.saveUser({ ...input, role: 'OPERATOR' }, id, 'Ampliação das responsabilidades de operação');
    expect(store.users().find(u => u.id === id)?.role).toBe('OPERATOR');
  });

  it('exige um motivo ao corrigir perfil ou situação de um acesso', () => {
    const { id, ...input } = store.users().find(u => u.role === 'VIEWER')!;
    expect(() => store.saveUser({ ...input, role: 'OPERATOR' }, id)).toThrow(/motivo/i);
    const reason = 'Atendimento à nova função da equipe';
    store.saveUser({ ...input, role: 'OPERATOR' }, id, reason);
    expect(store.audit()[0]).toMatchObject({ entityId: id, reason, changes: [{ field: 'Perfil', before: 'VIEWER', after: 'OPERATOR' }] });
  });

  it('extrato soma a abertura correta e preserva sinais e estornos', () => {
    const lines = store.ledger('r1', 2026);
    expect(lines[0]).toMatchObject({ type: 'Pagamento', amount: '-10000.00', balance: '70000.00' });
    expect(lines.at(-1)?.balance).toBe(store.receiptSummary('r1', 2026).closing);
    expect(store.annualSummary(2026, 'kat').closing).toBe('320000.00');
  });

  it('restaura dados e perfil sem persistência ou dados de outra instância', () => {
    store.addAuthor({ name: 'Autor temporário', party: '', office: '' });
    expect(new DemoStore().authors()).toHaveLength(3);
    store.setProfile('VIEWER');
    store.year.set(2025);
    store.resetDemo();
    expect(store.authors()).toHaveLength(3);
    expect(store.year()).toBe(2026);
    expect(store.currentUser().role).toBe('ADMIN');
    expect(store.annualSummary().closing).toBe('720000.00');
  });
});
