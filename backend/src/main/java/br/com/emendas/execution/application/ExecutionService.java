package br.com.emendas.execution.application;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.execution.api.Execution;
import br.com.emendas.execution.domain.Cnpj;
import br.com.emendas.execution.domain.PdfAttachment;
import br.com.emendas.execution.domain.Timeline;
import br.com.emendas.foundation.api.*;
import br.com.emendas.foundation.domain.*;
import br.com.emendas.funding.api.Funding;
import br.com.emendas.identity.api.CurrentActor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ExecutionService implements Execution {
  private final ExecutionStore store;
  private final Funding funding;
  private final CurrentActor actor;
  private final AuditTrail audit;
  private final IdempotentCommands commands;

  public ExecutionService(
      ExecutionStore store,
      Funding funding,
      CurrentActor actor,
      AuditTrail audit,
      IdempotentCommands commands) {
    this.store = store;
    this.funding = funding;
    this.actor = actor;
    this.audit = audit;
    this.commands = commands;
  }

  public record NewExpense(
      UUID receiptId,
      String description,
      String supplier,
      String cnpj,
      String document,
      LocalDate commitmentDate,
      BigDecimal amount,
      String observations) {}

  private record CreateExpenseRequest(
      NewExpense expense, String attachmentName, String attachmentSha256) {}

  private record CreatePaymentRequest(
      Posting posting, String protocolNumber, String attachmentName, String attachmentSha256) {}

  private record ExpenseAuditSnapshot(
      UUID id,
      UUID receiptId,
      String description,
      String supplier,
      String maskedCnpj,
      String document,
      LocalDate commitmentDate,
      MoneyView amount,
      String commitmentDocumentName,
      String observations) {}

  public record Posting(
      UUID expenseId,
      LocalDate date,
      BigDecimal amount,
      String document,
      String destinationAccount,
      String observations) {}

  public record Reverse(UUID paymentId, LocalDate date, String reason) {}

  public record ExpenseView(
      UUID id,
      UUID receiptId,
      String description,
      String supplier,
      String cnpj,
      String document,
      LocalDate commitmentDate,
      MoneyView amount,
      Execution.CommitmentDocumentInfo commitmentDocument,
      MoneyView liquidated,
      MoneyView paid,
      MoneyView pendingPayment,
      String observations) {}

  public record PostingView(
      UUID id,
      UUID expenseId,
      LocalDate date,
      MoneyView amount,
      String document,
      String destinationAccount,
      String protocolNumber,
      Execution.PaymentDocumentInfo paymentDocument,
      String observations) {
    public static PostingView of(Movement m) {
      return new PostingView(
          m.id(), m.expenseId(), m.date(), MoneyView.of(m.amount()), m.document(),
          m.destinationAccount(), null, null, m.observations());
    }

    public static PostingView ofPayment(Movement m) {
      return new PostingView(
          m.id(),
          m.expenseId(),
          m.date(),
          MoneyView.of(m.amount()),
          m.document(),
          m.destinationAccount(),
          m.protocolNumber(),
          m.paymentDocument(),
          m.observations());
    }
  }

  public record ExpenseDetail(
      ExpenseView expense,
      List<PostingView> liquidations,
      List<PostingView> payments,
      List<Reversal> reversals) {}

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Snapshot snapshot() {
    return store.snapshot(null);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Snapshot forReceipt(UUID id) {
    return store.snapshot(id);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public Page<ExpenseView> expenses(UUID receiptId, int offset, int limit) {
    var snapshot = store.snapshot(receiptId);
    return Page.slice(
        snapshot.expenses().stream().map(e -> view(e, snapshot)).toList(), offset, limit);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public ExpenseDetail detail(UUID id) {
    var e = expense(id);
    var snapshot = forReceipt(e.receiptId());
    var payments = snapshot.payments().stream().filter(p -> p.expenseId().equals(id)).toList();
    var paymentIds = payments.stream().map(Movement::id).toList();
    return new ExpenseDetail(
        view(e, snapshot),
        snapshot.liquidations().stream()
            .filter(l -> l.expenseId().equals(id))
            .map(PostingView::of)
            .toList(),
        payments.stream().map(PostingView::ofPayment).toList(),
        snapshot.reversals().stream().filter(r -> paymentIds.contains(r.paymentId())).toList());
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public ExpenseView create(UUID key, NewExpense r) {
    return create(key, r, null);
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public ExpenseView create(UUID key, NewExpense r, PdfAttachment pdf) {
    return commands.execute(
        actor.get().id(),
        key,
        "expense.create",
        new CreateExpenseRequest(r, pdf == null ? null : pdf.fileName(), pdf == null ? null : pdf.sha256()),
        ExpenseView.class,
        () -> {
          var receipt = funding.lockReceipt(r.receiptId());
          Money amount = new Money(r.amount()).positive();
          Timeline.noEarlierThan(r.commitmentDate(), receipt.creditDate());
          var snapshot = forReceipt(receipt.id());
          var committed =
              snapshot.expenses().stream().map(Expense::amount).reduce(Money.ZERO, Money::plus);
          if (committed.plus(amount).compareTo(receipt.amount()) > 0)
            throw DomainException.conflict("Empenhos excedem o valor deste recebimento.");
          var expense =
              new Expense(
                  UUID.randomUUID(),
                  r.receiptId(),
                  r.description(),
                  r.supplier(),
                  Cnpj.normalize(r.cnpj()),
                  r.document(),
                  r.commitmentDate(),
                  amount,
                  null,
                  normalizeObservations(r.observations()));
          store.insert(expense);
          if (pdf != null) {
            store.insertCommitmentDocument(
                new Execution.CommitmentDocument(
                    UUID.randomUUID(),
                    expense.id(),
                    pdf.fileName(),
                    pdf.sizeBytes(),
                    pdf.sha256(),
                    Instant.now(),
                    pdf.content()));
          }
          var persistedExpense = store.expense(expense.id()).orElse(expense);
          var result = view(persistedExpense, forReceipt(receipt.id()));
          audit.record(
              actor.get(),
              "COMMIT",
              "expense",
              expense.id(),
              null,
              auditSnapshot(result),
              "Registro de empenho");
          return result;
        });
  }

  @Transactional(readOnly = true)
  public Execution.CommitmentDocument commitmentDocument(UUID expenseId, UUID documentId) {
    expense(expenseId);
    return store
        .commitmentDocument(expenseId, documentId)
        .orElseThrow(() -> DomainException.missing("Nota de Empenho em PDF não encontrada."));
  }

  @Transactional(readOnly = true)
  public Execution.PaymentDocument paymentDocument(UUID paymentId, UUID documentId) {
    store
        .payment(paymentId)
        .orElseThrow(() -> DomainException.missing("Pagamento não encontrado."));
    return store
        .paymentDocument(paymentId, documentId)
        .orElseThrow(() -> DomainException.missing("Ofício do pagamento em PDF não encontrado."));
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public PostingView liquidate(UUID key, Posting r) {
    return commands.execute(
        actor.get().id(),
        key,
        "expense.liquidate",
        r,
        PostingView.class,
        () -> {
          var e = expense(r.expenseId());
          funding.lockReceipt(e.receiptId());
          var snapshot = forReceipt(e.receiptId());
          var destinationAccount = requiredDestinationAccount(r.destinationAccount());
          var previousAccounts = destinationAccounts(snapshot.liquidations(), e.id());
          if (!previousAccounts.isEmpty() && !previousAccounts.contains(destinationAccount))
            throw DomainException.conflict(
                "Use na liquidação a mesma conta de destino já registrada para este empenho.");
          Money amount = new Money(r.amount()).positive();
          Timeline.noEarlierThan(r.date(), e.commitmentDate());
          var liquidated =
              snapshot.liquidations().stream()
                  .filter(l -> l.expenseId().equals(e.id()))
                  .map(Movement::amount)
                  .reduce(Money.ZERO, Money::plus);
          if (liquidated.plus(amount).compareTo(e.amount()) > 0)
            throw DomainException.conflict("Liquidação excede o valor empenhado.");
          var m = new Movement(
              UUID.randomUUID(), e.id(), r.date(), amount, r.document(), destinationAccount, null, null,
              normalizeObservations(r.observations()));
          store.liquidate(m);
          var result = PostingView.of(m);
          audit.record(
              actor.get(),
              "LIQUIDATE",
              "liquidation",
              m.id(),
              null,
              result,
              "Registro de liquidação");
          return result;
        });
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public PostingView pay(UUID key, Posting r, String protocolNumber, PdfAttachment pdf) {
    var request =
        new CreatePaymentRequest(
            r,
            protocolNumber,
            pdf == null ? null : pdf.fileName(),
            pdf == null ? null : pdf.sha256());
    return commands.execute(
        actor.get().id(),
        key,
        "expense.pay",
        request,
        PostingView.class,
        () -> {
          var e = expense(r.expenseId());
          var receipt = funding.lockReceipt(e.receiptId());
          var snapshot = forReceipt(e.receiptId());
          var destinationAccount = requiredDestinationAccount(r.destinationAccount());
          var liquidationAccounts = destinationAccounts(snapshot.liquidations(), e.id());
          if (liquidationAccounts.size() > 1)
            throw DomainException.conflict(
                "As liquidações deste empenho possuem contas de destino diferentes; confira os registros antes de pagar.");
          if (!liquidationAccounts.isEmpty()
              && !liquidationAccounts.contains(destinationAccount))
            throw DomainException.conflict(
                "A conta de destino do pagamento deve ser a mesma registrada na liquidação.");
          var m =
              new Movement(
                  UUID.randomUUID(),
                  e.id(),
                  r.date(),
                  new Money(r.amount()).positive(),
                  r.document(),
                  destinationAccount,
                  protocolNumber,
                  null,
                  normalizeObservations(r.observations()));
          Timeline.noEarlierThan(r.date(), e.commitmentDate());
          var allPayments = new ArrayList<>(snapshot.payments());
          allPayments.add(m);
          validateTimeline(
              receipt,
              new Snapshot(
                  snapshot.expenses(), snapshot.liquidations(), allPayments, snapshot.reversals()),
              e.id());
          store.pay(m);
          if (pdf != null) {
            store.insertPaymentDocument(
                new Execution.PaymentDocument(
                    UUID.randomUUID(),
                    m.id(),
                    pdf.fileName(),
                    pdf.sizeBytes(),
                    pdf.sha256(),
                    Instant.now(),
                    pdf.content()));
          }
          var persistedPayment = store.payment(m.id()).orElse(m);
          var result = PostingView.ofPayment(persistedPayment);
          audit.record(
              actor.get(), "PAY", "payment", m.id(), null, result, "Registro de pagamento");
          return result;
        });
  }

  private static String requiredDestinationAccount(String account) {
    if (account == null || account.isBlank())
      throw DomainException.invalid("Informe a conta de destino.");
    var normalized = account.trim();
    if (normalized.length() > 100)
      throw DomainException.invalid("A conta de destino deve ter no máximo 100 caracteres.");
    return normalized;
  }

  private static Set<String> destinationAccounts(List<Movement> movements, UUID expenseId) {
    var accounts = new LinkedHashSet<String>();
    for (var movement : movements) {
      if (movement.expenseId().equals(expenseId)
          && movement.destinationAccount() != null
          && !movement.destinationAccount().isBlank())
        accounts.add(movement.destinationAccount().trim());
    }
    return accounts;
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public Reversal reverse(UUID key, Reverse r) {
    return commands.execute(
        actor.get().id(),
        key,
        "payment.reverse",
        r,
        Reversal.class,
        () -> {
          var p =
              store
                  .payment(r.paymentId())
                  .orElseThrow(() -> DomainException.missing("Pagamento não encontrado."));
          var e = expense(p.expenseId());
          funding.lockReceipt(e.receiptId());
          var snapshot = forReceipt(e.receiptId());
          if (snapshot.reversals().stream().anyMatch(s -> s.paymentId().equals(p.id())))
            throw DomainException.conflict("Pagamento já estornado.");
          Timeline.noEarlierThan(r.date(), p.date());
          var result = new Reversal(UUID.randomUUID(), p.id(), r.date(), r.reason());
          store.reverse(result);
          audit.record(
              actor.get(), "REVERSE", "payment", p.id(), PostingView.ofPayment(p), result, r.reason());
          return result;
        });
  }

  private Expense expense(UUID id) {
    return store.expense(id).orElseThrow(() -> DomainException.missing("Despesa não encontrada."));
  }

  private static void validateTimeline(Funding.Receipt receipt, Snapshot snapshot, UUID expenseId) {
    var cash = new ArrayList<Timeline.Entry>();
    cash.add(new Timeline.Entry(receipt.creditDate(), receipt.amount()));
    var available = new ArrayList<Timeline.Entry>();
    snapshot.liquidations().stream()
        .filter(l -> l.expenseId().equals(expenseId))
        .forEach(l -> available.add(new Timeline.Entry(l.date(), l.amount())));
    for (var p : snapshot.payments()) {
      cash.add(new Timeline.Entry(p.date(), p.amount().negate()));
      if (p.expenseId().equals(expenseId))
        available.add(new Timeline.Entry(p.date(), p.amount().negate()));
      snapshot.reversals().stream()
          .filter(r -> r.paymentId().equals(p.id()))
          .forEach(
              r -> {
                cash.add(new Timeline.Entry(r.date(), p.amount()));
                if (p.expenseId().equals(expenseId))
                  available.add(new Timeline.Entry(r.date(), p.amount()));
              });
    }
    Timeline.assertNonNegative(cash);
    Timeline.assertNonNegative(available);
  }

  private static ExpenseView view(Expense e, Snapshot snapshot) {
    Money liquidated =
        snapshot.liquidations().stream()
            .filter(l -> l.expenseId().equals(e.id()))
            .map(Movement::amount)
            .reduce(Money.ZERO, Money::plus);
    Money paid =
        snapshot.payments().stream()
            .filter(
                p ->
                    p.expenseId().equals(e.id())
                        && snapshot.reversals().stream()
                            .noneMatch(r -> r.paymentId().equals(p.id())))
            .map(Movement::amount)
            .reduce(Money.ZERO, Money::plus);
    return new ExpenseView(
        e.id(),
        e.receiptId(),
        e.description(),
        e.supplier(),
        e.cnpj(),
        e.document(),
        e.commitmentDate(),
        MoneyView.of(e.amount()),
        e.commitmentDocument(),
        MoneyView.of(liquidated),
        MoneyView.of(paid),
        MoneyView.of(liquidated.minus(paid)),
        e.observations());
  }

  private static ExpenseAuditSnapshot auditSnapshot(ExpenseView expense) {
    String cnpj = expense.cnpj();
    String masked = cnpj == null ? null : "••••••••••" + cnpj.substring(cnpj.length() - 4);
    return new ExpenseAuditSnapshot(
        expense.id(),
        expense.receiptId(),
        expense.description(),
        expense.supplier(),
        masked,
        expense.document(),
        expense.commitmentDate(),
        expense.amount(),
        expense.commitmentDocument() == null ? null : expense.commitmentDocument().fileName(),
        expense.observations());
  }

  private static String normalizeObservations(String observations) {
    return observations == null || observations.isBlank() ? null : observations.strip();
  }
}
