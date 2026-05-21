import { createRouterClient } from '@orpc/server';
import { appRouter } from '@/rpc/router';

export function createServerClient(headers: Headers, request?: Request) {
  return createRouterClient(appRouter, {
    context: { headers, request },
  });
}
