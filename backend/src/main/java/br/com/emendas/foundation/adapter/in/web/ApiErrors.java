package br.com.emendas.foundation.adapter.in.web;

import br.com.emendas.foundation.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.*;
import org.slf4j.*;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
@org.springframework.core.annotation.Order(-1)
public class ApiErrors {
  private static final Logger LOG = LoggerFactory.getLogger(ApiErrors.class);

  @ExceptionHandler(DomainException.class)
  public ResponseEntity<ProblemDetail> business(DomainException e, HttpServletRequest request) {
    return error(e.status(), e.code(), e.getMessage(), request);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ProblemDetail> validation(
      MethodArgumentNotValidException e, HttpServletRequest request) {
    var response = error(422, "VALIDATION_ERROR", "Confira os campos informados.", request);
    response
        .getBody()
        .setProperty(
            "fields",
            e.getBindingResult().getFieldErrors().stream()
                .map(
                    f ->
                        Map.of(
                            "field",
                            f.getField(),
                            "message",
                            Objects.requireNonNullElse(f.getDefaultMessage(), "Valor inválido")))
                .toList());
    return response;
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
    ConstraintViolationException.class,
    org.springframework.web.bind.MissingRequestHeaderException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class
  })
  public ResponseEntity<ProblemDetail> malformed(Exception e, HttpServletRequest request) {
    return error(
        400,
        "INVALID_REQUEST",
        "Confira o formato dos campos e os cabeçalhos obrigatórios.",
        request);
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<ProblemDetail> integrity(
      DataIntegrityViolationException e, HttpServletRequest request) {
    return error(409, "CONFLICT", "Cadastro duplicado ou vínculo inválido.", request);
  }

  @ExceptionHandler({
    CannotAcquireLockException.class,
    org.springframework.transaction.CannotCreateTransactionException.class
  })
  public ResponseEntity<ProblemDetail> unavailable(Exception e, HttpServletRequest request) {
    return error(
        503, "STORAGE_UNAVAILABLE", "Tente novamente com a mesma chave de idempotência.", request);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ProblemDetail> denied(Exception e, HttpServletRequest request) {
    return error(403, "ACCESS_DENIED", "Seu perfil não permite esta operação.", request);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ProblemDetail> unexpected(Exception e, HttpServletRequest request) {
    if (e instanceof org.springframework.web.ErrorResponse error)
      return error(
          error.getStatusCode().value(),
          "HTTP_ERROR",
          "A requisição não pôde ser atendida.",
          request);
    LOG.error(
        "Falha interna tipo={} referência={}",
        e.getClass().getName(),
        request.getAttribute("requestId"));
    return error(500, "INTERNAL_ERROR", "Não foi possível concluir a operação.", request);
  }

  private static ResponseEntity<ProblemDetail> error(
      int status, String code, String message, HttpServletRequest request) {
    var body = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), message);
    body.setProperty("code", code);
    body.setProperty("request_id", request.getAttribute("requestId"));
    var builder = ResponseEntity.status(status);
    if (status == 429) builder.header("Retry-After", "900");
    if (status == 503) builder.header("Retry-After", "2");
    return builder.body(body);
  }
}
