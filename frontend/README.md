# Gestão de emendas — frontend Angular

Aplicação Angular standalone para registrar parlamentares, emendas, recebimentos por objeto e as etapas de empenho, liquidação, pagamento e estorno. O frontend usa sessão segura do Spring, perfis de acesso e dados persistidos no PostgreSQL por meio da API REST.

## Executar localmente

Requisitos: Node.js compatível com Angular 22 e npm.

1. Inicie o backend seguindo as instruções de [execução e bootstrap do administrador](../backend-emendas/README.md#executar-no-windows). A API deve responder em `http://127.0.0.1:8000`.
2. Neste diretório, execute:

```powershell
npm install
npm start -- --host 127.0.0.1 --port 4207
```

3. Abra `http://127.0.0.1:4207/` e entre com o acesso criado no bootstrap do backend. No primeiro acesso, o sistema solicita uma nova senha.

O servidor Angular encaminha `/api` ao Spring por `proxy.conf.json`. Em produção, a hospedagem deve encaminhar `/api` ao backend na mesma origem, usar HTTPS e configurar o cookie seguro conforme a documentação do backend.

## Fluxos disponíveis

- Login e encerramento de sessão; troca obrigatória da senha temporária; perfis Administrador, Operador e Consulta.
- Cadastro de parlamentar e emenda, seguido de recebimentos independentes por objeto. Um mesmo parlamentar pode ter várias emendas e cada emenda, vários recebimentos.
- Empenho, liquidação, pagamento e estorno integral, vinculados ao recebimento e com chaves de idempotência nas operações financeiras.
- Correção justificada dos metadados de recebimento, trilha de auditoria e gestão de usuários pelo Administrador.
- Saldos por exercício e relatórios Excel e PDF: escopo geral ou por parlamentar, incluindo os exercícios e registros carregados.
- Valores em reais formatados em pt-BR e datas apresentadas como DD/MM/AAAA.

Os relatórios são cópias para consulta e conferência, não substituem o backup recuperável do banco. O frontend não importa a planilha original; a base começa com os registros cadastrados no sistema.

## Validação

```powershell
npm run build
npm test -- --watch=false
```

O build pode exibir avisos de tamanho do pacote inicial e dependências CommonJS por conta das bibliotecas de Excel e PDF. Os módulos de exportação são carregados sob demanda.

## Estrutura

```text
src/app/
  core/api/   sessão, CSRF, cliente HTTP e contratos da API
  core/       modelos financeiros, regras monetárias e store de dados
  shared/     shell, formatação, calendário, guards e componentes comuns
  features/   acesso, recebimentos, execução, catálogo, saldos, histórico,
              usuários e relatórios
```

As rotas carregam páginas sob demanda. Guards do Angular melhoram a navegação; a autorização real permanece no Spring Security.
