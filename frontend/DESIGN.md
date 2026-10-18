---
version: alpha
name: Emendas
description: Mesa administrativa para conferir recebimentos e sua execução por objeto.
colors:
  primary: '#234D73'
  on-primary: '#FFFFFF'
  background: '#F5F6F7'
  surface: '#FFFFFF'
  text: '#253039'
  muted: '#5C6873'
  line: '#DCE0E4'
  control: '#7E8790'
  tint: '#EAF0F5'
  danger: '#B42318'
  danger-container: '#FFF1EF'
  success: '#306248'
typography:
  body:
    fontFamily: 'IBM Plex Sans, Segoe UI, sans-serif'
    fontSize: '14px'
    lineHeight: '1.45'
  title:
    fontFamily: 'IBM Plex Sans, Segoe UI, sans-serif'
    fontSize: '27px'
    lineHeight: '1.2'
  data:
    fontFamily: 'IBM Plex Sans, Segoe UI, sans-serif'
    fontSize: '13px'
    lineHeight: '1.45'
rounded:
  DEFAULT: '5px'
  sm: '4px'
  dialog: '8px'
spacing:
  page: '32px'
  field-column-gap: '22px'
  field-row-gap: '24px'
  section: '27px'
components:
  button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.DEFAULT}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    typography: '{typography.body}'
  dialog:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.dialog}'
  table:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.data}'
  navigation:
    backgroundColor: '{colors.background}'
    textColor: '{colors.text}'
  navigation-active:
    backgroundColor: '{colors.tint}'
    textColor: '{colors.primary}'
  helper:
    textColor: '{colors.muted}'
  error:
    backgroundColor: '{colors.danger-container}'
    textColor: '{colors.danger}'
  success-status:
    textColor: '{colors.success}'
---

# Emendas — direção de interface

## Overview

Uma mesa de conferência de recursos: o objeto, a conta e os lançamentos devem ser mais fáceis de comparar do que qualquer elemento decorativo. Público: operadores administrativos que cadastram e conferem recursos de emendas em português do Brasil, sobretudo em computador durante o expediente. Registro de produto, com uso em telas menores para consulta e tarefas pontuais. O contexto foi fornecido na análise `../Analise_Frontend_Spring_Angular.md` e na referência visual refinada da conversa.

A assinatura é a faixa de **saldo explicado**: saldo anterior + recebido − pago + estornado = saldo de caixa registrado. Ela é uma relação financeira legível, sem cartões independentes de métricas. A identidade vem da tipografia, da tabela e dos alinhamentos. A contenção deve vencer em formulários e confirmações. Não usar heróis, gradientes, ornamentos de painel, muitos acentos, números gigantes ou cartões dentro de cartões.

**Fonte executável de tokens:** `src/styles.scss` (modelo runtime canônico). Este documento espelha os valores e explica as decisões. Mudanças duráveis alteram Sass e documentação juntas. Componentes consomem tokens de sistema Material por aliases `--app-*`; valores do tema são definidos com `mat.theme`, `mat.theme-overrides` e mixins `*-overrides`, sem classes internas Material ou `::ng-deep`.

## Colors

Tema claro para uso administrativo diurno. `background` organiza a lateral e a identificação da prévia; `surface` recebe conteúdo. `primary` aparece na ação principal, links e seleção; `tint` sustenta o contexto ativo. `line` separa elementos decorativamente e não é limite funcional suficiente; campos usam `control`. Erro sempre inclui texto de correção. Verde é reservado a conclusão positiva e não torna todo estorno visualmente negativo.

| Papel documentado    | Origem Material           | Consumidor                  |
| -------------------- | ------------------------- | --------------------------- |
| primary / on-primary | primary / on-primary      | Botões, foco e links        |
| background           | surface-container-low     | Navegação e faixa da prévia |
| surface / text       | surface / on-surface      | Conteúdo e tabela           |
| muted                | on-surface-variant        | Ajuda e metadados           |
| control / line       | outline / outline-variant | Campos / separadores        |
| tint                 | primary-container         | Navegação selecionada       |
| danger               | error                     | Erros e ação final de risco |

