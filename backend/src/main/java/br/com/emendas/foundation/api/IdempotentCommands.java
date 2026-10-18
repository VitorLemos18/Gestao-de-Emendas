package br.com.emendas.foundation.api;

import java.util.UUID;
import java.util.function.Supplier;

public interface IdempotentCommands {
  <T> T execute(
      UUID actorId,
      UUID key,
      String operation,
      Object request,
      Class<T> responseType,
      Supplier<T> action);
}
