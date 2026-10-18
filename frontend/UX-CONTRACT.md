# Contrato de experiência — Emendas

## Contexto e limites

Público administrativo em pt-BR, com operações de cadastro, conferência e execução por recebimento. A aplicação em uso autentica a pessoa e consulta/grava dados pelo backend Spring. O `DemoStore` funciona como fachada de estado para a interface e conserva um conjunto local usado em testes e desenvolvimento sem API; no modo conectado, os dados vêm do serviço e as permissões efetivas são verificadas no servidor.

Calendário gregoriano. Datas financeiras são datas sem fuso (`AAAA-MM-DD` no domínio e DD/MM/AAAA na tela). Auditoria apresenta instantes em `America/Sao_Paulo`. Todo texto visível, acessível, paginação e calendário deve ser pt-BR. Objetivo de acessibilidade WCAG 2.2 AA, cuja conformidade exige evidência de runtime.

## Fontes do domínio

| Escopo | Fonte | Tipo |
|---|---|---|
| Recebimento, saldo, etapas e estorno | `../backend-emendas/SPEC.md` | Especificação do domínio |
| Contratos da prévia | `src/app/core/models.ts` | Tipos da demonstração |
| Regras e perfis demonstrativos | `src/app/core/demo-store.ts` | Implementação local, não política de produção |
| Dinheiro e contratos reais observados | `../Analise_Frontend_Spring_Angular.md` | Análise do Spring e UX |
| Direção de bibliotecas | `../Pesquisa_Bibliotecas_Angular.md` | Pesquisa oficial |

As regras de negócio continuam pertencendo ao backend. Não introduzir uma operação financeira nova somente para preencher uma tela. O exercício de consulta pode ser diferente do ano do crédito; o saldo anual precisa conservar recursos anteriores. Empenho e liquidação não reduzem caixa. Estorno integral preserva o pagamento original e sua justificativa.

## Contrato visual

`DESIGN.md` registra intenção e valores. `src/styles.scss` é a fonte executável dos tokens, com APIs suportadas de tema Material. A documentação espelha os mesmos valores. Tema claro; sem modo escuro de demonstração. Aplicar as mesmas classes e componentes em todas as funcionalidades.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Não aplicável: sem operação em lote | Este contrato | nenhuma seleção implícita | inspeção |
| Select/Listbox | `MatSelect` e `MatAutocomplete` | Material + este contrato | curto / entidade pesquisável | teclado e popup aberto |
| Date | `PtBrDateAdapter`, `APP_DATE_FORMATS` e `MatDatepicker` | `shared/date-adapter.ts` | digitada / calendário | testes de data e browser |
| Form | Reactive Forms e `MoneyInput` | formulários tipados, `shared/money-input.ts` | cadastro / execução / correção | validação e fluxo completo |
| Scrollbar | `src/styles.scss` | `DESIGN.md` | exceção de geometria somente | computed styles |
| Toast | `MatSnackBar` | mensagem localizada por operação | sucesso / informação | live region e browser |
| CRUD | Rotas das funcionalidades + `DemoStore` | domínio e este contrato | destinos documentados abaixo | testes e browser |
| Confirmation | `ConfirmDialog` / `MatDialog` | `shared/confirm-dialog.ts` | neutro / danger | foco, Escape e retorno |

## Navegação, dados e estado

Navegação principal: Parlamentares, Recebimentos, Saldos entre anos, Histórico, Exportações e Usuários e perfis (somente Administrador). Parlamentares é o ponto de entrada: primeiro uma lista pesquisável de nomes; ao selecionar um, exibir somente as emendas vinculadas; expandir uma emenda para ver os percentuais de empenhado, liquidado e pago líquido acumulado, os recebimentos por objeto, seus valores e o saldo de caixa. Todos os percentuais usam como base os créditos recebidos até o exercício escolhido; o indicador principal é o pago líquido acumulado, que desconta estornos. O detalhe do recebimento começa pela execução e pelas despesas; valor recebido e saldo de caixa ficam em evidência, enquanto a composição do caixa e o extrato anual aparecem em Movimentações. A distinção entre saldo em caixa e valor ainda disponível para empenhar deve permanecer explícita. A tela de detalhe preserva o parlamentar e a emenda na URL. Mudança de perfil preserva os dados da sessão; ao perder acesso administrativo na tela de usuários, retornar a Parlamentares. Consulta não vê comandos de escrita; permissões efetivas sempre são verificadas no servidor.

O detalhe da despesa mostra as etapas em ordem — empenho, liquidação e pagamento líquido — e calcula o percentual pago sobre o valor empenhado. Saldo aguardando liquidação e saldo aguardando pagamento aparecem junto à etapa correspondente; pagamentos estornados preservam o valor original e exibem a devolução vinculada. Os comandos visíveis acompanham os valores ainda pendentes.

