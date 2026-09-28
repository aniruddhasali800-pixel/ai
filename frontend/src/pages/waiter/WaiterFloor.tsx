import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, CheckCheck, CircleUser, Inbox, PlusCircle, Receipt, Timer, Users } from 'lucide-react';
import { invalidate, useQuery } from '../../lib/query';
import { http, errMsg } from '../../lib/api';
import type { Bill, CustomerRequest, WaiterTable } from '../../lib/types';
import { REQUEST_LABEL, TABLE_STATUS_META } from '../../lib/statusMaps';
import { inr, minutesSince, timeAgo } from '../../lib/format';
import { Button, Card, EmptyState, Pill, Spinner, StatTile } from '../../components/ui';
import { toast } from '../../store/toasts';
import { useAuth } from '../../store/auth';

interface Shift {
  tablesAssigned: number;
  ordersToday: number;
  salesToday: number;
  awaitingPickup: number;
  openRequests: number;
  shiftStartedAt: string;
  bookings: number;
}

export function WaiterFloor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: shift } = useQuery<Shift>('waiter:summary', '/waiters/me/summary');
  const { data: floor, loading } = useQuery<{ data: WaiterTable[] }>('floor:map', '/waiters/map');
  const { data: calls } = useQuery<{ data: CustomerRequest[] }>('requests:list', '/waiters/requests');

  const tables = floor?.data ?? [];
  const mine = tables.filter((t) => t.mine && t.session);
  const openCalls = (calls?.data ?? []).filter((r) => r.status !== 'DONE');
  const myCalls = openCalls.filter((r) => r.mine);

  if (loading && !floor) return <Spinner label="Loading your floor…" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="My tables" value={String(shift?.tablesAssigned ?? mine.length)} hint={`${mine.filter((t) => t.session).length} seated`} />
        <StatTile label="Orders today" value={String(shift?.ordersToday ?? 0)} />
        <StatTile label="Sales today" value={inr(shift?.salesToday ?? 0)} tone="leaf" />
        <StatTile label="Ready to pick" value={String(shift?.awaitingPickup ?? 0)} tone="ember" hint="from the pass" />
      </div>

      <Card
        title={`Good service, ${user?.name.split(' ')[0]}`}
        subtitle={shift ? `Shift started ${timeAgo(shift.shiftStartedAt)} · ${shift.bookings} of your tables have bookings` : undefined}
        action={<Button size="sm" variant="primary" icon={<PlusCircle size={14} />} onClick={() => navigate('/floor/order')}>New order</Button>}
      >
        {mine.length ? (
          <ul className="divide-y divide-ink-100">
            {mine.map((t) => (
              <li key={t._id} className="flex items-center gap-3 px-3.5 py-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[13px] font-800 ${TABLE_STATUS_META[t.status].card} ${TABLE_STATUS_META[t.status].text}`}>
                  {t.number}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900">
                    {t.session?.customerName || `Guest party`} · {t.session?.guestCount} pax
                  </p>
                  <p className="truncate text-[12px] text-ink-500">
                    {t.activeOrders.length} order{t.activeOrders.length === 1 ? '' : 's'} · {inr(t.runningTotal)} on the tab
                    {t.session ? ` · opened ${timeAgo(t.session.openedAt)}` : ''}
                  </p>
                </div>
                {!!t.openRequests.length && (
                  <Pill className="bg-amber-50 text-amber-800 ring-amber-200">{t.openRequests.length} call</Pill>
                )}
                <span className="hidden shrink-0 font-display text-[14px] font-800 tabular-nums text-ink-900 sm:block">{inr(t.runningTotal)}</span>
                <BillButton table={t} />
                <button onClick={() => navigate('/floor/map')} className="text-ink-300 hover:text-ink-700" aria-label="Open floor">
                  <ArrowRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CircleUser size={26} />}
            title="No tables on your patch yet"
            body="Seat a party from the floor plan and the tab shows up here."
            action={<Button size="sm" variant="secondary" icon={<Users size={14} />} onClick={() => navigate('/floor/map')}>Open floor plan</Button>}
          />
        )}
      </Card>

      <Card title="Guest calls" subtitle={myCalls.length ? `${myCalls.length} waiting on you · ${openCalls.length - myCalls.length} elsewhere` : 'Nothing pending'}>
        {openCalls.length ? (
          <ul className="divide-y divide-ink-100">
            {openCalls.slice(0, 12).map((r) => (
              <CallRow key={r._id} r={r} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Inbox size={24} />} title="All quiet" body="No open requests from guests." />
        )}
      </Card>
    </div>
  );
}

function BillButton({ table }: { table: WaiterTable }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function issue() {
    if (!table.session) return;
    setBusy(true);
    try {
      const { data } = await http.post<{ bill: Bill }>('/billing', { sessionId: table.session._id });
      invalidate('floor:map');
      invalidate('bills');
      toast(`${data.bill.billNumber} issued for table ${table.number}`, 'success');
      navigate(`/bill/${data.bill.publicToken}`);
    } catch (e) {
      toast(errMsg(e, 'Could not bill this table'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      icon={<Receipt size={13} />}
      onClick={() => void issue()}
      className="shrink-0"
    >
      <span className="hidden sm:inline">Bill</span>
    </Button>
  );
}

function CallRow({ r }: { r: CustomerRequest }) {
  const waited = minutesSince(r.createdAt);
  const cash = r.type === 'CASH_PAYMENT';

  async function move(status: 'ACKNOWLEDGED' | 'DONE') {
    try {
      await http.patch(`/waiters/requests/${r._id}`, { status });
      invalidate('requests');
      invalidate('floor:map');
      if (status === 'DONE') toast('Request closed', 'success');
    } catch (e) {
      invalidate('requests');
      toast(errMsg(e, 'Could not update that request'), 'error');
    }
  }

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-[16px]">
          {REQUEST_LABEL[r.type]?.emoji ?? '✋'}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13.5px] font-semibold text-ink-900">
            Table {r.tableNumber || '—'} · {REQUEST_LABEL[r.type]?.label ?? r.type}
            {cash && r.billGrandTotal ? ` · ${inr(r.billGrandTotal)}` : ''}
          </p>
          <p className={`truncate text-[12px] ${waited > 8 ? 'font-semibold text-red-600' : 'text-ink-500'}`}>
            {r.collectedAt
              ? 'cash taken · waiting on the counter'
              : r.note
                ? `${r.note} · `
                : ''}
            {!r.collectedAt && (
              <span className="inline-flex items-center gap-1"><Timer size={11} /> {waited}m ago</span>
            )}
          </p>
        </div>
        {cash ? (
          r.collectedAt ? (
            <Pill className="bg-leaf-50 text-leaf-800 ring-leaf-200">At the counter</Pill>
          ) : r.billGrandTotal ? (
            <CashCollect r={r} />
          ) : (
            <Pill className="bg-amber-50 text-amber-800 ring-amber-200">No bill yet</Pill>
          )
        ) : (
          <>
            {r.status === 'OPEN' && (
              <Button size="sm" variant="secondary" onClick={() => void move('ACKNOWLEDGED')}>I'm on it</Button>
            )}
            <Button size="sm" variant="success" icon={<CheckCheck size={14} />} onClick={() => void move('DONE')}>Done</Button>
          </>
        )}
      </div>
    </li>
  );
}

/** The waiter only records the notes; the drawer is closed by the counter. */
function CashCollect({ r }: { r: CustomerRequest }) {
  const total = r.billGrandTotal ?? 0;
  const [open, setOpen] = useState(false);
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = Number(tendered || total);
  const short = amount < total;

  async function take() {
    setBusy(true);
    try {
      await http.post(`/waiters/requests/${r._id}/collect`, { tendered: amount });
      invalidate('requests');
      invalidate('floor:map');
      toast(`Collected ${inr(amount)} — carry it to the counter`, 'success');
    } catch (e) {
      toast(errMsg(e, 'Could not record the cash'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="primary" icon={<Banknote size={14} />} onClick={() => setOpen(true)}>
        Take {inr(total)}
      </Button>
    );
  }

  return (
    <div className="mt-2.5 rounded-xl bg-ink-50 p-2.5 ring-1 ring-ink-200">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          inputMode="decimal"
          value={tendered}
          onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder={String(total.toFixed(2))}
          className="w-28 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold tabular-nums outline-none focus:border-ember-400"
        />
        <span className="text-[12px] text-ink-500">{amount >= total ? `change ${inr(amount - total)}` : 'not enough'}</span>
        <Button size="sm" variant="primary" loading={busy} disabled={short} onClick={() => void take()} className="ml-auto">
          Take it
        </Button>
        <button onClick={() => setOpen(false)} className="text-[12px] font-semibold text-ink-400 hover:text-ink-700">
          Cancel
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000]
          .filter((v, i, arr) => i === 0 || v !== arr[i - 1])
          .map((v) => (
            <button
              key={v}
              onClick={() => setTendered(String(v))}
              className="rounded-lg bg-white px-2 py-1 text-[11.5px] font-semibold tabular-nums text-ink-700 ring-1 ring-ink-200 hover:ring-ember-300"
            >
              {inr(v)}
            </button>
          ))}
      </div>
    </div>
  );
}
