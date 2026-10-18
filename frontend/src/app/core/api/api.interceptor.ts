import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { CsrfState } from './csrf-state';
import { AuthService } from './auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const apiSessionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/v1/')) return next(request);

  let apiRequest = request.clone({ withCredentials: true });
  if (!SAFE_METHODS.has(request.method)) {
    const csrf = inject(CsrfState);
    const token = csrf.token();
    if (token) {
      apiRequest = apiRequest.clone({ setHeaders: { [csrf.headerName()]: token } });
    }
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(apiRequest).pipe(catchError(error => {
    const isSessionProbe = /\/auth\/(?:csrf|login|me)$/.test(request.url);
    if (error instanceof HttpErrorResponse && error.status === 401 && !isSessionProbe) {
      auth.clearSession();
      void router.navigateByUrl('/entrar');
    }
    return throwError(() => error);
  }));
};
