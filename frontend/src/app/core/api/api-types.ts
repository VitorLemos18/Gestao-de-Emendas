export interface ApiPage<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface ApiMoney {
  value: string;
  formatted: string;
  currency: 'BRL';
}

export type ApiRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiRole;
  active: boolean;
  must_change_password: boolean;
  version: number;
}

export interface ApiParliamentarian { id: string; name: string; }
export interface ApiAmendment {
  id: string;
  parliamentarian_id: string;
  number: string;
  year: number;
  mirror_document?: { id: string; file_name: string; size_bytes: number; uploaded_at: string } | null;
}
export interface ApiReceipt {
  id: string; amendment_id: string; type: string; source: string; action: string; expense_element: string | null;
  object: string; credit_date: string; bank_account: string; amount: ApiMoney; version: number;
}
export interface ApiExpense {
  id: string; receipt_id: string; description: string; supplier: string; cnpj?: string | null; document: string;
  commitment_date: string; amount: ApiMoney; observations?: string | null;
  commitment_document?: { id: string; file_name: string; size_bytes: number; uploaded_at: string } | null;
}
export interface ApiPosting {
  id: string; expense_id: string; date: string; amount: ApiMoney; document: string;
  destination_account?: string | null;
  observations?: string | null;
  protocol_number?: string | null;
  payment_document?: { id: string; file_name: string; size_bytes: number; uploaded_at: string } | null;
}
export interface ApiReversal { id: string; payment_id: string; date: string; reason: string; }
export interface ApiExpenseDetail {
  expense: ApiExpense;
  liquidations: ApiPosting[];
  payments: ApiPosting[];
  reversals: ApiReversal[];
}
export interface ApiAuditEntry {
  id: string; actor_name: string; action: string; entity: string; entity_id: string;
  before?: string | null; after?: string | null; reason?: string | null; occurred_at: string;
}

export interface CsrfResponse {
  token: string;
  header_name: string;
}

export interface LoginResponse {
  user: ApiUser;
  csrf_token: string;
  header_name: string;
}

export interface ApiProblem {
  status?: number;
  code?: string;
  detail?: string;
  request_id?: string;
  fields?: Record<string, string>;
}
