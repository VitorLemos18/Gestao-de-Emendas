package br.com.emendas.execution.domain;

import static org.junit.jupiter.api.Assertions.*;

import br.com.emendas.foundation.domain.*;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class TimelineTest {
  private Timeline.Entry entry(String date, String amount) {
    return new Timeline.Entry(LocalDate.parse(date), Money.of(amount));
  }

  @Test
  void rejectsPaymentBeforeCreditEvenWhenFinalBalanceIsPositive() {
    assertThrows(
        DomainException.class,
        () ->
            Timeline.assertNonNegative(
                List.of(entry("2025-01-02", "-50.00"), entry("2025-01-03", "100.00"))));
  }

  @Test
  void aggregatesSameDayAndPreservesExactCents() {
    assertEquals(
        Money.of("0.00"),
        Timeline.assertNonNegative(
            List.of(
                entry("2025-01-02", "-0.30"),
                entry("2025-01-02", "0.10"),
                entry("2025-01-02", "0.20"))));
  }

  @Test
  void futureReversalDoesNotAllowEarlyReuse() {
    assertThrows(
        DomainException.class,
        () ->
            Timeline.assertNonNegative(
                List.of(
                    entry("2025-01-01", "100.00"),
                    entry("2025-01-02", "-100.00"),
                    entry("2025-01-03", "-100.00"),
                    entry("2025-01-04", "100.00"))));
  }

  @Test
  void moneyRejectsRoundingAndFormatsReais() {
    assertThrows(DomainException.class, () -> Money.of("1.001"));
    assertEquals("R$ 100.000,00", Money.of("100000").formatted());
  }

  @Test
  void aggregateCanExceedIndividualPostingLimit() {
    var posting = Money.of("600000000000.00").positive();
    assertEquals(Money.of("1200000000000.00"), posting.plus(posting));
    assertThrows(DomainException.class, () -> posting.plus(posting).positive());
  }
}
