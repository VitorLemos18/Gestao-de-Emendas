import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiProblem } from './api-types';

const API_ROOT = '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.request(this.http.get<T>(this.url(path), { params, withCredentials: true }));
  }

  post<T>(
    path: string,
    body: unknown,
    options: { idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = options.idempotencyKey
      ? new HttpHeaders({ 'Idempotency-Key': options.idempotencyKey })
      : undefined;
    return this.request(
      this.http.post<T>(this.url(path), body, { headers, withCredentials: true }),
    );
  }

  postForm<T>(path: string, body: FormData, options: { idempotencyKey?: string } = {}): Promise<T> {
    const headers = options.idempotencyKey
      ? new HttpHeaders({ 'Idempotency-Key': options.idempotencyKey })
      : undefined;
    return this.request(
      this.http.post<T>(this.url(path), body, { headers, withCredentials: true }),
    );
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request(this.http.patch<T>(this.url(path), body, { withCredentials: true }));
  }

  postBlob(path: string, query: Record<string, string | number | undefined>): Promise<Blob> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.request(
      this.http.post(this.url(path), {}, { params, responseType: 'blob', withCredentials: true }),
    );
  }

  private url(path: string): string {
    return API_ROOT + (path.startsWith('/') ? path : '/' + path);
  }

  private async request<T>(request: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  private toApiError(error: unknown): Error {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error ? error : new Error('Não foi possível acessar o sistema.');
    }
    const body = this.problemBody(error.error);
    return new ApiRequestError(
      body?.detail ?? 'Não foi possível concluir a operação. Tente novamente.',
      error.status,
      body?.code,
      body?.request_id,
      body?.fields,
    );
  }

  private problemBody(body: unknown): ApiProblem | null {
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as unknown;
      } catch {
        return null;
      }
    }
    if (body === null || typeof body !== 'object') return null;
    const value = body as Record<string, unknown>;
    return {
      status: typeof value['status'] === 'number' ? value['status'] : undefined,
      code: typeof value['code'] === 'string' ? value['code'] : undefined,
      detail: typeof value['detail'] === 'string' ? value['detail'] : undefined,
      request_id: typeof value['request_id'] === 'string' ? value['request_id'] : undefined,
      fields:
        value['fields'] !== null && typeof value['fields'] === 'object'
          ? (value['fields'] as Record<string, string>)
          : undefined,
    };
  }
}
