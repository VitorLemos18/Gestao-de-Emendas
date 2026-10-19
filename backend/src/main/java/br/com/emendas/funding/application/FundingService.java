package br.com.emendas.funding.application;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.foundation.api.*;
import br.com.emendas.foundation.domain.*;
import br.com.emendas.funding.api.Funding;
import br.com.emendas.funding.domain.ReceiptPolicy;
import br.com.emendas.funding.domain.AmendmentMirrorPdf;
import br.com.emendas.identity.api.CurrentActor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(readOnly = true)
public class FundingService implements Funding {
  private final FundingStore store;
  private final CurrentActor actor;
  private final AuditTrail audit;
  private final IdempotentCommands commands;

  public FundingService(
      FundingStore store, CurrentActor actor, AuditTrail audit, IdempotentCommands commands) {
    this.store = store;
    this.actor = actor;
    this.audit = audit;
    this.commands = commands;
  }

  public record NewReceipt(
      UUID amendmentId,
      String type,
      String source,
      String action,
      String expenseElement,
      String object,
      LocalDate creditDate,
      String bankAccount,
      BigDecimal amount) {}

  public record EditReceipt(
      UUID amendmentId,
      String type,
      String source,
      String action,
      String expenseElement,
      String object,
      String bankAccount,
      LocalDate creditDate,
      BigDecimal amount,
      long version,
      String reason) {}

  public record NewAmendment(
      UUID parliamentarianId, String number, int year, String fileName, String sha256) {}

  public record ReceiptView(
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
      String creditDateFormatted,
      String bankAccount,
      MoneyView amount,
      long version) {
    public static ReceiptView of(Receipt r) {
      return new ReceiptView(
          r.id(),
          r.amendmentId(),
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
          r.creditDate().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")),
          r.bankAccount(),
          MoneyView.of(r.amount()),
          r.version());
    }
  }

  public List<Parliamentarian> parliamentarians() {
    return store.parliamentarians();
  }

  public List<Amendment> amendments() {
    return store.amendments();
  }

  public List<Receipt> receipts() {
    return store.receipts();
  }

  public Receipt receipt(UUID id) {
    return store
        .receipt(id, false)
        .orElseThrow(() -> DomainException.missing("Recebimento não encontrado."));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public Receipt lockReceipt(UUID id) {
    return store
        .receipt(id, true)
        .orElseThrow(() -> DomainException.missing("Recebimento não encontrado."));
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public Parliamentarian createParliamentarian(String name) {
    var result = new Parliamentarian(UUID.randomUUID(), name.trim());
    store.insert(result);
    audit.record(
        actor.get(),
        "CREATE",
        "parliamentarian",
        result.id(),
        null,
        result,
        "Cadastro do parlamentar");
    return result;
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public Amendment createAmendment(UUID parliamentarianId, String number, int year) {
    return createAmendment(parliamentarianId, number, year, null);
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public Amendment createAmendment(
      UUID key, UUID parliamentarianId, String number, int year, AmendmentMirrorPdf pdf) {
    if (pdf == null) throw DomainException.invalid("Anexe o espelho da emenda em PDF.");
    return commands.execute(
        actor.get().id(),
        key,
        "amendment.create",
        new NewAmendment(parliamentarianId, number, year, pdf.fileName(), pdf.sha256()),
        Amendment.class,
        () -> createAmendment(parliamentarianId, number, year, pdf));
  }

  private Amendment createAmendment(
      UUID parliamentarianId, String number, int year, AmendmentMirrorPdf pdf) {
    if (parliamentarians().stream().noneMatch(p -> p.id().equals(parliamentarianId)))
      throw DomainException.missing("Parlamentar não encontrado.");
    var base = new Amendment(UUID.randomUUID(), parliamentarianId, number, year);
    store.insert(base);
    Amendment result = base;
    if (pdf != null) {
      var document = new AmendmentDocumentInfo(
          UUID.randomUUID(), pdf.fileName(), pdf.sizeBytes(), java.time.Instant.now());
      var persistedDocument = store.insertAmendmentDocument(
          new AmendmentDocument(
              document.id(), base.id(), pdf.fileName(), pdf.sizeBytes(), pdf.sha256(),
              document.uploadedAt(), pdf.content()));
      result = new Amendment(
          base.id(), base.parliamentarianId(), base.number(), base.year(), persistedDocument);
    }
    audit.record(
        actor.get(), "CREATE", "amendment", result.id(), null, result, "Cadastro da emenda");
    return result;
  }

  @Transactional(readOnly = true)
  public AmendmentDocument amendmentDocument(UUID amendmentId, UUID documentId) {
    if (amendments().stream().noneMatch(a -> a.id().equals(amendmentId)))
      throw DomainException.missing("Emenda não encontrada.");
    return store.amendmentDocument(amendmentId, documentId)
        .orElseThrow(() -> DomainException.missing("Espelho da emenda em PDF não encontrado."));
  }

  @Transactional
  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  public ReceiptView createReceipt(UUID key, NewReceipt request) {
    return commands.execute(
        actor.get().id(),
        key,
        "receipt.create",
        request,
        ReceiptView.class,
        () -> {
          ReceiptPolicy.validate(
              new Money(request.amount()),
              request.creditDate(),
              request.object(),
              request.bankAccount());
          if (amendments().stream().noneMatch(a -> a.id().equals(request.amendmentId())))
            throw DomainException.missing("Emenda não encontrada.");
          UUID id = UUID.randomUUID();
          store.insert(id, request);
          var result = ReceiptView.of(receipt(id));
          audit.record(actor.get(), "CREATE", "receipt", id, null, result, "Registro do crédito");
          return result;
        });
  }

  @Transactional
  @PreAuthorize("hasRole('ADMIN')")
  public ReceiptView update(UUID id, EditReceipt request) {
    var before = lockReceipt(id);
    ReceiptPolicy.validate(
        new Money(request.amount()), request.creditDate(), request.object(), request.bankAccount());
    if (amendments().stream().noneMatch(a -> a.id().equals(request.amendmentId())))
      throw DomainException.missing("Emenda não encontrada.");
    var commitments = store.receiptCommitments(id);
    if (new Money(request.amount()).compareTo(new Money(commitments.total())) < 0)
      throw DomainException.conflict("O novo valor não pode ser menor que o total já empenhado.");
    if (commitments.firstCommitmentDate() != null
        && request.creditDate().isAfter(commitments.firstCommitmentDate()))
      throw DomainException.conflict(
          "A nova data do crédito não pode ser posterior a um empenho já registrado.");
    if (!store.update(id, request))
      throw DomainException.conflict("Recebimento alterado. Atualize a tela antes de salvar.");
    var after = ReceiptView.of(receipt(id));
    audit.record(
        actor.get(), "UPDATE", "receipt", id, ReceiptView.of(before), after, request.reason());
    return after;
  }
}
