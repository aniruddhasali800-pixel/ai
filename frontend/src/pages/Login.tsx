import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ChefHat, CreditCard, FlaskConical, ShieldCheck, ConciergeBell, ClipboardList, MessageSquareText } from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button, Field, Input, SegmentedControl } from '../components/ui';
import { useAuth } from '../store/auth';
import { connectRealtime } from '../lib/socket';
import { errMsg, http } from '../lib/api';
import type { Role } from '../lib/types';

const DEMO: { role: Role; label: string; email: string; icon: typeof ChefHat; blurb: string }[] = [
  { role: 'OWNER', label: 'Owner', email: 'owner@sizzle.test', icon: ShieldCheck, blurb: 'Everything, reports, settings' },
  { role: 'MANAGER', label: 'Manager', email: 'manager@sizzle.test', icon: ClipboardList, blurb: 'Floor, staff, orders' },
  { role: 'WAITER', label: 'Waiter', email: 'waiter1@sizzle.test', icon: ConciergeBell, blurb: 'Mobile floor & orders' },
  { role: 'KITCHEN', label: 'Kitchen', email: 'kitchen@sizzle.test', icon: ChefHat, blurb: 'Kitchen display' },
  { role: 'CASHIER', label: 'Cashier', email: 'cashier@sizzle.test', icon: CreditCard, blurb: 'Bills & payments' },
];

export function LoginPage() {
  const { user, login, loginWithCode } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('owner@sizzle.test');
  const [password, setPassword] = useState('sizzle123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  /** Both doors land in the same place: the session is real, so open that account's screen. */
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
    setPassword('sizzle123');
    setBusy(true);
    setError(null);
    try {
      await login(email, 'sizzle123');
      await finish();
    } catch (err) {
      setError(errMsg(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, #ea580c, transparent 65%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-0 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #eab308, transparent 70%)' }}
        />
        <Brand light />
        <div className="relative max-w-md">
          <h2 className="font-display text-[38px] font-800 leading-[1.05] tracking-tight">
            One screen for the whole floor.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            QR ordering, kitchen display, waiter routing and table billing — every action pushes to everyone
            online in real time, so the pass never shouts across the room.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['Live order rail', 'Table map', 'Kitchen firing', 'Digital bills', 'GST billing', 'Audit trail'].map((t) => (
              <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-medium text-ink-200">
                {t}
              </span>
            ))}
          </div>
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
              onChange={setMode}
              options={[
                { value: 'password', label: 'Email or phone' },
                { value: 'code', label: 'One-time code' },
              ]}
            />
          </div>

          {mode === 'password' ? (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <Field label="Email or phone">
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@sizzle.test" autoComplete="username" required />
              </Field>
              <Field label="Password">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
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
                <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">Demo accounts</span>
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

              <p className="mt-3 text-[11.5px] text-ink-400">Every demo account uses password <span className="font-semibold text-ink-500">sizzle123</span>.</p>
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
