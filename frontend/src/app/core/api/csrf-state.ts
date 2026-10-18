import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CsrfState {
  readonly token = signal('');
  readonly headerName = signal('X-CSRF-TOKEN');

  set(token: string, headerName = 'X-CSRF-TOKEN'): void {
    this.token.set(token);
    this.headerName.set(headerName);
  }

  clear(): void {
    this.token.set('');
    this.headerName.set('X-CSRF-TOKEN');
  }
}
