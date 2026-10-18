# Capacidades e limites dos módulos

| Módulo | Responsabilidade | Contrato de entrada/saída |
|---|---|---|
| identity | Usuários/perfis, sessão, senha e revogação | HTTP de acesso; CurrentActor, SessionPolicy e BootstrapAdmin |
| funding | Parlamentares, emendas e créditos por objeto | HTTP de cadastro; Funding para leitura e bloqueio transacional |
| execution | Empenhos, liquidações, pagamentos e estornos | HTTP financeiro; Execution para consultas consolidadas |
| reporting | Consolidação anual, extrato e Excel | HTTP de relatórios; ExcelWriter como porta de exportação |
| audit | Histórico imutável | AuditTrail; HTTP paginado |
| foundation | Money, Actor, erros, paginação, idempotência | Tipos puros de domínio e IdempotentCommands |
| configuration | Composição e segurança HTTP | Configuração de execução |

Uma escrita atravessa HTTP → caso de uso → domínio/portas → adaptadores. funding controla o bloqueio do seu recebimento; execution não acessa tabelas funding. Auditoria participa da transação chamadora. reporting combina Funding e Execution sem consultas SQL a tabelas alheias.

Histórico imutável não é event sourcing. Comandos/consultas separados não implicam bases distintas. Interfaces existem nos limites de módulos e I/O para permitir verificação e teste, sem repositórios genéricos, barramento de comandos ou classes base universais.
