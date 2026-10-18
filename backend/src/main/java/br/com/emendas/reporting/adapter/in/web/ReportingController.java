package br.com.emendas.reporting.adapter.in.web;

import br.com.emendas.foundation.api.Page;
import br.com.emendas.reporting.application.ReportingService;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ReportingController {
  private final ReportingService service;

  public ReportingController(ReportingService service) {
    this.service = service;
  }

  @GetMapping("/reports/annual")
  public ReportingService.Summary annual(
      @RequestParam int year,
      @RequestParam(name = "parliamentarian_id", required = false) UUID parliamentarianId,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "50") int limit) {
    return service.summary(year, parliamentarianId, offset, limit);
  }

  @GetMapping("/receipts/{id}/ledger")
  public Page<ReportingService.LedgerLine> ledger(
      @PathVariable UUID id,
      @RequestParam int year,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "50") int limit) {
    return service.ledger(id, year, offset, limit);
  }

  @PostMapping(
      value = "/exports/excel",
      produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  public ResponseEntity<byte[]> export(
      @RequestParam int year,
      @RequestParam(name = "parliamentarian_id", required = false) UUID parliamentarianId) {
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=emendas-" + year + ".xlsx")
        .body(service.export(year, parliamentarianId));
  }
}
