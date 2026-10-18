package br.com.emendas.funding.domain;

import br.com.emendas.foundation.domain.*;
import java.time.LocalDate;

public final class ReceiptPolicy {
  private ReceiptPolicy() {}

  public static void validate(
      Money amount, LocalDate creditDate, String object, String bankAccount) {
    amount.positive();
    if (creditDate == null || creditDate.getYear() < 2000 || creditDate.getYear() > 2100)
      throw DomainException.invalid("Data do crédito fora do período permitido.");
    if (object == null || object.isBlank() || bankAccount == null || bankAccount.isBlank())
      throw DomainException.invalid("Objeto e conta bancária são obrigatórios.");
  }
}
