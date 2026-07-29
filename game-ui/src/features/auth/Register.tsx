import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { useAuth } from '@/lib/authContext';

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError && isApiErrorCode(err.code)) return USER_MESSAGES[err.code];
  return 'Something went wrong.';
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // register() already returns a token + player, same as login — no
      // separate sign-in step needed once the account is created.
      await register(displayName, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6"
      >
        <h1 className="text-xl font-bold">Create an account</h1>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Display name</span>
          <input
            type="text"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-amber-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-amber-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-amber-400"
          />
        </label>

        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="text-center text-sm text-neutral-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-amber-300 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
