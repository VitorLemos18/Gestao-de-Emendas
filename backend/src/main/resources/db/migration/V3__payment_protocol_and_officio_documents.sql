ALTER TABLE execution.payments ADD COLUMN protocol_number varchar(100);

CREATE TABLE execution.payment_documents (
    id uuid PRIMARY KEY,
    payment_id uuid NOT NULL UNIQUE REFERENCES execution.payments(id),
    file_name varchar(255) NOT NULL,
    file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 10485760),
    sha256 char(64) NOT NULL,
    content bytea NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX payment_documents_payment_idx
    ON execution.payment_documents (payment_id, uploaded_at DESC);
CREATE TRIGGER immutable_payment_documents
    BEFORE UPDATE OR DELETE ON execution.payment_documents
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
