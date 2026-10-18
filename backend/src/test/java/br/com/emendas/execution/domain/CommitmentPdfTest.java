package br.com.emendas.execution.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class CommitmentPdfTest {
  @Test
  void stripsPathsAndCalculatesStableContentFingerprint() {
    byte[] bytes = "%PDF-1.7\nexample".getBytes(StandardCharsets.US_ASCII);
    var pdf = CommitmentPdf.create("C:\\private\\nota.pdf", bytes);
    assertEquals("nota.pdf", pdf.fileName());
    assertEquals(64, pdf.sha256().length());
    bytes[0] = 'X';
    assertEquals('%', pdf.content()[0]);
  }

  @Test
  void rejectsNonPdfAndOversizedFiles() {
    assertThrows(RuntimeException.class, () -> CommitmentPdf.create("nota.pdf", new byte[] {1, 2}));
    assertThrows(
        RuntimeException.class,
        () -> CommitmentPdf.create("nota.pdf", new byte[CommitmentPdf.MAX_SIZE_BYTES + 1]));
    assertThrows(
        RuntimeException.class,
        () -> CommitmentPdf.create("nota.txt", "%PDF-1.4".getBytes(StandardCharsets.US_ASCII)));
  }
}
