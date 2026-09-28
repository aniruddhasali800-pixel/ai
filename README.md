# Sizzle — Restaurant OS

A working restaurant platform for one floor: guests scan a table code and order, the kitchen
board fires tickets, waiters see who called, the counter raises the bill and takes payment, and
the owner watches it all in reports. Every screen is wired to one Node API over Socket.IO, so a
click on a till repaints the kitchen display on the other side of the room.

Single tenant per install (`Saffron & Smoke`, Pune, INR). Staff roles are OWNER, MANAGER,
WAITER, KITCHEN and CASHIER; permissions are enforced on the server for every request, and the
frontend only hides what the server would refuse anyway.

## Layout

```
backend/    Express 4 + Mongoose + Socket.IO, TypeScript, Zod validation, Vitest
frontend/   Vite + React 19 + Tailwind v4, hand-rolled SVG charts, Zustand stores
```

## Run it

Two terminals. Node 20+.

```bash
cd backend && npm install && npm run dev     # API on :4000
cd frontend && npm install && npm run dev    # app on :5173
```

Open http://localhost:5173 — that is the **hub**: every screen in the build on one page, staff and
guest, each with the sign-in it needs. Press a card and you are inside that screen; if you are not
signed in as someone who works there, the card signs you in as that role first.

**Database.** With `MONGODB_URI` empty the backend boots an embedded MongoDB into `backend/.data/mongo`
on first run, so there is nothing to install. Point `MONGODB_URI` at a real server for anything
persistent.

**Seeding.** `npm run seed` rewrites the demo floor; `npm run seed:fresh` wipes and rebuilds it.
The embedded database only allows one process to hold the lock — stop `npm run dev` before seeding,
then start it again.

```bash
cp backend/.env.example backend/.env   # only needed the first time
```

## Open it on a phone

One port serves everything — staff and guests — over the local network. Vite binds every interface,
so the same `:5173` the laptop uses is reachable from a phone on the **same Wi-Fi**:

```
http://192.168.31.213:5173        <- this machine's current LAN address
```

`npm run dev` in `frontend/` prints that address as `Network:` on startup; it changes with the
router, so re-read it rather than hard-coding it. That single link is the hub, and from it a guest
can book a table (`/book/saffron-and-smoke`), scan into a table menu and order, watch the ticket,
and pay the bill by UPI — no app install, no login.

For the codes to be scannable, `backend/.env` has to name the address the phone will dial:

```
PUBLIC_BASE_URL=http://192.168.31.213:5173
CORS_ORIGIN=http://localhost:5173,http://192.168.31.213:5173
```

`PUBLIC_BASE_URL` is what gets baked into the printed table QR (Back office → Tables → each card's
QR, or `GET /api/tables/:id/qr`), into guest bill links and into the mock checkout redirect.
`CORS_ORIGIN` is a comma-separated list and is checked by both HTTP CORS and the Socket.IO
handshake — leave the LAN origin out and the phone loads the page but never gets live updates.
Restart `npm run dev` in `backend/` after editing either one; no reseed needed, the links are built
per request.

Windows already allows inbound `node.exe` on the current profile, so nothing to configure there. If
the phone spins but never connects, check the router for AP/client isolation — that blocks
device-to-device traffic on the Wi-Fi and no setting in this repo will fix it.

## Demo accounts

Password for all of them: `sizzle123`.

| Role | Sign-in | Name | Opens |
| --- | --- | --- | --- |
| Owner | `owner@sizzle.test` | Aarav Mehta | Back office, reports, settings |
| Manager | `manager@sizzle.test` | Neha Kulkarni | Back office without settings/integrations |
| Cashier | `cashier@sizzle.test` | Rohit Deshmukh | `/pos` bills and payments |
| Kitchen | `kitchen@sizzle.test` | Vikram Rathore | `/kds` kitchen display |
| Waiter | `waiter1@sizzle.test` | Sneha Patil | `/floor` mobile floor |
| Waiter | `waiter2@sizzle.test` | Imran Sheikh | `/floor` |
| Waiter | `waiter3@sizzle.test` | Kavya Reddy | `/floor` |