Scrollbars globais possuem trilho, polegar, hover e active; permanecem visíveis. `forced-colors` devolve cores ao sistema. Modo escuro não está incluído na prévia.

## Typography

IBM Plex Sans auto-hospedada com `@fontsource/ibm-plex-sans`, pesos 400, 500 e 600. Fallback Segoe UI e sans-serif. Não usar uma família de display extra: o usuário já escolheu uma identidade de trabalho. Corpo 14px, dados 13px, ajuda 11–12px, seção 18px, página 27px (25px no celular). Títulos usam peso 500 e espaçamento discretamente fechado. Números usam algarismos tabulares e alinhamento à direita. Nomes, instruções e objetos importantes quebram linhas; não depender de hover para revelar conteúdo.

## Layout

Lateral de 212px em desktop; cabeçalho contextual de 70px; página com 32px de margem interna. Abaixo de 901px, navegação vira drawer acessível com botão visível e cabeçalho de 64px. Abaixo de 701px, margens de 20px e formulários de uma coluna. Campos mantêm rótulos permanentes. Largura máxima de página 1680px.

A tabela é protagonista. Uma região própria oferece rolagem horizontal em largura estreita; a página não deve transbordar. Paginação fica acessível fora dessa rolagem. Formulários longos seguem o documento e não herdam altura fixa da tabela. Faixa de saldo se adapta de cinco para três e depois duas colunas; saldo final ganha uma linha inteira no celular. Navegação atual tem cor e marca lateral, sem depender somente da cor.

## Elevation & Depth

Conteúdo e seções são planos, separados por espaço e divisórias. Overlays de seleção, menu e calendário recebem a elevação Material. Diálogo é modal e visualmente distinto do conteúdo. Não acrescentar sombras a todas as seções.

## Shapes

Controles têm raio 4px; botões e menus 5px; diálogo 8px. A lateral é reta. Status têm raio 3px e não parecem comandos. A marca textual "Emendas" identifica a prévia.

## Components

Material + CDK são os donos de interação acessível. Select curto usa `MatSelect`; busca de entidade usa `MatAutocomplete` com `displayWith` e `requireSelection`. `app-money-input` é o único dono de edição monetária. `PtBrDateAdapter` e `APP_DATE_FORMATS` definem datas estritas; `MatDatepickerIntl` e `MatPaginatorIntl` traduzem interface e acessibilidade. `ConfirmDialog` usa `MatDialog` e retorna boolean. Feedback curto usa `MatSnackBar`; erro de formulário é persistente e inline.

Ícones de navegação só quando esclarecem uma ação: a dependência instalada `@lucide/angular` é importada por ícone. No shell, menu móvel e seta de perfil são decorativos dentro de botões com nome acessível.

Classes compartilhadas: `.page`, `.page-head`, `.page-title`, `.page-intro`, `.toolbar`, `.form-grid`, `.full-width`, `.work-table`, `.table-wrap`, `.section-heading`, `.form-actions`, `.muted`, `.numeric`, `.status`, `.empty-state`, `.error-banner`, `.balance-strip`, `.balance-item`, `.balance-final`.

## Do's and Don'ts

- Manter objeto, parlamentar, data, conta e valores em contexto.
- Nomear o saldo como caixa registrado; empenho e liquidação ficam na execução.
- Usar texto junto de status e erros, foco visível e ações semânticas.
- Verificar componentes abertos e dados longos em 1366×768 e 390px.
- Não apresentar dados locais de teste como registros confirmados do sistema conectado.
- Não modificar cores por seletores internos Material; usar as APIs de tema.
- Não cortar centavos nem arredondar dinheiro silenciosamente.
- Respeitar `prefers-reduced-motion`; não usar movimento decorativo.
