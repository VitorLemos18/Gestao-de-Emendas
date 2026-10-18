package br.com.emendas.audit.adapter.out.persistence;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.foundation.api.Page;
import br.com.emendas.foundation.domain.Actor;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Component
public class PostgresAuditTrail implements AuditTrail {
  private final JdbcClient jdbc;
  private final JsonMapper json;

  public PostgresAuditTrail(JdbcClient jdbc, JsonMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(
      Actor actor,
      String action,
      String entity,
      UUID id,
      Object before,
      Object after,
      String reason) {
    jdbc.sql(
            "INSERT INTO"
                + " audit.entries(id,actor_id,actor_name,action,entity,entity_id,before_data,after_data,reason)"
                + " VALUES (?,?,?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb),?)")
        .params(
            UUID.randomUUID(),
            actor.id(),
            actor.name(),
            action,
            entity,
            id,
            json.writeValueAsString(before),
            json.writeValueAsString(after),
            reason)
        .update();
  }

  @Transactional(readOnly = true)
  public Page<Entry> list(String entity, UUID id, int offset, int limit) {
    Page.validate(offset, limit);
    var query =
        " FROM audit.entries WHERE (CAST(:entity AS text) IS NULL OR entity=:entity) AND (CAST(:id"
            + " AS uuid) IS NULL OR entity_id=:id)";
    var rows =
        jdbc.sql("SELECT *" + query + " ORDER BY occurred_at DESC,id LIMIT :limit OFFSET :offset")
            .param("entity", entity)
            .param("id", id)
            .param("limit", limit)
            .param("offset", offset)
            .query(
                (r, n) ->
                    new Entry(
                        r.getObject("id", UUID.class),
                        r.getObject("actor_id", UUID.class),
                        r.getString("actor_name"),
                        r.getString("action"),
                        r.getString("entity"),
                        r.getObject("entity_id", UUID.class),
                        r.getString("before_data"),
                        r.getString("after_data"),
                        r.getString("reason"),
                        r.getTimestamp("occurred_at").toInstant()))
            .list();
    long count =
        jdbc.sql("SELECT count(*)" + query)
            .param("entity", entity)
            .param("id", id)
            .query(Long.class)
            .single();
    return new Page<>(rows, count, offset, limit);
  }
}
