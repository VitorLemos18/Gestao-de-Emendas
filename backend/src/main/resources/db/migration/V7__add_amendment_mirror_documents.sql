CREATE TABLE funding.amendment_documents (
    id uuid PRIMARY KEY,
    amendment_id uuid NOT NULL REFERENCES funding.amendments(id),
    file_name varchar(255) NOT NULL,
    file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 10485760),
    sha256 char(64) NOT NULL,
    content bytea NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (amendment_id, sha256)
);

CREATE INDEX amendment_documents_amendment_idx
    ON funding.amendment_documents (amendment_id, uploaded_at DESC);

CREATE TRIGGER immutable_amendment_documents
    BEFORE UPDATE OR DELETE ON funding.amendment_documents
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
