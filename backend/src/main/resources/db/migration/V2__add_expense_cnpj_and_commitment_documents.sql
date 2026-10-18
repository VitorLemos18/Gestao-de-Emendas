ALTER TABLE execution.expenses ADD COLUMN cnpj varchar(14);
ALTER TABLE execution.expenses
    ADD CONSTRAINT expense_cnpj_format_check
    CHECK (cnpj IS NULL OR cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');

CREATE TABLE execution.commitment_documents (
    id uuid PRIMARY KEY,
    expense_id uuid NOT NULL REFERENCES execution.expenses(id),
    file_name varchar(255) NOT NULL,
    file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 10485760),
    sha256 char(64) NOT NULL,
    content bytea NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (expense_id, sha256)
);
CREATE INDEX commitment_documents_expense_idx
    ON execution.commitment_documents (expense_id, uploaded_at DESC);
CREATE TRIGGER immutable_commitment_documents
    BEFORE UPDATE OR DELETE ON execution.commitment_documents
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
