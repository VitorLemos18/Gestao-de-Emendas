package br.com.emendas.execution.api;

import br.com.emendas.foundation.domain.Money;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

public interface Execution {
  record Expense(
      UUID id,
      UUID receiptId,
      String description,
      String supplier,
      String cnpj,
      String document,
      LocalDate commitmentDate,
      Money amount,
      CommitmentDocumentInfo commitmentDocument,
      String observations,
      long version) {
    public Expense(UUID id, UUID receiptId, String description, String supplier, String cnpj,
        String document, LocalDate commitmentDate, Money amount,
        CommitmentDocumentInfo commitmentDocument, String observations) {
      this(id, receiptId, description, supplier, cnpj, document, commitmentDate, amount,
          commitmentDocument, observations, 1);
    }
  }

  record CommitmentDocumentInfo(UUID id, String fileName, long sizeBytes, Instant uploadedAt) {}

  record CommitmentDocument(
      UUID id,
      UUID expenseId,
      String fileName,
      long sizeBytes,
      String sha256,
      Instant uploadedAt,
      byte[] content) {
    public CommitmentDocument {
      content = content.clone();
    }

    @Override public byte[] content() { return content.clone(); }
  }

  record Movement(
      UUID id,
      UUID expenseId,
      LocalDate date,
      Money amount,
      String document,
      String destinationAccount,
      String protocolNumber,
      PaymentDocumentInfo paymentDocument,
      String observations,
      long version) {
    public Movement(UUID id, UUID expenseId, LocalDate date, Money amount, String document,
        String destinationAccount, String protocolNumber, PaymentDocumentInfo paymentDocument,
        String observations) {
      this(id, expenseId, date, amount, document, destinationAccount, protocolNumber,
          paymentDocument, observations, 1);
    }
    public Movement(UUID id, UUID expenseId, LocalDate date, Money amount, String document) {
      this(id, expenseId, date, amount, document, null, null, null, null);
    }

    public Movement(
        UUID id,
        UUID expenseId,
        LocalDate date,
        Money amount,
        String document,
        String protocolNumber,
        PaymentDocumentInfo paymentDocument) {
      this(id, expenseId, date, amount, document, null, protocolNumber, paymentDocument, null);
    }
  }

  record PaymentDocumentInfo(UUID id, String fileName, long sizeBytes, Instant uploadedAt) {}

  record PaymentDocument(
      UUID id,
      UUID paymentId,
      String fileName,
      long sizeBytes,
      String sha256,
      Instant uploadedAt,
      byte[] content) {
    public PaymentDocument {
      content = content.clone();
    }

    @Override public byte[] content() { return content.clone(); }
  }

  record Reversal(UUID id, UUID paymentId, LocalDate date, String reason) {}

  record Snapshot(
      List<Expense> expenses,
      List<Movement> liquidations,
      List<Movement> payments,
      List<Reversal> reversals) {}

  Snapshot snapshot();

  Snapshot forReceipt(UUID id);
}
