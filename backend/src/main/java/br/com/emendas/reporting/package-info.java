@org.springframework.modulith.ApplicationModule(
    allowedDependencies = {
      "foundation::api",
      "foundation::domain",
      "identity::api",
      "audit::api",
      "funding::api",
      "execution::api"
    })
package br.com.emendas.reporting;
