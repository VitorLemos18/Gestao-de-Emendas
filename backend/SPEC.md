# Especificação — versão Spring Boot 0.2.0

## Escopo e aceite

- Parlamentar possui várias emendas; uma emenda possui vários recebimentos, cada um com tipo, ação, elemento de despesa, fonte de recurso, objeto, data de crédito, conta e valor.
- Objetos e contas permanecem vinculados ao recebimento. Empenho, liquidação e pagamento possuem datas/documentos e valores próprios; somente o pagamento reduz caixa.
- Empenhos não excedem o crédito; liquidações não excedem o empenho; pagamentos não excedem o liquidado disponível nem o caixa em qualquer ponto da linha do tempo.
- Pagamento pode ser estornado integralmente uma vez, com data igual/posterior e motivo, sem apagar o original. Devolução só altera o ano em que ocorre.
- Saldo de entrada do exercício deriva dos eventos anteriores do mesmo recebimento, nunca de nova receita fictícia.
- ADMIN gerencia usuários; ADMIN/OPERATOR registram e exportam; VIEWER consulta. Sessões em cookie, CSRF inclusive login, Argon2id, troca inicial obrigatória e revogação por versão do usuário.
- Toda alteração registra ator, instante UTC, antes/depois e motivo. Registros financeiros e auditoria são protegidos contra alteração/exclusão no banco.
- Idempotência, alterações financeiras e auditoria são atômicas; concorrência protegida por bloqueio do recebimento no PostgreSQL.
- Excel com aba Geral, abas por parlamentar e Histórico; BRL numérico, datas reais e identificadores textuais. Backup recuperável completo separado.

## Plataforma e arquitetura

Java 21, Spring Boot 4.1.1, PostgreSQL 17, Flyway. Monólito modular com portas/adaptadores, contratos públicos explícitos, domínio sem dependências de frameworks. Consulte docs/ARQUITETURA.md e os ADRs. A topologia é um processo e uma base; não há mensageria ou consistência distribuída nesta versão.

## Contrato e limites

Consulte README e docs/openapi.json, gerado em execução. Prefixo /api/v1, snake_case, UUID, MoneyView, datas ISO, erros Problem Details. Listas limitadas a 200 itens por página; corpo JSON até 256 KB. Recebimentos e movimentos monetários têm no máximo 12 dígitos inteiros e 2 decimais. Motivos de correção/estorno têm 5 a 2000 caracteres. Valores/datas/origem do recebimento são imutáveis. Não existe exclusão financeira pela API.

Correções descritivas de recebimentos exigem versão atual e motivo. Parlamentares e emendas são criados e consultados nesta versão; não há renomeação/transferência por API. Estornos são apenas integrais; empenho não tem cancelamento nesta versão. Regras de data deste controle não são apresentadas como obrigações legais.

Não inclui frontend conectado, importação automática, anexos, juros, remanejamento nem atestado de conformidade. A homologação das classificações e obrigações de prestação de contas antecede o uso real.
