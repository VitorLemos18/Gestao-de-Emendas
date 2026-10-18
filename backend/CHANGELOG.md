# Alterações

## 0.2.0 — 16/10/2026

Reescrita do backend em Java 21/Spring Boot a pedido do usuário. Arquitetura pesquisada e documentada: monólito modular por domínio com portas/adaptadores e verificação Spring Modulith/ArchUnit. PostgreSQL substitui SQLite; Flyway versiona o esquema. Sessões Spring Security/JDBC, controles financeiros transacionais, idempotência, auditoria imutável, relatórios anuais e Excel Apache POI. Scripts locais de inicialização, backup e restauração em banco novo.

A API mantém as capacidades anteriores com contrato de erros Problem Details e documentação própria. Não existe migração automática dos dados ou sessões da versão Python. Histórico anterior preservado no Git em fd95691.

## 0.1.0

Protótipo inicial Python/FastAPI, substituído na versão 0.2.0.
