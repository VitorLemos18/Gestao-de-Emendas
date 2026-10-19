package br.com.emendas.execution.adapter.out.persistence;

import br.com.emendas.execution.api.Execution.*;
import br.com.emendas.execution.application.ExecutionStore;
import br.com.emendas.foundation.domain.Money;
import java.time.LocalDate;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PostgresExecutionStore implements ExecutionStore {
  private final JdbcClient jdbc;

  public PostgresExecutionStore(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  private static final RowMapper<Expense> EXPENSE =
      (r, n) -> {
        UUID documentId = r.getObject("commitment_document_id", UUID.class);
        var uploadedAt = r.getTimestamp("commitment_document_uploaded_at");
        CommitmentDocumentInfo document =
            documentId == null
                ? null
                : new CommitmentDocumentInfo(
                    documentId,
                    r.getString("commitment_document_name"),
                    r.getLong("commitment_document_size"),
                    uploadedAt == null ? null : uploadedAt.toInstant());
        return new Expense(
            r.getObject("id", UUID.class),
            r.getObject("receipt_id", UUID.class),
            r.getString("description"),
            r.getString("supplier"),
            r.getString("cnpj"),
            r.getString("document"),
            r.getObject("commitment_date", LocalDate.class),
            new Money(r.getBigDecimal("amount")),
            document,
            r.getString("observations"),
            r.getLong("version"));
      };
  private static final String EXPENSE_SELECT =
      "SELECT e.*, d.id AS commitment_document_id, d.file_name AS commitment_document_name,"
          + " d.file_size AS commitment_document_size, d.uploaded_at AS commitment_document_uploaded_at"
          + " FROM execution.expenses e LEFT JOIN LATERAL ("
          + " SELECT id, file_name, file_size, uploaded_at FROM execution.commitment_documents"
          + " WHERE expense_id=e.id ORDER BY uploaded_at DESC, id DESC LIMIT 1"
          + " ) d ON TRUE";
  private static final RowMapper<Movement> MOVEMENT =
      (r, n) ->
          new Movement(
              r.getObject("id", UUID.class),
              r.getObject("expense_id", UUID.class),
              r.getObject("date", LocalDate.class),
              new Money(r.getBigDecimal("amount")),
              r.getString("document"),
              r.getString("destination_account"),
              null,
              null,
              r.getString("observations"),
              r.getLong("version"));
  private static final RowMapper<Movement> PAYMENT_MOVEMENT =
      (r, n) -> {
        UUID documentId = r.getObject("payment_document_id", UUID.class);
        var uploadedAt = r.getTimestamp("payment_document_uploaded_at");
        PaymentDocumentInfo document =
            documentId == null
                ? null
                : new PaymentDocumentInfo(
                    documentId,
                    r.getString("payment_document_name"),
                    r.getLong("payment_document_size"),
                    uploadedAt == null ? null : uploadedAt.toInstant());
        return new Movement(
            r.getObject("id", UUID.class),
            r.getObject("expense_id", UUID.class),
            r.getObject("date", LocalDate.class),
            new Money(r.getBigDecimal("amount")),
            r.getString("document"),
            r.getString("destination_account"),
            r.getString("protocol_number"),
            document,
            r.getString("observations"),
            r.getLong("version"));
      };
  private static final String PAYMENT_SELECT =
      "SELECT p.*, d.id AS payment_document_id, d.file_name AS payment_document_name,"
          + " d.file_size AS payment_document_size, d.uploaded_at AS payment_document_uploaded_at"
          + " FROM execution.payments p LEFT JOIN LATERAL ("
          + " SELECT id, file_name, file_size, uploaded_at FROM execution.payment_documents"
          + " WHERE payment_id=p.id ORDER BY uploaded_at DESC, id DESC LIMIT 1"
          + ") d ON TRUE";
  private static final RowMapper<CommitmentDocumentInfo> DOCUMENT_INFO =
      (r, n) ->
          new CommitmentDocumentInfo(
              r.getObject("id", UUID.class),
              r.getString("file_name"),
              r.getLong("file_size"),
              r.getTimestamp("uploaded_at").toInstant());
  private static final RowMapper<CommitmentDocument> DOCUMENT =
      (r, n) ->
          new CommitmentDocument(
              r.getObject("id", UUID.class),
              r.getObject("expense_id", UUID.class),
              r.getString("file_name"),
              r.getLong("file_size"),
              r.getString("sha256"),
              r.getTimestamp("uploaded_at").toInstant(),
              r.getBytes("content"));
  private static final RowMapper<PaymentDocumentInfo> PAYMENT_DOCUMENT_INFO =
      (r, n) ->
          new PaymentDocumentInfo(
              r.getObject("id", UUID.class),
              r.getString("file_name"),
              r.getLong("file_size"),
              r.getTimestamp("uploaded_at").toInstant());
  private static final RowMapper<PaymentDocument> PAYMENT_DOCUMENT =
      (r, n) ->
          new PaymentDocument(
              r.getObject("id", UUID.class),
              r.getObject("payment_id", UUID.class),
              r.getString("file_name"),
              r.getLong("file_size"),
              r.getString("sha256"),
              r.getTimestamp("uploaded_at").toInstant(),
              r.getBytes("content"));

  public Optional<Expense> expense(UUID id) {
    return jdbc.sql(EXPENSE_SELECT + " WHERE e.id=?")
        .param(id)
        .query(EXPENSE)
        .optional();
  }

  public Optional<Movement> liquidation(UUID id) {
    return jdbc.sql("SELECT * FROM execution.liquidations WHERE id=?")
        .param(id)
        .query(MOVEMENT)
        .optional();
  }

  public Optional<Movement> payment(UUID id) {
    return jdbc.sql(PAYMENT_SELECT + " WHERE p.id=?")
        .param(id)
        .query(PAYMENT_MOVEMENT)
        .optional();
  }

  public Optional<PaymentDocument> paymentDocument(UUID paymentId, UUID documentId) {
    return jdbc.sql("SELECT * FROM execution.payment_documents WHERE payment_id=? AND id=?")
        .params(paymentId, documentId)
        .query(PAYMENT_DOCUMENT)
        .optional();
  }

  public PaymentDocumentInfo insertPaymentDocument(PaymentDocument document) {
    jdbc.sql(
            "INSERT INTO execution.payment_documents"
                + "(id, payment_id, file_name, file_size, sha256, content) VALUES (?,?,?,?,?,?)"
                + " ON CONFLICT (payment_id, sha256) DO NOTHING")
        .params(
            document.id(),
            document.paymentId(),
            document.fileName(),
            document.sizeBytes(),
            document.sha256(),
            document.content())
        .update();
    return jdbc.sql(
            "SELECT id, file_name, file_size, uploaded_at FROM execution.payment_documents"
                + " WHERE payment_id=? ORDER BY uploaded_at DESC, id DESC LIMIT 1")
        .param(document.paymentId())
        .query(PAYMENT_DOCUMENT_INFO)
        .single();
  }

  public Optional<CommitmentDocument> commitmentDocument(UUID expenseId, UUID documentId) {
    return jdbc.sql(
            "SELECT * FROM execution.commitment_documents WHERE expense_id=? AND id=?")
        .params(expenseId, documentId)
        .query(DOCUMENT)
        .optional();
  }

  public Optional<CommitmentDocumentInfo> commitmentDocumentByHash(UUID expenseId, String sha256) {
    return jdbc.sql(
            "SELECT id, file_name, file_size, uploaded_at FROM execution.commitment_documents"
                + " WHERE expense_id=? AND sha256=?")
        .params(expenseId, sha256)
        .query(DOCUMENT_INFO)
        .optional();
  }

  public CommitmentDocumentInfo insertCommitmentDocument(CommitmentDocument document) {
    jdbc.sql(
            "INSERT INTO execution.commitment_documents"
                + "(id, expense_id, file_name, file_size, sha256, content) VALUES (?,?,?,?,?,?)"
                + " ON CONFLICT (expense_id, sha256) DO NOTHING")
        .params(
            document.id(),
            document.expenseId(),
            document.fileName(),
            document.sizeBytes(),
            document.sha256(),
            document.content())
        .update();
    return commitmentDocumentByHash(document.expenseId(), document.sha256())
        .orElseThrow(() -> new IllegalStateException("PDF anexado não foi localizado após salvar."));
  }

  public Snapshot snapshot(UUID receiptId) {
    String filter = " WHERE (CAST(:receipt AS uuid) IS NULL OR e.receipt_id=:receipt)";
    var expenses =
        jdbc.sql(EXPENSE_SELECT + filter + " ORDER BY e.commitment_date,e.id")
            .param("receipt", receiptId)
            .query(EXPENSE)
            .list();
    var liquidations =
        jdbc.sql(
                "SELECT l.* FROM execution.liquidations l JOIN execution.expenses e ON"
                    + " e.id=l.expense_id"
                    + filter
                    + " ORDER BY l.date,l.id")
            .param("receipt", receiptId)
            .query(MOVEMENT)
            .list();
    var payments =
        jdbc.sql(
                PAYMENT_SELECT + " JOIN execution.expenses e ON e.id=p.expense_id"
                    + filter
                    + " ORDER BY p.date,p.id")
            .param("receipt", receiptId)
            .query(PAYMENT_MOVEMENT)
            .list();
    var reversals =
        jdbc.sql(
                "SELECT r.* FROM execution.reversals r JOIN execution.payments p ON"
                    + " p.id=r.payment_id JOIN execution.expenses e ON e.id=p.expense_id"
                    + filter
                    + " ORDER BY r.date,r.id")
            .param("receipt", receiptId)
            .query(
                (r, n) ->
                    new Reversal(
                        r.getObject("id", UUID.class),
                        r.getObject("payment_id", UUID.class),
                        r.getObject("date", LocalDate.class),
                        r.getString("reason")))
            .list();
    return new Snapshot(expenses, liquidations, payments, reversals);
  }

  public void insert(Expense e) {
    jdbc.sql(
            "INSERT INTO"
                + " execution.expenses(id,receipt_id,description,supplier,cnpj,document,commitment_date,amount,observations)"
                + " VALUES (?,?,?,?,?,?,?,?,?)")
        .params(
            e.id(),
            e.receiptId(),
            e.description(),
            e.supplier(),
            e.cnpj(),
            e.document(),
            e.commitmentDate(),
            e.amount().value(),
            e.observations())
        .update();
  }

  public boolean update(Expense e) {
    allowExecutionCorrection();
    return jdbc.sql("UPDATE execution.expenses SET description=?,supplier=?,cnpj=?,document=?,"
            + "commitment_date=?,amount=?,observations=?,version=version+1 WHERE id=? AND version=?")
        .params(e.description(), e.supplier(), e.cnpj(), e.document(), e.commitmentDate(),
            e.amount().value(), e.observations(), e.id(), e.version())
        .update() == 1;
  }

  public void liquidate(Movement m) {
    jdbc.sql(
            "INSERT INTO execution.liquidations"
                + "(id,expense_id,date,amount,document,destination_account,observations) VALUES"
                + " (?,?,?,?,?,?,?)")
        .params(
            m.id(), m.expenseId(), m.date(), m.amount().value(), m.document(),
            m.destinationAccount(), m.observations())
        .update();
  }

  public boolean updateLiquidation(Movement m) {
    allowExecutionCorrection();
    return jdbc.sql("UPDATE execution.liquidations SET date=?,amount=?,document=?,"
            + "destination_account=?,observations=?,version=version+1 WHERE id=? AND version=?")
        .params(m.date(), m.amount().value(), m.document(), m.destinationAccount(),
            m.observations(), m.id(), m.version())
        .update() == 1;
  }

  public void pay(Movement m) {
    jdbc.sql(
            "INSERT INTO execution.payments"
            + "(id,expense_id,date,amount,document,destination_account,protocol_number,observations)"
            + " VALUES (?,?,?,?,?,?,?,?)")
        .params(
            m.id(), m.expenseId(), m.date(), m.amount().value(), m.document(),
            m.destinationAccount(), m.protocolNumber(), m.observations())
        .update();
  }

  public boolean updatePayment(Movement m) {
    allowExecutionCorrection();
    return jdbc.sql("UPDATE execution.payments SET date=?,amount=?,document=?,"
            + "destination_account=?,protocol_number=?,observations=?,version=version+1 WHERE id=? AND version=?")
        .params(m.date(), m.amount().value(), m.document(), m.destinationAccount(),
            m.protocolNumber(), m.observations(), m.id(), m.version())
        .update() == 1;
  }

  private void allowExecutionCorrection() {
    jdbc.sql("SELECT set_config('app.execution_correction','allowed',true)")
        .query(String.class)
        .single();
  }

  public void reverse(Reversal r) {
    jdbc.sql("INSERT INTO execution.reversals(id,payment_id,date,reason) VALUES (?,?,?,?)")
        .params(r.id(), r.paymentId(), r.date(), r.reason())
        .update();
  }
}
