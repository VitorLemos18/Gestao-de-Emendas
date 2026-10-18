import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { DemoStore } from '../core/demo-store';
import { AuthService } from '../core/api/auth.service';
import { ConfirmDialog } from './confirm-dialog';

export const writeGuard: CanActivateFn = () =>
  inject(DemoStore).canWrite() || inject(Router).createUrlTree(['/acesso-negado']);

export const adminGuard: CanActivateFn = () =>
  inject(DemoStore).isAdmin() || inject(Router).createUrlTree(['/acesso-negado']);

export const sessionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const store = inject(DemoStore);
  const router = inject(Router);
  try {
    const user = await auth.ensureSession();
    if (!user) return router.createUrlTree(['/entrar'], { queryParams: { returnUrl: state.url } });
    if (user.must_change_password) return state.url.startsWith('/trocar-senha') ? true : router.createUrlTree(['/trocar-senha']);
    if (state.url.startsWith('/trocar-senha')) return router.createUrlTree(['/recebimentos']);
    if (!store.loaded()) await store.loadBackend(user);
    return true;
  } catch {
    auth.clearSession();
    store.clearBackend();
    return router.createUrlTree(['/entrar'], { queryParams: { erro: 'conexao' } });
  }
};

export const signedOutOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    const user = await auth.ensureSession();
    return user ? router.createUrlTree([user.must_change_password ? '/trocar-senha' : '/recebimentos']) : true;
  } catch {
    return true;
  }
};

export const unsavedGuard: CanDeactivateFn<{ hasUnsavedChanges(): boolean }> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return inject(MatDialog).open(ConfirmDialog, {
    data: {
      title: 'Descartar preenchimento?',
      message: 'Os dados preenchidos ainda não foram salvos.',
      confirmLabel: 'Descartar e sair',
      danger: true,
    },
    width: '440px',
    maxWidth: 'calc(100vw - 32px)',
  }).afterClosed();
};
