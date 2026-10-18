package br.com.emendas.funding.adapter.in.web;

import br.com.emendas.foundation.api.Page;
import br.com.emendas.foundation.domain.DomainException;
import br.com.emendas.funding.api.Funding.*;
import br.com.emendas.funding.application.FundingService;
import br.com.emendas.funding.domain.AmendmentMirrorPdf;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class FundingController {
  private final FundingService service;

  public FundingController(FundingService service) {
    this.service = service;
  }

  public record Author(@NotBlank @Size(max = 160) String name) {}

  public record AmendmentInput(
      @NotNull UUID parliamentarianId,
      @NotBlank @Size(max = 100) String number,
      @Min(2000) @Max(2100) int year) {}

  public record ReceiptInput(
      @NotNull UUID amendmentId,
      @NotBlank @Size(max = 100) String type,
      @NotBlank @Size(max = 160) String source,
      @NotBlank @Size(max = 200) String action,
      @NotBlank @Size(max = 200) String expenseElement,
      @NotBlank @Size(max = 2000) String object,
      @NotNull LocalDate creditDate,
      @NotBlank @Size(max = 100) String bankAccount,
      @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount) {}

  public record ReceiptEdit(
      @NotBlank @Size(max = 100) String type,
      @NotBlank @Size(max = 160) String source,
      @NotBlank @Size(max = 200) String action,
      @NotBlank @Size(max = 200) String expenseElement,
      @NotBlank @Size(max = 2000) String object,
      @NotBlank @Size(max = 100) String bankAccount,
      @Min(1) long version,
      @NotBlank @Size(min = 5, max = 2000) String reason) {}

  @GetMapping("/parliamentarians")
  public Page<Parliamentarian> authors(
      @RequestParam(defaultValue = "0") int offset, @RequestParam(defaultValue = "50") int limit) {
    return Page.slice(service.parliamentarians(), offset, limit);
  }

  @PostMapping("/parliamentarians")
  public Parliamentarian create(@Valid @RequestBody Author body) {
    return service.createParliamentarian(body.name());
  }

  @GetMapping("/amendments")
  public Page<Amendment> amendments(
      @RequestParam(defaultValue = "0") int offset, @RequestParam(defaultValue = "50") int limit) {
    return Page.slice(service.amendments(), offset, limit);
  }

  @PostMapping("/amendments")
  public Amendment create(@Valid @RequestBody AmendmentInput body) {
    return service.createAmendment(body.parliamentarianId(), body.number(), body.year());
  }

  @PostMapping(value = "/amendments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Amendment createWithMirrorPdf(
      @RequestHeader("Idempotency-Key") UUID key,
      @Valid @RequestPart("amendment") AmendmentInput body,
      @RequestPart("mirror_document") MultipartFile file) {
    AmendmentMirrorPdf pdf;
    try {
      pdf = AmendmentMirrorPdf.create(file.getOriginalFilename(), file.getBytes());
    } catch (IOException error) {
      throw DomainException.invalid("Não foi possível ler o PDF do espelho da emenda.");
    }
    return service.createAmendment(key, body.parliamentarianId(), body.number(), body.year(), pdf);
  }

  @GetMapping("/amendments/{amendmentId}/mirror-documents/{documentId}")
  public ResponseEntity<byte[]> amendmentMirrorDocument(
      @PathVariable UUID amendmentId, @PathVariable UUID documentId) {
    var document = service.amendmentDocument(amendmentId, documentId);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(document.sizeBytes())
        .header(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline().filename(document.fileName(), StandardCharsets.UTF_8).build().toString())
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(document.content());
  }

  @GetMapping("/receipts")
  public Page<FundingService.ReceiptView> receipts(
      @RequestParam(name = "parliamentarian_id", required = false) UUID parliamentarianId,
      @RequestParam(required = false) Integer year,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "50") int limit) {
    return Page.slice(
        service.receipts().stream()
            .filter(
                r -> parliamentarianId == null || r.parliamentarianId().equals(parliamentarianId))
            .filter(r -> year == null || r.creditDate().getYear() == year)
            .map(FundingService.ReceiptView::of)
            .toList(),
        offset,
        limit);
  }

  @GetMapping("/receipts/{id}")
  public FundingService.ReceiptView receipt(@PathVariable UUID id) {
    return FundingService.ReceiptView.of(service.receipt(id));
  }

  @PostMapping("/receipts")
  public FundingService.ReceiptView receipt(
      @RequestHeader("Idempotency-Key") UUID key, @Valid @RequestBody ReceiptInput r) {
    return service.createReceipt(
        key,
        new FundingService.NewReceipt(
            r.amendmentId(),
            r.type(),
            r.source(),
            r.action(),
            r.expenseElement(),
            r.object(),
            r.creditDate(),
            r.bankAccount(),
            r.amount()));
  }

  @PatchMapping("/receipts/{id}")
  public FundingService.ReceiptView update(
      @PathVariable UUID id, @Valid @RequestBody ReceiptEdit r) {
    return service.update(
        id,
        new FundingService.EditReceipt(
            r.type(),
            r.source(),
            r.action(),
            r.expenseElement(),
            r.object(),
            r.bankAccount(),
            r.version(),
            r.reason()));
  }
}
