# Controle de emendas — backend Spring Boot

Java 21 LTS, Spring Boot 4.1.1, Spring Security, Spring Modulith 2.1.1, PostgreSQL 17, Flyway e Apache POI. Versão 0.2.0. A versão Python foi substituída; permanece recuperável no histórico Git, commit fd95691.

## Arquitetura

Monólito modular por capacidade de negócio, com portas e adaptadores dentro de cada módulo. Domínio independente de frameworks; casos de uso controlam transações; HTTP, PostgreSQL e Excel ficam nas bordas. [Pesquisa e comparação](docs/ARQUITETURA.md), [decisões registradas](docs/adr/0001-spring-modular-hexagonal.md) e [contrato de qualidade](CONSTRAINTS.md).

```text
src/main/java/br/com/emendas/
  identity/      acessos, perfis, senhas e sessões
  funding/       parlamentares, emendas e recebimentos
  execution/     empenhos, liquidações, pagamentos e estornos
  reporting/     saldos anuais, extrato e Excel
  audit/         histórico imutável
  foundation/    dinheiro, erros, paginação e idempotência
  configuration/ composição da aplicação e segurança HTTP

Dentro dos módulos, conforme a responsabilidade:
  api/           contratos públicos entre módulos
  domain/        regras e valores de negócio, Java puro
  application/   casos de uso e portas de saída
  adapter/in/    controllers e integração com autenticação
  adapter/out/   PostgreSQL e Excel

src/main/resources/db/migration/  migrações Flyway
src/test/java/                   testes de domínio, arquitetura e integração
```

O sistema tem uma aplicação e um banco. Relatórios combinam contratos públicos; cada adaptador SQL acessa apenas o esquema de seu módulo. Spring Modulith rejeita ciclos e acesso a pacotes internos; ArchUnit verifica a independência do domínio e a separação entre controllers, casos de uso e persistência.

## Executar no Windows

Requisitos: JDK 21 ou superior, Docker Desktop em execução e acesso à internet no primeiro build. O Maven Wrapper baixa a distribuição configurada; Maven global não é necessário.

```powershell
.\Preparar-Ambiente.ps1
.\mvnw.cmd verify
.\Iniciar-Backend.ps1 -CriarAdministrador
```

O primeiro comando cria `.env` com senha aleatória do banco; o último solicita nome, e-mail e senha sem exibi-la. Bootstrap só é aceito em base sem usuários. No primeiro login é obrigatória a troca de senha. Nas próximas inicializações use `.\Iniciar-Backend.ps1`.

API: http://127.0.0.1:8000 — documentação: http://127.0.0.1:8000/docs — saúde: `/actuator/health`. O banco deste projeto usa a porta 15432, volume e projeto Compose próprios. O arquivo `.env` é local e ignorado pelo Git.

Para executar apenas a infraestrutura: `docker compose up -d database`. Para executar também a aplicação em contêiner, após o build/testes: `docker compose --profile app up -d --build`. O bootstrap interativo deve ser feito na primeira inicialização local, usando o mesmo banco. Não executar JAR e contêiner da API na mesma porta.

## Autenticação e contrato

1. `GET /api/v1/auth/csrf` cria a sessão anônima e retorna `token`/`header_name`.
2. Envie `X-CSRF-TOKEN` e o cookie no `POST /api/v1/auth/login`, com `email` e `password`.
3. Use o novo `csrf_token` retornado após o login em todas as escritas. O cookie da sessão é HttpOnly; não armazene credenciais em localStorage.
4. Se `must_change_password=true`, use `POST /api/v1/auth/change-password` com `current_password`/`new_password`, entre novamente e obtenha o novo token.

No Swagger, use **Authorize** para informar o token CSRF. Após login, atualize-o com o novo token retornado. O navegador mantém o cookie de sessão. O perfil Consulta lê; Operador e Administrador lançam e exportam; somente Administrador gerencia acessos. Senhas, perfis ou ativação alterados invalidam sessões anteriores pela versão do usuário.

Prefixo `/api/v1`, UUIDs, JSON e parâmetros em snake_case. Datas financeiras ISO `AAAA-MM-DD`; instantes UTC. Valores de entrada são decimais exatos, preferencialmente strings (`"100000.00"`); até 12 casas inteiras e 2 decimais. Saída monetária: `{ "value": "100000.00", "formatted": "R$ 100.000,00", "currency": "BRL" }`. Datas têm valor ISO e formatação no recebimento; o frontend deverá apresentar todas as datas em `DD/MM/AAAA`.

Listas: `items`, `total`, `offset`, `limit` (1 a 200). Erros seguem Problem Details, com `status`, `detail`, `code`, `request_id` e `fields` quando aplicável. A estrutura difere da API Python inicial, que ainda não tinha consumidores integrados.

