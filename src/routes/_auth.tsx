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
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Tuesday</h1>
          <p className="text-gray-400 mt-1">Your team's workspace</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