Guest links need no login: `/t/<tableToken>` is the QR menu, `/s/<sessionToken>` is a live table,
`/bill/<billToken>` is a receipt, `/book/saffron-and-smoke` is reservations. Table codes are listed
under Tables in the back office, and `GET /api/tables` returns each `qrUrl` ready to print. The hub
picks up the current tokens for you — no copy-pasting needed.

## Taking payment

Every unpaid bill carries a **scan-to-pay UPI QR** built from its own total: the amount, the payee
handle and the bill number go into the `upi://pay?...` link on the server, so nobody types a figure
into a payment app. Owner → Settings → *Scan-to-pay UPI* holds the handle (demo:
`saffronandsmoke@icici`); leave it blank and the QRs disappear from bills and the counter drawer.
The same QR is on the guest's `/bill/...` page and in the printed slip. Confirming payment stays a
server action — the QR only moves money, the counter records it.

Takeaway and delivery tickets carry the guest's **address and city** from the moment they are
created: they show on the order card in the back office, in the ticket header on the kitchen board
(so the packer knows where it is going), and on the bill. Waiters fill them in on `/floor/order`
when the destination is *Takeaway / counter*; delivery orders get them from the partner payload.

### When a guest presses *Bill please*

The tap does not ask a human for a favour — the server totals **every open order on that table into
one bill** and pushes it straight back into the guest's browser, which lands on `/bill/...` with the
UPI QR already cut for that figure. Cashier, owner and manager all get the notification at the same
moment, and the session room keeps the page live, so the phone shows *Paid — thank you* the second
the counter confirms it.

If the guest would rather hand over notes, the same bill page has **Pay with cash at the table**.
That tap rings the waiter on that patch and the counter. The waiter presses *Take ₹…*, confirms the
notes with the change previewed, and the round moves to the counter as *At the till*; the cashier
presses **Payment done**, which records the cash, marks the orders complete, closes the session and
sends the table to *Cleaning* — all on the server, all audited. A waiter can issue a bill and carry
cash, but `payments:write` is not in the waiter role, so a waiter can never mark money as received.

Waiters can bill a table themselves too: the receipt button on *My tables* at `/floor` issues the
same combined bill and opens it.

The kitchen ticket for a table carries the **table number** in the header and splits the lines into
a **veg side and a non-veg side**, so nothing on the pass can be plated for the wrong guest; the
bill that closes the table combines both sides again. Bill headers pair the Sizzle mark with the
restaurant's own logo (Owner → Settings → *Logo*, falling back to the restaurant's initials).

## The five-minute tour

1. Sign in as **Kitchen** in one window and leave the board up.
2. In another window open a table code — the hub's *Table QR menu* card has one ready, or go to
   Back office → Tables → QR for a printable code. The tokens change whenever you reseed; on the
   current seed table G1 is http://localhost:5173/t/5wNfQUcStkAzeA2eazRBEg. Add a couple of items
   with an add-on and place the order. The ticket lands on the board without a refresh.
3. Press *Start*, then *Fire*, then *Ready* on the board. The guest's phone flips to "Ready" and
   the waiter's floor map turns green on its own.
4. Press *Bill please* on the guest screen — the phone jumps straight to the total and the counter
   already has the notification. Either settle it at the till, or press *Pay with cash at the table*
   on the bill page, then sign in as **Waiter** to take the notes and as **Cashier** to press
   *Payment done*. Change is calculated on the server and the table goes to *Cleaning* by itself.
5. Sign in as **Owner** and look at Reports — the order, the discount and the payment are already
   in the numbers.

## Scripts

