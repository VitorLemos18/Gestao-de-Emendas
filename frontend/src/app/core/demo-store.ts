import { computed, Injectable, Optional, signal } from '@angular/core';
import { createDemoData, DemoData } from './demo-data';
import {
  Amendment,
  AnnualSummary,
  AuditEntry,
  Author,
  DemoUser,
  Expense,
  ExpenseSummary,
  LedgerLine,
  Liquidation,
  Payment,
  Receipt,
  ReceiptSummary,
  Role,
} from './models';
import { brl, fromCents, toCents } from './money';
import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj';
import { ApiClient } from './api/api-client';
import {
  ApiAmendment,
  ApiAuditEntry,
  ApiExpense,
  ApiExpenseDetail,
  ApiPage,
  ApiParliamentarian,
  ApiPosting,
  ApiReceipt,
  ApiReversal,
  ApiUser,
} from './api/api-types';

type ReceiptCorrection = Partial<
  Pick<Receipt, 'amendmentId' | 'type' | 'action' | 'expenseElement' | 'source' | 'object' | 'creditDate' | 'account' | 'amount'>
>;
type CashEvent = Omit<LedgerLine, 'amount' | 'balance'> & { cents: bigint };
const MAX_AMOUNT = 99999999999999n;

@Injectable({ providedIn: 'root' })
export class DemoStore {
  private readonly data = signal<DemoData>(createDemoData());
  private readonly currentUserId = signal('u1');
  private readonly sessionUser = signal<DemoUser | null>(null);
  private readonly backendUser = signal<ApiUser | null>(null);
  private readonly pendingKeys = new Map<string, string>();
  liveMode = false;
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly authors = computed(() => this.data().authors);
  readonly amendments = computed(() => this.data().amendments);
  readonly receipts = computed(() => this.data().receipts);
  readonly expenses = computed(() => this.data().expenses);
  readonly liquidations = computed(() => this.data().liquidations);
  readonly payments = computed(() => this.data().payments);
  readonly users = computed(() => this.data().users);
  readonly audit = computed(() => this.data().audit);
  readonly currentUser = computed(
    () =>
      this.sessionUser() ??
      this.users().find((u) => u.id === this.currentUserId()) ?? {
        id: '',
        name: '',
        email: '',
        role: 'VIEWER' as Role,
        active: false,
      },
  );
  readonly year = signal(2026);
  readonly isAdmin = computed(
    () => this.currentUser().active && this.currentUser().role === 'ADMIN',
  );
  readonly canWrite = computed(
    () => this.currentUser().active && this.currentUser().role !== 'VIEWER',
  );
  readonly canExport = computed(() => this.canWrite());

  constructor(@Optional() private readonly api: ApiClient | null = null) {}

