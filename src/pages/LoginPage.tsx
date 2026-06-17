import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate('/app');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="glass-card w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-bold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Access your rental portfolio dashboard</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-slate-400">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-cyan-600 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/signup" className="text-cyan-400 hover:text-cyan-300">
            Create one
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          <Link to="/" className="hover:text-slate-300">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
