package br.com.emendas.reporting.adapter.out.excel;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.foundation.api.MoneyView;
import br.com.emendas.foundation.domain.Money;
import br.com.emendas.reporting.application.*;
import java.io.*;
import java.time.*;
import java.util.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

@Component
public class PoiExcelWriter implements ExcelWriter {
  public byte[] write(ReportingService.Report report, List<AuditTrail.Entry> history) {
    try (var book = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var formats = book.createDataFormat();
      var currency = book.createCellStyle();
      currency.setDataFormat(formats.getFormat("\"R$\" #,##0.00;[Red]-\"R$\" #,##0.00"));
      var date = book.createCellStyle();
      date.setDataFormat(formats.getFormat("dd/mm/yyyy"));
      var heading = book.createCellStyle();
      heading.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
      heading.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      var font = book.createFont();
      font.setBold(true);
      font.setColor(IndexedColors.WHITE.getIndex());
      heading.setFont(font);
      var names = new HashSet<String>();
      names.add("geral");
      names.add("histórico");
      financialSheet(
          book,
          "Geral",
          report.year(),
          report.receipts(),
          report.ledger(),
          currency,
          date,
          heading);
      var groups = new LinkedHashMap<UUID, List<ReportingService.ReceiptLine>>();
      report
          .receipts()
          .forEach(
              r -> groups.computeIfAbsent(r.parliamentarianId(), key -> new ArrayList<>()).add(r));
      for (var receipts : groups.values()) {
        String base = WorkbookUtil.createSafeSheetName(receipts.getFirst().parliamentarian());
        String name = base;
        int suffix = 2;
        while (!names.add(name.toLowerCase(Locale.ROOT))) {
          String tail = " (" + suffix++ + ")";
          name = base.substring(0, Math.min(base.length(), 31 - tail.length())) + tail;
        }
        var ids = receipts.stream().map(ReportingService.ReceiptLine::receiptId).toList();
        financialSheet(
            book,
            name,
            report.year(),
            receipts,
            report.ledger().stream().filter(l -> ids.contains(l.receiptId())).toList(),
            currency,
            date,
            heading);
      }
      var audit = book.createSheet("Histórico");
      row(
          audit,
          0,
          heading,
          null,
          null,
          "Data e hora (UTC)",
          "Responsável",
          "Ação",
          "Entidade",
          "Identificador",
          "Antes (JSON)",
          "Depois (JSON)",
          "Motivo");
      int i = 1;
      for (var e : history)
        row(
            audit,
            i++,
            null,
            null,
            null,
            e.occurredAt().toString(),
            e.actorName(),
            e.action(),
            e.entity(),
            e.entityId().toString(),
            e.before(),
            e.after(),
            e.reason());
      size(audit, 8);
      book.write(output);
      return output.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static void financialSheet(
      Workbook book,
      String name,
      int year,
      List<ReportingService.ReceiptLine> receipts,
      List<ReportingService.LedgerLine> ledger,
      CellStyle money,
      CellStyle date,
      CellStyle heading) {
    var sheet = book.createSheet(name);
    row(sheet, 0, heading, null, null, "Controle financeiro — exercício " + year);
    row(
        sheet,
        1,
        null,
        null,
        null,
        "Saldo anterior preserva o recebimento, objeto e conta de origem. Valores apurados até"
            + " 31/12/"
            + year
            + ".");
    row(
        sheet,
        3,
        heading,
        null,
        null,
        "Parlamentar",
        "Emenda",
        "Ano da emenda",
        "Recebimento ID",
        "Tipo",
        "Ação",
        "Elemento de despesa",
        "Fonte de recurso",
        "Objeto",
        "Data do crédito",
        "Conta bancária",
        "Valor original",
        "Saldo anterior",
        "Recebido no ano",
        "Pago no ano",
        "Estornado no ano",
        "Saldo final",
        "Empenhado até o ano",
        "Liquidado até o ano",
        "A pagar até o ano");
    int i = 4;
    for (var r : receipts)
      row(
          sheet,
          i++,
          null,
          money,
          date,
          r.parliamentarian(),
          r.amendment(),
          r.amendmentYear(),
          r.receiptId().toString(),
          r.type(),
          r.action(),
          r.expenseElement() == null ? "Não informado no cadastro anterior" : r.expenseElement(),
          r.source(),
          r.object(),
          r.creditDate(),
          r.bankAccount(),
          r.originalAmount(),
          r.balance().openingBalance(),
          r.balance().received(),
          r.balance().paid(),
          r.balance().reversed(),
          r.balance().closingBalance(),
          r.committed(),
          r.liquidated(),
          r.pendingPayment());
    row(
        sheet,
        i++,
        null,
        money,
        date,
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        sum(receipts, ReportingService.ReceiptLine::originalAmount),
        sum(receipts, r -> r.balance().openingBalance()),
        sum(receipts, r -> r.balance().received()),
        sum(receipts, r -> r.balance().paid()),
        sum(receipts, r -> r.balance().reversed()),
        sum(receipts, r -> r.balance().closingBalance()),
        sum(receipts, ReportingService.ReceiptLine::committed),
        sum(receipts, ReportingService.ReceiptLine::liquidated),
        sum(receipts, ReportingService.ReceiptLine::pendingPayment));
    i += 2;
    row(
        sheet,
        i++,
        heading,
        null,
        null,
        "EXTRATO DO EXERCÍCIO",
        "Recebimento ID",
        "Despesa ID",
        "Data",
        "Tipo",
        "Descrição/Motivo",
        "Documento",
        "Valor");
    for (var l : ledger)
      row(
          sheet,
          i++,
          null,
          money,
          date,
          l.id().toString(),
          l.receiptId().toString(),
          l.expenseId() == null ? "" : l.expenseId().toString(),
          l.date(),
          translate(l.kind()),
          l.description(),
          l.document(),
          l.amount());
    sheet.createFreezePane(2, 4);
    size(sheet, 20);
    sheet.setColumnWidth(8, 60 * 256);
    if (!receipts.isEmpty())
      sheet.setAutoFilter(
          new org.apache.poi.ss.util.CellRangeAddress(3, 3 + receipts.size(), 0, 19));
  }

  private static String translate(String kind) {
    return switch (kind) {
      case "CREDIT" -> "Recebimento";
      case "PAYMENT" -> "Pagamento";
      case "REVERSAL" -> "Estorno";
      default -> kind;
    };
  }

  private static MoneyView sum(
      List<ReportingService.ReceiptLine> receipts,
      java.util.function.Function<ReportingService.ReceiptLine, MoneyView> field) {
    return MoneyView.of(
        new Money(
            receipts.stream()
                .map(field)
                .map(m -> new java.math.BigDecimal(m.value()))
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add)));
  }

  private static void row(
      Sheet sheet, int index, CellStyle style, CellStyle money, CellStyle date, Object... values) {
    var row = sheet.createRow(index);
    for (int i = 0; i < values.length; i++) {
      var cell = row.createCell(i);
      Object value = values[i];
      if (value instanceof MoneyView m) {
        cell.setCellValue(Double.parseDouble(m.value()));
        cell.setCellStyle(money);
      } else if (value instanceof LocalDate d) {
        cell.setCellValue(d.atStartOfDay());
        cell.setCellStyle(date);
      } else if (value instanceof Integer n) cell.setCellValue(n);
      else cell.setCellValue(value == null ? "" : value.toString());
      if (style != null) cell.setCellStyle(style);
    }
  }

  private static void size(Sheet sheet, int columns) {
    for (int i = 0; i < columns; i++) sheet.setColumnWidth(i, 24 * 256);
  }
}
