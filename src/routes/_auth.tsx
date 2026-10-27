import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { getSessionFn } from '@/lib/session';

export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (session) throw redirect({ to: '/app' });
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Tuesday" className="h-14 w-auto mx-auto" />
          <p className="text-app-t3 mt-3">Your team's workspace</p>
        </div>
        <div className="bg-app-s1 border border-app-ln rounded-xl p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
