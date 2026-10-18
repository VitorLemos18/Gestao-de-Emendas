package br.com.emendas.foundation.api;

import br.com.emendas.foundation.domain.Money;

public record MoneyView(String value, String formatted, String currency) {
  public static MoneyView of(Money money) {
    return new MoneyView(money.value().toPlainString(), money.formatted(), "BRL");
  }
}
