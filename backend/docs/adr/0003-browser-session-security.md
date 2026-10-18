# ADR 0003 — Sessões e autorização

Status: aceita na reescrita autorizada em 16/10/2026.

## Contexto

O cliente previsto é uma aplicação web de gestão. Bloqueio de usuário, mudança de perfil e troca de senha devem revogar acessos anteriores. Administrador, Operador e Consulta têm permissões diferentes; escritas financeiras precisam de proteção também no servidor.

## Decisão

Spring Security autentica com Argon2id e persiste o contexto em sessões Spring Session JDBC. O navegador recebe somente cookie HttpOnly/SameSite=Lax; produção exige Secure/HTTPS. Há CSRF inclusive no login. A autenticação personalizada salva explicitamente o contexto e troca o identificador de sessão, seguindo o fluxo documentado pelo Spring.

Cada sessão carrega a versão do usuário. Antes das operações, o servidor confere ativação e versão atuais; alterações de acesso/senha tornam sessões anteriores inválidas. Troca inicial de senha é obrigatória. Usuários são criados somente por administrador; o bootstrap não cria credenciais fixas e só funciona em base vazia. Autorizações de escrita/gestão são verificadas nos casos de uso, além da autenticação HTTP.

Não há requisito de consumidores externos ou delegação que justifique tokens JWT próprios. Uma futura integração externa deverá ter um fluxo de identidade específico, sem reutilizar senhas de operadores.

## Consequências

Sessões revogáveis e compartilháveis entre instâncias usam a base existente; acrescentam consultas ao banco e limpeza de sessões expiradas. Serialização interna de sessões pode exigir novo login após mudanças incompatíveis de versão. Proxy/HTTPS e privilégios mínimos do banco são configurações de publicação, distintas do ambiente local.

Referências: [persistência e sessões Spring Security](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html), [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html), [OWASP — armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
