package br.com.emendas.reporting.application;

import br.com.emendas.audit.api.AuditTrail;
import java.util.List;

public interface ExcelWriter {
  byte[] write(ReportingService.Report report, List<AuditTrail.Entry> history);
}
