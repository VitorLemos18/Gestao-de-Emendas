package br.com.emendas.execution.domain;

import br.com.emendas.foundation.domain.DomainException;
import java.util.Locale;

/** Numeric and alphanumeric CNPJ validation using the Receita Federal's module-11 rule. */
public final class Cnpj {
  private static final int[] FIRST_DIGIT_WEIGHTS = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
  private static final int[] SECOND_DIGIT_WEIGHTS = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

  private Cnpj() {}

  public static String normalize(String input) {
    if (input == null || input.isBlank()) return null;
    String source = input.strip().toUpperCase(Locale.ROOT);
    if (source.length() > 18 || !source.matches("[A-Z0-9./\\-\\s]+")) {
      throw DomainException.invalid("Informe um CNPJ válido.");
    }
    String value = source.replaceAll("[./\\-\\s]", "");
    if (!value.matches("[A-Z0-9]{12}[0-9]{2}")
        || value.matches("([0-9])\\1{13}")
        || checkDigit(value.substring(0, 12), FIRST_DIGIT_WEIGHTS) != value.charAt(12) - '0'
        || checkDigit(value.substring(0, 13), SECOND_DIGIT_WEIGHTS) != value.charAt(13) - '0') {
      throw DomainException.invalid(
          "Informe um CNPJ válido, com 14 caracteres e dígitos verificadores corretos.");
    }
    return value;
  }

  private static int checkDigit(String base, int[] weights) {
    int sum = 0;
    for (int index = 0; index < weights.length; index++) {
      sum += (base.charAt(index) - 48) * weights[index];
    }
    int remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }
}
