CREATE SCHEMA identity;
CREATE SCHEMA funding;
CREATE SCHEMA execution;
CREATE SCHEMA audit;
CREATE SCHEMA platform;

CREATE TABLE identity.users (
    id uuid PRIMARY KEY, name varchar(160) NOT NULL, email varchar(254) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL, role varchar(16) NOT NULL CHECK(role IN ('ADMIN','OPERATOR','VIEWER')),
    active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT true,
    version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.login_attempts (subject varchar(64) PRIMARY KEY, failures int NOT NULL, window_start timestamptz NOT NULL);

CREATE TABLE funding.parliamentarians (id uuid PRIMARY KEY, name varchar(160) NOT NULL, UNIQUE(name));
CREATE TABLE funding.amendments (
    id uuid PRIMARY KEY, parliamentarian_id uuid NOT NULL REFERENCES funding.parliamentarians(id),
    number varchar(100) NOT NULL, year int NOT NULL CHECK(year BETWEEN 2000 AND 2100), UNIQUE(number,year)
);
CREATE TABLE funding.receipts (
    id uuid PRIMARY KEY, amendment_id uuid NOT NULL REFERENCES funding.amendments(id),
    type varchar(100) NOT NULL, source varchar(160) NOT NULL, block_action varchar(200) NOT NULL,
    object text NOT NULL, credit_date date NOT NULL, bank_account varchar(100) NOT NULL,
    amount numeric(14,2) NOT NULL CHECK(amount>0), version bigint NOT NULL DEFAULT 1
);
CREATE INDEX receipts_amendment_idx ON funding.receipts(amendment_id);
CREATE TABLE execution.expenses (
    id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES funding.receipts(id),
    description varchar(2000) NOT NULL, supplier varchar(200) NOT NULL, document varchar(100) NOT NULL,
    commitment_date date NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount>0)
);
CREATE INDEX expenses_receipt_idx ON execution.expenses(receipt_id);
CREATE TABLE execution.liquidations (
    id uuid PRIMARY KEY, expense_id uuid NOT NULL REFERENCES execution.expenses(id),
    date date NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount>0), document varchar(100) NOT NULL
);
CREATE TABLE execution.payments (
    id uuid PRIMARY KEY, expense_id uuid NOT NULL REFERENCES execution.expenses(id),
    date date NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount>0), document varchar(100) NOT NULL
);
CREATE TABLE execution.reversals (
    id uuid PRIMARY KEY, payment_id uuid NOT NULL UNIQUE REFERENCES execution.payments(id),
    date date NOT NULL, reason varchar(2000) NOT NULL
);
CREATE INDEX liquidation_expense_idx ON execution.liquidations(expense_id);
CREATE INDEX payment_expense_idx ON execution.payments(expense_id);
CREATE TABLE audit.entries (
    id uuid PRIMARY KEY, actor_id uuid NOT NULL, actor_name varchar(160) NOT NULL,
    action varchar(100) NOT NULL, entity varchar(100) NOT NULL, entity_id uuid NOT NULL,
    before_data jsonb NOT NULL, after_data jsonb NOT NULL, reason varchar(2000) NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_entity_idx ON audit.entries(entity,entity_id,occurred_at DESC);
CREATE TABLE platform.idempotency (
    actor_id uuid NOT NULL, command_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
    response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_key)
);

CREATE FUNCTION platform.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro imutável: crie lançamento corretivo'; END; $$;
CREATE TRIGGER immutable_expenses BEFORE UPDATE OR DELETE ON execution.expenses FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_liquidations BEFORE UPDATE OR DELETE ON execution.liquidations FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_payments BEFORE UPDATE OR DELETE ON execution.payments FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_reversals BEFORE UPDATE OR DELETE ON execution.reversals FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit.entries FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE FUNCTION funding.protect_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recebimento não pode ser excluído'; END IF;
  IF NEW.amount<>OLD.amount OR NEW.credit_date<>OLD.credit_date OR NEW.amendment_id<>OLD.amendment_id THEN
    RAISE EXCEPTION 'Valor, origem e data do crédito são imutáveis';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_receipt BEFORE UPDATE OR DELETE ON funding.receipts FOR EACH ROW EXECUTE FUNCTION funding.protect_receipt();

-- Spring Session JDBC: sessões persistidas, sem credenciais nos arquivos de exportação.
CREATE TABLE SPRING_SESSION (
 PRIMARY_ID CHAR(36) NOT NULL PRIMARY KEY, SESSION_ID CHAR(36) NOT NULL, CREATION_TIME BIGINT NOT NULL,
 LAST_ACCESS_TIME BIGINT NOT NULL, MAX_INACTIVE_INTERVAL INT NOT NULL, EXPIRY_TIME BIGINT NOT NULL, PRINCIPAL_NAME VARCHAR(254)
);
CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION(SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION(EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION(PRINCIPAL_NAME);
CREATE TABLE SPRING_SESSION_ATTRIBUTES (
 SESSION_PRIMARY_ID CHAR(36) NOT NULL REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE,
 ATTRIBUTE_NAME VARCHAR(200) NOT NULL, ATTRIBUTE_BYTES BYTEA NOT NULL,
 PRIMARY KEY(SESSION_PRIMARY_ID, ATTRIBUTE_NAME)
);
