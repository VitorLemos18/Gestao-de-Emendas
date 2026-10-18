package br.com.emendas.foundation.adapter.in.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestBoundary extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String id = UUID.randomUUID().toString();
    request.setAttribute("requestId", id);
    response.setHeader("X-Request-ID", id);
    response.setHeader("Cache-Control", "no-store");
    String contentType = request.getContentType();
    if (contentType != null
        && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/form-data")) {
      chain.doFilter(request, response);
      return;
    }
    // O limite também vale para JSON com sufixo +json, mídia em maiúsculas e corpos sem
    // Content-Type.
    byte[] bytes = request.getInputStream().readNBytes(262145);
    if (bytes.length > 262144) {
      response.setStatus(413);
      response.setContentType("application/problem+json");
      response
          .getWriter()
          .write(
              "{\"status\":413,\"code\":\"BODY_TOO_LARGE\",\"detail\":\"Limite de 256 KB"
                  + " excedido.\"}");
      return;
    }
    var input = new ByteArrayInputStream(bytes);
    request =
        new HttpServletRequestWrapper(request) {
          @Override
          public ServletInputStream getInputStream() {
            return new ServletInputStream() {
              public int read() {
                return input.read();
              }

              public boolean isFinished() {
                return input.available() == 0;
              }

              public boolean isReady() {
                return true;
              }

              public void setReadListener(ReadListener listener) {
                throw new UnsupportedOperationException("Leitura síncrona");
              }
            };
          }

          @Override
          public BufferedReader getReader() {
            return new BufferedReader(
                new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
          }
        };
    chain.doFilter(request, response);
  }
}
