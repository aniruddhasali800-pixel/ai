import { useCallback, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, MessageSquareText, ShieldCheck, Store } from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../store/auth';
import { connectRealtime } from '../lib/socket';
import { errMsg, http } from '../lib/api';
import type { Role } from '../lib/types';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [phoneDoor, setPhoneDoor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** After a successful login, open the right station screen. */
  const finish = useCallback(
    async (role?: Role) => {
      const u = role ? { role } : useAuth.getState().user;
      connectRealtime(useAuth.getState().accessToken);
      navigate(u ? homeFor(u.role) : '/app', { replace: true });
    },
    [navigate],
  );

  // Every hook runs before this exit, because a sign-in lands here with a user and React counts the
  // hooks from one render to the next — leaving one below this return would tear the tree down.
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      await finish();
    } catch (err) {
      setError(errMsg(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Decorative / branding panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div className="relative z-10">
          <Brand light />
        </div>
        <div className="relative z-10 max-w-md space-y-4">
          <h2 className="font-display text-3xl font-800 tracking-tight text-white sm:text-4xl">
            Live orders, active tables and clear bills.
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-300">
            One system for floor, counter and kitchen. Sign in and the account decides which station opens — owner,
            manager, waiter, kitchen or cashier.
          </p>
        </div>
        <p className="relative text-[12px] text-ink-500">Sizzle · floor, counter and kitchen in one system</p>
      </div>

      {/* The two doors: an existing restaurant, or a new one. */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <Brand />
          </div>

          <h1 className="mt-8 font-display text-2xl font-800 tracking-tight text-ink-900 lg:mt-0">
            {phoneDoor ? 'Start your shift' : 'Sign in to your restaurant'}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            {phoneDoor
              ? 'The number you gave on the job form, or the one your manager typed. A code is worth five minutes.'
              : 'The email or phone number your owner registered you with, and your password.'}
          </p>

          {phoneDoor ? (
            <CodeForm onDone={finish} onBack={() => setPhoneDoor(false)} />
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <Field label="Email or phone">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@restaurant.com"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<ArrowRight size={16} />}>
                Sign in
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPhoneDoor(true);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 hover:text-ember-600 hover:underline"
              >
                <MessageSquareText size={15} /> No password yet — take a code sent to my phone
              </button>
            </form>
          )}

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">or</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <button
            type="button"
            onClick={() => navigate('/register')}
            className="flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-left transition-all hover:border-ember-300 hover:bg-ember-50/40"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ember-500 text-white">
              <Store size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold text-ink-900">Create a restaurant</span>
              <span className="block text-[12.5px] leading-relaxed text-ink-500">
                Name it, set its branding, and you are its owner — no sales call, no waiting.
              </span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-ink-400" />
          </button>

          <p className="mt-6 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-400">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              Every restaurant’s orders, menus and photos are its own records. Signing in opens one kitchen, not all
              of them.{' '}
              <Link to="/book/saffron-and-smoke" className="font-semibold text-ink-500 hover:text-ink-800 hover:underline">
                Dining as a guest? Book a table →
              </Link>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The floor's door: a phone number and a code that is worth five minutes. A walk-in who was
 * approved on the job form has never been given a password, so this is how a shift starts.
 */
function CodeForm({ onDone, onBack }: { onDone: () => Promise<void> | void; onBack: () => void }) {
  const { loginWithCode } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [noGateway, setNoGateway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNoGateway(false);
    try {
      const { data } = await http.post<{ ok: boolean; sent: boolean; demoCode: string | null }>('/auth/otp/request', {
        phone: phone.trim(),
      });
      // A server with no text gateway hands back no code, which means nothing is coming. The form
      // stays on the number and says so, instead of opening a box for digits that never arrive.
      if (data.sent && !data.demoCode) {
        setNoGateway(true);
      } else {
        setSent(data.sent);
        setDemoCode(data.demoCode);
        if (!data.sent) setError('We could not send a code to that number. Check the digits, or ask your manager to add you.');
      }
    } catch (err) {
      setError(errMsg(err, 'Could not send a code'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithCode(phone.trim(), code.trim());
      await onDone();
    } catch (err) {
      setError(errMsg(err, 'That code is not right, or it has expired'));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form onSubmit={request} className="mt-5 space-y-4">
        <Field label="Your phone number">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" autoFocus required />
        </Field>
        {noGateway && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
            This server is not wired to a text-message provider, so no code can reach a phone. Your
            manager can set a password on your account under Back office → Staff, and you can sign in
            with that instead.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<MessageSquareText size={16} />}>
          Send me a code
        </Button>
        <button type="button" onClick={onBack} className="text-[13px] font-semibold text-ink-600 hover:text-ember-600 hover:underline">
          Sign in with your password instead
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="mt-5 space-y-4">
      <Field label="Six-digit code" hint={`Sent to ${phone}. It is worth five minutes.`}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="tracking-[0.35em] text-center font-display text-lg"
          required
        />
      </Field>
      {demoCode && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
          No SMS gateway on this demo, so the code is shown here: <span className="font-display text-[15px] font-800 tracking-widest">{demoCode}</span>
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => { setSent(false); setCode(''); setError(null); }}>
          Change number
        </Button>
        <Button type="submit" variant="primary" size="lg" className="flex-1" loading={busy} disabled={code.length < 6} icon={<ArrowRight size={16} />}>
          Start shift
        </Button>
      </div>
      <button type="button" onClick={onBack} className="text-[13px] font-semibold text-ink-600 hover:text-ember-600 hover:underline">
        Sign in with your password instead
      </button>
    </form>
  );
}

/** Maps a staff role to their home route — used by every post-login redirect. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'KITCHEN':
      return '/kds';
    case 'WAITER':
      return '/floor';
    case 'CASHIER':
      return '/pos';
    default:
      return '/app';
  }
}
