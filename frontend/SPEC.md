# Prévia completa de gestão de emendas

## Objetivo e limites

Permitir avaliar o trabalho diário em uma aplicação Angular real, com Material e CDK, usando dados demonstrativos. As alterações ficam na memória da aba e são descartadas ao recarregar. Não há autenticação real, gravação no Spring ou movimentação bancária. A troca de perfil serve para avaliar a experiência de Administrador, Operador e Consulta.

## Capacidades e ordem

| Capacidade | Responsabilidade                                               | Depende de   |
| ---------- | -------------------------------------------------------------- | ------------ |
| core       | Modelos, dinheiro exato, cenário e invariantes da demonstração | —            |
| shared     | Moeda, datas pt-BR, confirmação, tema e shell                  | core         |
| receipts   | Recebimentos, correções, despesas e execução                   | core, shared |
| catalog    | Parlamentares e emendas                                        | core, shared |
| reports    | Saldos entre exercícios e exportação Excel/PDF                 | core, shared |
| management | Usuários demonstrativos e histórico agregado                   | core, shared |

## Critérios de aceite

- Um parlamentar pode ter múltiplos recebimentos com objetos e saldos separados.
- Cadastro contém emenda, tipo, ação, elemento de despesa, fonte de recurso, objeto, data, conta e valor.
- Digitar 10000 significa dez mil reais; exibir 10.000,00, com duas casas. Datas DD/MM/AAAA; contas e documentos como texto preservando zeros.
- Corrigir somente tipo, ação, elemento de despesa, fonte de recurso, objeto e conta, com motivo; origem, data e valor permanecem imutáveis.
- Registrar empenho, liquidação parcial, pagamento e estorno integral com validações de saldo e cronologia. Nenhum empenho ou liquidação reduz caixa.
- Estorno devolve caixa na data informada e preserva pagamento original e motivo.
- O saldo anterior pertence ao mesmo recebimento e não cria novo crédito na virada de exercício.
- Administrador gerencia usuários; Operador lança e exporta; Consulta apenas lê. As escritas da demonstração também verificam o perfil.
- Histórico mostra autor da ação, data/hora, objeto, motivo e alterações legíveis.
- Dois escopos de relatório (Excel e PDF): relatório geral com todos os parlamentares e relatório completo de um parlamentar selecionado. Ambos abrangem todos os exercícios e os registros fora da página visível.
- As planilhas detalham recebimentos/objetos, emendas, empenhos, liquidações, pagamentos e estornos, histórico e saldo por ano; o relatório geral também contém uma aba por parlamentar.
- Valores monetários e datas são células tipadas e formatadas, contas e documentos permanecem como texto. Identificar os arquivos como EXEMPLO. Exportação não é uma rotina de recuperação do banco.
- Gerar os mesmos dois escopos em PDF, com resumo, seções detalhadas, cabeçalhos repetidos, quebra de página e numeração. O relatório geral inclui consolidação por parlamentar.
- Selects/Autocomplete, calendário e diálogos são componentes Material, com português, teclado e foco verificados.
- Formulários preservam dados ao errar e confirmam saída quando há preenchimento não salvo.
- Telas utilizáveis em desktop e celular; rolagem de tabelas restrita ao seu contêiner.

## Implementação

Angular/Material/CDK 22.2.3, TypeScript estrito, componentes standalone, rotas por funcionalidade, Reactive Forms, Signals para estado da demonstração. Serviços de domínio demonstrativo não fazem HTTP. A integração futura deverá corrigir e verificar contratos documentados no backend antes de gerar cliente.

## Verificação

`npm test -- --watch=false`: Vitest pelo builder Angular. Testes de dinheiro, datas, saldo, etapas, cronologia, perfis e Excel. `npm run build`: compilação de produção. `npm exec prettier -- --check .`: formatação. Conferência de navegador cobre filtros, cadastro/correção, execução/estorno, exercício, perfis, histórico, Excel, teclado e largura estreita.

## Fonte de domínio

Backend Spring em ../backend-emendas/SPEC.md e seus casos de uso; análise consolidada em ../Analise_Frontend_Spring_Angular.md. Cenário e valores de demonstração preservam o modelo refinado apresentado na conversa.