As tabelas paginam; não entregar listagem administrativa ilimitada. Conjunto demonstrativo completo pode ser filtrado localmente. Na integração real, busca, filtros e ordenação abrangem o conjunto do servidor, nunca apenas a página carregada. Filtros comprometidos, ordenação e paginação pertencem aos parâmetros da URL quando compartilháveis. Trocar filtro reinicia a página. Ao retornar do detalhe, restaurar o contexto da lista. Sem seleção em lote nesta prévia.

Estados vazios distinguem ausência de registros e ausência de correspondências. Mensagem de erro diz o que corrigir e conserva dados. Carregamento real, quando existir, mantém a geometria e bloqueia somente o comando em curso. Não simular latência em toda operação apenas para exibir um loader. Nenhum estado de demonstração implica que uma requisição foi feita ao backend.

Cada rota possui título localizado. Navegação usa links; ações usam botões. Drawer móvel prende foco quando aberto, fecha com Escape e devolve foco ao botão. Conteúdo possui atalho "Ir para o conteúdo". Abas usam primitiva Material e preservam contexto do mesmo recebimento. Erros de rota e acesso mantêm a navegação utilizável.

## Fluxos e retorno

| Operação | Destino após sucesso | Feedback | Falha / cancelamento |
|---|---|---|---|
| Cadastrar recebimento | Detalhe do recebimento criado | Recebimento incluído na prévia | Manter campos e destacar erro; cancelar volta à lista |
| Corrigir dados | Mesmo recebimento | Dados atualizados na prévia | Preservar campos e motivo |
| Empenhar / liquidar / pagar | Mesmo recebimento, contexto da execução | Nome da etapa e confirmação local | Preservar formulário e explicar limite |
| Estornar | Mesmo recebimento com extrato e saldo atualizados | Pagamento estornado na prévia | Revisão de valor, data e motivo; original preservado |
| Cadastrar parlamentar / emenda | Contexto do cadastro/lista | Cadastro concluído na prévia | Erros inline, valores mantidos |
| Alterar usuário / perfil | Lista de usuários | Alteração concluída na prévia | Preservar dados e explicar regra |
| Reiniciar demonstração | Recebimentos com dados iniciais | Demonstração reiniciada | Cancelar conserva toda a sessão |

Não usar `alert`, `confirm` ou `prompt`. Diálogos têm título, descrição, foco inicial seguro, Escape e restauração de foco. Consequência e objeto são descritos; botão final usa o verbo real. Confirmação de risco foca Cancelar. Salvar rotineiro não pede confirmação adicional. Alterações não salvas têm proteção de navegação quando o formulário se torna dirty.

## Campos, busca e validação

Rótulos permanentes. Formulários `novalidate`; erros são textuais, associados e exibidos após interação ou tentativa de salvar. Submissão inválida foca o primeiro campo incorreto. Não apagar valores preenchidos. Campos obrigatórios e seus limites são validados no formulário e no `DemoStore`; produção repete no servidor. Não permitir duplo submit durante operação em curso. Textareas não redimensionam manualmente e devem oferecer altura adequada ou auto-grow.

Parlamentar é entidade selecionada, não nome livre: autocomplete com `displayWith`, `requireSelection`, ID estável e botão de limpar. Mostrar orientação, nenhum resultado e falha recuperável. Sugestões não contêm botões ou checkboxes aninhados. Busca local é imediata; remota usa debounce de 300ms, suprime IME durante composição e cancela respostas antigas. Limpar é imediato e retorna foco ao campo.

`MoneyInput` é CVA de `string | null` canônica e `NG_VALIDATORS`. Digitar 10000 significa 10.000 reais. Aceitar colagem `R$ 10.000,50`; agrupar milhares sem perder cursor e vírgula parcial; completar duas casas ao sair. Campo vazio continua vazio. Mais de duas casas fica visível como erro, sem corte ou arredondamento. Nenhum cálculo usa ponto flutuante: valores canônicos textuais e centavos `bigint` no domínio da prévia. A biblioteca Maskito permanece disponível, mas o campo usa comportamento próprio testado para não eliminar silenciosamente casas excedentes.

Data digitada deve ser DD/MM/AAAA estrita, incluindo validação do calendário. `NativeDateAdapter` padrão não é parser brasileiro suficiente; usar o adaptador compartilhado. ISO é desserializado por partes locais, sem `Date.parse`/UTC para datas financeiras. Calendário e paginação traduzem também seus nomes acessíveis.

## Responsividade e estados

Tabela financeira conserva relações entre colunas em região horizontal própria; identificadores importantes têm leitura integral. Formulários não herdam um scroll interno de tabela. Sem comandos descobertos somente por hover. Alvos têm hover, foco visível, active e disabled coerentes. Botão ocupado conserva largura. Status nunca depende somente da cor.

Verificação mínima: build, testes unitários de moeda e data, todos os fluxos demonstrativos no browser, teclado, select/autocomplete/calendário abertos, 1366×768 e 390px, textos longos, nenhum resultado, formulário inválido, perfil Consulta, redução de movimento e comparação entre telas. Auditar contratos estaticamente e registrar o que foi realmente executado; auditoria estática não comprova acessibilidade ou comportamento.
