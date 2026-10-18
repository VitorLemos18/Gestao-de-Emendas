package br.com.emendas.identity.api;

public interface BootstrapAdmin {
  void createFirst(String name, String email, String password);
}
