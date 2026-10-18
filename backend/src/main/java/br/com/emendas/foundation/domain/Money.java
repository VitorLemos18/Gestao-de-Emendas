package br.com.emendas.foundation.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Objects;

public record Money(BigDecimal value) implements Comparable<Money> {
  public static final Money ZERO = new Money(BigDecimal.ZERO);

  public Money {
    Objects.requireNonNull(value, "Informe o valor.");
    try {
      value = value.setScale(2, RoundingMode.UNNECESSARY);
    } catch (ArithmeticException e) {
      throw DomainException.invalid("O valor deve ter até duas casas decimais.");
    }
  }

  public static Money of(String value) {
    return new Money(new BigDecimal(value));
  }

  public Money plus(Money other) {
    return new Money(value.add(other.value));
  }

  public Money minus(Money other) {
    return new Money(value.subtract(other.value));
  }

  public Money negate() {
    return new Money(value.negate());
  }

  public Money positive() {
    if (value.signum() <= 0) throw DomainException.invalid("Informe um valor maior que zero.");
    if (value.compareTo(new BigDecimal("999999999999.99")) > 0)
      throw DomainException.invalid("Lançamento acima do limite permitido.");
    return this;
  }

  public String formatted() {
    return NumberFormat.getCurrencyInstance(Locale.of("pt", "BR"))
        .format(value)
        .replace('\u00a0', ' ');
  }

  @Override
  public int compareTo(Money other) {
    return value.compareTo(other.value);
  }
}
