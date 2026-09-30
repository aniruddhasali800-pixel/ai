import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  Armchair,
  Briefcase,
  Check,
  ChefHat,
  CreditCard,
  Download,
  LayoutDashboard,
  LogIn,
  Share,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { Brand } from '../layouts/AppShell';
import { Button } from '../components/ui';
import { useAuth } from '../store/auth';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useTitle } from '../hooks/useTitle';
import { homeFor } from './Login';

const SCREENS = [
  { icon: ShieldCheck, title: 'Owner', body: 'Sales, orders, menu, stock, staff, reports, settings', to: '/app' },
  { icon: LayoutDashboard, title: 'Manager', body: 'The floor, the tickets and who is on shift', to: '/app' },
  { icon: Armchair, title: 'Waiter', body: 'Seat guests, raise orders, call the bill from the table', to: '/floor' },
  { icon: ChefHat, title: 'Kitchen', body: 'Tickets fire by course, veg and non-veg apart', to: '/kds' },
  { icon: CreditCard, title: 'Cashier', body: 'Bills, UPI, cards, cash and the change drawer', to: '/pos' },
];

/**
 * The page a staff phone lands on after scanning the restaurant's code. One install for the
 * whole team and all five screens inside it — the account that signs in decides which one
 * opens, so the waiter's phone and the owner's phone carry the same icon on purpose.
 *
 * `?r=<slug>` comes from the printed sticker and only feeds the "no account yet" path: the
 * code is per restaurant, so an applicant lands on that restaurant's job form.
 */
export function StaffInstall() {
  const { user, ready } = useAuth();
  const [params] = useSearchParams();
  const slug = params.get('r') ?? '';
  const { canInstall, promptInstall, installed, needsManualInstall } = useInstallPrompt();

  useTitle('Sizzle Staff — Restaurant OS');

  // Only a session the API has just confirmed counts. A token left over from an old
  // install would otherwise bounce this page to the login screen mid-boot.
  if (user && ready) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <div className="min-h-screen bg-ink-50 pb-14">
      <header className="bg-ink-900 px-4 pb-16 pt-5 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Brand light />
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-ink-200 ring-1 ring-white/15">
            Staff app
          </span>
        </div>
        <div className="mx-auto mt-7 max-w-md">
          <h1 className="font-display text-[30px] font-800 leading-[1.1] tracking-tight">
            The whole restaurant, on this phone.
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-300">
            Five screens in one app — the owner's office, the manager's floor, the waiter's table, the cook's pass and
            the cashier's till. Sign in and it opens on yours.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-md space-y-3 px-4">
        <div className="card divide-y divide-ink-100">
          {SCREENS.map((s) => (
            <div key={s.title} className="flex items-start gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
                <s.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-ink-900">{s.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{s.body}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="card space-y-3 p-4">
          <h2 className="font-display text-[16px] font-800 text-ink-900">Put it on the home screen</h2>
          {installed ? (
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-600">
              <Check size={14} className="mt-0.5 shrink-0 text-leaf-600" />
              This phone already has Sizzle installed — open it from your home screen and sign in.
            </p>
          ) : needsManualInstall ? (
            <>
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-600">
                <Share size={14} className="mt-0.5 shrink-0 text-ember-600" />
                In Safari, tap <span className="font-semibold">Share</span> and then{' '}
                <span className="font-semibold">Add to Home Screen</span>. It lands beside your other apps with this
                name and icon.
              </p>
              <p className="text-[11.5px] text-ink-400">Android and desktop Chrome show the button below instead.</p>
            </>
          ) : canInstall ? (
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              One tap and it installs as its own app — no store, no account to make. It keeps you signed in and picks up
              new orders the moment the kitchen fires them.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-600">
              <Smartphone size={14} className="mt-0.5 shrink-0 text-ink-400" />
              This browser has no install prompt. Open this page on the phone that will run the screen and scan the
              code again — or sign in below and bookmark it.
            </p>
          )}
          {canInstall && (
            <Button variant="primary" size="lg" className="w-full" icon={<Download size={16} />} onClick={() => void promptInstall()}>
              Install Sizzle Staff
            </Button>
          )}
        </div>

        <Link
          to="/login"
          className="card flex items-center gap-3 border-l-4 border-l-ember-500 p-4 text-left transition-shadow hover:shadow-md"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-ember-400">
            <LogIn size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink-900">Sign in and start</span>
            <span className="block text-[12px] text-ink-500">
              Email, phone or a one-time code. Every screen your account can open is one tap away.
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-ember-600">Open →</span>
        </Link>

        {slug ? (
          <Link
            to={`/apply/${slug}`}
            className="card flex items-center gap-3 border-l-4 border-l-leaf-500 p-4 text-left transition-shadow hover:shadow-md"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200">
              <Briefcase size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink-900">New job — ask to work here</span>
              <span className="block text-[12px] text-ink-500">
                No account yet? Leave your name, phone and the job you want. The manager gets it on their phone.
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-leaf-700">Apply →</span>
          </Link>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-3 text-[12px] leading-relaxed text-ink-500 ring-1 ring-ink-200">
            Looking for work here? Scan the sticker on the door or the counter — that one carries the restaurant's
            name and opens the job form.
          </p>
        )}

        <p className="pt-1 text-center text-[11.5px] leading-relaxed text-ink-500">
          Hungry, not employed here?{' '}
          <Link to="/eat" className="font-semibold text-ember-600 underline-offset-2 hover:underline">
            Order from the guest app instead
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
