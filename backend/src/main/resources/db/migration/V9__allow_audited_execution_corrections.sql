ALTER TABLE execution.payment_documents
    DROP CONSTRAINT IF EXISTS payment_documents_payment_id_key;

ALTER TABLE execution.payment_documents
    ADD CONSTRAINT payment_documents_payment_sha256_key UNIQUE (payment_id, sha256);

ALTER TABLE execution.expenses
    ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE execution.liquidations
    ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE execution.payments
    ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE OR REPLACE FUNCTION execution.protect_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registro de execução não pode ser excluído';
  END IF;
  IF current_setting('app.execution_correction', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Correção exige operação administrativa auditada';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS immutable_expenses ON execution.expenses;
DROP TRIGGER IF EXISTS immutable_liquidations ON execution.liquidations;
DROP TRIGGER IF EXISTS immutable_payments ON execution.payments;

CREATE TRIGGER immutable_expenses
    BEFORE UPDATE OR DELETE ON execution.expenses
    FOR EACH ROW EXECUTE FUNCTION execution.protect_correction();
CREATE TRIGGER immutable_liquidations
    BEFORE UPDATE OR DELETE ON execution.liquidations
    FOR EACH ROW EXECUTE FUNCTION execution.protect_correction();
CREATE TRIGGER immutable_payments
    BEFORE UPDATE OR DELETE ON execution.payments
    FOR EACH ROW EXECUTE FUNCTION execution.protect_correction();
