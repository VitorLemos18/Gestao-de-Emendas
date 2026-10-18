package br.com.emendas.execution.application;

import br.com.emendas.execution.api.Execution.*;
import java.util.*;

public interface ExecutionStore {
  Snapshot snapshot(UUID receiptId);

  Optional<Expense> expense(UUID id);

  Optional<Movement> payment(UUID id);

  Optional<PaymentDocument> paymentDocument(UUID paymentId, UUID documentId);

  PaymentDocumentInfo insertPaymentDocument(PaymentDocument document);

  Optional<CommitmentDocument> commitmentDocument(UUID expenseId, UUID documentId);

  Optional<CommitmentDocumentInfo> commitmentDocumentByHash(UUID expenseId, String sha256);

  CommitmentDocumentInfo insertCommitmentDocument(CommitmentDocument document);

  void insert(Expense expense);

  void liquidate(Movement movement);

  void pay(Movement movement);

  void reverse(Reversal reversal);
}
