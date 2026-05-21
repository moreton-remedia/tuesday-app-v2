import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { getSessionFn } from '@/lib/session';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: '/login' });
  },
  component: () => <Outlet />,
});
