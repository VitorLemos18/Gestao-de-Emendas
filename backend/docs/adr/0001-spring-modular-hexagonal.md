---
status: accepted
---
# Spring Boot em monólito modular com portas e adaptadores

O backend será refeito em Java/Spring Boot conforme a preferência explícita do usuário. A operação financeira e a auditoria exigem uma transação consistente, enquanto autenticação, persistência e Excel precisam de limites claros. Escolhemos monólito modular, módulos por capacidade e domínio independente, com Spring Modulith/ArchUnit verificando as dependências.

Camadas globais foram rejeitadas como organização principal porque espalham uma capacidade entre áreas técnicas. Microsserviços foram considerados e adiados por não existir requisito de implantação independente que compense a consistência distribuída. Portas serão criadas para I/O e contratos reais entre módulos, evitando interfaces que apenas repetem métodos sem proteger uma regra ou uma dependência.
