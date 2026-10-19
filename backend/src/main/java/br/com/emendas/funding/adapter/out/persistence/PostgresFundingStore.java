package br.com.emendas.funding.adapter.out.persistence;

import br.com.emendas.foundation.domain.Money;
import br.com.emendas.funding.api.Funding.*;
import br.com.emendas.funding.application.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PostgresFundingStore implements FundingStore {
  private final JdbcClient jdbc;

  public PostgresFundingStore(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  private static final String RECEIPT_SQL =
      "SELECT r.*,a.parliamentarian_id,a.number AS amendment_number,a.year AS amendment_year,p.name"
          + " AS parliamentarian_name FROM funding.receipts r JOIN funding.amendments a ON"
          + " a.id=r.amendment_id JOIN funding.parliamentarians p ON p.id=a.parliamentarian_id";
  private static final RowMapper<Receipt> RECEIPT =
      (r, n) ->
          new Receipt(
              r.getObject("id", UUID.class),
              r.getObject("amendment_id", UUID.class),
              r.getObject("parliamentarian_id", UUID.class),
              r.getString("parliamentarian_name"),
              r.getString("amendment_number"),
              r.getInt("amendment_year"),
              r.getString("type"),
              r.getString("source"),
              r.getString("action"),
              r.getString("expense_element"),
              r.getString("object"),
              r.getObject("credit_date", LocalDate.class),
              r.getString("bank_account"),
              new Money(r.getBigDecimal("amount")),
              r.getLong("version"));
  private static final RowMapper<AmendmentDocumentInfo> AMENDMENT_DOCUMENT_INFO =
      (r, n) -> {
        var uploadedAt = r.getTimestamp("uploaded_at");
        return new AmendmentDocumentInfo(
            r.getObject("id", UUID.class),
            r.getString("file_name"),
            r.getLong("file_size"),
            uploadedAt == null ? null : uploadedAt.toInstant());
      };
  private static final String AMENDMENT_SELECT =
      "SELECT a.*, d.id AS document_id, d.file_name AS document_file_name,"
          + " d.file_size AS document_file_size, d.uploaded_at AS document_uploaded_at"
          + " FROM funding.amendments a LEFT JOIN LATERAL ("
          + " SELECT id,file_name,file_size,uploaded_at FROM funding.amendment_documents"
          + " WHERE amendment_id=a.id ORDER BY uploaded_at DESC,id DESC LIMIT 1"
          + " ) d ON TRUE";

  public List<Parliamentarian> parliamentarians() {
    return jdbc.sql("SELECT * FROM funding.parliamentarians ORDER BY name,id")
        .query((r, n) -> new Parliamentarian(r.getObject("id", UUID.class), r.getString("name")))
        .list();
  }

  public List<Amendment> amendments() {
    return jdbc.sql(AMENDMENT_SELECT + " ORDER BY a.year,a.number,a.id")
        .query(
            (r, n) -> {
              UUID documentId = r.getObject("document_id", UUID.class);
              var uploadedAt = r.getTimestamp("document_uploaded_at");
              var document = documentId == null ? null : new AmendmentDocumentInfo(
                  documentId, r.getString("document_file_name"), r.getLong("document_file_size"),
                  uploadedAt == null ? null : uploadedAt.toInstant());
              return new Amendment(r.getObject("id", UUID.class),
                  r.getObject("parliamentarian_id", UUID.class), r.getString("number"),
                  r.getInt("year"), document);
            })
        .list();
  }

  public Optional<AmendmentDocument> amendmentDocument(UUID amendmentId, UUID documentId) {
    return jdbc.sql("SELECT * FROM funding.amendment_documents WHERE amendment_id=? AND id=?")
        .params(amendmentId, documentId)
        .query((r, n) -> new AmendmentDocument(
            r.getObject("id", UUID.class), r.getObject("amendment_id", UUID.class),
            r.getString("file_name"), r.getLong("file_size"), r.getString("sha256"),
            r.getTimestamp("uploaded_at").toInstant(), r.getBytes("content")))
        .optional();
  }

  public Optional<AmendmentDocumentInfo> amendmentDocumentByHash(UUID amendmentId, String sha256) {
    return jdbc.sql("SELECT id,file_name,file_size,uploaded_at FROM funding.amendment_documents"
            + " WHERE amendment_id=? AND sha256=?")
        .params(amendmentId, sha256)
        .query(AMENDMENT_DOCUMENT_INFO)
        .optional();
  }

  public AmendmentDocumentInfo insertAmendmentDocument(AmendmentDocument document) {
    jdbc.sql("INSERT INTO funding.amendment_documents"
            + "(id,amendment_id,file_name,file_size,sha256,content) VALUES (?,?,?,?,?,?)"
            + " ON CONFLICT (amendment_id,sha256) DO NOTHING")
        .params(document.id(), document.amendmentId(), document.fileName(), document.sizeBytes(),
            document.sha256(), document.content())
        .update();
    return amendmentDocumentByHash(document.amendmentId(), document.sha256())
        .orElseThrow(() -> new IllegalStateException("Espelho PDF não foi localizado após salvar."));
  }

  public List<Receipt> receipts() {
    return jdbc.sql(RECEIPT_SQL + " ORDER BY r.credit_date,r.id").query(RECEIPT).list();
  }

  public Optional<Receipt> receipt(UUID id, boolean lock) {
    return jdbc.sql(RECEIPT_SQL + " WHERE r.id=?" + (lock ? " FOR UPDATE OF r" : ""))
        .param(id)
        .query(RECEIPT)
        .optional();
  }

  public void insert(Parliamentarian p) {
    jdbc.sql("INSERT INTO funding.parliamentarians(id,name) VALUES (?,?)")
        .params(p.id(), p.name())
        .update();
  }

  public void insert(Amendment a) {
    jdbc.sql("INSERT INTO funding.amendments(id,parliamentarian_id,number,year) VALUES (?,?,?,?)")
        .params(a.id(), a.parliamentarianId(), a.number(), a.year())
        .update();
  }

  public void insert(UUID id, FundingService.NewReceipt r) {
    jdbc.sql(
            "INSERT INTO"
                + " funding.receipts(id,amendment_id,type,source,action,expense_element,object,credit_date,bank_account,amount)"
                + " VALUES (?,?,?,?,?,?,?,?,?,?)")
        .params(
            id,
            r.amendmentId(),
            r.type(),
            r.source(),
            r.action(),
            r.expenseElement(),
            r.object(),
            r.creditDate(),
            r.bankAccount(),
            r.amount())
        .update();
  }

  public boolean update(UUID id, FundingService.EditReceipt r) {
    jdbc.sql("SELECT set_config('app.receipt_correction', 'allowed', true)").query(String.class).single();
    return jdbc.sql(
                "UPDATE funding.receipts SET"
                    + " amendment_id=?,type=?,source=?,action=?,expense_element=?,object=?,credit_date=?,bank_account=?,amount=?,version=version+1"
                    + " WHERE id=? AND version=?")
            .params(
                r.amendmentId(), r.type(), r.source(), r.action(), r.expenseElement(), r.object(),
                r.creditDate(), r.bankAccount(), r.amount(), id, r.version())
            .update()
        == 1;
  }

  public FundingStore.ReceiptCommitments receiptCommitments(UUID id) {
    return jdbc.sql("SELECT COALESCE(SUM(amount),0) AS total, MIN(commitment_date) AS first_date"
            + " FROM execution.expenses WHERE receipt_id=?")
        .param(id)
        .query((r, n) -> new FundingStore.ReceiptCommitments(
            r.getBigDecimal("total"), r.getObject("first_date", LocalDate.class)))
        .single();
  }
}
