import { Injectable, inject, signal } from '@angular/core';
import { ApiClient, ApiRequestError } from './api-client';
import { ApiUser, CsrfResponse, LoginResponse } from './api-types';
import { CsrfState } from './csrf-state';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly csrf = inject(CsrfState);
  readonly currentUser = signal<ApiUser | null>(null);
  readonly ready = signal(false);
  private sessionCheck?: Promise<ApiUser | null>;

  async ensureSession(): Promise<ApiUser | null> {
    if (this.ready()) return this.currentUser();
    if (this.sessionCheck) return this.sessionCheck;
    this.sessionCheck = this.loadSession();
    try {
      return await this.sessionCheck;
    } finally {
      this.sessionCheck = undefined;
    }
  }

  async login(email: string, password: string): Promise<ApiUser> {
    await this.refreshCsrf();
    const response = await this.api.post<LoginResponse>('/auth/login', { email, password });
    this.csrf.set(response.csrf_token, response.header_name);
    this.currentUser.set(response.user);
    this.ready.set(true);
    return response.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.post<void>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    this.clearSession();
  }

  async logout(): Promise<void> {
    try {
      await this.api.post<void>('/auth/logout', {});
    } finally {
      this.clearSession();
    }
  }

  clearSession(): void {
    this.currentUser.set(null);
    this.ready.set(true);
    this.csrf.clear();
  }

  private async loadSession(): Promise<ApiUser | null> {
    try {
      await this.refreshCsrf();
      const user = await this.api.get<ApiUser>('/auth/me');
      this.currentUser.set(user);
      return user;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        this.currentUser.set(null);
        return null;
      }
      throw error;
    } finally {
      this.ready.set(true);
    }
  }

  private async refreshCsrf(): Promise<void> {
    const response = await this.api.get<CsrfResponse>('/auth/csrf');
    this.csrf.set(response.token, response.header_name);
  }
}
