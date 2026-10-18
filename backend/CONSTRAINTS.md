# Contrato de qualidade da reescrita

- Plataforma solicitada: Java com Spring Boot; PostgreSQL como banco operacional.
- O domínio não depende de framework, HTTP, serialização, SQL ou Excel.
- Controller não usa JdbcClient, DataSource, EntityManager ou repositório.
- Casos de uso não dependem de classes de adaptadores.
- Módulos não têm ciclos e só consomem interfaces públicas permitidas.
- Cada módulo acessa suas próprias tabelas; composição entre módulos usa contratos.
- Escritas financeiras, idempotência e auditoria são atômicas; pagamentos concorrentes não podem exceder saldo.
- Valores financeiros não usam float/double para cálculos. Conversão numérica para Excel só ocorre na borda de exportação.
- Testes de integração usam PostgreSQL real e não são ignorados quando Docker estiver indisponível.
- Não reduzir regras de ArchUnit/Modulith, ignorar testes ou retirar asserções para fazer o build passar.
- Não inserir credenciais padrão, importar dados reais ou alterar serviços Docker preexistentes.
