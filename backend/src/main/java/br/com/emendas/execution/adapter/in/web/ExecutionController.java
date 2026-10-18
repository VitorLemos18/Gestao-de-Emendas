package br.com.emendas.execution.adapter.in.web;

import br.com.emendas.execution.api.Execution.Reversal;
import br.com.emendas.execution.application.ExecutionService;
import br.com.emendas.execution.domain.PdfAttachment;
import br.com.emendas.foundation.domain.DomainException;
import br.com.emendas.foundation.api.Page;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ExecutionController {
  private final ExecutionService service;

  public ExecutionController(ExecutionService service) {
    this.service = service;
  }

  public record ExpenseInput(
      @NotNull UUID receiptId,
      @NotBlank @Size(max = 2000) String description,
      @NotBlank @Size(max = 200) String supplier,
      @Size(max = 18) String cnpj,
      @NotBlank @Size(max = 100) String document,
      @NotNull LocalDate commitmentDate,
      @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
      @Size(max = 2000) String observations) {}

  public record PostingInput(
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
      @NotBlank @Size(max = 100) String document,
      @NotBlank @Size(max = 100) String destinationAccount,
      @Size(max = 2000) String observations) {}

  public record PaymentInput(
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
      @NotBlank @Size(max = 100) String document,
      @NotBlank @Size(max = 100) String protocolNumber,
      @NotBlank @Size(max = 100) String destinationAccount,
      @Size(max = 2000) String observations) {}

  public record ReversalInput(
      @NotNull LocalDate date, @NotBlank @Size(min = 5, max = 2000) String reason) {}

  @GetMapping("/expenses")
  public Page<ExecutionService.ExpenseView> list(
      @RequestParam(name = "receipt_id", required = false) UUID receiptId,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "50") int limit) {
    return service.expenses(receiptId, offset, limit);
  }

  @GetMapping("/expenses/{id}")
  public ExecutionService.ExpenseDetail detail(@PathVariable UUID id) {
    return service.detail(id);
  }

  @PostMapping(value = "/expenses", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ExecutionService.ExpenseView create(
      @RequestHeader("Idempotency-Key") UUID key, @Valid @RequestBody ExpenseInput r) {
    return service.create(key, newExpense(r));
  }

  @PostMapping(value = "/expenses", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ExecutionService.ExpenseView createWithCommitmentPdf(
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestPart("expense") ExpenseInput r,
      @RequestPart(value = "commitment_document", required = false) MultipartFile file) {
    PdfAttachment pdf = null;
    if (file != null && !file.isEmpty()) {
      try {
        pdf = PdfAttachment.create(file.getOriginalFilename(), file.getBytes(), "Nota de Empenho");
      } catch (IOException error) {
        throw DomainException.invalid("Não foi possível ler o PDF da Nota de Empenho.");
      }
    }
    return service.create(key, newExpense(r), pdf);
  }

  @GetMapping("/expenses/{expenseId}/commitment-documents/{documentId}")
  public ResponseEntity<byte[]> commitmentDocument(
      @PathVariable UUID expenseId, @PathVariable UUID documentId) {
    var document = service.commitmentDocument(expenseId, documentId);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(document.sizeBytes())
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline()
                .filename(document.fileName(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(document.content());
  }

  private static ExecutionService.NewExpense newExpense(ExpenseInput r) {
    return new ExecutionService.NewExpense(
        r.receiptId(),
        r.description(),
        r.supplier(),
        r.cnpj(),
        r.document(),
        r.commitmentDate(),
        r.amount(),
        r.observations());
  }

  @PostMapping("/expenses/{id}/liquidations")
  public ExecutionService.PostingView liquidate(
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestBody PostingInput r) {
    return service.liquidate(
        key,
        new ExecutionService.Posting(
            id, r.date(), r.amount(), r.document(), r.destinationAccount(), r.observations()));
  }

  @GetMapping("/payments/{paymentId}/documents/{documentId}")
  public ResponseEntity<byte[]> paymentDocument(
      @PathVariable UUID paymentId, @PathVariable UUID documentId) {
    var document = service.paymentDocument(paymentId, documentId);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(document.sizeBytes())
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline()
                .filename(document.fileName(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(document.content());
  }

  @PostMapping(value = "/expenses/{id}/payments", consumes = MediaType.APPLICATION_JSON_VALUE)
  public ExecutionService.PostingView pay(
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestBody PaymentInput r) {
    return service.pay(
        key,
        new ExecutionService.Posting(
            id, r.date(), r.amount(), r.document(), r.destinationAccount(), r.observations()),
        r.protocolNumber(),
        null);
  }

  @PostMapping(
      value = "/expenses/{id}/payments",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ExecutionService.PostingView payWithOfficioPdf(
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestPart("payment") PaymentInput r,
      @RequestPart(value = "payment_document", required = false) MultipartFile file) {
    PdfAttachment pdf = null;
    if (file != null && !file.isEmpty()) {
      try {
        pdf = PdfAttachment.create(file.getOriginalFilename(), file.getBytes(), "Ofício do pagamento");
      } catch (IOException error) {
        throw DomainException.invalid("Não foi possível ler o PDF do Ofício do pagamento.");
      }
    }
    return service.pay(
        key,
        new ExecutionService.Posting(
            id, r.date(), r.amount(), r.document(), r.destinationAccount(), r.observations()),
        r.protocolNumber(),
        pdf);
  }

  @PostMapping("/payments/{id}/reversals")
  public Reversal reverse(
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestBody ReversalInput r) {
    return service.reverse(key, new ExecutionService.Reverse(id, r.date(), r.reason()));
  }
}
