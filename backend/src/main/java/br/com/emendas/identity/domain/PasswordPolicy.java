package br.com.emendas.identity.domain;

import br.com.emendas.foundation.domain.DomainException;

public final class PasswordPolicy {
  private PasswordPolicy() {}

  public static void validate(String password) {
    if (password == null || password.length() < 12 || password.length() > 128)
      throw DomainException.invalid("A senha deve ter entre 12 e 128 caracteres.");
  }
}
