import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/common/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: async ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
