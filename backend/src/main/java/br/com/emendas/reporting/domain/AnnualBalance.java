package br.com.emendas.reporting.domain;

import br.com.emendas.foundation.domain.*;
import java.time.LocalDate;
import java.util.List;

public record AnnualBalance(
    Money opening, Money received, Money paid, Money reversed, Money closing) {
  public enum Kind {
    CREDIT,
    PAYMENT,
    REVERSAL
  }

  public record Entry(LocalDate date, Kind kind, Money amount) {}

  public static AnnualBalance calculate(int year, List<Entry> entries) {
    if (year < 2000 || year > 2100)
      throw DomainException.invalid("Exercício deve estar entre 2000 e 2100.");
    Money opening = Money.ZERO, received = Money.ZERO, paid = Money.ZERO, reversed = Money.ZERO;
    for (var e : entries) {
      if (e.date().getYear() < year)
        opening = e.kind() == Kind.PAYMENT ? opening.minus(e.amount()) : opening.plus(e.amount());
      else if (e.date().getYear() == year) {
        switch (e.kind()) {
          case CREDIT -> received = received.plus(e.amount());
          case PAYMENT -> paid = paid.plus(e.amount());
          case REVERSAL -> reversed = reversed.plus(e.amount());
        }
      }
    }
    return new AnnualBalance(
        opening, received, paid, reversed, opening.plus(received).minus(paid).plus(reversed));
  }
}
