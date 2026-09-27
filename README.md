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

## The five-minute tour

1. Sign in as **Kitchen** in one window and leave the board up.
2. In another window open a table code — the hub's *Table QR menu* card has one ready, or go to
   Back office → Tables → QR for a printable code. The tokens change whenever you reseed; on the
   current seed table G1 is http://localhost:5173/t/5wNfQUcStkAzeA2eazRBEg. Add a couple of items
   with an add-on and place the order. The ticket lands on the board without a refresh.
3. Press *Start*, then *Fire*, then *Ready* on the board. The guest's phone flips to "Ready" and
   the waiter's floor map turns green on its own.
4. Ask for the bill from the guest screen, then sign in as **Cashier**, open *Guest calls*, raise
   the bill and settle it in cash. Change is calculated on the server. The drawer already shows the
   UPI QR cut for that exact total.
5. Sign in as **Owner** and look at Reports — the order, the discount and the payment are already
   in the numbers.

## Scripts

Backend: `npm run dev`, `npm run build`, `npm start`, `npm run seed`, `npm run seed:fresh`,
`npm run typecheck`, `npm test`.

Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck`.

The test suites cover pricing and GST rounding, order creation and the state machine, booking
availability and lifecycle, the UPI link built from a bill total, and the signature checks on both
payment and delivery webhooks. `cd backend && npm test` — 36 tests.

## Configuration

Everything the backend reads lives in `backend/.env`; see `.env.example` for the annotated list.
The important ones:

- `MONGODB_URI` — empty in development to use the embedded database.
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — change both before deploying anywhere.
- `PUBLIC_BASE_URL` — the host printed into QR codes and guest bill links.
- `PAYMENT_WEBHOOK_SECRET`, `SWIGGY_WEBHOOK_SECRET`, `ZOMATO_WEBHOOK_SECRET` — HMAC keys the
  gateway and partners sign with; every webhook body is compared against the signature before it
  is trusted.

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
