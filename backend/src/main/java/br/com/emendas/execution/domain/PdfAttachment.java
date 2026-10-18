package br.com.emendas.execution.domain;

import br.com.emendas.foundation.domain.DomainException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/** A bounded, signature-checked PDF attachment for an execution record. */
public final class PdfAttachment {
  public static final int MAX_SIZE_BYTES = 10 * 1024 * 1024;

  private final String fileName;
  private final byte[] content;
  private final String sha256;

  private PdfAttachment(String fileName, byte[] content, String sha256) {
    this.fileName = fileName;
    this.content = content.clone();
    this.sha256 = sha256;
  }

  public static PdfAttachment create(String originalName, byte[] content, String documentName) {
    String name = documentName == null || documentName.isBlank() ? "Documento" : documentName;
    String fileName = safeFileName(originalName);
    if (!fileName.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
      throw DomainException.invalid("O arquivo de " + name + " deve estar em formato PDF.");
    }
    if (content == null || content.length == 0) {
      throw DomainException.invalid("Selecione um arquivo PDF não vazio.");
    }
    if (content.length > MAX_SIZE_BYTES) {
      throw DomainException.invalid("O PDF de " + name + " deve ter no máximo 10 MB.");
    }
    if (content.length < 5
        || content[0] != '%'
        || content[1] != 'P'
        || content[2] != 'D'
        || content[3] != 'F'
        || content[4] != '-') {
      throw DomainException.invalid("O arquivo selecionado não parece ser um PDF válido.");
    }
    return new PdfAttachment(fileName, content, digest(content));
  }

  private static String safeFileName(String originalName) {
    if (originalName == null || originalName.isBlank()) {
      throw DomainException.invalid("O arquivo precisa ter um nome terminado em .pdf.");
    }
    String normalized = originalName.replace('\\', '/');
    String fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
        .replaceAll("[\\p{Cntrl}]", "")
        .strip();
    if (fileName.isBlank() || fileName.length() > 255) {
      throw DomainException.invalid("O nome do arquivo PDF deve ter até 255 caracteres.");
    }
    return fileName;
  }

  private static String digest(byte[] content) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 indisponível", e);
    }
  }

  public String fileName() { return fileName; }
  public byte[] content() { return content.clone(); }
  public String sha256() { return sha256; }
  public long sizeBytes() { return content.length; }
}
