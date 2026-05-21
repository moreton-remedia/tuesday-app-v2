import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';
import { appRouter } from '@/rpc/router';

const handler = new RPCHandler(appRouter);

export const Route = createFileRoute('/api/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response, matched } = await handler.handle(request, {
          prefix: '/api/rpc',
          context: { headers: request.headers, request },
        });

        if (matched) return response;

        return new Response(JSON.stringify({ error: 'No route was found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});

