package br.com.emendas;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.*;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ArchitectureTest {
  private final com.tngtech.archunit.core.domain.JavaClasses classes =
      new ClassFileImporter()
          .withImportOption(new ImportOption.DoNotIncludeTests())
          .importPackages("br.com.emendas");

  @Test
  void modulesHaveNoCyclesAndRespectPublicContracts() {
    ApplicationModules.of(EmendasApplication.class).verify();
  }

  @Test
  void domainUsesOnlyJdkAndDomainTypes() {
    classes()
        .that()
        .resideInAPackage("..domain..")
        .and()
        .doNotHaveSimpleName("package-info")
        .should()
        .onlyDependOnClassesThat()
        .resideInAnyPackage("java..", "..domain..")
        .check(classes);
  }

  @Test
  void controllersDoNotAccessStorage() {
    noClasses()
        .that()
        .areAnnotatedWith(org.springframework.web.bind.annotation.RestController.class)
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "org.springframework.jdbc..", "javax.sql..", "jakarta.persistence..", "..adapter.out..")
        .check(classes);
    noClasses()
        .that()
        .areAnnotatedWith(org.springframework.web.bind.annotation.RestController.class)
        .should()
        .dependOnClassesThat()
        .haveSimpleNameEndingWith("Store")
        .check(classes);
  }

  @Test
  void applicationCannotImportAdapters() {
    noClasses()
        .that()
        .resideInAPackage("..application..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("..adapter..")
        .check(classes);
  }
}
