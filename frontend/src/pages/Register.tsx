import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../store/auth';
import { connectRealtime } from '../lib/socket';
import { errMsg } from '../lib/api';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ restaurantName: '', name: '', email: '', phone: '', password: '', cuisine: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/app" replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, email: form.email || undefined, phone: form.phone || undefined, cuisine: form.cuisine || undefined });
      connectRealtime(useAuth.getState().accessToken);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Could not create the restaurant'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-100 px-5 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center"><Brand /></div>
        <div className="card mt-6 p-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-800 tracking-tight text-ink-900">Create an account</h1>
          </div>
          <p className="mt-1 text-[13px] text-ink-500">Creates the tenant, your owner seat, a default menu skeleton and table QR codes.</p>

          <form onSubmit={submit} className="mt-4 space-y-3.5">
            <Field label="Restaurant name" required>
              <Input value={form.restaurantName} onChange={set('restaurantName')} placeholder="Saffron & Smoke" required />
            </Field>
            <Field label="Your name" required>
              <Input value={form.name} onChange={set('name')} placeholder="Aarav Mehta" required />
            </Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={form.email} onChange={set('email')} placeholder="owner@restaurant.in" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={set('phone')} placeholder="+91 98200 11001" />
              </Field>
            </div>
            <Field label="Cuisine" hint="Optional — only shapes the starter menu.">
              <Input value={form.cuisine} onChange={set('cuisine')} placeholder="Modern Indian" />
            </Field>
            <Field label="Password" required hint="At least 8 characters.">
              <Input type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-red-200">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Link to="/login" className="grow">
                <Button variant="ghost" className="w-full" icon={<ArrowLeft size={15} />}>Back to sign in</Button>
              </Link>
              <Button type="submit" variant="primary" loading={busy} className="grow" icon={<ArrowRight size={15} />}>
                Create account
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
