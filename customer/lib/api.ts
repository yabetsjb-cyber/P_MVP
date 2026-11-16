const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ApiError = 
  | { kind: 'unauthorized' }
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'network' }
  | { kind: 'server'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'conflict'; code?: string; message: string };

export async function api<T>(path: string, options: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: { kind: 'unauthorized' } };
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 || res.status === 422) return { ok: false, error: { kind: 'validation', fields: body.fields || {} } };
      if (res.status === 404) return { ok: false, error: { kind: 'not_found', message: body.error } };
      if (res.status === 409) return { ok: false, error: { kind: 'conflict', code: body.error, message: body.error } };
      return { ok: false, error: { kind: 'server', message: body.error || 'Server error' } };
    }

    const data = res.status === 204 ? null : await res.json();
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }
}