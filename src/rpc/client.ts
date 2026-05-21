import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { AppRouter } from '@/rpc/router';

function getRpcUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc`;
  }

  return new URL('/api/rpc', process.env.BASE_URL || 'http://localhost:3000').toString();
}

const link = new RPCLink({
  url: () => getRpcUrl(),
  fetch: (request, init) => globalThis.fetch(request, init),
});

export const client = createORPCClient<RouterClient<AppRouter>>(link);

