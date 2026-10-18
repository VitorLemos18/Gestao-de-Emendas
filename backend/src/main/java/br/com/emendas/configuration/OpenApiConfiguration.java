package br.com.emendas.configuration;

import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.enums.*;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.*;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
    info =
        @Info(
            title = "Controle de emendas",
            version = "0.2.0",
            description =
                "Sessão em cookie HttpOnly. Obtenha o token em /api/v1/auth/csrf e informe em"
                    + " Authorize; após o login, use o novo csrf_token retornado. Operações"
                    + " financeiras exigem Idempotency-Key UUID."),
    security = @SecurityRequirement(name = "csrf"))
@SecurityScheme(
    name = "csrf",
    type = SecuritySchemeType.APIKEY,
    in = SecuritySchemeIn.HEADER,
    paramName = "X-CSRF-TOKEN",
    description =
        "Token obtido em auth/csrf e renovado após o login. A sessão é mantida automaticamente pelo"
            + " navegador.")
public class OpenApiConfiguration {}
