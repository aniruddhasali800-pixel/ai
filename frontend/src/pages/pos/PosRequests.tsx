import { CheckCheck, Inbox, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { invalidate, useQuery } from '../../lib/query';
import { http, errMsg } from '../../lib/api';
import type { Bill, CustomerRequest } from '../../lib/types';
import { REQUEST_LABEL } from '../../lib/statusMaps';
import { timeAgo } from '../../lib/format';
import { Button, Card, EmptyState, Pill, Spinner } from '../../components/ui';
import { toast } from '../../store/toasts';
import { can, useAuth } from '../../store/auth';

export function PosRequests() {
  const { user } = useAuth();
  const write = can(user?.role, 'requests:write');
  const bills = can(user?.role, 'billing:write');
  const navigate = useNavigate();
  const { data, loading } = useQuery<{ data: CustomerRequest[] }>('requests:list', '/waiters/requests');
  const rows = data?.data ?? [];
  const billCalls = rows.filter((r) => r.type === 'BILL' && r.status !== 'DONE');
  const rest = rows.filter((r) => !(r.type === 'BILL' && r.status !== 'DONE'));

  async function done(r: CustomerRequest) {
    try {
      await http.patch(`/waiters/requests/${r._id}`, { status: 'DONE' });
      invalidate('requests');
      toast(`Table ${r.tableNumber ?? ''} request closed`, 'success');
    } catch (e) {
      invalidate('requests');
      toast(errMsg(e, 'Could not close that'), 'error');
    }
  }

  /** Guests pressed "Bill please" — total the whole table server-side, then hand it to the till. */
  async function raiseBill(r: CustomerRequest) {
    try {
      const { data: res } = await http.post<{ bill: Bill }>('/billing', { sessionId: r.tableSessionId });
      await http.patch(`/waiters/requests/${r._id}`, { status: 'DONE' }).catch(() => undefined);
      invalidate('requests');
      invalidate('bills');
      invalidate('tables');
      toast(`Bill ${res.bill.billNumber} ready for table ${r.tableNumber ?? ''}`, 'success');
      navigate('/pos');
    } catch (e) {
      toast(errMsg(e, 'That table still has open orders'), 'error');
    }
  }

  if (loading && !data) return <Spinner label="Loading guest calls…" />;

  return (
    <div className="space-y-4">
      <RequestGroup
        title="Bill requests"
        hint="Issue the bill, then settle it at the counter"
        rows={billCalls}
        write={write}
        onDone={done}
        onBill={bills ? raiseBill : undefined}
      />
      <RequestGroup title="Floor calls" hint="Ask a waiter to pick these up" rows={rest} write={write} onDone={done} />
      {!rows.length && (
        <Card>
          <EmptyState icon={<Inbox size={26} />} title="No open calls" body="Every guest has what they need right now." />
        </Card>
      )}
    </div>
  );
}

function RequestGroup({
  title,
  hint,
  rows,
  write,
  onDone,
  onBill,
}: {
  title: string;
  hint: string;
  rows: CustomerRequest[];
  write: boolean;
  onDone: (r: CustomerRequest) => Promise<void>;
  onBill?: ((r: CustomerRequest) => Promise<void>) | undefined;
}) {
  if (!rows.length) return null;
  return (
    <Card title={title} subtitle={hint}>
      <ul className="divide-y divide-ink-100">
        {rows.map((r) => (
          <li key={r._id} className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-[16px]">
              {REQUEST_LABEL[r.type]?.emoji ?? '✋'}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] font-semibold text-ink-900">
                Table {r.tableNumber || '—'} · {REQUEST_LABEL[r.type]?.label ?? r.type}
              </p>
              <p className="truncate text-[12px] text-ink-500">{r.note || timeAgo(r.createdAt)}</p>
            </div>
            <Pill className={r.status === 'ACKNOWLEDGED' ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}>
              {r.status === 'ACKNOWLEDGED' ? 'On it' : 'Waiting'}
            </Pill>
            {onBill && (
              <Button size="sm" icon={<ReceiptText size={14} />} onClick={() => void onBill(r)}>
                Raise bill
              </Button>
            )}
            {write && <Button size="sm" variant="secondary" icon={<CheckCheck size={14} />} onClick={() => void onDone(r)}>Done</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
