import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '@/lib/api';

const API = 'http://localhost:3000';

describe('customer lib/api', () => {
  it('returns ok data on 200', async () => {
    server.use(http.get(`${API}/v1/echo`, () => HttpResponse.json({ value: 42 })));
    const result = await api<{ value: number }>('/v1/echo');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.value).toBe(42);
  });

  it('maps 401 to unauthorized', async () => {
    server.use(http.get(`${API}/v1/echo`, () => HttpResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })));
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unauthorized');
  });

  it('maps 422 to validation with fields', async () => {
    server.use(http.get(`${API}/v1/echo`, () =>
      HttpResponse.json({ error: 'VALIDATION', fields: { email: 'required' } }, { status: 422 }),
    ));
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'validation') {
      expect(result.error.fields).toEqual({ email: 'required' });
    }
  });

  it('maps network failure', async () => {
    server.use(http.get(`${API}/v1/echo`, () => HttpResponse.error()));
    const result = await api('/v1/echo');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
  });
});