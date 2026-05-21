import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSessionFn } from '@/lib/session';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSessionFn();
    throw redirect({ to: session ? '/app' : '/login' });
  },
  component: () => null,
});
