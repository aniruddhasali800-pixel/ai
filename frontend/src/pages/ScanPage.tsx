import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Receipt, Store, Ticket, Users } from 'lucide-react';
import { QrScanner } from '../components/QrScanner';
import { http, errMsg } from '../lib/api';
import type { ResolvedScan } from '../lib/types';
import { inr } from '../lib/format';
import { ORDER_STATUS_META, TABLE_STATUS_META } from '../lib/statusMaps';
import { Button, Card, Spinner } from '../components/ui';
import { toast } from '../store/toasts';

/**
 * The one screen every role lands on with a phone in their hand. Point it at anything the
 * restaurant prints — a table sticker, a bill, the link on a takeaway bag — and the API
 * answers with the job that code opens *for this person*. The browser is never trusted to
 * decide what a cook may see.
 */
export function ScanPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<ResolvedScan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lookUp = useCallback(async (code: string) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await http.post<ResolvedScan>('/scan', { code });
      setResult(data);
      toast(`${data.headline} recognised`, 'success');
    } catch (e) {
      setResult(null);
      setError(errMsg(e, 'That code is not one of ours'));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="font-display text-[22px] font-800 tracking-tight text-ink-900">Scan</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
          Tables, bills, tickets and the shopfront sticker all land on the right screen for your role.
          No camera? Type what is printed under the code.
        </p>
      </div>

      {busy && <Spinner label="Reading the code…" />}

      {!busy && !result && <QrScanner onCode={(code) => void lookUp(code)} />}

      {!busy && error && (
        <div className="space-y-3">
          <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-[12.5px] font-medium text-rose-800 ring-1 ring-rose-200">{error}</p>
          <QrScanner onCode={(code) => void lookUp(code)} defaultMode="type" />
          <Button variant="secondary" onClick={() => { setError(''); setResult(null); }}>Try again</Button>
        </div>
      )}

      {!busy && result && <ScanResult result={result} onOpen={navigate} onAgain={() => setResult(null)} />}
    </div>
  );
}

function ScanResult({ result, onOpen, onAgain }: { result: ResolvedScan; onOpen: (href: string) => void; onAgain: () => void }) {
  const icon =
    result.kind === 'ORDER' ? <Ticket size={19} /> :
    result.kind === 'BILL' ? <Receipt size={19} /> :
    result.kind === 'RESTAURANT' ? <Store size={19} /> :
    <Users size={19} />;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start gap-3.5 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-900 text-ember-400">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[19px] font-800 leading-tight text-ink-900">{result.headline}</h2>
              <StatusChip result={result} />
            </div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{result.note}</p>
          </div>
          {typeof result.amount === 'number' && (
            <span className="shrink-0 text-right">
              <span className="block font-display text-[17px] font-800 tabular-nums text-ink-900">{inr(result.amount)}</span>
              <span className="block text-[10.5px] uppercase tracking-wide text-ink-400">
                {result.kind === 'BILL' ? 'due' : result.kind === 'ORDER' ? 'total' : 'running'}
              </span>
            </span>
          )}
        </div>

        <div className="space-y-2 border-t border-ink-100 px-4 py-3.5">
          <Button
            variant="primary"
            className="w-full justify-center"
            icon={<ArrowRight size={15} />}
            onClick={() => onOpen(result.href)}
          >
            {actionLabel(result)}
          </Button>
          {result.links.map((l) => (
            <Button key={l.href} variant="secondary" className="w-full justify-center" onClick={() => onOpen(l.href)}>
              {l.label}
            </Button>
          ))}
          <button onClick={onAgain} className="w-full pt-1 text-center text-[12px] font-semibold text-ink-500 hover:text-ink-900">
            Scan another
          </button>
        </div>
      </Card>
    </div>
  );
}

/** The button says what the destination actually is, in the words that role uses. */
function actionLabel(r: ResolvedScan): string {
  if (r.kind === 'ORDER') return r.href.startsWith('/kds') ? 'Fire this ticket' : 'Open the ticket';
  if (r.kind === 'BILL') return 'Settle it at the counter';
  if (r.kind === 'RESTAURANT') return r.href.startsWith('/app') ? 'Print the sticker' : 'Open the guest app';
  if (r.href.startsWith('/kds')) return 'Open the kitchen board';
  if (r.href.startsWith('/pos')) return 'Open the counter';
  if (r.href.startsWith('/floor/order')) return 'Take their order';
  if (r.href.startsWith('/floor')) return 'Open on the floor';
  if (r.href.startsWith('/app/tables')) return 'Open the floor plan';
  return 'Open';
}

function StatusChip({ result }: { result: ResolvedScan }) {
  const order = result.kind === 'ORDER' ? ORDER_STATUS_META[result.status as keyof typeof ORDER_STATUS_META] : undefined;
  if (order) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${order.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${order.dot}`} />
        {order.label}
      </span>
    );
  }

  const table = TABLE_STATUS_META[result.status as keyof typeof TABLE_STATUS_META];
  if (table && result.kind !== 'BILL') {
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${table.chip} ${table.text}`}>{table.label}</span>;
  }

  if (result.kind === 'BILL') {
    const paid = result.status === 'PAID';
    return (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${paid ? 'bg-leaf-100 text-leaf-600 ring-leaf-500/30' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
        {paid ? 'Settled' : result.status === 'REFUNDED' ? 'Refunded' : 'To collect'}
      </span>
    );
  }

  return <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{result.status}</span>;
}
