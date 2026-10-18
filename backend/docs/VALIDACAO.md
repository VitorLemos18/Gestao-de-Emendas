# Validação — Spring Boot 0.2.0 — 16/10/2026

## Build e testes

`mvnw verify` aprovado com **21 testes, zero falhas, zero erros e zero testes ignorados**. Executado com Temurin JDK 21.0.12.1, compilação release 21 e Spring Boot 4.1.1; a suíte também passou com JDK 26 compilando para 21. PostgreSQL real 17.11 via Testcontainers 2.0.5. Não foi utilizado H2 ou SQLite na validação Java.

| Grupo | Testes | Evidência principal |
|---|---:|---|
| ArchitectureTest | 4 | Spring Modulith sem ciclos/acesso interno; ArchUnit domínio puro, controllers sem persistência e aplicação sem adaptadores |
| TimelineTest | 5 | Centavos exatos, BRL, sem arredondamento silencioso, retroatividade, estorno futuro e total maior que o limite individual |
| AnnualBalanceTest | 1 | Saldo anterior sem crédito fictício; devolução no exercício correto |
| BackendIntegrationTest | 11 | API HTTP real, autenticação, transações PostgreSQL e Excel |

Integração exercita:

- CSRF obrigatório, Argon2id, troca de senha inicial, três perfis, último administrador, bloqueio após dez falhas e revogação de sessão por versão do usuário.
- E-mail válido com mais de cem caracteres preservado na sessão JDBC.
- Recebimentos separados por objeto, formatação BRL/data e zeros na conta bancária, edição com versão e histórico antes/depois/motivo.
- Empenho acima do crédito, liquidação acima do empenho, pagamento sem liquidação, datas anteriores e estorno duplicado rejeitados.
- Dois pagamentos simultâneos: apenas um aprovado quando a soma excederia o disponível. Retentativas simultâneas com a mesma chave geram uma única movimentação.
- Falha de auditoria injetada no PostgreSQL desfaz pagamento e chave de idempotência; a retentativa posterior funciona.
- Consulta pausada após sua primeira leitura mantém a fotografia original enquanto outro pedido liquida e paga; uma nova consulta enxerga os novos valores.
- Estorno no ano seguinte preserva os números do ano anterior; pagamento retroativo não usa a devolução futura.
- Triggers rejeitam alteração do valor de crédito e exclusão de auditoria. Limite de corpo vale também para `application/problem+json`.
- Excel contém Geral, aba do parlamentar e Histórico; células monetárias numéricas com BRL, datas reais DD/MM/AAAA, zeros preservados e ausência de fórmulas em texto iniciado por `=`.

## Revisão

Revisão separada de correção, arquitetura e segurança encontrou e levou à correção de três problemas: fotografia inconsistente em consultas concorrentes, limite de corpo aplicado a apenas um tipo de mídia e tamanho de e-mail incompatível com a coluna de sessões. Acrescentadas regressões correspondentes. O limite de lançamento foi separado da representação dos totais monetários. A releitura das correções não identificou pendências Required/Critical.

Arquivos Java formatados com Google Java Format 1.37.0. Scripts PowerShell conferidos pelo parser e gravados em UTF-8 com BOM para compatibilidade de mensagens no Windows.

## Execução e recuperação

JAR iniciado localmente com Java 21 e PostgreSQL próprio deste projeto. `/actuator/health`, `/docs` e `/v3/api-docs` responderam 200. O manifesto registra Java-Version 21, Start-Class br.com.emendas.EmendasApplication e Spring-Boot-Version 4.1.1. OpenAPI atualizado a partir do serviço executado: **27 operações**.

Imagem Docker construída com sucesso a partir do JAR verificado e runtime Java 21, usando usuário sem privilégios de root. O projeto Compose usa banco/volume próprios e porta PostgreSQL 15432; serviços Docker que já existiam foram preservados.

Scripts `Backup-Banco.ps1` e `Restaurar-Copia.ps1` executados contra a base inicial de desenvolvimento. Dump customizado copiado com SHA-256 e restaurado em `restore_validacao_java`, sem sobrescrever `emendas`. Conferidas onze tabelas dos módulos e zero sessões após a limpeza da cópia. Este exercício usa a base inicial, sem dados de produção; validar restauração com volume/dados representativos faz parte da preparação de uso real.

## Limites da evidência

Não é teste de carga, auditoria externa, varredura completa de vulnerabilidades nem homologação legal. O frontend Angular conectado tem build e testes unitários próprios, mas a sessão autenticada não foi exercitada ponta a ponta nesta validação. Não houve importação da planilha. Leituras consolidadas e exportação carregam conjuntos em memória; paginação de resposta não limita o volume consultado no banco. Configuração local utiliza proprietário do banco para migrações e execução. HTTPS, privilégios mínimos separados, segredos de produção, retenção externa e recuperação operacional precisam ser definidos antes de publicar.
