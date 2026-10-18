package br.com.emendas.identity.api;

import org.springframework.security.core.Authentication;

public interface SessionPolicy {
  boolean isCurrent(Authentication authentication);

  boolean mustChangePassword(Authentication authentication);
}
