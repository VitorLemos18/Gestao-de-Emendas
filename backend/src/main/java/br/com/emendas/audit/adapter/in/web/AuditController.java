package br.com.emendas.audit.adapter.in.web;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.foundation.api.Page;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {
  private final AuditTrail audit;

  public AuditController(AuditTrail audit) {
    this.audit = audit;
  }

  @GetMapping
  public Page<AuditTrail.Entry> list(
      @RequestParam(required = false) String entity,
      @RequestParam(name = "entity_id", required = false) UUID entityId,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "50") int limit) {
    return audit.list(entity, entityId, offset, limit);
  }
}
