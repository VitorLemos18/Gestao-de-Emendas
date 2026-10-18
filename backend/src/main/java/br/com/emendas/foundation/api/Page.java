package br.com.emendas.foundation.api;

import br.com.emendas.foundation.domain.DomainException;
import java.util.List;

public record Page<T>(List<T> items, long total, int offset, int limit) {
  public static void validate(int offset, int limit) {
    if (offset < 0 || limit < 1 || limit > 200)
      throw DomainException.invalid("Use offset positivo e limit entre 1 e 200.");
  }

  public static <T> Page<T> slice(List<T> all, int offset, int limit) {
    validate(offset, limit);
    return new Page<>(all.stream().skip(offset).limit(limit).toList(), all.size(), offset, limit);
  }
}
