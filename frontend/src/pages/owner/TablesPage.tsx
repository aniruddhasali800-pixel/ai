import { useEffect, useState } from 'react';
import { Link2, Plus, QrCode, RefreshCw, Trash2, Check } from 'lucide-react';
import { useQuery, invalidate } from '../../lib/query';
import { http, errMsg } from '../../lib/api';
import type { Paginated, Table, User } from '../../lib/types';
import { TABLE_STATUS_META } from '../../lib/statusMaps';
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Spinner } from '../../components/ui';
import { can, useAuth } from '../../store/auth';
import { clockTime } from '../../lib/format';
import { toast } from '../../store/toasts';

export function TablesPage() {
  const { user } = useAuth();
  const editable = can(user?.role, 'tables:write');
  const { data, loading } = useQuery<{ data: Table[] }>('tables', '/tables');
  const { data: staff } = useQuery<Paginated<User>>('staff', '/staff');
  const [qr, setQr] = useState<Table | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !data) return <Spinner label="Loading tables…" />;
  const tables = data?.data ?? [];
  const waiters = (staff?.data ?? []).filter((u) => u.role === 'WAITER');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(TABLE_STATUS_META).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium ${v.text} ${v.chip}`}>
              <span className={`h-2 w-2 rounded-full ${v.card.split(' ')[0].replace('bg-', 'bg-')}`} /> {v.label}
            </span>
          ))}
        </div>
        {editable && <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add table</Button>}
      </div>

      {!tables.length ? (
        <Card><EmptyState icon={<Link2 size={26} />} title="No tables yet" body="Add your first table to generate a scannable QR." action={editable && <Button variant="primary" onClick={() => setAddOpen(true)}>Add table</Button>} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((t) => {
            const meta = TABLE_STATUS_META[t.status];
            const waiter = waiters.find((w) => w._id === t.assignedWaiterId);
            return (
              <article key={t._id} className="card flex flex-col p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-display text-lg font-800 text-ink-900">Table {t.number}</span>
                    <p className="text-[12px] text-ink-500">{t.section} · seats {t.capacity}</p>
                  </div>
                  <Pill className={`${meta.text} ${meta.chip} !ring-transparent`}>{meta.label}</Pill>
                </div>
                {t.session && (
                  <p className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-600">
                    {t.session.customerName || 'Guest'} · {t.session.guestCount}p · since {clockTime(t.session.openedAt)}
                  </p>
                )}
                <div className="mt-auto space-y-2 pt-3">
                  <div className="flex items-center gap-2">
                    {editable && (
                      <>
                        <Button size="sm" variant="secondary" icon={<QrCode size={14} />} onClick={() => setQr(t)}>QR</Button>
                        <Select
                          className="h-8 flex-1 text-[12.5px]"
                          value={t.assignedWaiterId ?? ''}
                          onChange={(e) => assignWaiter(t, e.target.value || null)}
                        >
                          <option value="">Unassigned</option>
                          {waiters.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                        </Select>
                      </>
                    )}
                  </div>
                  {editable && t.status === 'CLEANING' && (
                    <Button size="sm" variant="success" className="w-full" icon={<Check size={14} />} onClick={() => setStatus(t, 'AVAILABLE')}>Mark cleaned</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {qr && <QrModal table={qr} onClose={() => setQr(null)} />}
      {addOpen && <AddTableModal onClose={() => setAddOpen(false)} />}
    </div>
  );

  async function setStatus(t: Table, status: Table['status']) {
    try { await http.patch(`/tables/${t._id}/status`, { status }); invalidate('tables'); toast(`Table ${t.number} is now ${status.toLowerCase()}`, 'success'); }
    catch (e) { toast(errMsg(e, 'Update failed'), 'error'); }
  }
  async function assignWaiter(t: Table, waiterId: string | null) {
    try { await http.post(`/tables/${t._id}/assign-waiter`, { waiterId }); invalidate('tables'); }
    catch (e) { toast(errMsg(e, 'Assignment failed'), 'error'); }
  }
}

function QrModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const [img, setImg] = useState<{ dataUrl: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    http.get<{ dataUrl: string; url: string }>(`/tables/${table._id}/qr`)
      .then((r) => { if (live) setImg(r.data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [table._id]);
  return (
    <Modal open onClose={onClose} title={`Table ${table.number}`} subtitle="Guests scan this to open the menu and order" width="max-w-sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="secondary" icon={<Link2 size={14} />} onClick={() => navigator.clipboard?.writeText(img?.url ?? table.qrUrl ?? '')}>Copy link</Button>
        <Button variant="primary" onClick={print}>Print</Button>
      </>}>
      <div className="flex flex-col items-center gap-3 py-2">
        {img?.dataUrl ? <img src={img.dataUrl} alt={`QR for table ${table.number}`} className="h-56 w-56 rounded-xl ring-1 ring-ink-200" /> : <Spinner label="Rendering QR…" />}
        <p className="break-all text-center text-[12px] text-ink-500">{img?.url ?? table.qrUrl}</p>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} loading={busy} onClick={regen}>Regenerate code</Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={remove}>Delete table</Button>
      </div>
    </Modal>
  );

  async function regen() {
    setBusy(true);
    try {
      const { data } = await http.post<{ qrUrl: string }>(`/tables/${table._id}/regenerate-qr`);
      const { data: fresh } = await http.get<{ dataUrl: string; url: string }>(`/tables/${table._id}/qr`);
      setImg(fresh);
      invalidate('tables');
      toast('QR regenerated', 'success');
      void data;
    } catch (e) { toast(errMsg(e, 'Failed'), 'error'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete table ${table.number}?`)) return;
    try { await http.delete(`/tables/${table._id}`); invalidate('tables'); toast('Table deleted', 'info'); onClose(); }
    catch (e) { toast(errMsg(e, 'Could not delete'), 'error'); }
  }
  function print() {
    const w = window.open('', '_blank');
    if (!w || !img?.dataUrl) return;
    w.document.write(`<div style="text-align:center;font-family:sans-serif;padding:24px"><h2 style="margin:0">Sizzle</h2><p>Table ${table.number} — scan to view the menu</p><img src="${img.dataUrl}" style="width:280px" onload="window.print()" /></div>`);
    w.document.close();
  }
}

function AddTableModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ number: '', capacity: 4, section: 'Main', description: '' });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await http.post('/tables', form); invalidate('tables'); toast(`Table ${form.number} created`, 'success'); onClose(); }
    catch (e) { toast(errMsg(e, 'Could not create'), 'error'); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Add table" width="max-w-md" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!form.number}>Create</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Table number" required><Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="T7" /></Field>
        <Field label="Capacity"><Input type="number" min={1} max={40} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} /></Field>
        <Field label="Section"><Input value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} /></Field>
        <Field label="Note" className="sm:col-span-2"><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Window seat, near the pass…" /></Field>
      </div>
      <p className="mt-2 text-[12px] text-ink-500">A fresh QR token is minted server-side; print it from the table card.</p>
    </Modal>
  );
}
