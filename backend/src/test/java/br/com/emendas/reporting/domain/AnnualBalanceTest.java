package br.com.emendas.reporting.domain;

import static org.junit.jupiter.api.Assertions.*;

import br.com.emendas.foundation.domain.Money;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class AnnualBalanceTest {
  @Test
  void carryoverIsNotNewCreditAndReversalAffectsItsOwnYear() {
    var entries =
        List.of(
            new AnnualBalance.Entry(
                LocalDate.of(2025, 1, 1), AnnualBalance.Kind.CREDIT, Money.of("100000")),
            new AnnualBalance.Entry(
                LocalDate.of(2025, 2, 1), AnnualBalance.Kind.PAYMENT, Money.of("25000")),
            new AnnualBalance.Entry(
                LocalDate.of(2026, 1, 2), AnnualBalance.Kind.REVERSAL, Money.of("25000")));
    var first = AnnualBalance.calculate(2025, entries);
    var next = AnnualBalance.calculate(2026, entries);
    assertEquals(Money.of("75000"), first.closing());
    assertEquals(first.closing(), next.opening());
    assertEquals(Money.ZERO, next.received());
    assertEquals(Money.of("25000"), next.reversed());
    assertEquals(Money.of("100000"), next.closing());
  }
}
