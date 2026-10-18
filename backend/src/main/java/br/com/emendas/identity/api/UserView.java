package br.com.emendas.identity.api;

import java.util.UUID;

public record UserView(
    UUID id,
    String name,
    String email,
    String role,
    boolean active,
    boolean mustChangePassword,
    long version) {}
