package br.com.emendas.execution.domain;

/** Backwards-compatible, specifically labelled PDF validation for an expense's commitment note. */
public final class CommitmentPdf {
  public static final int MAX_SIZE_BYTES = PdfAttachment.MAX_SIZE_BYTES;

  private final PdfAttachment attachment;

  private CommitmentPdf(PdfAttachment attachment) {
    this.attachment = attachment;
  }

  public static CommitmentPdf create(String originalName, byte[] content) {
    return new CommitmentPdf(PdfAttachment.create(originalName, content, "Nota de Empenho"));
  }

  public String fileName() { return attachment.fileName(); }
  public byte[] content() { return attachment.content(); }
  public String sha256() { return attachment.sha256(); }
  public long sizeBytes() { return attachment.sizeBytes(); }
}
