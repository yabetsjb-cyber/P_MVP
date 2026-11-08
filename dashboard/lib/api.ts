const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ApiError =
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'conflict'; message: string; code?: string }
  | { kind: 'rate_limited'; retryAfter: number }
  | { kind: 'server'; message: string }
  | { kind: 'network' };

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** Skip redirect handling — useful for /me on the login page itself */
  skipAuthRedirect?: boolean;
};

/**
 * All API calls go through this. It always returns a discriminated union,
 * never throws for HTTP errors. Network failures become `{ kind: 'network' }`.
 *
 * On 401, it redirects to /login unless `skipAuthRedirect` is set.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, skipAuthRedirect, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.ok) {
    if (response.status === 204) return { ok: true, data: undefined as T };
    const data = (await response.json().catch(() => ({}))) as T;
    return { ok: true, data };
  }

  return { ok: false, error: await parseError(response, skipAuthRedirect) };
}

async function parseError(
  response: Response,
  skipAuthRedirect: boolean | undefined,
): Promise<ApiError> {
  if (response.status === 401) {
    if (!skipAuthRedirect && typeof window !== 'undefined') {
      // Preserve the page the user wanted
      const returnTo = encodeURIComponent(window.location.pathname);
      window.location.replace(`/login?returnTo=${returnTo}`);
    }
    return { kind: 'unauthorized' };
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    fields?: Record<string, string>;
    code?: string;
  };

  switch (response.status) {
    case 403:
      return { kind: 'forbidden', message: body.message ?? body.error ?? 'Forbidden' };
    case 404:
      return { kind: 'not_found', message: body.message ?? body.error ?? 'Not found' };
    case 409:
      return {
        kind: 'conflict',
        message: body.message ?? body.error ?? 'Conflict',
        code: body.code ?? body.error,
      };
    case 422:
    case 400:
      return { kind: 'validation', fields: body.fields ?? {} };
    case 429: {
      const retry = Number(response.headers.get('Retry-After') ?? '60');
      return { kind: 'rate_limited', retryAfter: Number.isFinite(retry) ? retry : 60 };
    }
    default:
      return {
        kind: 'server',
        message: body.message ?? body.error ?? `Server error (${response.status})`,
      };
  }
}

export function isUnauthorized(err: ApiError): boolean {
  return err.kind === 'unauthorized';
}

/** Human-readable message for any error kind. Use for inline error banners. */
export function errorMessage(err: ApiError): string {
  switch (err.kind) {
    case 'unauthorized':
      return 'Please log in again.';
    case 'forbidden':
      return err.message || 'You do not have permission to do that.';
    case 'not_found':
      return err.message || 'Not found.';
    case 'validation':
      return 'Please check the highlighted fields.';
    case 'conflict':
      return err.message || 'That action conflicts with something else.';
    case 'rate_limited':
      return `Too many requests. Try again in ${err.retryAfter}s.`;
    case 'server':
      return err.message || 'Something went wrong. Try again.';
    case 'network':
      return 'You appear to be offline. Check your connection.';
  }
}