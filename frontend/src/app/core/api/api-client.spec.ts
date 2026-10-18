import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient, ApiRequestError } from './api-client';
import { apiSessionInterceptor } from './api.interceptor';
import { CsrfState } from './csrf-state';

describe('ApiClient', () => {
  let api: ApiClient;
  let csrf: CsrfState;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(ApiClient);
    csrf = TestBed.inject(CsrfState);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the same-origin API path and includes session credentials', async () => {
    const result = api.get<{ total: number }>('/users', { offset: 0, limit: 50 });
    const request = http.expectOne('/api/v1/users?offset=0&limit=50');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ total: 3 });
    await expect(result).resolves.toEqual({ total: 3 });
  });

  it('adds the session CSRF token and idempotency key to a command', async () => {
    csrf.set('session-token', 'X-CSRF-TOKEN');
    const result = api.post<{ id: string }>(
      '/expenses',
      { amount: '10000.00' },
      { idempotencyKey: 'command-1' },
    );
    const request = http.expectOne('/api/v1/expenses');
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('session-token');
    expect(request.request.headers.get('Idempotency-Key')).toBe('command-1');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ id: 'expense-1' });
    await expect(result).resolves.toEqual({ id: 'expense-1' });
  });

  it('sends multipart files with session security without setting its boundary header manually', async () => {
    csrf.set('session-token', 'X-CSRF-TOKEN');
    const body = new FormData();
    body.append('expense', new Blob(['{}'], { type: 'application/json' }));
    body.append('commitment_document', new File(['%PDF-1.4'], 'nota.pdf', { type: 'application/pdf' }));
    const result = api.postForm<{ id: string }>('/expenses', body, { idempotencyKey: 'upload-1' });
    const request = http.expectOne('/api/v1/expenses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(body);
    expect(request.request.headers.get('Content-Type')).toBeNull();
    expect(request.request.headers.get('X-CSRF-TOKEN')).toBe('session-token');
    expect(request.request.headers.get('Idempotency-Key')).toBe('upload-1');
    request.flush({ id: 'expense-1' });
    await expect(result).resolves.toEqual({ id: 'expense-1' });
  });

  it('converts problem responses into actionable API errors', async () => {
    const result = api.post('/receipts', {});
    const request = http.expectOne('/api/v1/receipts');
    request.flush(
      { status: 422, code: 'INVALID', detail: 'Confira o valor.', fields: { amount: 'Obrigatório' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await expect(result).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'Confira o valor.',
      status: 422,
      code: 'INVALID',
      fields: { amount: 'Obrigatório' },
    } satisfies Partial<ApiRequestError>);
  });
});
