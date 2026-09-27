import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ChefHat, CreditCard, FlaskConical, ShieldCheck, ConciergeBell, ClipboardList } from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../store/auth';
import { connectRealtime } from '../lib/socket';
import { errMsg } from '../lib/api';
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
  const [identifier, setIdentifier] = useState('owner@sizzle.test');
  const [password, setPassword] = useState('sizzle123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      const u = useAuth.getState().user;
      connectRealtime(useAuth.getState().accessToken);
      navigate(u ? homeFor(u.role) : '/app', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  async function quick(email: string) {
    setIdentifier(email);
    setPassword('sizzle123');
    setBusy(true);
    setError(null);
    try {
      await login(email, 'sizzle123');
      const u = useAuth.getState().user;
      connectRealtime(useAuth.getState().accessToken);
      navigate(u ? homeFor(u.role) : '/app', { replace: true });
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
          <p className="mt-1 text-sm text-ink-500">Use your staff email or phone to open the floor.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
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

          <div className="mt-7 flex items-center justify-between text-[13px]">
            <Link to="/register" className="inline-flex items-center gap-1.5 font-semibold text-ember-600 hover:underline">
              <FlaskConical size={14} /> Onboard a restaurant
            </Link>
            <Link to="/book/saffron-and-smoke" className="text-ink-500 hover:text-ink-800">
              Book a table →
            </Link>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-400">Every demo account uses password <span className="font-semibold text-ink-500">sizzle123</span>.</p>
        </div>
      </div>
    </div>
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
