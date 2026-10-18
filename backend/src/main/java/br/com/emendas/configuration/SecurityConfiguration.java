package br.com.emendas.configuration;

import br.com.emendas.identity.api.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.*;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.*;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {
  @Bean
  PasswordEncoder passwords() {
    return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
  }

  @Bean
  AuthenticationManager authentication(UserDetailsService details, PasswordEncoder passwords) {
    var provider = new DaoAuthenticationProvider(details);
    provider.setPasswordEncoder(passwords);
    return new ProviderManager(provider);
  }

  @Bean
  SecurityContextRepository contexts() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  CsrfTokenRepository csrfTokens() {
    return new HttpSessionCsrfTokenRepository();
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http,
      SecurityContextRepository contexts,
      CsrfTokenRepository csrf,
      SessionPolicy sessions,
      @Value("${springdoc.api-docs.enabled:true}") boolean docs)
      throws Exception {
    http.securityContext(c -> c.securityContextRepository(contexts).requireExplicitSave(true))
        .csrf(
            c ->
                c.csrfTokenRepository(csrf)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
        .requestCache(c -> c.disable())
        .formLogin(c -> c.disable())
        .httpBasic(c -> c.disable())
        .logout(c -> c.disable())
        .authorizeHttpRequests(
            c -> {
              c.requestMatchers(
                      "/api/v1/auth/login", "/api/v1/auth/csrf", "/actuator/health", "/error")
                  .permitAll();
              if (docs) c.requestMatchers("/docs", "/swagger-ui/**", "/v3/api-docs/**").permitAll();
              c.anyRequest().authenticated();
            })
        .exceptionHandling(
            c ->
                c.authenticationEntryPoint(
                        (req, res, e) ->
                            problem(res, 401, "AUTH_REQUIRED", "Entre para continuar."))
                    .accessDeniedHandler(
                        (req, res, e) ->
                            problem(
                                res,
                                403,
                                "ACCESS_DENIED",
                                "Acesso negado ou token CSRF inválido.")))
        .headers(
            c ->
                c.contentSecurityPolicy(
                    p ->
                        p.policyDirectives(
                            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src"
                                + " 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors"
                                + " 'none'")));
    http.addFilterAfter(
        new OncePerRequestFilter() {
          @Override
          protected void doFilterInternal(
              HttpServletRequest request, HttpServletResponse response, FilterChain chain)
              throws ServletException, IOException {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
              if (!sessions.isCurrent(auth)) {
                var session = request.getSession(false);
                if (session != null) session.invalidate();
                SecurityContextHolder.clearContext();
                problem(response, 401, "SESSION_REVOKED", "Acesso alterado. Entre novamente.");
                return;
              }
              String path = request.getServletPath();
              if (sessions.mustChangePassword(auth)
                  && path.startsWith("/api/")
                  && !path.equals("/api/v1/auth/me")
                  && !path.equals("/api/v1/auth/csrf")
                  && !path.equals("/api/v1/auth/change-password")
                  && !path.equals("/api/v1/auth/logout")) {
                problem(
                    response, 403, "PASSWORD_CHANGE_REQUIRED", "Troque sua senha para continuar.");
                return;
              }
            }
            chain.doFilter(request, response);
          }
        },
        SecurityContextHolderFilter.class);
    return http.build();
  }

  private static void problem(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/problem+json");
    response.setCharacterEncoding("UTF-8");
    response
        .getWriter()
        .write(
            "{\"type\":\"about:blank\",\"status\":"
                + status
                + ",\"code\":\""
                + code
                + "\",\"detail\":\""
                + message
                + "\"}");
  }

  @Bean
  ApplicationRunner firstAdmin(
      BootstrapAdmin bootstrap,
      @Value("${BOOTSTRAP_ADMIN_EMAIL:}") String email,
      @Value("${BOOTSTRAP_ADMIN_NAME:Administrador}") String name,
      @Value("${BOOTSTRAP_ADMIN_PASSWORD:}") String password) {
    return args -> {
      if (!email.isBlank()) {
        if (password.isBlank())
          throw new IllegalStateException("Informe BOOTSTRAP_ADMIN_PASSWORD.");
        bootstrap.createFirst(name, email, password);
      }
    };
  }
}
