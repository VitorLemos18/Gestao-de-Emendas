package br.com.emendas;

import static org.junit.jupiter.api.Assertions.*;

import br.com.emendas.execution.application.ExecutionStore;
import br.com.emendas.identity.api.BootstrapAdmin;
import java.io.ByteArrayInputStream;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BackendIntegrationTest {
  @Container static final PostgreSQLContainer DB = new PostgreSQLContainer("postgres:17-alpine");

  // PER_CLASS: Spring injeta a instância antes do callback beforeAll da extensão.
  static {
    DB.start();
  }

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", DB::getJdbcUrl);
    r.add("spring.datasource.username", DB::getUsername);
    r.add("spring.datasource.password", DB::getPassword);
  }

  @LocalServerPort int port;
  @Autowired BootstrapAdmin bootstrap;
  @Autowired JsonMapper json;
  @Autowired JdbcClient jdbc;
  @MockitoSpyBean ExecutionStore executionStore;
  Client admin;
  final String adminEmail = "admin-" + UUID.randomUUID() + "@example.test";
  final String initial = "Initial-test-" + UUID.randomUUID();
  final String permanent = "Permanent-test-" + UUID.randomUUID();

  @BeforeAll
  void firstAdmin() throws Exception {
    bootstrap.createFirst("Administrador de teste", adminEmail, initial);
    admin = new Client();
    admin.login(adminEmail, initial);
    assertEquals(403, admin.get("/parliamentarians").status());
    admin
        .post(
            "/auth/change-password", Map.of("current_password", initial, "new_password", permanent))
        .expect(200);
    admin.login(adminEmail, permanent);
  }

  @Test
  void authCsrfAndPasswordPoliciesAreEnforced() throws Exception {
    var anon = new Client();
    anon.get("/receipts").expect(401);
    var request =
        HttpRequest.newBuilder(URI.create(url("/parliamentarians")))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"CSRF\"}"))
            .build();
    assertEquals(403, admin.http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
    String raw =
        jdbc.sql("SELECT password_hash FROM identity.users WHERE email=?")
            .param(adminEmail)
            .query(String.class)
            .single();
    assertTrue(raw.startsWith("$argon2id$"));
    assertFalse(raw.contains(permanent));
    var reply = admin.get("/auth/me");
    reply.expect(200);
    assertFalse(reply.text().contains("password_hash"));
    var headers = admin.get("/auth/csrf").response.headers();
    assertEquals("no-store", headers.firstValue("cache-control").orElseThrow());
  }

  @Test
  void independentObjectsIdempotencyMetadataAndFormatting() throws Exception {
    var seed = seed("100000.00", "2025-01-10");
    var second =
        admin.post("/receipts", receipt(seed.amendment, "300000.00", "2026-01-10", "Locomoção"));
    second.expect(200);
    var body = receipt(seed.amendment, "100000.00", "2025-01-10", "Insumos");
    String key = UUID.randomUUID().toString();
    var first = admin.post("/receipts", body, key);
    var replay = admin.post("/receipts", body, key);
    first.expect(200);
    replay.expect(200);
    assertEquals(first.node(), replay.node());
    assertEquals("APS", first.node().path("action").asText());
    assertEquals(
        "3.3.90.30 - Material de consumo",
        first.node().path("expense_element").asText());
    assertEquals("Emenda", first.node().path("source").asText());
    assertEquals("R$ 100.000,00", first.node().path("amount").path("formatted").asText());
    assertEquals("00001-0", first.node().path("bank_account").asText());
    assertEquals("10/01/2025", first.node().path("credit_date_formatted").asText());
    admin
        .post("/receipts", receipt(seed.amendment, "1.00", "2025-01-10", "Outro objeto"), key)
        .expect(409);
    String path = "/receipts/" + seed.receipt;
    var edit = new HashMap<String, Object>(
        receipt(seed.amendment, "100000.00", "2025-01-10", "Insumos detalhados"));
    edit.put("version", 1);
    edit.put("reason", "Correção do detalhamento");
    admin.patch(path, edit).expect(200);
    admin.patch(path, edit).expect(409);
    assertEquals(2, admin.get(path).node().path("version").asInt());
    assertEquals("APS", admin.get(path).node().path("action").asText());
    assertEquals(
        "3.3.90.30 - Material de consumo",
        admin.get(path).node().path("expense_element").asText());
    assertEquals("Emenda", admin.get(path).node().path("source").asText());
    var audits = admin.get("/audit?entity=receipt&entity_id=" + seed.receipt).node();
    assertEquals(2, audits.path("total").asInt());
    assertTrue(audits.toString().contains("Correção do detalhamento"));
    admin.post("/receipts", receipt(seed.amendment, "1.001", "2025-01-10", "Insumos")).expect(422);
  }

  @Test
  void adminCanCorrectCreditOriginDateAndAmountWithAuditAndExecutionGuards() throws Exception {
    var seed = seed("100000.00", "2025-01-10");
    var otherAuthor = admin.post("/parliamentarians", Map.of("name", "Nova autora " + UUID.randomUUID()));
    otherAuthor.expect(200);
    var otherAmendment = admin.post("/amendments", Map.of(
        "parliamentarian_id", otherAuthor.node().path("id").asText(),
        "number", "CORR-" + UUID.randomUUID(), "year", 2025));
    otherAmendment.expect(200);

    var changed = new HashMap<String, Object>(receipt(
        otherAmendment.node().path("id").asText(), "120000.00", "2025-01-10", "Objeto corrigido"));
    changed.put("version", 1);
    changed.put("reason", "Correção conforme espelho oficial da emenda");
    var corrected = admin.patch("/receipts/" + seed.receipt, changed);
    corrected.expect(200);
    assertEquals(otherAmendment.node().path("id").asText(), corrected.node().path("amendment_id").asText());
    assertEquals("120000.00", corrected.node().path("amount").path("value").asText());
    assertEquals("10/01/2025", corrected.node().path("credit_date_formatted").asText());
    assertTrue(admin.get("/audit?entity=receipt&entity_id=" + seed.receipt).node().toString()
        .contains("Correção conforme espelho oficial da emenda"));

    String expenseId = expense(seed.receipt, "40000.00", "2025-01-15");
    var lowerValue = new HashMap<String, Object>(changed);
    lowerValue.put("version", 2);
    lowerValue.put("amount", "30000.00");
    lowerValue.put("reason", "Redução solicitada após empenho");
    admin.patch("/receipts/" + seed.receipt, lowerValue).expect(409);

    var laterCredit = new HashMap<String, Object>(changed);
    laterCredit.put("version", 2);
    laterCredit.put("credit_date", "2025-01-20");
    laterCredit.put("reason", "Ajuste de data solicitado");
    admin.patch("/receipts/" + seed.receipt, laterCredit).expect(409);
    assertNotNull(admin.get("/expenses/" + expenseId).node());
  }

  @Test
  void amendmentStoresOfficialMirrorPdfAndAllowsDownload() throws Exception {
    var author = admin.post("/parliamentarians", Map.of("name", "Autora " + UUID.randomUUID()));
    author.expect(200);
    byte[] pdf = "%PDF-1.7\nEspelho oficial da emenda".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    var input = Map.of(
        "parliamentarian_id", author.node().path("id").asText(),
        "number", "ESPELHO-" + UUID.randomUUID(),
        "year", 2026);
    String key = UUID.randomUUID().toString();
    var created = admin.postMultipart(
        "/amendments", input, "amendment", "mirror_document", "espelho-emenda.pdf", pdf, key);
    created.expect(200);
    assertEquals("espelho-emenda.pdf", created.node().path("mirror_document").path("file_name").asText());

    var amendments = admin.get("/amendments");
    amendments.expect(200);
    String amendmentId = created.node().path("id").asText();
    JsonNode listedAmendment = null;
    for (JsonNode item : amendments.node().path("items")) {
      if (item.path("id").asText().equals(amendmentId)) listedAmendment = item;
    }
    assertNotNull(listedAmendment);
    String documentId = listedAmendment.path("mirror_document").path("id").asText();
    var download = admin.get("/amendments/" + amendmentId + "/mirror-documents/" + documentId);
    download.expect(200);
    assertArrayEquals(pdf, download.response.body());
    assertTrue(download.response.headers().firstValue("content-type").orElseThrow().startsWith("application/pdf"));

    byte[] invalid = "not a pdf".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    admin.postMultipart("/amendments", input, "amendment", "mirror_document", "espelho.pdf",
        invalid, UUID.randomUUID().toString()).expect(422);
  }

  @Test
  void expenseAcceptsAlphanumericCnpjAndStoresDownloadableCommitmentPdf() throws Exception {
    var seed = seed("100000.00", "2026-01-10");
    var expense = new HashMap<>(expenseBody(seed.receipt, "25000.00", "2026-01-11"));
    expense.put("cnpj", "12.ABC.345/01DE-35");
    byte[] pdf = "%PDF-1.7\nNota de Empenho de teste".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    var created =
        admin.postMultipart(
            "/expenses", expense, "expense", "commitment_document", "nota-empenho.pdf", pdf, UUID.randomUUID().toString());
    created.expect(200);
    String expenseId = created.node().path("id").asText();
    var view = created.node();
    assertEquals("12ABC34501DE35", view.path("cnpj").asText());
    assertEquals(
        "nota-empenho.pdf",
        view.path("commitment_document").path("file_name").asText(),
        view.toString());
    String documentId = view.path("commitment_document").path("id").asText();

    var download = admin.get("/expenses/" + expenseId + "/commitment-documents/" + documentId);
    download.expect(200);
    assertArrayEquals(pdf, download.response.body());
    assertTrue(download.response.headers().firstValue("content-type").orElseThrow().startsWith("application/pdf"));
    assertTrue(download.response.headers().firstValue("content-disposition").orElseThrow().contains("inline"));

    var audit = admin.get("/audit?entity=expense&entity_id=" + expenseId);
    audit.expect(200);
    assertFalse(audit.text().contains("12ABC34501DE35"));
    assertTrue(audit.text().contains("••••••••••DE35"));

    var invalid = new HashMap<>(expenseBody(seed.receipt, "1000.00", "2026-01-12"));
    invalid.put("cnpj", "12.ABC.345/01DE-36");
    admin.post("/expenses", invalid).expect(422);
  }

  @Test
  void paymentStoresProtocolAndDownloadableOfficioPdf() throws Exception {
    var seed = seed("1000.00", "2026-01-10");
    var expenseInput = new HashMap<>(expenseBody(seed.receipt, "1000.00", "2026-01-11"));
    expenseInput.put("observations", "Compra emergencial autorizada no processo 12/2026.");
    var expenseResponse = admin.post("/expenses", expenseInput);
    expenseResponse.expect(200);
    String expense = expenseResponse.node().path("id").asText();
    var liquidationInput = new HashMap<>(posting("2026-01-12", "1000.00"));
    liquidationInput.put("observations", "Materiais recebidos e conferidos.");
    liquidationInput.put("destination_account", "000456-7");
    var liquidation = admin.post("/expenses/" + expense + "/liquidations", liquidationInput);
    liquidation.expect(200);
    assertEquals("Materiais recebidos e conferidos.", liquidation.node().path("observations").asText());
    assertEquals("000456-7", liquidation.node().path("destination_account").asText());
    byte[] pdf = "%PDF-1.7\nOfício de pagamento".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    var paymentInput = new HashMap<>(paymentPosting("2026-01-13", "1000.00"));
    paymentInput.put("observations", "Pagamento realizado após conferência do serviço.");
    paymentInput.put("destination_account", "000456-7");
    var wrongPaymentAccount = new HashMap<>(paymentInput);
    wrongPaymentAccount.put("destination_account", "000999-9");
    admin.post("/expenses/" + expense + "/payments", wrongPaymentAccount).expect(409);
    var payment =
        admin.postMultipart(
            "/expenses/" + expense + "/payments",
            paymentInput,
            "payment",
            "payment_document",
            "oficio-pagamento.pdf",
            pdf,
            UUID.randomUUID().toString());
    payment.expect(200);
    String paymentId = payment.node().path("id").asText();
    assertEquals("PROC-2026-0001", payment.node().path("protocol_number").asText());
    assertEquals("Pagamento realizado após conferência do serviço.", payment.node().path("observations").asText());
    assertEquals("000456-7", payment.node().path("destination_account").asText());
    assertEquals("oficio-pagamento.pdf", payment.node().path("payment_document").path("file_name").asText());
    String documentId = payment.node().path("payment_document").path("id").asText();

    var detail = admin.get("/expenses/" + expense);
    detail.expect(200);
    assertEquals("Compra emergencial autorizada no processo 12/2026.", detail.node().path("expense").path("observations").asText());
    assertEquals("Materiais recebidos e conferidos.", detail.node().path("liquidations").get(0).path("observations").asText());
    assertEquals("000456-7", detail.node().path("liquidations").get(0).path("destination_account").asText());
    assertEquals("PROC-2026-0001", detail.node().path("payments").get(0).path("protocol_number").asText());
    assertEquals("Pagamento realizado após conferência do serviço.", detail.node().path("payments").get(0).path("observations").asText());
    assertEquals("000456-7", detail.node().path("payments").get(0).path("destination_account").asText());
    var download = admin.get("/payments/" + paymentId + "/documents/" + documentId);
    download.expect(200);
    assertArrayEquals(pdf, download.response.body());
    assertTrue(download.response.headers().firstValue("content-type").orElseThrow().startsWith("application/pdf"));

    admin
        .post(
            "/expenses/" + expense + "/payments",
            Map.of("date", "2026-01-13", "amount", "1.00", "document", "OF 2"))
        .expect(422);
  }

  @Test
  void commitmentLiquidationPaymentAndYearlyReversal() throws Exception {
    var seed = seed("100000.00", "2025-01-10");
    var expense = expense(seed.receipt, "100000.00", "2025-01-11");
    admin.post("/expenses", expenseBody(seed.receipt, "0.01", "2025-01-11")).expect(409);
    admin.post("/expenses/" + expense + "/payments", paymentPosting("2025-01-11", "25000.00")).expect(409);
    admin
        .post("/expenses/" + expense + "/liquidations", posting("2025-02-01", "25000.00"))
        .expect(200);
    var wrongLiquidationAccount = new HashMap<>(posting("2025-02-01", "1.00"));
    wrongLiquidationAccount.put("destination_account", "999999-9");
    admin.post("/expenses/" + expense + "/liquidations", wrongLiquidationAccount).expect(409);
    admin
        .post("/expenses/" + expense + "/liquidations", posting("2025-02-01", "80000.00"))
        .expect(409);
    admin.post("/expenses/" + expense + "/payments", paymentPosting("2025-01-31", "25000.00")).expect(409);
    var payment =
        admin.post("/expenses/" + expense + "/payments", paymentPosting("2025-02-02", "25000.00"));
    payment.expect(200);
    String id = payment.node().path("id").asText();
    admin
        .post(
            "/payments/" + id + "/reversals",
            Map.of("date", "2026-01-02", "reason", "Pagamento devolvido integralmente"))
        .expect(200);
    admin
        .post(
            "/payments/" + id + "/reversals",
            Map.of("date", "2026-01-02", "reason", "Segunda tentativa de estorno"))
        .expect(409);
    var y2025 = annual(seed.author, 2025);
    var y2026 = annual(seed.author, 2026);
    assertEquals("75000.00", y2025.path("closing_balance").path("value").asText());
    assertEquals("75000.00", y2026.path("opening_balance").path("value").asText());
    assertEquals("0.00", y2026.path("received").path("value").asText());
    assertEquals("25000.00", y2026.path("reversed").path("value").asText());
    assertEquals("100000.00", y2026.path("closing_balance").path("value").asText());
    admin.post("/expenses/" + expense + "/payments", paymentPosting("2025-03-01", "25000.00")).expect(409);
    admin.post("/expenses/" + expense + "/payments", paymentPosting("2026-01-02", "25000.00")).expect(200);
  }

  @Test
  void concurrentPaymentsCannotOverspendAndSameKeyCannotDuplicate() throws Exception {
    var seed = seed("100.00", "2026-01-01");
    var expense = expense(seed.receipt, "100.00", "2026-01-01");
    admin
        .post("/expenses/" + expense + "/liquidations", posting("2026-01-01", "100.00"))
        .expect(200);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var barrier = new CyclicBarrier(2);
      Callable<Reply> pay =
          () -> {
            barrier.await();
            return admin.post("/expenses/" + expense + "/payments", paymentPosting("2026-01-02", "60.00"));
          };
      var results = pool.invokeAll(List.of(pay, pay));
      var statuses =
          List.of(results.get(0).get().status(), results.get(1).get().status()).stream()
              .sorted()
              .toList();
      assertEquals(List.of(200, 409), statuses);
      String key = UUID.randomUUID().toString();
      var next = paymentPosting("2026-01-03", "40.00");
      Callable<Reply> retry =
          () -> {
            barrier.await();
            return admin.post("/expenses/" + expense + "/payments", next, key);
          };
      var replay = pool.invokeAll(List.of(retry, retry));
      replay.get(0).get().expect(200);
      replay.get(1).get().expect(200);
      assertEquals(replay.get(0).get().node(), replay.get(1).get().node());
    }
    assertEquals("100.00", annual(seed.author, 2026).path("paid").path("value").asText());
    assertEquals(2, admin.get("/expenses/" + expense).node().path("payments").size());
  }

  @Test
  void expenseDetailUsesOneDatabaseSnapshotDuringConcurrentWrites() throws Exception {
    var seed = seed("100.00", "2026-01-01");
    var expense = expense(seed.receipt, "100.00", "2026-01-01");
    var firstRead = new CountDownLatch(1);
    var continueReading = new CountDownLatch(1);
    var interceptOnce = new java.util.concurrent.atomic.AtomicBoolean(true);
    org.mockito.Mockito.doAnswer(
            invocation -> {
              Object result = invocation.callRealMethod();
              if (interceptOnce.getAndSet(false)) {
                firstRead.countDown();
                if (!continueReading.await(15, TimeUnit.SECONDS))
                  throw new IllegalStateException("Leitura não liberada");
              }
              return result;
            })
        .when(executionStore)
        .expense(UUID.fromString(expense));
    try (var pool = Executors.newSingleThreadExecutor()) {
      var reading = pool.submit(() -> admin.get("/expenses/" + expense));
      assertTrue(firstRead.await(15, TimeUnit.SECONDS));
      try {
        admin
            .post("/expenses/" + expense + "/liquidations", posting("2026-01-01", "100.00"))
            .expect(200);
        admin
            .post("/expenses/" + expense + "/payments", paymentPosting("2026-01-02", "100.00"))
            .expect(200);
      } finally {
        continueReading.countDown();
      }
      var originalSnapshot = reading.get(20, TimeUnit.SECONDS);
      originalSnapshot.expect(200);
      assertEquals(
          "0.00",
          originalSnapshot.node().path("expense").path("liquidated").path("value").asText());
      assertEquals(
          "0.00", originalSnapshot.node().path("expense").path("paid").path("value").asText());
      assertEquals(
          "100.00",
          admin
              .get("/expenses/" + expense)
              .node()
              .path("expense")
              .path("paid")
              .path("value")
              .asText());
    } finally {
      continueReading.countDown();
      org.mockito.Mockito.reset(executionStore);
    }
  }

  @Test
  void failedAuditRollsBackPaymentAndDeduplication() throws Exception {
    var seed = seed("100.00", "2026-01-01");
    var expense = expense(seed.receipt, "100.00", "2026-01-01");
    admin
        .post("/expenses/" + expense + "/liquidations", posting("2026-01-01", "100.00"))
        .expect(200);
    String key = UUID.randomUUID().toString();
    jdbc.sql(
            "CREATE FUNCTION audit.fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF"
                + " NEW.action='PAY' THEN RAISE EXCEPTION 'Falha de auditoria injetada'; END IF;"
                + " RETURN NEW; END $$")
        .update();
    jdbc.sql(
            "CREATE TRIGGER fail_test BEFORE INSERT ON audit.entries FOR EACH ROW EXECUTE FUNCTION"
                + " audit.fail_test()")
        .update();
    try {
      admin
          .post("/expenses/" + expense + "/payments", paymentPosting("2026-01-02", "100.00"), key)
          .expect(500);
    } finally {
      jdbc.sql("DROP TRIGGER fail_test ON audit.entries").update();
      jdbc.sql("DROP FUNCTION audit.fail_test()").update();
    }
    assertEquals(0, admin.get("/expenses/" + expense).node().path("payments").size());
    assertEquals(
        0L,
        jdbc.sql("SELECT count(*) FROM platform.idempotency WHERE command_key=CAST(? AS uuid)")
            .param(key)
            .query(Long.class)
            .single());
    admin
        .post("/expenses/" + expense + "/payments", paymentPosting("2026-01-02", "100.00"), key)
        .expect(200);
  }

  @Test
  void rolesSessionRevocationAndLastAdmin() throws Exception {
    String email = UUID.randomUUID() + "@example.test",
        password = "Temporary-test-" + UUID.randomUUID(),
        next = "Changed-test-" + UUID.randomUUID();
    var created =
        admin.post(
            "/users",
            Map.of(
                "name", "Consulta teste", "email", email, "password", password, "role", "VIEWER"));
    created.expect(200);
    String id = created.node().path("id").asText();
    var viewer = new Client();
    viewer.login(email, password);
    viewer
        .post("/auth/change-password", Map.of("current_password", password, "new_password", next))
        .expect(200);
    viewer.login(email, next);
    viewer.get("/receipts").expect(200);
    viewer.get("/users").expect(403);
    viewer.post("/parliamentarians", Map.of("name", "Alteração proibida")).expect(403);
    viewer.post("/exports/excel?year=2026", null).expect(403);
    var current = viewer.get("/auth/me").node();
    admin
        .patch(
            "/users/" + id,
            Map.of(
                "role",
                "VIEWER",
                "active",
                false,
                "version",
                current.path("version").asLong(),
                "reason",
                "Revogação de acesso para teste"))
        .expect(200);
    viewer.get("/receipts").expect(401);
    var own = admin.get("/auth/me").node();
    admin
        .patch(
            "/users/" + own.path("id").asText(),
            Map.of(
                "role",
                "VIEWER",
                "active",
                true,
                "version",
                own.path("version").asLong(),
                "reason",
                "Tentativa de remover último administrador"))
        .expect(409);
  }

  @Test
  void loginFailuresAreThrottledWithoutDefaultAccounts() throws Exception {
    var client = new Client();
    client.csrf();
    String email = UUID.randomUUID() + "@example.test";
    for (int i = 0; i < 10; i++)
      client
          .post("/auth/login", Map.of("email", email, "password", "Invalid-password-test"))
          .expect(401);
    client
        .post("/auth/login", Map.of("email", email, "password", "Invalid-password-test"))
        .expect(429);
  }

  @Test
  void longValidEmailCanPersistAuthenticatedSession() throws Exception {
    String email =
        "u".repeat(64)
            + "@"
            + "d".repeat(60)
            + "."
            + "e".repeat(60)
            + "."
            + "f".repeat(60)
            + ".test";
    String password = "Long-email-test-" + UUID.randomUUID();
    admin
        .post(
            "/users",
            Map.of("name", "E-mail longo", "email", email, "password", password, "role", "VIEWER"))
        .expect(200);
    var user = new Client();
    user.login(email, password);
    user.get("/auth/me").expect(200);
    assertEquals(email, user.get("/auth/me").node().path("email").asText());
  }

  @Test
  void excelHasGeneralAndAuthorSheetsNumericMoneyRealDatesAndSafeText() throws Exception {
    var seed = seed("100000.00", "2025-01-10");
    var excel = admin.post("/exports/excel?year=2026&parliamentarian_id=" + seed.author, null);
    excel.expect(200);
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(excel.response.body()))) {
      assertEquals(3, book.getNumberOfSheets());
      assertNotNull(book.getSheet("Geral"));
      assertNotNull(book.getSheet("Histórico"));
      var row = book.getSheet("Geral").getRow(4);
      assertEquals("APS", row.getCell(5).getStringCellValue());
      assertEquals("3.3.90.30 - Material de consumo", row.getCell(6).getStringCellValue());
      assertEquals("Emenda", row.getCell(7).getStringCellValue());
      assertEquals(CellType.NUMERIC, row.getCell(11).getCellType());
      assertEquals(100000.0, row.getCell(11).getNumericCellValue());
      assertTrue(row.getCell(11).getCellStyle().getDataFormatString().contains("R$"));
      assertTrue(DateUtil.isCellDateFormatted(row.getCell(9)));
      assertEquals("dd/mm/yyyy", row.getCell(9).getCellStyle().getDataFormatString());
      assertEquals("00001-0", row.getCell(10).getStringCellValue());
      assertEquals(100000.0, row.getCell(12).getNumericCellValue());
      assertEquals(0.0, row.getCell(13).getNumericCellValue());
      assertEquals(0.0, row.getCell(19).getNumericCellValue());
      for (var sheet : book)
        for (var r : sheet)
          for (var cell : r) assertNotEquals(CellType.FORMULA, cell.getCellType());
      assertFalse(
          book.getSheet("Histórico")
              .getRow(1)
              .getCell(6)
              .getStringCellValue()
              .contains("password_hash"));
    }
  }

  @Test
  void databaseRejectsMutationAndBoundaryRejectsOversizePayload() throws Exception {
    var seed = seed("10.00", "2026-01-01");
    assertThrows(
        org.springframework.dao.DataAccessException.class,
        () ->
            jdbc.sql("UPDATE funding.receipts SET amount=20 WHERE id=CAST(? AS uuid)")
                .param(seed.receipt)
                .update());
    assertThrows(
        org.springframework.dao.DataAccessException.class,
        () ->
            jdbc.sql("DELETE FROM audit.entries WHERE entity_id=CAST(? AS uuid)")
                .param(seed.receipt)
                .update());
    admin.post("/parliamentarians", Map.of("name", "x".repeat(262145))).expect(413);
    var request =
        HttpRequest.newBuilder(URI.create(url("/auth/login")))
            .header("Content-Type", "application/problem+json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"" + "x".repeat(262145) + "\"}"))
            .build();
    assertEquals(413, admin.http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
  }

  private JsonNode annual(String author, int year) throws Exception {
    var response = admin.get("/reports/annual?year=" + year + "&parliamentarian_id=" + author);
    response.expect(200);
    return response.node().path("totals");
  }

  private Seed seed(String amount, String date) throws Exception {
    var author =
        admin.post("/parliamentarians", Map.of("name", "=Parlamentar " + UUID.randomUUID()));
    author.expect(200);
    String p = author.node().path("id").asText();
    var amendment =
        admin.post(
            "/amendments",
            Map.of("parliamentarian_id", p, "number", UUID.randomUUID().toString(), "year", 2025));
    amendment.expect(200);
    String a = amendment.node().path("id").asText();
    var receipt = admin.post("/receipts", receipt(a, amount, date, "Insumos"));
    receipt.expect(200);
    return new Seed(p, a, receipt.node().path("id").asText());
  }

  private String expense(String receipt, String amount, String date) throws Exception {
    var result = admin.post("/expenses", expenseBody(receipt, amount, date));
    result.expect(200);
    return result.node().path("id").asText();
  }

  private Map<String, Object> receipt(String amendment, String amount, String date, String object) {
    return Map.of(
        "amendment_id",
        amendment,
        "type",
        "Custeio",
        "source",
        "Emenda",
        "action",
        "APS",
        "expense_element",
        "3.3.90.30 - Material de consumo",
        "object",
        object,
        "credit_date",
        date,
        "bank_account",
        "00001-0",
        "amount",
        amount);
  }

  private Map<String, Object> expenseBody(String receipt, String amount, String date) {
    return Map.of(
        "receipt_id",
        receipt,
        "description",
        "Compra de insumos",
        "supplier",
        "Fornecedor teste",
        "document",
        "000123",
        "commitment_date",
        date,
        "amount",
        amount);
  }

  private Map<String, Object> posting(String date, String amount) {
    return Map.of(
        "date", date,
        "amount", amount,
        "document", "000001",
        "destination_account", "000123-4");
  }

  private Map<String, Object> paymentPosting(String date, String amount) {
    return Map.of(
        "date", date,
        "amount", amount,
        "document", "OF 000001",
        "destination_account", "000123-4",
        "protocol_number", "PROC-2026-0001");
  }

  private record Seed(String author, String amendment, String receipt) {}

  private String url(String path) {
    return "http://127.0.0.1:" + port + "/api/v1" + path;
  }

  class Reply {
    final HttpResponse<byte[]> response;

    Reply(HttpResponse<byte[]> response) {
      this.response = response;
    }

    int status() {
      return response.statusCode();
    }

    String text() {
      return new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
    }

    JsonNode node() {
      return json.readTree(response.body());
    }

    void expect(int status) {
      assertEquals(status, status(), () -> "Resposta HTTP: " + text());
    }
  }

  class Client {
    final HttpClient http =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String token;

    void csrf() throws Exception {
      var response = get("/auth/csrf");
      response.expect(200);
      token = response.node().path("token").asText();
    }

    void login(String email, String password) throws Exception {
      csrf();
      var response = post("/auth/login", Map.of("email", email, "password", password));
      response.expect(200);
      token = response.node().path("csrf_token").asText();
    }

    Reply get(String path) throws Exception {
      return send("GET", path, null, null);
    }

    Reply post(String path, Object body) throws Exception {
      return post(path, body, UUID.randomUUID().toString());
    }

    Reply post(String path, Object body, String key) throws Exception {
      return send("POST", path, body, key);
    }

    Reply postMultipart(
        String path,
        Object bodyObject,
        String bodyField,
        String fileField,
        String fileName,
        byte[] file,
        String key)
        throws Exception {
      String boundary = "CodexBoundary" + UUID.randomUUID().toString().replace("-", "");
      var body = new java.io.ByteArrayOutputStream();
      body.write(
          ("--" + boundary + "\r\n"
                  + "Content-Disposition: form-data; name=\""
                  + bodyField
                  + "\"\r\n"
                  + "Content-Type: application/json\r\n\r\n"
                  + json.writeValueAsString(bodyObject)
                  + "\r\n--"
                  + boundary
                  + "\r\n"
                  + "Content-Disposition: form-data; name=\""
                  + fileField
                  + "\"; filename=\""
                  + fileName
                  + "\"\r\n"
                  + "Content-Type: application/pdf\r\n\r\n")
              .getBytes(java.nio.charset.StandardCharsets.UTF_8));
      body.write(file);
      body.write(("\r\n--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
      var request = HttpRequest.newBuilder(URI.create(url(path))).timeout(Duration.ofSeconds(30));
      if (token != null) request.header("X-CSRF-TOKEN", token);
      request.header("Idempotency-Key", key);
      request.header("Content-Type", "multipart/form-data; boundary=" + boundary);
      return new Reply(
          http.send(
              request.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build(),
              HttpResponse.BodyHandlers.ofByteArray()));
    }

    Reply patch(String path, Object body) throws Exception {
      return send("PATCH", path, body, null);
    }

    Reply send(String method, String path, Object body, String key) throws Exception {
      var request = HttpRequest.newBuilder(URI.create(url(path))).timeout(Duration.ofSeconds(30));
      if (token != null) request.header("X-CSRF-TOKEN", token);
      if (key != null) request.header("Idempotency-Key", key);
      if (body != null) request.header("Content-Type", "application/json");
      request.method(
          method,
          body == null
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      return new Reply(http.send(request.build(), HttpResponse.BodyHandlers.ofByteArray()));
    }
  }
}
