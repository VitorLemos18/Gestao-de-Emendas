# PostgreSQL, migrações e políticas financeiras

Usaremos PostgreSQL com migrações Flyway e adaptadores Spring JDBC. A escolha torna explícitos o bloqueio por recebimento, as restrições e a leitura do extrato, mantendo SQL fora do domínio e dos controllers. A implantação utiliza o mesmo banco em testes de integração e na execução; não há substituição por H2/SQLite para aprovar os testes.

Auditoria é gravada de forma síncrona na transação financeira. Registro do pagamento e proteção contra duplicidade são atômicos. O saldo é conferido ao longo das datas financeiras, incluindo pagamentos e estornos, para impedir que um lançamento retroativo use um recurso que só voltou ao saldo no futuro.
