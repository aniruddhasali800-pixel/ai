import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChefHat,
  CreditCard,
  FlaskConical,
  ShieldCheck,
  ConciergeBell,
  ClipboardList,
  MessageSquareText,
} from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button, Field, Input, SegmentedControl } from '../components/ui';
import { useAuth } from '../store/auth';
import { connectRealtime } from '../lib/socket';
import { errMsg, http } from '../lib/api';
import { DEMO_MASTER, demoPassword } from '../lib/demoAccounts';
import type { Role } from '../lib/types';

const DEMO: { role: Role; label: string; email: string; icon: typeof ChefHat; blurb: string }[] = [
  { role: 'OWNER', label: 'Owner', email: 'owner@sizzle.test', icon: ShieldCheck, blurb: 'Everything, reports, settings' },
  { role: 'MANAGER', label: 'Manager', email: 'manager@sizzle.test', icon: ClipboardList, blurb: 'Floor, staff, orders' },
  { role: 'WAITER', label: 'Waiter', email: 'waiter1@sizzle.test', icon: ConciergeBell, blurb: 'Mobile floor & orders' },
  { role: 'KITCHEN', label: 'Kitchen', email: 'kitchen@sizzle.test', icon: ChefHat, blurb: 'Kitchen display' },
  { role: 'CASHIER', label: 'Cashier', email: 'cashier@sizzle.test', icon: CreditCard, blurb: 'Bills & payments' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('owner@sizzle.test');
  const [password, setPassword] = useState(demoPassword('owner@sizzle.test'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  /** After a successful login, open the right station screen. */
  async function finish() {
    const u = useAuth.getState().user;
    connectRealtime(useAuth.getState().accessToken);
    navigate(u ? homeFor(u.role) : '/app', { replace: true });
  }

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

  async function quick(email: string) {
    setMode('password');
    setIdentifier(email);
    setPassword(demoPassword(email));
    setBusy(true);
    setError(null);
    try {
      await login(email, demoPassword(email));
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
            One system for floor, counter and kitchen. Pick your role to see the exact interface built for that station.
          </p>
        </div>
        <p className="relative text-[12px] text-ink-500">Saffron &amp; Smoke · Pune · a Sizzle demo tenant</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <Brand />
          </div>
          <h1 className="mt-8 font-display text-2xl font-800 tracking-tight text-ink-900 lg:mt-0">Sign in</h1>
          <p className="mt-1 text-sm text-ink-500">One code on the wall, five jobs behind it — your account decides the screen.</p>

          <div className="mt-5">
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={(v) => setMode(v as 'password' | 'code')}
              options={[
                { value: 'password', label: 'Email / Demo' },
                { value: 'code', label: 'One-time code' },
              ]}
            />
          </div>

          {mode === 'password' ? (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <Field label="Email or phone">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@sizzle.test"
                  autoComplete="username"
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
                Enter floor
              </Button>
            </form>
          ) : (
            <CodeForm onDone={finish} />
          )}

          {mode === 'password' && (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-200" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">Demo accounts (1-tap)</span>
                <span className="h-px flex-1 bg-ink-200" />
              </div>

              <div className="grid gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    onClick={() => quick(d.email)}
                    disabled={busy}
                    className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left transition-all hover:border-ember-300 hover:bg-ember-50/40 disabled:opacity-60"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-900 text-white transition-colors group-hover:bg-ember-500">
                      <d.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-ink-900">{d.label}</span>
                      <span className="block truncate text-[12px] text-ink-500">{d.blurb}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-ink-400 group-hover:text-ember-600">{d.email}</span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
                Each job was seeded with its own password — the list is in{' '}
                <span className="font-semibold text-ink-500">DEMO-CREDENTIALS.md</span>. Tapping a tile fills it in for
                you, or use <span className="font-semibold text-ink-500">{DEMO_MASTER}</span> to open any of them.
              </p>
            </>
          )}

          <div className="mt-7 flex items-center justify-between text-[13px]">
            <Link to="/register" className="inline-flex items-center gap-1.5 font-semibold text-ember-600 hover:underline">
              <FlaskConical size={14} /> Onboard a restaurant
            </Link>
            <Link to="/book/saffron-and-smoke" className="text-ink-500 hover:text-ink-800">
              Book a table →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The floor's door: a phone number and a code that is worth five minutes. A walk-in who was
 * approved on the job form has never been given a password, so this is how a shift starts.
 */
function CodeForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const { loginWithCode } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await http.post<{ ok: boolean; sent: boolean; demoCode: string | null }>('/auth/otp/request', {
        phone: phone.trim(),
      });
      setSent(data.sent);
      setDemoCode(data.demoCode);
      if (!data.sent) setError('We could not send a code to that number. Check the digits, or ask your manager to add you.');
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
        <Field label="Your phone number" hint="The one you gave on the job form, or the one your manager typed.">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" required />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<MessageSquareText size={16} />}>
          Send me a code
        </Button>
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
