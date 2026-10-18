package br.com.emendas.reporting.application;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.execution.api.Execution;
import br.com.emendas.foundation.api.*;
import br.com.emendas.foundation.domain.*;
import br.com.emendas.funding.api.Funding;
import br.com.emendas.identity.api.CurrentActor;
import br.com.emendas.reporting.domain.AnnualBalance;
import br.com.emendas.reporting.domain.AnnualBalance.*;
import java.time.*;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReportingService {
  private final Funding funding;
  private final Execution execution;
  private final AuditTrail audit;
  private final CurrentActor actor;
  private final ExcelWriter excel;

  public ReportingService(
      Funding funding,
      Execution execution,
      AuditTrail audit,
      CurrentActor actor,
      ExcelWriter excel) {
    this.funding = funding;
    this.execution = execution;
    this.audit = audit;
    this.actor = actor;
    this.excel = excel;
  }

  public record Totals(
      MoneyView openingBalance,
      MoneyView received,
      MoneyView paid,
      MoneyView reversed,
      MoneyView closingBalance) {}

  public record ReceiptLine(
      UUID receiptId,
      UUID parliamentarianId,
      String parliamentarian,
      String amendment,
      int amendmentYear,
      String type,
      String source,
      String action,
      String expenseElement,
      String object,
      LocalDate creditDate,
      String bankAccount,
      MoneyView originalAmount,
      Totals balance,
      MoneyView committed,
      MoneyView liquidated,
      MoneyView pendingPayment) {}

  public record LedgerLine(
      UUID id,
      UUID receiptId,
      UUID expenseId,
      LocalDate date,
      String kind,
      String description,
      String document,
      MoneyView amount) {}

  public record Report(
      int year, Totals totals, List<ReceiptLine> receipts, List<LedgerLine> ledger) {}

  public record Summary(int year, Totals totals, Page<ReceiptLine> receipts) {}

  public Summary summary(int year, UUID parliamentarianId, int offset, int limit) {
    var report = report(year, parliamentarianId, null);
    return new Summary(year, report.totals(), Page.slice(report.receipts(), offset, limit));
  }

  public Page<LedgerLine> ledger(UUID receiptId, int year, int offset, int limit) {
    funding.receipt(receiptId);
    return Page.slice(report(year, null, receiptId).ledger(), offset, limit);
  }

  @Transactional(isolation = Isolation.REPEATABLE_READ)
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public byte[] export(int year, UUID parliamentarianId) {
    var report = report(year, parliamentarianId, null);
    var history = new ArrayList<AuditTrail.Entry>();
    int offset = 0;
    while (true) {
      var page = audit.list(null, null, offset, 200);
      history.addAll(page.items());
      if (history.size() >= page.total()) break;
      offset += 200;
    }
    byte[] bytes = excel.write(report, history);
    audit.record(
        actor.get(),
        "EXPORT",
        "report",
        UUID.randomUUID(),
        null,
        Map.of("year", year, "receipts", report.receipts().size()),
        "Exportação Excel financeiro");
    return bytes;
  }

  private Report report(int year, UUID parliamentarianId, UUID receiptId) {
    AnnualBalance.calculate(year, List.of());
    var snapshot = execution.snapshot();
    var cutoff = LocalDate.of(year, 12, 31);
    var lines = new ArrayList<ReceiptLine>();
    var ledger = new ArrayList<LedgerLine>();
    Money opening = Money.ZERO,
        received = Money.ZERO,
        paid = Money.ZERO,
        reversed = Money.ZERO,
        closing = Money.ZERO;
    for (var r : funding.receipts()) {
      if (r.creditDate().isAfter(cutoff)
          || (parliamentarianId != null && !r.parliamentarianId().equals(parliamentarianId))
          || (receiptId != null && !r.id().equals(receiptId))) continue;
      var events = new ArrayList<Entry>();
      events.add(new Entry(r.creditDate(), Kind.CREDIT, r.amount()));
      ledger.add(
          new LedgerLine(
              r.id(),
              r.id(),
              null,
              r.creditDate(),
              "CREDIT",
              r.object(),
              r.amendmentNumber(),
              MoneyView.of(r.amount())));
      var expenses =
          snapshot.expenses().stream().filter(e -> e.receiptId().equals(r.id())).toList();
      var ids =
          expenses.stream().map(Execution.Expense::id).collect(java.util.stream.Collectors.toSet());
      var movements =
          snapshot.payments().stream().filter(p -> ids.contains(p.expenseId())).toList();
      for (var p : movements) {
        events.add(new Entry(p.date(), Kind.PAYMENT, p.amount()));
        ledger.add(
            new LedgerLine(
                p.id(),
                r.id(),
                p.expenseId(),
                p.date(),
                "PAYMENT",
                "Pagamento",
                p.document(),
                MoneyView.of(p.amount().negate())));
        for (var reversal : snapshot.reversals())
          if (reversal.paymentId().equals(p.id())) {
            events.add(new Entry(reversal.date(), Kind.REVERSAL, p.amount()));
            ledger.add(
                new LedgerLine(
                    reversal.id(),
                    r.id(),
                    p.expenseId(),
                    reversal.date(),
                    "REVERSAL",
                    reversal.reason(),
                    p.document(),
                    MoneyView.of(p.amount())));
          }
      }
      var balance = AnnualBalance.calculate(year, events);
      Money committed =
          expenses.stream()
              .filter(e -> !e.commitmentDate().isAfter(cutoff))
              .map(Execution.Expense::amount)
              .reduce(Money.ZERO, Money::plus);
      Money liquidated =
          snapshot.liquidations().stream()
              .filter(l -> ids.contains(l.expenseId()) && !l.date().isAfter(cutoff))
              .map(Execution.Movement::amount)
              .reduce(Money.ZERO, Money::plus);
      Money netPaid =
          events.stream()
              .filter(e -> !e.date().isAfter(cutoff) && e.kind() != Kind.CREDIT)
              .map(e -> e.kind() == Kind.PAYMENT ? e.amount() : e.amount().negate())
              .reduce(Money.ZERO, Money::plus);
      lines.add(
          new ReceiptLine(
              r.id(),
              r.parliamentarianId(),
              r.parliamentarianName(),
              r.amendmentNumber(),
              r.amendmentYear(),
              r.type(),
              r.source(),
              r.action(),
              r.expenseElement(),
              r.object(),
              r.creditDate(),
              r.bankAccount(),
              MoneyView.of(r.amount()),
              totals(balance),
              MoneyView.of(committed),
              MoneyView.of(liquidated),
              MoneyView.of(liquidated.minus(netPaid))));
      opening = opening.plus(balance.opening());
      received = received.plus(balance.received());
      paid = paid.plus(balance.paid());
      reversed = reversed.plus(balance.reversed());
      closing = closing.plus(balance.closing());
    }
    ledger.removeIf(l -> l.date().getYear() != year);
    ledger.sort(Comparator.comparing(LedgerLine::date).thenComparing(LedgerLine::id));
    return new Report(
        year,
        new Totals(
            MoneyView.of(opening),
            MoneyView.of(received),
            MoneyView.of(paid),
            MoneyView.of(reversed),
            MoneyView.of(closing)),
        List.copyOf(lines),
        List.copyOf(ledger));
  }

  private static Totals totals(AnnualBalance b) {
    return new Totals(
        MoneyView.of(b.opening()),
        MoneyView.of(b.received()),
        MoneyView.of(b.paid()),
        MoneyView.of(b.reversed()),
        MoneyView.of(b.closing()));
  }
}