  async loadBackend(user: ApiUser): Promise<void> {
    if (!this.api) throw new Error('A conexão com o serviço não está disponível.');
    if (!this.liveMode) {
      this.liveMode = true;
      this.data.set(emptyData());
      this.loaded.set(false);
    }
    this.loading.set(true);
    this.loadError.set('');
    this.backendUser.set(user);
    this.sessionUser.set(mapUser(user));
    try {
      const [authors, amendments, receipts, expenses, audit] = await Promise.all([
        this.all<ApiParliamentarian>('/parliamentarians'),
        this.all<ApiAmendment>('/amendments'),
        this.all<ApiReceipt>('/receipts'),
        this.all<ApiExpense>('/expenses'),
        this.all<ApiAuditEntry>('/audit'),
      ]);
      const details = await Promise.all(
        expenses.map((e) => this.api!.get<ApiExpenseDetail>(`/expenses/${e.id}`)),
      );
      let users: DemoUser[] = [mapUser(user)];
      if (user.role === 'ADMIN') users = (await this.all<ApiUser>('/users')).map(mapUser);
      const reversals = new Map<string, ApiReversal>();
      for (const detail of details)
        for (const reversal of detail.reversals) reversals.set(reversal.payment_id, reversal);
      this.data.set({
        authors: authors.map((a) => ({ id: a.id, name: a.name, party: '', office: '' })),
        amendments: amendments.map((a) => ({
          id: a.id,
          authorId: a.parliamentarian_id,
          number: a.number,
          year: a.year,
          description: '',
          mirrorDocument: a.mirror_document
            ? {
                id: a.mirror_document.id,
                fileName: a.mirror_document.file_name,
                sizeBytes: a.mirror_document.size_bytes,
                uploadedAt: a.mirror_document.uploaded_at,
              }
            : null,
        })),
        receipts: receipts.map(mapReceipt),
        expenses: expenses.map(mapExpense),
        liquidations: details.flatMap((d) => d.liquidations.map(mapPosting)),
        payments: details.flatMap((d) =>
          d.payments.map((p) => ({
            ...mapPayment(p),
            reversal: reversals.has(p.id)
              ? { date: reversals.get(p.id)!.date, reason: reversals.get(p.id)!.reason }
              : undefined,
          })),
        ),
        users,
        audit: audit.map(mapAudit),
      });
      this.loaded.set(true);
    } catch (error) {
      this.loadError.set(
        error instanceof Error ? error.message : 'Não foi possível carregar os dados.',
      );
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async refreshBackend(): Promise<void> {
    const user = this.backendUser();
    if (user) await this.loadBackend(user);
  }

  clearBackend(): void {
    if (!this.liveMode) return;
    this.data.set(emptyData());
    this.sessionUser.set(null);
    this.backendUser.set(null);
    this.loaded.set(false);
  }

  async createAuthor(name: string): Promise<string> {
    if (!this.api) return this.addAuthor({ name, party: '', office: '' });
    const result = await this.api.post<ApiParliamentarian>('/parliamentarians', { name });
    await this.refreshBackend();
    return result.id;
  }
  async createAmendment(input: Omit<Amendment, 'id'>, mirrorPdf?: File): Promise<string> {
    if (!this.api) {
      if (mirrorPdf) throw new Error('O anexo em PDF exige conexão com o serviço.');
      return this.addAmendment(input);
    }
    const body = {
      parliamentarian_id: input.authorId,
      number: input.number,
      year: input.year,
    };
    const result = mirrorPdf
      ? await this.commandForm<ApiAmendment>(
          '/amendments', body, mirrorPdf, 'amendment', 'mirror_document',
        )
      : await this.api.post<ApiAmendment>('/amendments', body);
    await this.refreshBackend();
    return result.id;
  }
  async createReceipt(input: Omit<Receipt, 'id' | 'version'>): Promise<string> {
    if (!this.api) return this.addReceipt(input);
    const result = await this.command<ApiReceipt>('/receipts', {
      amendment_id: input.amendmentId,
      type: input.type,
      action: input.action,
      expense_element: input.expenseElement,
      source: input.source,
      object: input.object,
      credit_date: input.creditDate,
      bank_account: input.account,
      amount: input.amount,
    });
    return result.id;
  }
  async correctReceiptBackend(id: string, patch: ReceiptCorrection, reason: string): Promise<void> {
    if (!this.api) return this.correctReceipt(id, patch, reason);
    const before = this.requireReceipt(id);
    await this.api.patch<ApiReceipt>(`/receipts/${id}`, {
      amendment_id: patch.amendmentId ?? before.amendmentId,
      type: patch.type ?? before.type,
      action: patch.action ?? before.action,
      expense_element: patch.expenseElement ?? before.expenseElement,
      source: patch.source ?? before.source,
      object: patch.object ?? before.object,
      credit_date: patch.creditDate ?? before.creditDate,
      bank_account: patch.account ?? before.account,
      amount: patch.amount ?? before.amount,
      version: before.version,
      reason,
    });
    await this.refreshBackend();
  }
  async createExpense(input: Omit<Expense, 'id'>, commitmentPdf?: File): Promise<string> {
    if (!this.api) {
      if (commitmentPdf) {
        throw new Error('O anexo em PDF exige conexão com o serviço.');
      }
      return this.addExpense(input);
    }
    const body = {
      receipt_id: input.receiptId,
      description: input.description,
      supplier: input.supplier,
      cnpj: input.cnpj ? normalizeCnpj(input.cnpj) : null,
      document: input.document,
      commitment_date: input.commitmentDate,
      amount: input.amount,
      observations: input.observations?.trim() || null,
    };
    const result = commitmentPdf
      ? await this.commandForm<ApiExpense>('/expenses', body, commitmentPdf)
      : await this.command<ApiExpense>('/expenses', body);
    return result.id;
  }
  async createLiquidation(input: Omit<Liquidation, 'id'>): Promise<string> {
    if (!this.api) return this.addLiquidation(input);
    const result = await this.command<ApiPosting>(`/expenses/${input.expenseId}/liquidations`, {
      date: input.date,
      amount: input.amount,
      document: input.document,
      destination_account: input.destinationAccount?.trim() || '',
      observations: input.observations?.trim() || null,
    });
    return result.id;
  }
  async createPayment(input: Omit<Payment, 'id' | 'reversal' | 'paymentDocument'>, paymentPdf?: File): Promise<string> {
    if (!this.api) {
      if (paymentPdf) throw new Error('O Ofício em PDF precisa de uma conexão ativa para ser salvo.');
      return this.addPayment(input);
    }
    const body = {
      date: input.date,
      amount: input.amount,
      document: input.document,
      destination_account: input.destinationAccount?.trim() || '',
      protocol_number: input.protocolNumber,
      observations: input.observations?.trim() || null,
    };
    const path = `/expenses/${input.expenseId}/payments`;
    const result = paymentPdf
      ? await this.commandForm<ApiPosting>(path, body, paymentPdf, 'payment', 'payment_document')
      : await this.command<ApiPosting>(path, body);
    return result.id;
  }
  async correctExpenseBackend(
    id: string,
    input: Omit<Expense, 'id' | 'receiptId' | 'commitmentDocument'>,
    reason: string,
    commitmentPdf?: File,
  ): Promise<void> {
    this.reason(reason);
    const before = this.requireExpense(id);
    if (!this.api) {
      this.assertWrite(true);
      if (commitmentPdf) throw new Error('A substituição do PDF exige conexão com o serviço.');
      this.record({ expenses: this.expenses().map((item) => item.id === id
        ? { ...item, ...input, version: (item.version ?? 1) + 1,
            cnpj: input.cnpj ? formatCnpj(input.cnpj) : null } : item) },
      'UPDATE', 'expense', id, 'Correção de empenho', before.receiptId, reason);
      return;
    }
    const body = {
      description: input.description, supplier: input.supplier,
      cnpj: input.cnpj ? normalizeCnpj(input.cnpj) : null,
      document: input.document, commitment_date: input.commitmentDate,
      amount: input.amount, observations: input.observations?.trim() || null,
      version: before.version ?? 1, reason,
    };
    if (commitmentPdf) {
      const form = new FormData();
      form.append('expense', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      form.append('commitment_document', commitmentPdf, commitmentPdf.name);
      await this.api.patchForm<ApiExpense>(`/expenses/${id}`, form);
    } else await this.api.patch<ApiExpense>(`/expenses/${id}`, body);
    await this.refreshBackend();
  }
  async correctLiquidationBackend(id: string, input: Omit<Liquidation, 'id'>, reason: string): Promise<void> {
    this.reason(reason);
    if (!this.api) {
      this.assertWrite(true);
      const before = this.liquidations().find((item) => item.id === id);
      if (!before) throw new Error('Liquidação não encontrada.');
      this.record({ liquidations: this.liquidations().map((item) => item.id === id
        ? { ...item, ...input, version: (item.version ?? 1) + 1 } : item) },
        'UPDATE', 'liquidation', id, 'Correção de liquidação', input.expenseId, reason);
      return;
    }
    const before = this.liquidations().find((item) => item.id === id);
    if (!before) throw new Error('Liquidação não encontrada.');
    await this.api.patch(`/liquidations/${id}`, {
      date: input.date, amount: input.amount, document: input.document,
      destination_account: input.destinationAccount?.trim() || '',
      observations: input.observations?.trim() || null, version: before.version ?? 1, reason,
    });
    await this.refreshBackend();
  }
  async correctPaymentBackend(
    id: string,
    input: Omit<Payment, 'id' | 'reversal' | 'paymentDocument'>,
    reason: string,
    paymentPdf?: File,
  ): Promise<void> {
    this.reason(reason);
    const before = this.payments().find((item) => item.id === id);
    if (!before) throw new Error('Pagamento não encontrado.');
    if (!this.api) {
      this.assertWrite(true);
      if (paymentPdf) throw new Error('A substituição do PDF exige conexão com o serviço.');
      this.record({ payments: this.payments().map((item) => item.id === id
        ? { ...item, ...input, version: (item.version ?? 1) + 1,
            reversal: item.reversal, paymentDocument: item.paymentDocument } : item) },
      'UPDATE', 'payment', id, 'Correção de pagamento', input.expenseId, reason);
      return;
    }
    const body = {
      date: input.date, amount: input.amount, document: input.document,
      destination_account: input.destinationAccount?.trim() || '',
      protocol_number: input.protocolNumber?.trim() || '',
      observations: input.observations?.trim() || null,
      version: before.version ?? 1, reason,
    };
    if (paymentPdf) {
      const form = new FormData();
      form.append('payment', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      form.append('payment_document', paymentPdf, paymentPdf.name);
      await this.api.patchForm<ApiPosting>(`/payments/${id}`, form);
    } else await this.api.patch<ApiPosting>(`/payments/${id}`, body);
    await this.refreshBackend();
  }
  async reversePaymentBackend(id: string, date: string, reason: string): Promise<void> {
    if (!this.api) return this.reversePayment(id, date, reason);
    await this.command<ApiReversal>(`/payments/${id}/reversals`, { date, reason });
  }
  async exportExcel(year: number, parliamentarianId?: string): Promise<Blob> {
    if (!this.api) throw new Error('A exportação não está disponível.');
    const blob = await this.api.postBlob('/exports/excel', {
      year,
      parliamentarian_id: parliamentarianId,
    });
    await this.refreshBackend();
    return blob;
  }
  async saveUserBackend(
    input: Omit<DemoUser, 'id'>,
    id?: string,
    reason?: string,
    password?: string,
  ): Promise<string> {
    if (!this.api) return this.saveUser(input, id, reason);
    if (id) {
      const version = this.users().find((u) => u.id === id)?.version ?? 1;
      const result = await this.api.patch<ApiUser>(`/users/${id}`, {
        role: input.role,
        active: input.active,
        version,
        reason,
      });
      if (id === this.backendUser()?.id) {
        this.sessionUser.set(mapUser(result));
        this.data.update((data) => ({
          ...data,
          users: data.users.map((u) => (u.id === id ? mapUser(result) : u)),
        }));
        return id;
      }
    } else {
      await this.api.post<ApiUser>('/users', {
        name: input.name,
        email: input.email,
        password,
        role: input.role,
      });
    }
    await this.refreshBackend();
    return id ?? this.users().find((u) => u.email === input.email)?.id ?? '';
  }

  authorName(id: string): string {
    return this.authors().find((a) => a.id === id)?.name ?? 'Parlamentar não encontrado';
  }

  receiptAuthor(receiptId: string): Author | undefined {
    const receipt = this.receipts().find((r) => r.id === receiptId);
    const amendment = this.amendments().find((a) => a.id === receipt?.amendmentId);
    return this.authors().find((a) => a.id === amendment?.authorId);
  }

  expenseDestinationAccount(expenseId: string): string | null {
    const accounts = new Set(
      this.liquidations()
        .filter((item) => item.expenseId === expenseId)
        .map((item) => item.destinationAccount?.trim())
        .filter((account): account is string => Boolean(account)),
    );
    return accounts.size === 1 ? [...accounts][0] : null;
  }

  receiptSummary(receiptId: string, year = this.year()): ReceiptSummary {
    const receipt = this.requireReceipt(receiptId);
    const cutoff = this.cutoff(year);
    const annual = this.balance(this.cashEvents(receiptId), year);
    const expenses = this.expenses().filter(
      (e) => e.receiptId === receiptId && e.commitmentDate <= cutoff,
    );
    const summaries = expenses.map((e) => this.expenseSummary(e.id, year));
    const committed = this.sum(summaries.map((s) => s.committed));
    const liquidated = this.sum(summaries.map((s) => s.liquidated));
    return {
      ...annual,
      committed: fromCents(committed),
      liquidated: fromCents(liquidated),
      toCommit: fromCents(
        (receipt.creditDate <= cutoff ? toCents(receipt.amount) : 0n) - committed,
      ),
      toLiquidate: fromCents(committed - liquidated),
      toPay: fromCents(this.sum(summaries.map((s) => s.toPay))),
    };
  }

  annualSummary(year = this.year(), authorId?: string): AnnualSummary {
    const cutoff = this.cutoff(year);
    const totals = { opening: 0n, received: 0n, paid: 0n, reversed: 0n, closing: 0n };
    for (const receipt of this.receipts()) {
      if (
        receipt.creditDate > cutoff ||
        (authorId && this.receiptAuthor(receipt.id)?.id !== authorId)
      )
        continue;
      const summary = this.receiptSummary(receipt.id, year);
      for (const key of Object.keys(totals) as (keyof AnnualSummary)[])
        totals[key] += toCents(summary[key]);
    }
    return {
      opening: fromCents(totals.opening),
      received: fromCents(totals.received),
      paid: fromCents(totals.paid),
      reversed: fromCents(totals.reversed),
      closing: fromCents(totals.closing),
    };
  }

  expenseSummary(expenseId: string, year = this.year()): ExpenseSummary {
    const expense = this.requireExpense(expenseId);
    const cutoff = this.cutoff(year);
    const committed = expense.commitmentDate <= cutoff ? toCents(expense.amount) : 0n;
    const liquidated = this.sum(
      this.liquidations()
        .filter((l) => l.expenseId === expenseId && l.date <= cutoff)
        .map((l) => l.amount),
    );
    const payments = this.payments().filter((p) => p.expenseId === expenseId && p.date <= cutoff);
    const grossPaid = this.sum(payments.map((p) => p.amount));
    const reversed = this.sum(
      payments.filter((p) => p.reversal && p.reversal.date <= cutoff).map((p) => p.amount),
    );
    const paid = grossPaid - reversed;
    return {
      committed: fromCents(committed),
      liquidated: fromCents(liquidated),
      paid: fromCents(paid),
      grossPaid: fromCents(grossPaid),
      reversed: fromCents(reversed),
      toLiquidate: fromCents(committed - liquidated),
      toPay: fromCents(liquidated - paid),
    };
  }

  ledger(receiptId: string, year = this.year()): LedgerLine[] {
    this.requireReceipt(receiptId);
    let balance = toCents(this.receiptSummary(receiptId, year).opening);
    // O domínio confere o total diário; a prévia ordena entradas antes de saídas no mesmo dia.
    return this.cashEvents(receiptId)
      .filter((e) => Number(e.date.slice(0, 4)) === year)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.cents > 0n ? 0 : 1) - (b.cents > 0n ? 0 : 1) ||
          a.id.localeCompare(b.id),
      )
      .map(({ cents, ...event }) => {
        balance += cents;
        return { ...event, amount: fromCents(cents), balance: fromCents(balance) };
      });
  }

  receiptAudit(receiptId: string): AuditEntry[] {
    return this.audit().filter((e) => e.receiptId === receiptId);
  }

  addAuthor(input: Omit<Author, 'id'>): string {
    this.assertWrite();
    const name = this.text(input.name, 'Nome do parlamentar', 160);
    if (
      this.authors().some(
        (a) => a.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
      )
    )
      throw new Error('Este parlamentar já está cadastrado.');
    const author = { ...input, name, id: crypto.randomUUID() };
    this.record(
      { authors: [...this.authors(), author] },
      'Parlamentar cadastrado',
      'parliamentarian',
      author.id,
      name,
    );
    return author.id;
  }

  addAmendment(input: Omit<Amendment, 'id'>): string {
    this.assertWrite();
    if (!this.authors().some((a) => a.id === input.authorId))
      throw new Error('Selecione um parlamentar cadastrado.');
    this.cutoff(input.year);
    const number = this.text(input.number, 'Número da emenda', 100);
    if (this.amendments().some((a) => a.number === number && a.year === input.year))
      throw new Error('Esta emenda já está cadastrada neste ano.');
    const amendment = { ...input, number, id: crypto.randomUUID() };
    this.record(
      { amendments: [...this.amendments(), amendment] },
      'Emenda cadastrada',
      'amendment',
      amendment.id,
      number,
    );
    return amendment.id;
  }

  addReceipt(input: Omit<Receipt, 'id' | 'version'>): string {
    this.assertWrite();
    if (!this.amendments().some((a) => a.id === input.amendmentId))
      throw new Error('Selecione uma emenda cadastrada.');
    this.date(input.creditDate);
    const amount = this.positive(input.amount);
    const receipt: Receipt = {
      ...input,
      ...this.receiptFields(input),
      amount: fromCents(amount),
      id: crypto.randomUUID(),
      version: 1,
    };
    this.record(
      { receipts: [...this.receipts(), receipt] },
      'Recebimento cadastrado',
      'receipt',
      receipt.id,
      `${receipt.object} · ${brl(receipt.amount)}`,
      receipt.id,
    );
    return receipt.id;
  }

  correctReceipt(id: string, patch: ReceiptCorrection, reason: string): void {
    this.assertWrite(true);
    this.reason(reason);
    const before = this.requireReceipt(id);
    const labels = {
      amendmentId: 'Emenda / parlamentar',
      type: 'Tipo',
      action: 'Ação',
      expenseElement: 'Elemento de despesa',
      source: 'Fonte de recurso',
      object: 'Objeto',
      creditDate: 'Data do crédito',
      account: 'Conta bancária',
      amount: 'Valor recebido',
    };
    if (patch.amendmentId && !this.amendments().some((a) => a.id === patch.amendmentId))
      throw new Error('Selecione uma emenda cadastrada.');
    if (patch.creditDate) this.date(patch.creditDate);
    const nextAmount = patch.amount === undefined ? before.amount : fromCents(this.positive(patch.amount));
    const commitments = this.sum(this.expenses().filter((e) => e.receiptId === id).map((e) => e.amount));
    if (toCents(nextAmount) < commitments)
      throw new Error('O novo valor não pode ser menor que o total já empenhado.');
    const nextDate = patch.creditDate ?? before.creditDate;
    if (this.expenses().some((e) => e.receiptId === id && e.commitmentDate < nextDate))
      throw new Error('A nova data do crédito não pode ser posterior a um empenho já registrado.');
    const after = {
      ...before,
      ...patch,
      ...this.receiptFields({ ...before, ...patch }),
      amount: nextAmount,
      version: before.version + 1,
    };
    const changes = (Object.keys(labels) as (keyof typeof labels)[])
      .filter((key) => before[key] !== after[key])
      .map((key) => ({
        field: labels[key],
        before: key === 'amendmentId' ? this.amendmentLabel(before.amendmentId) : before[key] ?? '',
        after: key === 'amendmentId' ? this.amendmentLabel(after.amendmentId) : after[key] ?? '',
      }));
    this.record(
      { receipts: this.receipts().map((r) => (r.id === id ? after : r)) },
      'Dados do recebimento corrigidos',
      'receipt',
      id,
      after.object,
      id,
      reason,
      changes,
    );
  }

  private amendmentLabel(id: string): string {
    const amendment = this.amendments().find((item) => item.id === id);
    const author = amendment && this.authors().find((item) => item.id === amendment.authorId);
    const number = amendment && /\/?\d{4}$/.test(amendment.number)
      ? amendment.number
      : `${amendment?.number}/${amendment?.year}`;
    return amendment ? `${author?.name ?? 'Parlamentar'} · ${number}` : id;
  }

  addExpense(input: Omit<Expense, 'id'>): string {
    this.assertWrite();
    const receipt = this.requireReceipt(input.receiptId);
    this.date(input.commitmentDate, receipt.creditDate);
    const amount = this.positive(input.amount);
    const cnpj = input.cnpj ? normalizeCnpj(input.cnpj) : null;
    if (cnpj && !isValidCnpj(cnpj)) throw new Error('Informe um CNPJ válido.');
    if (
      this.sum(
        this.expenses()
          .filter((e) => e.receiptId === receipt.id)
          .map((e) => e.amount),
      ) +
        amount >
      toCents(receipt.amount)
    )
      throw new Error('Os empenhos excedem o valor original deste recebimento.');
    const expense: Expense = {
      ...input,
      cnpj: cnpj ? formatCnpj(cnpj) : null,
      id: crypto.randomUUID(),
      amount: fromCents(amount),
      description: this.text(input.description, 'Descrição', 2000),
      supplier: this.text(input.supplier, 'Fornecedor', 200),
      document: this.text(input.document, 'Documento', 100),
      observations: input.observations?.trim() || null,
    };
    this.record(
      { expenses: [...this.expenses(), expense] },
      'Empenho registrado',
      'expense',
      expense.id,
      `${expense.description} · ${brl(expense.amount)}`,
      receipt.id,
    );
    return expense.id;
  }

  addLiquidation(input: Omit<Liquidation, 'id'>): string {
    this.assertWrite();
    const expense = this.requireExpense(input.expenseId);
    this.date(input.date, expense.commitmentDate);
    const amount = this.positive(input.amount);
    const destinationAccount = this.text(input.destinationAccount ?? '', 'Conta de destino', 100);
    const previousAccount = this.expenseDestinationAccount(expense.id);
    if (previousAccount && previousAccount !== destinationAccount)
      throw new Error('Use a mesma conta de destino já registrada para este empenho.');
    if (
      this.sum(
        this.liquidations()
          .filter((l) => l.expenseId === expense.id)
          .map((l) => l.amount),
      ) +
        amount >
      toCents(expense.amount)
    )
      throw new Error('A liquidação excede o valor empenhado.');
    const liquidation = {
      ...input,
      id: crypto.randomUUID(),
      amount: fromCents(amount),
      document: this.text(input.document, 'Documento', 100),
      destinationAccount,
      observations: input.observations?.trim() || null,
    };
    this.record(
      { liquidations: [...this.liquidations(), liquidation] },
      'Liquidação registrada',
      'liquidation',
      liquidation.id,
      `${liquidation.document} · ${brl(liquidation.amount)}`,
      expense.receiptId,
    );
    return liquidation.id;
  }

  addPayment(input: Omit<Payment, 'id' | 'reversal'>): string {
    this.assertWrite();
    const expense = this.requireExpense(input.expenseId);
    const receipt = this.requireReceipt(expense.receiptId);
    this.date(input.date, expense.commitmentDate);
    const recordedAccount = this.expenseDestinationAccount(expense.id);
    const destinationAccount = this.text(
      input.destinationAccount?.trim() || recordedAccount || '',
      'Conta de destino',
      100,
    );
    if (recordedAccount && recordedAccount !== destinationAccount)
      throw new Error('A conta do pagamento deve ser a mesma registrada na liquidação.');
    const payment: Payment = {
      expenseId: input.expenseId,
      date: input.date,
      id: crypto.randomUUID(),
      amount: fromCents(this.positive(input.amount)),
      document: this.text(input.document, 'Documento', 100),
      destinationAccount,
      protocolNumber: input.protocolNumber
        ? this.text(input.protocolNumber, 'Número do protocolo', 100)
        : undefined,
      observations: input.observations?.trim() || null,
    };
    const payments = [...this.payments(), payment];
    const cash: { date: string; cents: bigint }[] = [
      { date: receipt.creditDate, cents: toCents(receipt.amount) },
    ];
    const liquidated = this.liquidations()
      .filter((l) => l.expenseId === expense.id)
      .map((l) => ({ date: l.date, cents: toCents(l.amount) }));
    const receiptExpenseIds = new Set(
      this.expenses()
        .filter((e) => e.receiptId === receipt.id)
        .map((e) => e.id),
    );
    for (const p of payments.filter((p) => receiptExpenseIds.has(p.expenseId))) {
      const debit = { date: p.date, cents: -toCents(p.amount) };
      cash.push(debit);
      if (p.expenseId === expense.id) liquidated.push(debit);
      if (p.reversal) {
        const credit = { date: p.reversal.date, cents: toCents(p.amount) };
        cash.push(credit);
        if (p.expenseId === expense.id) liquidated.push(credit);
      }
    }
    this.assertTimeline(cash, 'O caixa deste recebimento');
    this.assertTimeline(liquidated, 'O valor liquidado disponível');
    this.record(
      { payments },
      'Pagamento registrado',
      'payment',
      payment.id,
      `${payment.document} · ${brl(payment.amount)}`,
      receipt.id,
    );
    return payment.id;
  }

  reversePayment(id: string, date: string, reason: string): void {
    this.assertWrite();
    const payment = this.payments().find((p) => p.id === id);
    if (!payment) throw new Error('Pagamento não encontrado.');
    if (payment.reversal) throw new Error('Este pagamento já está estornado.');
    this.date(date, payment.date);
    this.reason(reason);
    const after = { ...payment, reversal: { date, reason: reason.trim() } };
    const receiptId = this.requireExpense(payment.expenseId).receiptId;
    this.record(
      { payments: this.payments().map((p) => (p.id === id ? after : p)) },
      'Pagamento estornado integralmente',
      'payment',
      id,
      `${payment.document} · devolução de ${brl(payment.amount)}`,
      receiptId,
      reason,
    );
  }

  saveUser(input: Omit<DemoUser, 'id'>, id?: string, reason?: string): string {
    this.assertWrite(true);
    const before = id ? this.users().find((u) => u.id === id) : undefined;
    if (id && !before) throw new Error('Usuário não encontrado.');
    const name = this.text(input.name, 'Nome', 160);
    const email = this.text(input.email, 'E-mail', 254).toLowerCase();
    if (before && (before.name !== name || before.email !== email))
      throw new Error('Nome e e-mail do usuário existente são somente leitura nesta versão.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if (!['ADMIN', 'OPERATOR', 'VIEWER'].includes(input.role))
      throw new Error('Selecione um perfil válido.');
    if (typeof input.active !== 'boolean') throw new Error('Informe a situação do acesso.');
    if (this.users().some((u) => u.id !== id && u.email.toLowerCase() === email))
      throw new Error('Este e-mail já está cadastrado.');
    if (
      before?.role === 'ADMIN' &&
      before.active &&
      (!input.active || input.role !== 'ADMIN') &&
      this.users().filter((u) => u.role === 'ADMIN' && u.active).length === 1
    )
      throw new Error('Mantenha pelo menos um administrador ativo.');
    if (id) this.reason(reason ?? '');
    else if (reason !== undefined) this.reason(reason);
    const user = { ...input, name, email, id: id ?? crypto.randomUUID() };
    this.record(
      { users: id ? this.users().map((u) => (u.id === id ? user : u)) : [...this.users(), user] },
      id ? 'Acesso alterado' : 'Acesso cadastrado',
      'user',
      user.id,
      `${name} · ${input.role}`,
      undefined,
      reason ?? 'Cadastro de acesso demonstrativo',
      before
        ? [
            { field: 'Perfil', before: before.role, after: user.role },
            { field: 'Ativo', before: String(before.active), after: String(user.active) },
          ].filter((c) => c.before !== c.after)
        : [],
    );
    return user.id;
  }

  setProfile(role: Role): void {
    const user = this.users().find((u) => u.role === role && u.active);
    if (!user) throw new Error('Não há um usuário ativo com este perfil na prévia.');
    this.currentUserId.set(user.id);
  }

  resetDemo(): void {
    this.data.set(createDemoData());
    this.currentUserId.set('u1');
    this.year.set(2026);
  }

  private balance(events: CashEvent[], year: number): AnnualSummary {
    let opening = 0n,
      received = 0n,
      paid = 0n,
      reversed = 0n;
    for (const event of events) {
      const eventYear = Number(event.date.slice(0, 4));
      if (eventYear < year) opening += event.cents;
      else if (eventYear === year) {
        if (event.type === 'Crédito') received += event.cents;
        else if (event.type === 'Pagamento') paid -= event.cents;
        else reversed += event.cents;
      }
    }
    return {
      opening: fromCents(opening),
      received: fromCents(received),
      paid: fromCents(paid),
      reversed: fromCents(reversed),
      closing: fromCents(opening + received - paid + reversed),
    };
  }

  private async all<T>(path: string): Promise<T[]> {
    if (!this.api) return [];
    const items: T[] = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await this.api.get<ApiPage<T>>(path, { offset, limit: 200 });
      items.push(...page.items);
      total = page.total;
      offset += page.items.length;
      if (!page.items.length) break;
    } while (offset < total);
    return items;
  }

  private async command<T>(path: string, body: unknown): Promise<T> {
    if (!this.api) throw new Error('A conexão com o serviço não está disponível.');
    const signature = path + ':' + JSON.stringify(body);
    const key = this.pendingKeys.get(signature) ?? crypto.randomUUID();
    this.pendingKeys.set(signature, key);
    const result = await this.api.post<T>(path, body, { idempotencyKey: key });
    await this.refreshBackend();
    this.pendingKeys.delete(signature);
    return result;
  }

  private async commandForm<T>(
    path: string,
    body: unknown,
    file: File,
    bodyPart = 'expense',
    filePart = 'commitment_document',
  ): Promise<T> {
    if (!this.api) throw new Error('A conexão com o serviço não está disponível.');
    const signature = `${path}:${JSON.stringify(body)}:${file.name}:${file.size}:${file.lastModified}`;
    const key = this.pendingKeys.get(signature) ?? crypto.randomUUID();
    this.pendingKeys.set(signature, key);
    const form = new FormData();
    form.append(bodyPart, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    form.append(filePart, file, file.name);
    const result = await this.api.postForm<T>(path, form, { idempotencyKey: key });
    await this.refreshBackend();
    this.pendingKeys.delete(signature);
    return result;
  }

  private cashEvents(receiptId: string): CashEvent[] {
    const receipt = this.requireReceipt(receiptId);
    const amendment = this.amendments().find((a) => a.id === receipt.amendmentId)!;
    const result: CashEvent[] = [
      {
        id: receipt.id,
        date: receipt.creditDate,
        type: 'Crédito',
        description: receipt.object,
        document: amendment.number,
        cents: toCents(receipt.amount),
      },
    ];
    const expenses = this.expenses().filter((e) => e.receiptId === receiptId);
    for (const payment of this.payments()) {
      const expense = expenses.find((e) => e.id === payment.expenseId);
      if (!expense) continue;
      result.push({
        id: payment.id,
        date: payment.date,
        type: 'Pagamento',
        description: expense.description,
        document: payment.document,
        cents: -toCents(payment.amount),
      });
      if (payment.reversal)
        result.push({
          id: `${payment.id}-reversal`,
          date: payment.reversal.date,
          type: 'Estorno',
          description: payment.reversal.reason,
          document: payment.document,
          cents: toCents(payment.amount),
        });
    }
    return result;
  }

  private assertTimeline(events: { date: string; cents: bigint }[], label: string): void {
    const days = new Map<string, bigint>();
    for (const event of events) days.set(event.date, (days.get(event.date) ?? 0n) + event.cents);
    let balance = 0n;
    for (const [date, amount] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      balance += amount;
      if (balance < 0n)
        throw new Error(
          `${label} ficaria negativo em ${date.split('-').reverse().join('/')}. Revise valor e data.`,
        );
    }
  }

  private requireReceipt(id: string): Receipt {
    const receipt = this.receipts().find((r) => r.id === id);
    if (!receipt) throw new Error('Recebimento não encontrado.');
    return receipt;
  }

  private requireExpense(id: string): Expense {
    const expense = this.expenses().find((e) => e.id === id);
    if (!expense) throw new Error('Empenho não encontrado.');
    return expense;
  }

  private receiptFields(
    input: Pick<Receipt, 'type' | 'action' | 'expenseElement' | 'source' | 'object' | 'account'>,
  ): Pick<Receipt, 'type' | 'action' | 'expenseElement' | 'source' | 'object' | 'account'> {
    if (!['Federal', 'Estadual'].includes(input.type))
      throw new Error('Selecione um tipo de recebimento válido.');
    return {
      type: input.type,
      action: this.text(input.action, 'Ação', 200),
      expenseElement: this.text(input.expenseElement ?? '', 'Elemento de despesa', 200),
      source: this.text(input.source, 'Fonte de recurso', 160),
      object: this.text(input.object, 'Objeto', 2000),
      account: this.text(input.account, 'Conta bancária', 100),
    };
  }

  private text(value: string, label: string, max: number, min = 1): string {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
      throw new Error(`${label}: informe de ${min} a ${max} caracteres.`);
    return value.trim();
  }

  private reason(value: string): void {
    this.text(value, 'Motivo', 2000, 5);
  }
  private sum(values: string[]): bigint {
    return values.reduce((total, value) => total + toCents(value), 0n);
  }
  private positive(value: string): bigint {
    const amount = toCents(value);
    if (amount <= 0n) throw new Error('Informe um valor maior que zero.');
    if (amount > MAX_AMOUNT)
      throw new Error('Valor acima do limite de R$ 999.999.999.999,99 por lançamento.');
    return amount;
  }

  private cutoff(year: number): string {
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw new Error('O exercício deve estar entre 2000 e 2100.');
    return `${year}-12-31`;
  }

  private date(value: string, minimum?: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Informe uma data válida.');
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
      throw new Error('Informe uma data válida entre 2000 e 2100.');
    if (minimum && value < minimum)
      throw new Error('A data não pode ser anterior ao lançamento de origem.');
  }

  private assertWrite(admin = false): void {
    if (admin && !this.isAdmin())
      throw new Error('Somente o administrador pode realizar esta operação.');
    if (!this.canWrite()) throw new Error('Seu perfil não permite esta operação.');
  }

  private record(
    patch: Partial<DemoData>,
    action: string,
    entityType: string,
    entityId: string,
    description: string,
    receiptId?: string,
    reason?: string,
    changes: AuditEntry['changes'] = [],
  ): void {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: this.currentUser().name,
      action,
      entityType,
      entityId,
      receiptId,
      description,
      reason: reason?.trim(),
      changes,
    };
    this.data.update((data) => ({ ...data, ...patch, audit: [entry, ...data.audit] }));
  }
}

function emptyData(): DemoData {
  return {
    authors: [],
    amendments: [],
    receipts: [],
    expenses: [],
    liquidations: [],
    payments: [],
    users: [],
    audit: [],
  };
}

function mapUser(user: ApiUser): DemoUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    version: user.version,
  };
}
function mapReceipt(receipt: ApiReceipt): Receipt {
  return {
    id: receipt.id,
    amendmentId: receipt.amendment_id,
    type: receipt.type === 'Estadual' ? 'Estadual' : 'Federal',
    action: receipt.action,
    expenseElement: receipt.expense_element,
    source: receipt.source,
    object: receipt.object,
    creditDate: receipt.credit_date,
    account: receipt.bank_account,
    amount: receipt.amount.value,
    version: receipt.version,
  };
}
function mapExpense(expense: ApiExpense): Expense {
  return {
    id: expense.id,
    receiptId: expense.receipt_id,
    description: expense.description,
    supplier: expense.supplier,
    cnpj: expense.cnpj ? formatCnpj(expense.cnpj) : null,
    document: expense.document,
    commitmentDate: expense.commitment_date,
    amount: expense.amount.value,
    version: expense.version,
    observations: expense.observations ?? null,
    commitmentDocument: expense.commitment_document
      ? {
          id: expense.commitment_document.id,
          fileName: expense.commitment_document.file_name,
          sizeBytes: expense.commitment_document.size_bytes,
          uploadedAt: expense.commitment_document.uploaded_at,
        }
      : null,
  };
}
function mapPosting(posting: ApiPosting): Liquidation {
  return {
    id: posting.id,
    expenseId: posting.expense_id,
    date: posting.date,
    amount: posting.amount.value,
    document: posting.document,
    destinationAccount: posting.destination_account ?? null,
    observations: posting.observations ?? null,
    version: posting.version,
  };
}
function mapPayment(posting: ApiPosting): Payment {
  return {
    ...mapPosting(posting),
    protocolNumber: posting.protocol_number ?? undefined,
    paymentDocument: posting.payment_document
      ? {
          id: posting.payment_document.id,
          fileName: posting.payment_document.file_name,
          sizeBytes: posting.payment_document.size_bytes,
          uploadedAt: posting.payment_document.uploaded_at,
        }
      : null,
  };
}
function mapAudit(entry: ApiAuditEntry): AuditEntry {
  const labels: Record<string, string> = {
    CREATE: 'Cadastro criado',
    COMMIT: 'Empenho registrado',
    ATTACH_COMMITMENT_DOCUMENT: 'Nota de Empenho anexada',
    LIQUIDATE: 'Liquidação registrada',
    PAY: 'Pagamento registrado',
    REVERSE: 'Pagamento estornado',
    EXPORT: 'Relatório exportado',
    UPDATE: 'Cadastro atualizado',
    LOGIN: 'Acesso realizado',
    BOOTSTRAP: 'Acesso inicial criado',
    PASSWORD_RESET: 'Senha redefinida',
    PASSWORD_CHANGE: 'Senha alterada',
  };
  const before = auditObject(entry.before);
  const after = auditObject(entry.after);
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const ignoredFields = new Set([
    'id',
    'version',
    'amendment_id',
    'parliamentarian_id',
    'receipt_id',
    'expense_id',
    'payment_id',
  ]);
  const changes = [...fields].flatMap((key) => {
    if (ignoredFields.has(key)) return [];
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
    return [
      {
        field: auditField(key, entry.entity, entry.action),
        before: auditValue(oldValue),
        after: auditValue(newValue),
      },
    ];
  });
  const record = { ...(before ?? {}), ...(after ?? {}) };
  if (entry.action === 'REVERSE' && before?.['date']) record['date'] = before['date'];
  const updateLabels: Record<string, string> = {
    expense: 'Empenho corrigido',
    liquidation: 'Liquidação corrigida',
    payment: 'Pagamento corrigido',
    receipt: 'Recebimento corrigido',
    user: 'Acesso atualizado',
  };
  return {
    id: entry.id,
    timestamp: entry.occurred_at,
    actor: entry.actor_name,
    action: entry.action === 'UPDATE'
      ? updateLabels[entry.entity] ?? labels[entry.action]
      : labels[entry.action] ?? entry.action,
    entityType: entry.entity,
    entityId: entry.entity_id,
    description: auditRecordSummary(entry.entity, record),
    reason: auditReason(entry.reason),
    changes,
  };
}

