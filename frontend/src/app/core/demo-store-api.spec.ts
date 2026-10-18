import { describe, expect, it, vi } from 'vitest';
import { DemoStore } from './demo-store';
import { ApiClient } from './api/api-client';
import { ApiUser } from './api/api-types';

describe('carregamento do backend Spring', () => {
  it('converte os contratos da API e reconstrói o saldo por recebimento', async () => {
    const admin: ApiUser = { id: 'user-1', name: 'Administradora', email: 'admin@example.test', role: 'ADMIN', active: true, must_change_password: false, version: 1 };
    const rows: Record<string, unknown> = {
      '/parliamentarians': page([{ id: 'par-1', name: 'Parlamentar' }]),
      '/amendments': page([{ id: 'amd-1', parliamentarian_id: 'par-1', number: '123/2026', year: 2026,
        mirror_document: { id: 'mirror-1', file_name: 'espelho.pdf', size_bytes: 1024, uploaded_at: '2026-01-01T10:00:00Z' } }]),
      '/receipts': page([{ id: 'rec-1', amendment_id: 'amd-1', type: 'Federal', source: 'Fundo', action: 'Atenção básica', expense_element: '3.3.90.30 - Material de consumo', object: 'Insumos', credit_date: '2026-01-10', bank_account: '0001-0', amount: money('10000.00'), version: 1 }]),
      '/expenses': page([{ id: 'exp-1', receipt_id: 'rec-1', description: 'Insumos', supplier: 'Fornecedor', document: 'EMP 01', commitment_date: '2026-01-11', amount: money('5000.00') }]),
      '/audit': page([]),
      '/users': page([admin]),
      '/expenses/exp-1': {
        expense: { id: 'exp-1', receipt_id: 'rec-1', description: 'Insumos', supplier: 'Fornecedor', document: 'EMP 01', commitment_date: '2026-01-11', amount: money('5000.00') },
        liquidations: [{ id: 'liq-1', expense_id: 'exp-1', date: '2026-01-12', amount: money('4000.00'), document: 'LIQ 01' }],
        payments: [{
          id: 'pay-1', expense_id: 'exp-1', date: '2026-01-13', amount: money('3000.00'),
          document: 'OF 01', protocol_number: 'PROC-2026-0001',
          payment_document: { id: 'pdf-1', file_name: 'oficio.pdf', size_bytes: 1200, uploaded_at: '2026-01-13T10:00:00Z' },
        }],
        reversals: [{ id: 'rev-1', payment_id: 'pay-1', date: '2026-01-14', reason: 'Devolução bancária' }],
      },
    };
    const fakeApi = { get: vi.fn(async <T>(path: string) => rows[path] as T) } as unknown as ApiClient;
    const store = new DemoStore(fakeApi);

    await store.loadBackend(admin);

    expect(store.liveMode).toBe(true);
    expect(store.authors()).toEqual([{ id: 'par-1', name: 'Parlamentar', party: '', office: '' }]);
    expect(store.amendments()[0].mirrorDocument).toEqual({
      id: 'mirror-1', fileName: 'espelho.pdf', sizeBytes: 1024, uploadedAt: '2026-01-01T10:00:00Z',
    });
    expect(store.receipts()[0]).toMatchObject({
      id: 'rec-1', amount: '10000.00', object: 'Insumos', action: 'Atenção básica',
      expenseElement: '3.3.90.30 - Material de consumo', source: 'Fundo',
    });
    expect(store.payments()[0].reversal).toEqual({ date: '2026-01-14', reason: 'Devolução bancária' });
    expect(store.payments()[0]).toMatchObject({
      protocolNumber: 'PROC-2026-0001',
      paymentDocument: { id: 'pdf-1', fileName: 'oficio.pdf', sizeBytes: 1200 },
    });
    expect(store.receiptSummary('rec-1')).toMatchObject({ closing: '10000.00', paid: '3000.00', reversed: '3000.00', committed: '5000.00', liquidated: '4000.00', toPay: '4000.00' });
  });
});

function page<T>(items: T[]) { return { items, total: items.length, offset: 0, limit: 200 }; }
function money(value: string) { return { value, formatted: `R$ ${value}`, currency: 'BRL' as const }; }
