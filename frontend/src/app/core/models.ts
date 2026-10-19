export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type Decimal = string;

export interface Author {
  id: string;
  name: string;
  party: string;
  office: string;
}
export interface Amendment {
  id: string;
  authorId: string;
  number: string;
  year: number;
  description: string;
  mirrorDocument?: {
    id: string;
    fileName: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
}
export interface Receipt {
  id: string;
  amendmentId: string;
  type: 'Federal' | 'Estadual';
  action: string;
  expenseElement: string | null;
  source: string;
  object: string;
  creditDate: string;
  account: string;
  amount: Decimal;
  version: number;
}
export interface Expense {
  id: string;
  receiptId: string;
  description: string;
  supplier: string;
  cnpj?: string | null;
  document: string;
  commitmentDate: string;
  amount: Decimal;
  version?: number;
  observations?: string | null;
  commitmentDocument?: {
    id: string;
    fileName: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
}
export interface Liquidation {
  id: string;
  expenseId: string;
  date: string;
  amount: Decimal;
  document: string;
  destinationAccount?: string | null;
  observations?: string | null;
  version?: number;
}
export interface Payment {
  id: string;
  expenseId: string;
  date: string;
  amount: Decimal;
  document: string;
  destinationAccount?: string | null;
  observations?: string | null;
  version?: number;
  protocolNumber?: string;
  paymentDocument?: {
    id: string;
    fileName: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
  reversal?: { date: string; reason: string };
}
export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version?: number;
}
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  receiptId?: string;
  description: string;
  reason?: string;
  changes: { field: string; before: string; after: string }[];
}
export interface AnnualSummary {
  opening: Decimal;
  received: Decimal;
  paid: Decimal;
  reversed: Decimal;
  closing: Decimal;
}
export interface ReceiptSummary extends AnnualSummary {
  committed: Decimal;
  liquidated: Decimal;
  toCommit: Decimal;
  toLiquidate: Decimal;
  toPay: Decimal;
}
export interface ExpenseSummary {
  committed: Decimal;
  liquidated: Decimal;
  paid: Decimal;
  grossPaid: Decimal;
  reversed: Decimal;
  toLiquidate: Decimal;
  toPay: Decimal;
}
export interface LedgerLine {
  id: string;
  date: string;
  type: 'Crédito' | 'Pagamento' | 'Estorno';
  description: string;
  document: string;
  amount: Decimal;
  balance: Decimal;
}
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  VIEWER: 'Consulta',
};