function auditReason(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const generatedReasons = new Set([
    'Cadastro do parlamentar',
    'Cadastro da emenda',
    'Registro do crédito',
    'Cadastro de acesso',
    'Primeiro acesso administrativo',
    'Registro de empenho',
    'Registro de liquidação',
    'Registro de pagamento',
    'Exportação Excel financeiro',
    'Cadastro de acesso demonstrativo',
  ]);
  return generatedReasons.has(value.trim()) ? undefined : value.trim();
}

function auditRecordSummary(entity: string, record: Record<string, unknown>): string {
  const value = (key: string): string => auditValue(record[key]);
  const present = (key: string): boolean =>
    record[key] !== null && record[key] !== undefined && record[key] !== '';
  const details: string[] = [];
  switch (entity) {
    case 'parliamentarian':
      if (present('name')) details.push(value('name'));
      break;
    case 'amendment':
      if (present('number')) details.push(`Emenda ${value('number')}`);
      if (present('year')) details.push(`Exercício ${value('year')}`);
      break;
    case 'receipt':
      if (present('object')) details.push(`Objeto: ${value('object')}`);
      if (present('amount')) details.push(value('amount'));
      if (present('credit_date')) details.push(`Crédito em ${value('credit_date')}`);
      break;
    case 'expense':
      if (present('description')) details.push(value('description'));
      if (present('amount')) details.push(value('amount'));
      if (present('document')) details.push(`Documento ${value('document')}`);
      break;
    case 'liquidation':
      if (present('document')) details.push(`Documento ${value('document')}`);
      if (present('amount')) details.push(value('amount'));
      if (present('date')) details.push(`Data da liquidação ${value('date')}`);
      break;
    case 'payment':
      if (present('document')) details.push(`Documento ${value('document')}`);
      if (present('amount')) details.push(value('amount'));
      if (present('date')) details.push(`Data do pagamento ${value('date')}`);
      break;
    case 'user':
      if (present('name')) details.push(value('name'));
      if (present('email')) details.push(value('email'));
      break;
    case 'report':
      if (present('year')) details.push(`Exercício ${value('year')}`);
      if (present('receipts')) details.push(`${value('receipts')} recebimentos`);
      break;
  }
  return details.join(' · ');
}

function auditObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
function auditField(key: string, entity: string, action: string): string {
  if (key === 'date' && entity === 'payment' && action === 'REVERSE')
    return 'Data do pagamento / estorno';
  if (key === 'date' && entity === 'payment') return 'Data do pagamento';
  if (key === 'date' && entity === 'liquidation') return 'Data da liquidação';
  const labels: Record<string, string> = {
    name: 'Nome',
    email: 'E-mail',
    role: 'Perfil',
    active: 'Acesso ativo',
    must_change_password: 'Exigir troca de senha',
    number: 'Número',
    year: 'Ano',
    type: 'Tipo',
    source: 'Fonte de recurso',
    action: 'Ação',
    expense_element: 'Elemento de despesa',
    object: 'Objeto',
    credit_date: 'Data do crédito',
    bank_account: 'Conta bancária',
    amount: 'Valor',
    description: 'Descrição',
    supplier: 'Fornecedor',
    document: 'Documento',
    commitment_date: 'Data do empenho',
    date: 'Data',
    reason: 'Motivo',
  };
  return (
    labels[key] ??
    key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toLocaleUpperCase('pt-BR'))
  );
}
function auditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const money = value as Record<string, unknown>;
    if (typeof money['formatted'] === 'string') return money['formatted'];
    if (typeof money['value'] === 'string' && money['currency'] === 'BRL')
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        Number(money['value']),
      );
    return JSON.stringify(value);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split('-').reverse().join('/');
  return text;
}
