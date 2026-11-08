import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';

// Router mocks must be created via vi.hoisted so the vi.mock factory
// below can reference them. Exporting them here lets test files import
// the same instances instead of reaching into the mocked module.
const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: routerMocks.push,
    replace: routerMocks.replace,
    prefetch: routerMocks.prefetch,
    back: routerMocks.back,
    forward: routerMocks.forward,
    pathname: '/',
    asPath: '/',
    query: {},
    isReady: true,
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  }),
}));

export { routerMocks };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());