import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/common/auth';
import { subscribeToBoard } from '@/lib/board-events';

export const Route = createFileRoute('/api/board-events/$')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 });
        }

        const boardId = new URL(request.url).pathname.replace('/api/board-events/', '');
        if (!boardId) {
          return new Response('Bad Request', { status: 400 });
        }

        const encoder = new TextEncoder();
        let cleanup = () => {};

        const stream = new ReadableStream({
          start(ctrl) {
            let alive = true;
            const send = (data: string) => {
              if (alive) {
                try { ctrl.enqueue(encoder.encode(data)); } catch { alive = false; }
              }
            };

            send(':ping\n\n');
            const unsubscribe = subscribeToBoard(boardId, send);
            const interval = setInterval(() => {
              if (!alive) { clearInterval(interval); return; }
              send(':ping\n\n');
            }, 30_000);

            cleanup = () => {
              alive = false;
              clearInterval(interval);
              unsubscribe();
            };
          },
          cancel() { cleanup(); },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      },
    },
  },
});
