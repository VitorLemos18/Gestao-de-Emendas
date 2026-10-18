package br.com.emendas.funding.api;

import br.com.emendas.foundation.domain.Money;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

public interface Funding {
  record Parliamentarian(UUID id, String name) {}

  record Amendment(UUID id, UUID parliamentarianId, String number, int year, AmendmentDocumentInfo mirrorDocument) {
    public Amendment(UUID id, UUID parliamentarianId, String number, int year) {
      this(id, parliamentarianId, number, year, null);
    }
  }

  record AmendmentDocumentInfo(UUID id, String fileName, long sizeBytes, Instant uploadedAt) {}

  record AmendmentDocument(
      UUID id,
      UUID amendmentId,
      String fileName,
      long sizeBytes,
      String sha256,
      Instant uploadedAt,
      byte[] content) {
    public AmendmentDocument {
      content = content.clone();
    }

    @Override
    public byte[] content() {
      return content.clone();
    }
  }

  record Receipt(
      UUID id,
      UUID amendmentId,
      UUID parliamentarianId,
      String parliamentarianName,
      String amendmentNumber,
      int amendmentYear,
      String type,
      String source,
      String action,
      String expenseElement,
      String object,
      LocalDate creditDate,
      String bankAccount,
      Money amount,
      long version) {}

  List<Parliamentarian> parliamentarians();

  List<Amendment> amendments();

  List<Receipt> receipts();

  Receipt receipt(UUID id);

  /** Adquire bloqueio pessimista na transação chamadora, antes de conferir e lançar execução. */
  Receipt lockReceipt(UUID id);
}
