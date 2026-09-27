import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Broom, Hand, PlusCircle, Share2, UserPlus } from 'lucide-react';
import { invalidate, useQuery } from '../../lib/query';
import { http, errMsg } from '../../lib/api';
import type { User, WaiterTable } from '../../lib/types';
import { REQUEST_LABEL, TABLE_STATUS_META } from '../../lib/statusMaps';
import { clockTime, inr, timeAgo } from '../../lib/format';
import { Button, Field, Input, Modal, SegmentedControl, Select, Spinner } from '../../components/ui';
import { can, useAuth } from '../../store/auth';
import { toast } from '../../store/toasts';

type Filter = 'all' | 'mine' | 'seated' | 'open';

export function FloorMap() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const writable = can(user?.role, 'tables:write');
  const { data, loading } = useQuery<{ data: WaiterTable[] }>('floor:map', '/waiters/map');
  const { data: staff } = useQuery<{ data: User[] }>('staff', '/staff');
  const [filter, setFilter] = useState<Filter>('all');
  const [seating, setSeating] = useState<WaiterTable | null>(null);
  const [transferring, setTransferring] = useState<WaiterTable | null>(null);

  const tables = data?.data ?? [];
  const shown = useMemo(
    () =>
      tables.filter((t) =>
        filter === 'all' ? true
          : filter === 'mine' ? t.mine
            : filter === 'seated' ? Boolean(t.session)
              : !t.session,
      ),
    [tables, filter],
  );
  const waiters = (staff?.data ?? []).filter((u) => u.role === 'WAITER' && u.status === 'ACTIVE');

  if (loading && !data) return <Spinner label="Loading the floor…" />;

  async function clear(t: WaiterTable) {
    try {
      await http.post(`/waiters/tables/${t._id}/clear`);
      invalidate('floor');
      invalidate('tables');
      toast(`Table ${t.number} cleared and free`, 'success');
    } catch (e) {
      invalidate('floor');
      toast(errMsg(e, 'Could not clear that table'), 'error');
    }
  }

  async function shareMenu(t: WaiterTable) {
    const url = `${window.location.origin}/t/${t.qrToken}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Table ${t.number} menu`, url }); return; } catch { /* dismissed */ }
    }
    void navigator.clipboard?.writeText(url);
    toast('Menu link copied', 'success');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${tables.length}` },
            { value: 'mine', label: 'Mine' },
            { value: 'seated', label: 'Seated' },
            { value: 'open', label: 'Free' },
          ]}
        />
        <Button size="sm" variant="primary" icon={<PlusCircle size={14} />} onClick={() => navigate('/floor/order')}>New order</Button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => {
          const meta = TABLE_STATUS_META[t.status];
          const late = t.session && timeAgo(t.session.openedAt).includes('h');
          return (
            <article key={t._id} className={`overflow-hidden rounded-2xl border shadow-sm ${meta.card}`}>
              <header className={`flex items-center gap-2 px-3.5 py-2.5 ${meta.text}`}>
                <span className="font-display text-[16px] font-800 leading-none">{t.number}</span>
                <span className="text-[11.5px] opacity-80">{t.section} · {t.capacity}p</span>
                {t.mine && <span className="ml-auto rounded bg-black/15 px-1.5 py-0.5 text-[10px] font-bold uppercase">Mine</span>}
              </header>
              <div className="bg-white/95 px-3.5 py-3">
                {t.session ? (
                  <>
                    <p className="truncate text-[13px] font-semibold text-ink-900">
                      {t.session.customerName || 'Walk-in'} · {t.session.guestCount} guests
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      opened {clockTime(t.session.openedAt)}
                      {late ? ' · long sitting' : ''} · tab <span className="font-semibold text-ink-800">{inr(t.runningTotal)}</span>
                    </p>
                    {!!t.activeOrders.length && (
                      <p className="mt-1 truncate text-[12px] text-ink-500">
                        {t.activeOrders.map((o) => `${o.orderNumber} ${o.status[0]}${o.status[1]?.toLowerCase() ?? ''}`).join(' · ')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-ink-500">{meta.label} · ready to seat</p>
                )}

                {!!t.openRequests.length && (
                  <ul className="mt-2 space-y-1">
                    {t.openRequests.map((r) => (
                      <li key={r._id} className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11.5px] font-semibold text-amber-800">
                        <span>{REQUEST_LABEL[r.type]?.emoji ?? '✋'}</span>
                        {REQUEST_LABEL[r.type]?.label ?? r.type}
                        <span className="ml-auto font-normal text-amber-700">{timeAgo(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {t.session ? (
                    <>
                      <Button size="sm" variant="secondary" icon={<PlusCircle size={13} />} onClick={() => navigate(`/floor/order?table=${t._id}`)}>Add</Button>
                      <Button size="sm" variant="secondary" icon={<Share2 size={13} />} onClick={() => void shareMenu(t)}>Menu</Button>
                      {writable && <Button size="sm" variant="ghost" icon={<Hand size={13} />} onClick={() => void clear(t)}>Clear</Button>}
                    </>
                  ) : (
                    writable && <Button size="sm" variant="primary" icon={<UserPlus size={13} />} onClick={() => setSeating(t)}>Seat</Button>
                  )}
                  {writable && !!t.session && (
                    <Button size="sm" variant="ghost" icon={<Broom size={13} />} onClick={() => setTransferring(t)}>Transfer</Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!shown.length && <p className="col-span-full py-10 text-center text-sm text-ink-500">No tables match that filter.</p>}
      </div>

      {seating && <SeatModal table={seating} onClose={() => setSeating(null)} />}
      {transferring && <TransferModal table={transferring} waiters={waiters} onClose={() => setTransferring(null)} />}
    </div>
  );
}

function SeatModal({ table, onClose }: { table: WaiterTable; onClose: () => void }) {
  const [guests, setGuests] = useState(Math.min(2, table.capacity));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function seat() {
    setBusy(true);
    try {
      const { data } = await http.post<{ publicToken: string }>(`/waiters/tables/${table._id}/seat`, {
        guestCount: guests,
        customerName: name || undefined,
      });
      invalidate('floor');
      invalidate('tables');
      toast(`Table ${table.number} seated`, 'success');
      onClose();
      if (navigator.share) {
        void navigator.share({ title: `Table ${table.number}`, url: `${window.location.origin}/s/${data.publicToken}` }).catch(() => undefined);
      }
    } catch (e) { toast(errMsg(e, 'Could not seat them'), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Seat table ${table.number}`} subtitle={`${table.section} · seats up to ${table.capacity}`} width="max-w-sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={seat}>Seat guests</Button></>}>
      <div className="space-y-3">
        <Field label="Guests">
          <div className="flex gap-1.5">
            {Array.from({ length: Math.min(10, table.capacity) }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setGuests(n)}
                className={`h-9 flex-1 rounded-lg text-[13px] font-bold transition-colors ${guests === n ? 'bg-ink-900 text-white' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`}>
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mehta" /></Field>
      </div>
    </Modal>
  );
}

function TransferModal({ table, waiters, onClose }: { table: WaiterTable; waiters: User[]; onClose: () => void }) {
  const [waiterId, setWaiterId] = useState(waiters.find((w) => w._id !== table.assignedWaiterId)?._id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await http.post(`/waiters/tables/${table._id}/transfer`, { waiterId, reason: reason || undefined });
      invalidate('floor');
      invalidate('tables');
      toast(`Table ${table.number} handed over`, 'success');
      onClose();
    } catch (e) { toast(errMsg(e, 'Transfer failed'), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Hand over table ${table.number}`} width="max-w-sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!waiterId} onClick={go}>Transfer</Button></>}>
      <div className="space-y-3">
        <Field label="New waiter">
          <Select value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
            <option value="">Choose a colleague…</option>
            {waiters.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
          </Select>
        </Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="They know the regulars" /></Field>
      </div>
    </Modal>
  );
}
