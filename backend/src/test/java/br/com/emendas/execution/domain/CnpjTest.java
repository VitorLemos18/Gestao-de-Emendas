package br.com.emendas.execution.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class CnpjTest {
  @Test
  void normalizesAndAcceptsNumericAndAlphanumericCnpjs() {
    assertEquals("12345678000195", Cnpj.normalize("12.345.678/0001-95"));
    assertEquals("12ABC34501DE35", Cnpj.normalize("12.ABC.345/01DE-35"));
    assertNull(Cnpj.normalize("   "));
  }

  @Test
  void rejectsInvalidCheckDigitsAndMalformedValues() {
    assertThrows(RuntimeException.class, () -> Cnpj.normalize("12.345.678/0001-90"));
    assertThrows(RuntimeException.class, () -> Cnpj.normalize("12.ABC.345/01DE-36"));
    assertThrows(RuntimeException.class, () -> Cnpj.normalize("12.345"));
  }
}