Backend: `npm run dev`, `npm run build`, `npm start`, `npm run seed`, `npm run seed:fresh`,
`npm run typecheck`, `npm test`. `build` bundles the API and then builds the client, since it serves
the client; `seed` is idempotent and `seed:fresh` wipes first.

Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck`.

The test suites cover pricing and GST rounding, order creation and the state machine, booking
availability and lifecycle, one combined bill per table and the cash handoff (including that a
waiter cannot confirm a payment), the UPI link built from a bill total, and the signature checks on
both payment and delivery webhooks. `cd backend && npm test` — 40 tests.

## Configuration

Everything the backend reads lives in `backend/.env`; see `.env.example` for the annotated list.
The important ones:

- `MONGODB_URI` — empty in development to use the embedded database.
- `AUTO_SEED` — set to `false` to boot an untouched database clean instead of loading the demo
  tenant into it.
- `STATIC_DIR` — only needed if the built client is not at `../frontend/dist`; when that folder
  exists the API serves the whole app itself.
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — change both before deploying anywhere.
- `PUBLIC_BASE_URL` — the host printed into QR codes and guest bill links. On a deployed
  instance it is never allowed to be a laptop address, since no customer's phone can open one;
  the API falls back to the host the platform publishes and says so at boot.
- `PAYMENT_WEBHOOK_SECRET`, `SWIGGY_WEBHOOK_SECRET`, `ZOMATO_WEBHOOK_SECRET` — HMAC keys the
  gateway and partners sign with; every webhook body is compared against the signature before it
  is trusted.

## Deploying

One service runs the whole product. `npm run build` in `backend/` bundles the API to `backend/dist`
and builds the client to `frontend/dist`, which Express then serves on `/` with an SPA fallback for
deep links like `/app/orders`. Because the browser talks to a single origin, `/api`, `/uploads` and
`/socket.io` need no proxy, no absolute API base and no CORS allowance.

**Render.** `render.yaml` is a Blueprint (**New → Blueprint**, point it at this repo); on a service
you created by hand, set root directory `backend`, build `npm install && npm run build`, start
`node dist/server.js`, health check `/api/health`. The host tells the app its own public URL through
`RENDER_EXTERNAL_URL`, and the config reads it — so the socket allowlist and every QR code, guest
bill link and booking link come out pointing at the deployed domain without any variable to fill in.

The database is the one real decision:

- **Leave it alone** and the service runs an embedded MongoDB inside its own container. Booting an
  empty database loads the demo tenant automatically (`AUTO_SEED`, see below), so the site is usable
  the moment it starts — and wipes back to a fresh demo on every deploy. A Render shell cannot reach
  that database, since the shell is a separate container, so seeding has to happen at boot.
- **Set `MONGODB_URI`** to a free MongoDB Atlas M0 cluster and the data survives redeploys; then
  `npm run seed` in a Render shell works too, because both containers use the same database.
- **Set `NODE_ENV=production`** once you do have Atlas: the process then refuses to boot on a missing
  `MONGODB_URI` or a development-default token secret, and never starts the embedded database. Pair
  it with generated secrets (`openssl rand -hex 32`).

The free tier sleeps after inactivity, so the first request after a quiet period takes ~30 seconds;
`/api/health` warms it. Uploaded menu images go to `backend/uploads` on that container's disk, so
they disappear on redeploy — object storage is the fix for a real install.

**Two hosts — client on Vercel, API on Render.** This repo's live demo does exactly that:
`https://ai-ecru-kappa-14.vercel.app` for the client, `https://ai-1-hsus.onrender.com` for the API.
The client is told where the API lives at build time through `VITE_API_URL`, which
`frontend/.env.production` commits for this pair (a host-level variable overrides it), and the API's
allowlist always includes that client origin in addition to `CORS_ORIGIN` — so neither half has to be
remembered in a dashboard. Deep links (`/app`, `/t/<token>`) need `frontend/vercel.json`, whose single
rewrite sends every path to `index.html`; without it a refresh or a QR code opens a 404 instead of the
app. Uploaded images are served by the API, so the client routes every `/uploads/...` path through
`mediaUrl()` rather than trusting a root-relative `src`.

If you change the client's domain, update `VITE_API_URL` on the client side and add the new origin to
`CORS_ORIGIN` on the API. Anywhere other than Render: serve `frontend/dist` from any static host, put
that host in both `CORS_ORIGIN` and `PUBLIC_BASE_URL`, and set `VITE_API_URL` to the API's origin — the
socket handshake checks the same comma-separated list as the HTTP routes.

## What is deliberately mocked

- **Payments** run through a mock provider. A card/UPI settlement needs the explicit
  `POST /payments/:id/simulate` call the counter makes, because a payment is only ever marked
  paid by the server — never by the browser.
- **Delivery partners** expose real webhook receivers with signature checks and a "receive a test
  order" button, but no live Swiggy or Zomato credentials. Consumer sites are not scraped; only
  official partner APIs would be wired here.
- **Uploads** write to `backend/uploads` and are served from `/uploads`. Move to object storage for
  production.
- The payment gateway keys are read from the environment; the RAZORPAY_* variables are placeholders
  until a real account exists.
