import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChefHat, Flame, LayoutDashboard, LogOut, RefreshCw, ScanLine } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useRealtimeShell } from '../hooks/useRealtimeShell';
import { LiveChip } from './AppShell';
import { invalidate } from '../lib/query';
import { clockTime } from '../lib/format';

export function KdsLayout() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  useRealtimeShell();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'KITCHEN' && user.role !== 'MANAGER' && user.role !== 'OWNER') return <Navigate to="/app" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 text-ink-100">
      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-3 lg:px-6">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ember-500 text-white">
          <ChefHat size={19} />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-[17px] font-800 leading-none tracking-tight">Kitchen display</h1>
          <p className="text-[11.5px] text-ink-400">Fire tickets as they land · pass is live</p>
        </div>
        <span className="hidden font-display text-2xl font-800 tabular-nums text-ink-200 sm:block">{clockTime(now)}</span>
        <LiveChip />
        <button
          onClick={() => navigate('/kds/scan')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ember-500 px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-ember-600"
          title="Scan a ticket or a table"
        >
          <ScanLine size={13} /> Scan
        </button>
        <button
          onClick={() => invalidate('kds')}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-white"
          title="Refresh board"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-white"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
        {(user.role === 'MANAGER' || user.role === 'OWNER') && (
          <button
            onClick={() => navigate('/app')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-ink-200 hover:bg-white/5"
          >
            <LayoutDashboard size={13} /> Office
          </button>
        )}
      </header>
      <main className={`flex-1 overflow-y-auto p-4 lg:p-6 ${location.pathname === '/kds/scan' ? 'bg-ink-50' : ''}`}>
        <Outlet />
      </main>
      <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-2 text-[11px] text-ink-500 lg:px-6">
        <Flame size={12} className="text-ember-500" /> Sizzle KDS
        <span className="ml-auto">{user.name}</span>
      </footer>
    </div>
  );
}
