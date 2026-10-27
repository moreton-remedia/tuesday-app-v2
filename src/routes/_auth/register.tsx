import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { signUp } from '@/common/auth-client';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) { setError(result.error.message ?? 'Registration failed.'); return; }
      await router.navigate({ to: '/' });
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-app-t1 mb-6">Create account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-app-t3 mb-1">Name</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            required autoComplete="name"
            className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-app-t1 text-sm focus:outline-none focus:border-app-ac"
          />
        </div>
        <div>
          <label className="block text-sm text-app-t3 mb-1">Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            required autoComplete="email"
            className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-app-t1 text-sm focus:outline-none focus:border-app-ac"
          />
        </div>
        <div>
          <label className="block text-sm text-app-t3 mb-1">Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={8} autoComplete="new-password"
            className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-app-t1 text-sm focus:outline-none focus:border-app-ac"
          />
        </div>
        {error && <p className="text-app-dg text-sm">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full bg-app-ac hover:bg-app-ac/90 disabled:opacity-50 text-app-ac-tx font-medium py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-center text-sm text-app-t3 mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-app-ac hover:text-app-ac/80">Sign in</Link>
      </p>
    </>
  );
}
