package br.com.emendas.execution.domain;

import br.com.emendas.foundation.domain.*;
import java.time.LocalDate;
import java.util.*;

public final class Timeline {
  private Timeline() {}

  public record Entry(LocalDate date, Money delta) {}

  public static Money assertNonNegative(List<Entry> entries) {
    var days = new TreeMap<LocalDate, Money>();
    for (var entry : entries) days.merge(entry.date(), entry.delta(), Money::plus);
    Money balance = Money.ZERO;
    for (var day : days.entrySet()) {
      balance = balance.plus(day.getValue());
      if (balance.compareTo(Money.ZERO) < 0)
        throw DomainException.conflict(
            "O lançamento deixa saldo ou valor liquidado negativo em " + day.getKey() + ".");
    }
    return balance;
  }

  public static void noEarlierThan(LocalDate date, LocalDate minimum) {
    if (date.isBefore(minimum) || date.getYear() < 2000 || date.getYear() > 2100)
      throw DomainException.invalid(
          "Data anterior ao lançamento de origem ou fora do período permitido.");
  }
}