Criações de recebimento, empenho, liquidação, pagamento e estorno exigem `Idempotency-Key` UUID. Mesma chave/ator e mesmo comando devolvem a resposta anterior; dados diferentes retornam 409. Se houver falha, a transação desfaz também a chave. Correções administrativas do recebimento exigem versão atual e justificativa de 5 a 2000 caracteres; podem alterar parlamentar/emenda, valor, data do crédito e demais dados de origem. O valor corrigido não pode ficar abaixo do total empenhado e a data não pode avançar além de um empenho existente. A alteração e sua trilha de auditoria são atômicas.

## Recursos principais

| Caminho | Uso |
|---|---|
| `/auth/csrf`, `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/change-password` | Acesso e sessão |
| `/users`, `/users/{id}`, `/users/{id}/reset-password` | Gestão de acessos |
| `/parliamentarians`, `/amendments`, `/receipts`, `/receipts/{id}` | Cadastros e recebimentos |
| `/expenses`, `/expenses/{id}` | Empenhos e acompanhamento detalhado |
| `/expenses/{id}/liquidations`, `/expenses/{id}/payments` | Execução |
| `/payments/{id}/reversals` | Estorno integral com data/motivo |
| `/reports/annual?year=2026` | Saldo anterior, créditos, pagamentos, estornos e saldo final |
| `/receipts/{id}/ledger?year=2026` | Extrato de caixa do recebimento |
| `/exports/excel?year=2026` (POST) | Excel financeiro |
| `/audit?entity=receipt&entity_id=UUID` | Histórico paginado |

Relatório e exportação aceitam `parliamentarian_id`. As operações e os esquemas completos estão no OpenAPI gerado pela própria aplicação.

## Regras financeiras e Excel

Cada recebimento preserva seu objeto, origem, conta e crédito. O mesmo parlamentar pode ter R$ 100.000,00 para insumos e R$ 300.000,00 para locomoção sem mistura de saldos. Empenho reserva; liquidação reconhece a obrigação; apenas pagamento reduz caixa. Bloqueios de linha no PostgreSQL serializam a execução por recebimento. A conferência considera toda a linha do tempo, inclusive pagamentos retroativos e estornos posteriores.

Saldo anterior é calculado, mantendo o recebimento original. Estorno é um novo registro e afeta o exercício da devolução. Relatórios usam fotografia transacional consistente. O histórico guarda responsável, instante UTC, motivo e antes/depois na mesma transação da alteração.

O Excel possui `Geral`, uma aba por parlamentar com recebimentos e extrato, e `Histórico`. Contas e documentos são texto, datas são células de data e valores são células numéricas com formato BRL. Textos que começam com `=` permanecem texto. A planilha é uma fotografia do exercício, não um mecanismo de edição/importação do banco. Não contém hashes de senha ou sessões.

## Cópia completa e recuperação

```powershell
.\scripts\Backup-Banco.ps1
.\scripts\Restaurar-Copia.ps1 -Arquivo 'C:\caminho\emendas.dump' -NovoBanco restore_validacao
```

O backup completo usa `pg_dump -Fc`, preservando cadastros, acessos, histórico e migrações. Guarde-o em local protegido. A restauração cria somente um banco novo, não sobrescreve o operacional, falha se o destino já existir e limpa sessões da cópia. Para usar uma cópia validada, configure explicitamente `DB_URL`; o script não troca o banco da aplicação. A restauração e a retenção devem ser exercitadas antes do uso real. Excel é cópia financeira para conferência, não substitui recuperação completa.

## Validação e limites

`./mvnw verify` executa a suíte, incluindo PostgreSQL real via Testcontainers; Docker indisponível causa falha, não pula integração. [Evidências](docs/VALIDACAO.md).

O frontend Angular em `../frontend-emendas` já consome esta API para autenticação, cadastros, execução financeira, histórico, saldos e relatórios. A integração foi validada por build e testes unitários do frontend; o fluxo visual não foi autenticado ponta a ponta nesta sessão porque não foram fornecidas credenciais de teste. Não foram importados os dados da planilha original. Anexos, remanejamentos, juros, cancelamento de empenho e estornos parciais não fazem parte desta versão. Classificações não atestam conformidade legal: regras de aplicação e prestação de contas precisam de validação dos responsáveis antes de uso real.

A exportação e as consultas consolidadas carregam o conjunto financeiro em memória: adequadas ao escopo inicial, exigem medição e paginação/streaming na persistência antes de volumes grandes. Sessões JDBC usam serialização interna do Spring; atualizações incompatíveis podem exigir novo login.

Para publicação: HTTPS, `COOKIE_SECURE=true`, `DOCS_ENABLED=false`, segredos fora dos arquivos compartilhados, usuário do banco com privilégios mínimos e processo de migração separado, cópia externa protegida e recuperação validada. A configuração local usa um único proprietário do banco para desenvolvimento; não é a configuração de produção.
