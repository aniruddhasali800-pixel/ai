import { useState } from 'react';
import { KeyRound, Mail, Phone, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { invalidate, useQuery } from '../../lib/query';
import { http, errMsg } from '../../lib/api';
import type { Role, User } from '../../lib/types';
import { dateTime, initials, timeAgo } from '../../lib/format';
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Spinner } from '../../components/ui';
import { can, useAuth } from '../../store/auth';
import { toast } from '../../store/toasts';

const ROLES: { value: Role; label: string; blurb: string }[] = [
  { value: 'MANAGER', label: 'Manager', blurb: 'Runs the floor, menu and reports' },
  { value: 'CASHIER', label: 'Cashier', blurb: 'Bills, payments and refunds' },
  { value: 'WAITER', label: 'Waiter', blurb: 'Tables, orders and guest calls' },
  { value: 'KITCHEN', label: 'Kitchen', blurb: 'See tickets and set cooking status' },
];

const ROLE_TONE: Record<string, string> = {
  OWNER: 'bg-ink-900 text-white ring-ink-900',
  MANAGER: 'bg-ember-50 text-ember-700 ring-ember-200',
  CASHIER: 'bg-leaf-100 text-leaf-600 ring-leaf-500/30',
  WAITER: 'bg-blue-50 text-blue-800 ring-blue-200',
  KITCHEN: 'bg-amber-50 text-amber-800 ring-amber-200',
};

export function StaffPage() {
  const { user } = useAuth();
  const writable = can(user?.role, 'staff:write');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const { data, loading } = useQuery<{ data: User[] }>('staff', '/staff');
  const rows = data?.data ?? [];

  const byRole = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r.value] = rows.filter((u) => u.role === r.value).length;
    return acc;
  }, { OWNER: rows.filter((u) => u.role === 'OWNER').length });

  async function setStatus(u: User, status: 'ACTIVE' | 'SUSPENDED') {
    try {
      await http.patch(`/staff/${u._id}`, { status });
      invalidate('staff');
      toast(`${u.name} ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}`, status === 'ACTIVE' ? 'success' : 'info');
    } catch (e) { toast(errMsg(e, 'Could not change that'), 'error'); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {['OWNER', ...ROLES.map((r) => r.value)].map((r) => (
          <div key={r} className="card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{r === 'OWNER' ? 'Owner' : ROLES.find((x) => x.value === r)!.label}</p>
            <p className="mt-1 font-display text-[22px] font-800 leading-none tabular-nums text-ink-900">{byRole[r] ?? 0}</p>
          </div>
        ))}
      </div>

      <Card
        title="Team"
        subtitle="Roles decide what each device can touch"
        action={writable && <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setAdding(true)}>Add staff</Button>}
      >
        {loading && !data ? <Spinner /> : !rows.length ? (
          <EmptyState icon={<Users size={26} />} title="No team yet" body="Add waiters, cooks and a cashier so the floor can run itself." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((u) => (
              <li key={u._id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-900 font-display text-[13px] font-800 text-white">
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900">
                    {u.name}
                    {u._id === user?._id && <span className="ml-1.5 text-[11px] font-medium text-ink-400">(you)</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 truncate text-[12px] text-ink-500">
                    {u.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {u.email}</span>}
                    {u.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {u.phone}</span>}
                  </p>
                </div>
                <span className="hidden text-[11.5px] text-ink-400 md:block">
                  {u.lastLoginAt ? `active ${timeAgo(u.lastLoginAt)}` : `added ${dateTime(u.createdAt).split(',')[0]}`}
                </span>
                <Pill className={ROLE_TONE[u.role] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>{u.role}</Pill>
                {u.status !== 'ACTIVE' && <Pill className="bg-red-50 text-red-700 ring-red-200">Suspended</Pill>}
                {writable && u.role !== 'OWNER' && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<KeyRound size={13} />} onClick={() => setResetting(u)}>Password</Button>
                    <Button size="sm" variant={u.status === 'ACTIVE' ? 'danger' : 'success'} onClick={() => void setStatus(u, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}>
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Restore'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-500">
        <ShieldCheck size={13} className="text-leaf-600" /> Role changes, refunds and price edits are written to the audit trail.
      </p>

      {adding && <StaffModal onClose={() => setAdding(false)} />}
      {editing && <StaffModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <PasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function StaffModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const [form, setForm] = useState({
    name: user?.name ?? '',
    role: user?.role ?? ('WAITER' as Role),
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(user);

  async function save() {
    if (form.name.trim().length < 2) { toast('Add a name', 'error'); return; }
    if (!isEdit && form.password.length < 8) { toast('Pick a password of 8+ characters', 'error'); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await http.patch(`/staff/${user!._id}`, {
          name: form.name.trim(),
          role: form.role,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        });
        toast('Team member updated', 'success');
      } else {
        await http.post('/staff', {
          name: form.name.trim(),
          role: form.role,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          password: form.password,
        });
        toast(`${form.name} can now sign in`, 'success');
      }
      invalidate('staff');
      onClose();
    } catch (e) { toast(errMsg(e, 'Could not save that'), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${user!.name}` : 'Add a team member'} width="max-w-md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sneha Patil" />
        </Field>
        <Field label="Role" className="sm:col-span-2">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.blurb}</option>)}
          </Select>
        </Field>
        <Field label="Email"><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} inputMode="email" /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} inputMode="tel" /></Field>
        {!isEdit && (
          <Field label="Temporary password" required className="sm:col-span-2" hint="They can change it from the sign-in screen">
            <Input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="at least 8 characters" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (password.length < 8) { toast('8 characters minimum', 'error'); return; }
    setBusy(true);
    try {
      await http.post(`/staff/${user._id}/reset-password`, { password });
      invalidate('staff');
      toast(`${user.name}'s password reset`, 'success');
      onClose();
    } catch (e) { toast(errMsg(e, 'Reset failed'), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Reset password" subtitle={user.name} width="max-w-sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Set password</Button></>}>
      <Field label="New password" required hint="This replaces their old password immediately.">
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
