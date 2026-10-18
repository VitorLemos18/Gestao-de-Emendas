package br.com.emendas.foundation.adapter.out.persistence;

import br.com.emendas.foundation.api.IdempotentCommands;
import br.com.emendas.foundation.domain.DomainException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Component
public class PostgresIdempotency implements IdempotentCommands {
  private final JdbcClient jdbc;
  private final JsonMapper json;

  public PostgresIdempotency(JdbcClient jdbc, JsonMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public <T> T execute(
      UUID actor, UUID key, String operation, Object request, Class<T> type, Supplier<T> action) {
    String hash = digest(operation + "\n" + json.writeValueAsString(request));
    int inserted =
        jdbc.sql(
                "INSERT INTO platform.idempotency(actor_id, command_key, request_hash) VALUES (?,"
                    + " ?, ?) ON CONFLICT DO NOTHING")
            .params(actor, key, hash)
            .update();
    if (inserted == 0) {
      var stored =
          jdbc.sql(
                  "SELECT request_hash, response FROM platform.idempotency WHERE actor_id=? AND"
                      + " command_key=?")
              .params(actor, key)
              .query((r, n) -> new Stored(r.getString(1), r.getString(2)))
              .single();
      if (!hash.equals(stored.hash))
        throw DomainException.conflict("Chave de idempotência já usada com outros dados.");
      return json.readValue(stored.response, type);
    }
    T result = action.get();
    jdbc.sql(
            "UPDATE platform.idempotency SET response=CAST(? AS jsonb) WHERE actor_id=? AND"
                + " command_key=?")
        .params(json.writeValueAsString(result), actor, key)
        .update();
    return result;
  }

  private static String digest(String text) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private record Stored(String hash, String response) {}
}
