import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api, errorMessage } from '@/lib/api';

const API = 'http://localhost:3000';

describe('lib/api', () => {
  it('returns ok data on 200', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () => HttpResponse.json({ value: 42 })),
    );
    const result = await api<{ value: number }>('/v1/echo');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.value).toBe(42);
  });

  it('maps 401 to { kind: unauthorized }', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () =>
        HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );
    const result = await api('/v1/echo', { skipAuthRedirect: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unauthorized');
  });

  it('maps 403 with message', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () =>
        HttpResponse.json({ error: 'FORBIDDEN', message: 'Nope' }, { status: 403 }),
      ),
    );
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('forbidden');
      if (result.error.kind === 'forbidden') expect(result.error.message).toBe('Nope');
    }
  });

  it('maps 422 with field errors', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () =>
        HttpResponse.json(
          { error: 'VALIDATION', fields: { email: 'required' } },
          { status: 422 },
        ),
      ),
    );
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'validation') {
      expect(result.error.fields).toEqual({ email: 'required' });
    }
  });

  it('maps network failure', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () => HttpResponse.error()),
    );
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
  });

  it('maps 429 with Retry-After header', async () => {
    server.use(
      http.get(`${API}/v1/echo`, () =>
        HttpResponse.json(
          { error: 'RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '17' } },
        ),
      ),
    );
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'rate_limited') {
      expect(result.error.retryAfter).toBe(17);
    }
  });

  it('errorMessage returns a string for every kind', () => {
    expect(errorMessage({ kind: 'unauthorized' })).toBeTruthy();
    expect(errorMessage({ kind: 'network' })).toBeTruthy();
    expect(
      errorMessage({ kind: 'rate_limited', retryAfter: 5 }),
    ).toContain('5s');
  });
});