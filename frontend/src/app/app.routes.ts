import { Routes } from '@angular/router';
import { adminGuard, writeGuard, unsavedGuard, sessionGuard, signedOutOnlyGuard } from './shared/guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Visão geral · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  { path: 'entrar', title: 'Entrar · Emendas', canActivate: [signedOutOnlyGuard], loadComponent: () => import('./features/auth/login-page').then(m => m.LoginPage) },
  { path: 'trocar-senha', title: 'Trocar senha · Emendas', canActivate: [sessionGuard], loadComponent: () => import('./features/auth/change-password-page').then(m => m.ChangePasswordPage) },
  {
    path: 'recebimentos',
    title: 'Recebimentos · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/receipts/receipt-list').then((m) => m.ReceiptList),
  },
  {
    path: 'recebimentos/novo',
    title: 'Novo recebimento · Emendas',
    canActivate: [sessionGuard, writeGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/receipts/receipt-form').then((m) => m.ReceiptForm),
  },
  {
    path: 'recebimentos/:id/corrigir',
    title: 'Corrigir recebimento · Emendas',
    canActivate: [sessionGuard, adminGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/receipts/receipt-form').then((m) => m.ReceiptForm),
  },
  {
    path: 'recebimentos/:id',
    title: 'Detalhe do recebimento · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/receipts/receipt-detail').then((m) => m.ReceiptDetail),
  },
  {
    path: 'despesas/:id',
    title: 'Execução da despesa · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/execution/expense-page').then((m) => m.ExpensePage),
  },
  {
    path: 'parlamentares',
    title: 'Parlamentares · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/catalog/parliamentarian-explorer').then((m) => m.ParliamentarianExplorer),
  },
  {
    path: 'saldos',
    title: 'Saldos entre anos · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/reports/annual-page').then((m) => m.AnnualPage),
  },
  {
    path: 'historico',
    title: 'Histórico · Emendas',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/audit/audit-page').then((m) => m.AuditPage),
  },
  {
    path: 'usuarios',
    title: 'Usuários e perfis · Emendas',
    canActivate: [sessionGuard, adminGuard],
    loadComponent: () => import('./features/users/users-page').then((m) => m.UsersPage),
  },
  {
    path: 'exportacoes',
    title: 'Relatórios Excel e PDF · Emendas',
    canActivate: [sessionGuard, writeGuard],
    loadComponent: () => import('./features/export/export-page').then((m) => m.ExportPage),
  },
  {
    path: 'acesso-negado',
    title: 'Acesso indisponível · Emendas',
    data: { denied: true },
    loadComponent: () => import('./shared/feedback-page').then((m) => m.FeedbackPage),
  },
  {
    path: '**',
    title: 'Página não encontrada · Emendas',
    loadComponent: () => import('./shared/feedback-page').then((m) => m.FeedbackPage),
  },
];
