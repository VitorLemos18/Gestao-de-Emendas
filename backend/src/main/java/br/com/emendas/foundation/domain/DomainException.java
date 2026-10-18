package br.com.emendas.foundation.domain;

public class DomainException extends RuntimeException {
  private final String code;
  private final int status;

  public DomainException(String code, String message, int status) {
    super(message);
    this.code = code;
    this.status = status;
  }

  public String code() {
    return code;
  }

  public int status() {
    return status;
  }

  public static DomainException invalid(String message) {
    return new DomainException("VALIDATION_ERROR", message, 422);
  }

  public static DomainException conflict(String message) {
    return new DomainException("CONFLICT", message, 409);
  }

  public static DomainException missing(String message) {
    return new DomainException("NOT_FOUND", message, 404);
  }
}
