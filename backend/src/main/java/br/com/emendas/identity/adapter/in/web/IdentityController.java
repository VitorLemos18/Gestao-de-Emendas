package br.com.emendas.identity.adapter.in.web;

import br.com.emendas.foundation.api.Page;
import br.com.emendas.identity.api.UserView;
import br.com.emendas.identity.application.IdentityService;
import br.com.emendas.identity.domain.Role;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.security.authentication.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.*;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class IdentityController {
  private final IdentityService service;
  private final AuthenticationManager authentication;
  private final SecurityContextRepository contexts;
  private final CsrfTokenRepository csrf;

  public IdentityController(
      IdentityService service,
      AuthenticationManager authentication,
      SecurityContextRepository contexts,
      CsrfTokenRepository csrf) {
    this.service = service;
    this.authentication = authentication;
    this.contexts = contexts;
    this.csrf = csrf;
  }

  public record Login(
      @NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 128) String password) {}

  public record CreateUser(
      @NotBlank @Size(max = 160) String name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 128) String password,
      @NotNull Role role) {}

  public record UpdateUser(
      @NotNull Role role,
      @NotNull Boolean active,
      @Min(1) long version,
      @NotBlank @Size(min = 5, max = 2000) String reason) {}

  public record PasswordChange(
      @NotBlank @Size(max = 128) String currentPassword,
      @NotBlank @Size(min = 12, max = 128) String newPassword) {}

  public record ResetPassword(
      @NotBlank @Size(min = 12, max = 128) String temporaryPassword,
      @NotBlank @Size(min = 5, max = 2000) String reason) {}

  public record Token(String token, String headerName) {}

  @GetMapping("/auth/csrf")
  public Token csrf(CsrfToken token) {
    return new Token(token.getToken(), token.getHeaderName());
  }

  @PostMapping("/auth/login")
  public Map<String, Object> login(
      @Valid @RequestBody Login login, HttpServletRequest request, HttpServletResponse response) {
    String subject = subject(request.getRemoteAddr(), login.email().toLowerCase(Locale.ROOT));
    service.checkLogin(subject);
    try {
      var auth =
          authentication.authenticate(
              UsernamePasswordAuthenticationToken.unauthenticated(login.email(), login.password()));
      new ChangeSessionIdAuthenticationStrategy().onAuthentication(auth, request, response);
      var context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(auth);
      SecurityContextHolder.setContext(context);
      contexts.saveContext(context, request, response);
      CsrfToken token = csrf.generateToken(request);
      csrf.saveToken(token, request, response);
      return Map.of(
          "user",
          service.me(),
          "csrf_token",
          token.getToken(),
          "header_name",
          token.getHeaderName());
    } catch (AuthenticationException e) {
      service.failedLogin(subject);
      throw new br.com.emendas.foundation.domain.DomainException(
          "INVALID_CREDENTIALS", "E-mail ou senha inválidos.", 401);
    }
  }

  @GetMapping("/auth/me")
  public UserView me() {
    return service.me();
  }

  @PostMapping("/auth/change-password")
  public void changePassword(@Valid @RequestBody PasswordChange body, HttpServletRequest request) {
    service.changePassword(body.currentPassword(), body.newPassword());
    request.getSession().invalidate();
    SecurityContextHolder.clearContext();
  }

  @PostMapping("/auth/logout")
  public void logout(HttpServletRequest request, HttpServletResponse response) {
    var session = request.getSession(false);
    if (session != null) session.invalidate();
    SecurityContextHolder.clearContext();
    csrf.saveToken(null, request, response);
  }

  @GetMapping("/users")
  public Page<UserView> users(
      @RequestParam(defaultValue = "0") int offset, @RequestParam(defaultValue = "50") int limit) {
    return service.list(offset, limit);
  }

  @PostMapping("/users")
  public UserView create(@Valid @RequestBody CreateUser body) {
    return service.create(body.name(), body.email(), body.password(), body.role());
  }

  @PatchMapping("/users/{id}")
  public UserView update(@PathVariable UUID id, @Valid @RequestBody UpdateUser body) {
    return service.update(id, body.role(), body.active(), body.version(), body.reason());
  }

  @PostMapping("/users/{id}/reset-password")
  public void reset(@PathVariable UUID id, @Valid @RequestBody ResetPassword body) {
    service.resetPassword(id, body.temporaryPassword(), body.reason());
  }

  private static String subject(String address, String email) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest((address + "|" + email).getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
