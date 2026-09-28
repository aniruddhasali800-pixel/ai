import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Banknote, CheckCircle2, Printer, Receipt } from 'lucide-react';
import { invalidate, useQuery } from '../../lib/query';
import { http, errMsg, mediaUrl } from '../../lib/api';
import { joinSession, leaveSession, useRealtimePrefix } from '../../lib/socket';
import type { PublicBill } from '../../lib/types';
import { clockTime, dateTime, inr } from '../../lib/format';
import { MerchantMark, Spinner, VegDot } from '../../components/ui';
import { UpiQr } from '../../components/UpiQr';
import { toast } from '../../store/toasts';
import { useTitle } from '../../hooks/useTitle';

export function GuestBill() {
  const { billToken = '' } = useParams();
  const { data, loading, error } = useQuery<PublicBill>(`guest:bill:${billToken}`, `/public/bill/${billToken}`);
  useTitle(data ? `Bill ${data.billNumber}` : 'Your bill');

  // The counter settles this bill on a different screen — the guest should watch it
  // happen instead of refreshing and half-expecting to be charged twice.
  useEffect(() => {
    const token = data?.sessionToken;
    if (!token) return;
    joinSession(token);
    return () => leaveSession(token);
  }, [data?.sessionToken]);

  useRealtimePrefix(['bill.', 'payment.', 'session.', 'request.'], () => invalidate(`guest:bill:${billToken}`));

  if (loading && !data) return <Spinner label="Fetching your bill…" />;
  if (error) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <Receipt size={24} className="mx-auto mb-3 text-ink-300" />
        <p className="font-display text-lg font-700 text-ink-900">Bill unavailable</p>
        <p className="mt-1.5 text-sm text-ink-500">{error}</p>
      </div>
    );
  }

  const b = data!;
  const paid = b.paymentStatus === 'PAID';

  return (
    <div className="min-h-screen bg-ink-100 px-4 py-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-ink-200">
        <header className="border-b border-dashed border-ink-200 px-5 py-4 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <MerchantMark
              name={b.merchant?.name ?? b.tableNumber ?? 'Sizzle'}
              logoSrc={b.merchant?.logoUrl ? mediaUrl(b.merchant.logoUrl) : undefined}
            />
            <p className="font-display text-[13px] font-800 uppercase tracking-[0.2em] text-ember-600">Sizzle</p>
          </div>
          <h1 className="mt-1.5 font-display text-lg font-800 text-ink-900">
            {b.merchant?.name ?? (b.tableNumber ? `Table ${b.tableNumber}` : 'Takeaway')}
          </h1>
          <p className="mt-0.5 text-[12px] text-ink-500">
            {b.tableNumber ? `Table ${b.tableNumber} · ` : ''}
            {b.billNumber} · issued {clockTime(b.issuedAt)}
            {b.customerName ? ` · ${b.customerName}` : ''}
          </p>
        </header>

        <ul className="divide-y divide-ink-50 px-5">
          {b.items.map((it, i) => (
            <li key={i} className="flex items-start gap-3 py-2.5">
              <span className="mt-0.5 w-5 shrink-0 text-[13px] font-bold tabular-nums text-ink-500">{it.qty}×</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-ink-900">
                  <VegDot isVeg={it.isVeg} /> {it.name}
                </p>
                {!!it.addons.length && <p className="text-[12px] text-ink-500">+ {it.addons.map((a) => a.name).join(', ')}</p>}
              </div>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-800">{inr(it.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t border-ink-100 px-5 py-4 text-[13px]">
          <Row label="Subtotal" value={inr(b.subtotal)} />
          {!!b.discountAmount && <Row label="Discount" value={`− ${inr(b.discountAmount)}`} />}
          {!!b.serviceCharge && <Row label="Service charge" value={inr(b.serviceCharge)} />}
          {b.taxBreakup.map((t) => (
            <Row key={t.label} label={`${t.label} (${t.percent}%)`} value={inr(t.amount)} />
          ))}
          {!!b.roundOff && <Row label="Round off" value={b.roundOff > 0 ? inr(b.roundOff) : `− ${inr(-b.roundOff)}`} />}
          <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-ink-300 pt-2.5">
            <span className="font-display text-[15px] font-800 text-ink-900">Total payable</span>
            <span className="font-display text-[22px] font-800 tabular-nums text-ink-900">{inr(b.grandTotal)}</span>
          </div>
        </div>

        <footer className="px-5 pb-5">
          {paid ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-leaf-50 px-4 py-3 text-leaf-800 ring-1 ring-leaf-500/30">
              <CheckCircle2 size={19} className="shrink-0" />
              <div className="leading-tight">
                <p className="text-[13.5px] font-bold">Paid — thank you</p>
                <p className="text-[12px] text-leaf-700">{b.paidAt ? dateTime(b.paidAt) : ''}</p>
              </div>
            </div>
          ) : b.pay ? (
            <div className="space-y-2.5">
              <UpiQr charge={b.pay} />
              {b.sessionToken ? (
                <CashButton sessionToken={b.sessionToken} total={b.grandTotal} />
              ) : (
                <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-800 ring-1 ring-amber-200">
                  Or pay at the counter — cash and cards are welcome.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 ring-1 ring-amber-200">
              Please pay at the counter. Cash, card and UPI are all accepted.
            </p>
          )}
          <button
            onClick={() => window.print()}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 py-2 text-[13px] font-semibold text-ink-600 transition-colors hover:bg-ink-50"
          >
            <Printer size={14} /> Save or print this bill
          </button>
          <p className="mt-3 text-center text-[11.5px] leading-relaxed text-ink-400">
            Prices include GST as breakup above. A service charge is added where applicable.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium tabular-nums text-ink-800">{value}</span>
    </div>
  );
}

/** Cash is the one payment a phone cannot finish, so the tap only summons a waiter. */
function CashButton({ sessionToken, total }: { sessionToken: string; total: number }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      await http.post(`/public/session/${sessionToken}/requests`, { type: 'CASH_PAYMENT' });
      invalidate(`guest:session:${sessionToken}`);
      setSent(true);
      toast(`Waiter called to collect ${inr(total)}`, 'success');
    } catch (e) {
      toast(errMsg(e, 'Could not call the waiter'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] font-medium text-ink-700 ring-1 ring-ink-200">
        <Banknote size={16} className="shrink-0 text-amber-600" />
        A waiter is coming to take {inr(total)}. You can keep this page open.
      </div>
    );
  }

  return (
    <button
      onClick={ask}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-ink-300 bg-white py-2.5 text-[13.5px] font-bold text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-60"
    >
      <Banknote size={16} /> Pay with cash at the table
    </button>
  );
}
