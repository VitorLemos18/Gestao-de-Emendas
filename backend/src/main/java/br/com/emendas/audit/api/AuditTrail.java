package br.com.emendas.audit.api;

import br.com.emendas.foundation.api.Page;
import br.com.emendas.foundation.domain.Actor;
import java.time.Instant;
import java.util.UUID;

public interface AuditTrail {
  void record(
      Actor actor,
      String action,
      String entity,
      UUID entityId,
      Object before,
      Object after,
      String reason);

  Page<Entry> list(String entity, UUID entityId, int offset, int limit);

  record Entry(
      UUID id,
      UUID actorId,
      String actorName,
      String action,
      String entity,
      UUID entityId,
      String before,
      String after,
      String reason,
      Instant occurredAt) {}
}
