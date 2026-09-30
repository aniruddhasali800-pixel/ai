# Demo credentials — Saffron & Smoke

Every sign-in the seeded tenant understands, in one place, so a walkthrough needs no other window
open. These are fake people at a fake restaurant in Koregaon Park, Pune — no real money, no real
guest data and no real kitchen stands behind the passwords below.

Live: <https://ai-ecru-kappa-14.vercel.app> · API: <https://ai-1-hsus.onrender.com>
Local: <http://localhost:5173> · API: <http://localhost:4000>

## Master password

```
Sizzle@Master1
```

Opens any active account of this demo tenant, whichever job it is — the seven below and anyone hired
through the apply page. It exists so you can walk from the owner's reports to the kitchen pass
without keeping a list beside the keyboard. A restaurant that onboarded itself at */register* is a
different tenant, and this password gets you nowhere near it.

- **Turned off in production.** When the API runs with `NODE_ENV=production` the value arrives
  empty from the config and matches nothing. Any host can also switch it off without a code change
  by setting `DEMO_MASTER_PASSWORD=` (blank) in its environment. The Render service this demo runs
  on leaves `NODE_ENV` at its default, so on `ai-1-hsus.onrender.com` the door is open — as intended
  for a walkthrough, and the first thing to close before any real restaurant signs in.
- A suspended account is refused before the master is ever compared, so the door does not
  resurrect a deactivated staff login.
- It is never written to a log, and the sign-in failure message is the same wording as any other
  wrong password.

## Staff — sign in with email and password

| Job | Email | Password | Name | Phone | Opens |
| --- | --- | --- | --- | --- | --- |
| Owner | `owner@sizzle.test` | `Owner@Sizzle1` | Aarav Mehta | `+91 98200 11001` | Back office, reports, settings, staff approvals |
| Manager | `manager@sizzle.test` | `Manager@Sizzle1` | Neha Kulkarni | `+91 98200 11002` | Back office without settings or integrations, the hire queue |
| Cashier | `cashier@sizzle.test` | `Cashier@Sizzle1` | Rohit Deshmukh | `+91 98200 11003` | `/pos` — bills, payments, cash drawer |
| Kitchen | `kitchen@sizzle.test` | `Kitchen@Sizzle1` | Vikram Rathore | `+91 98200 11004` | `/kds` — the cook's line and the veg / non-veg rails |
| Waiter | `waiter1@sizzle.test` | `Waiter1@Sizzle1` | Sneha Patil | `+91 98200 11005` | `/floor` — table seating, order-taking, bill requests |
| Waiter | `waiter2@sizzle.test` | `Waiter2@Sizzle1` | Imran Sheikh | `+91 98200 11006` | `/floor` |
| Waiter | `waiter3@sizzle.test` | `Waiter3@Sizzle1` | Kavya Reddy | `+91 98200 11007` | `/floor` |

One password per job on purpose: the cashier's till is not something a demo of the approve queue
should be able to reach from another account.

## Staff — sign in with a phone number and a one-time code

The floor jobs — waiter, cashier, kitchen — can also log in by tapping the **One-time code** tab,
typing the phone number above and the six digits that come back. There is no SMS gateway wired up,
so on a demo host the code is shown on screen instead of texted. That is exactly why the owner and
the manager are excluded: a code you can read off the page should not open the settings or the
staff registry.

- Codes last five minutes, work once, and burn after five wrong guesses.
- Maximum three codes per account per fifteen minutes.
- An unknown number, a suspended account and a number belonging to the owner get the same reply as
  a code that was sent, so the form cannot be used to enumerate staff.
- Country code optional — `98200 11005` finds `+91 98200 11005`.

## Applying for a job

<https://ai-ecru-kappa-14.vercel.app/apply/saffron-and-smoke> — no login. A stranger picks a floor
job, leaves a name and a phone number, and the manager (or the owner) approves or rejects it from
Back office → Staff → *Applications*. An approved applicant becomes an active staff
member with that phone number and can immediately sign in with a one-time code. Only the owner can
grant **Manager**; a manager's approve box will not offer it.

## Guest links — nothing to sign in

| Link | What it is |
| --- | --- |
| `/t/<tableToken>` | The table's QR menu — dine-in ordering, seats itself |
| `/eat/saffron-and-smoke` | The storefront app: delivery and takeaway, installable |
| `/s/<sessionToken>` | One live table: order status and the running bill |
| `/bill/<billToken>` | A printed receipt with its UPI QR |
| `/track/<token>` | A delivery order's progress |
| `/book/saffron-and-smoke` | Reservations |
| `/staff.html` | The one code that installs the staff app for any role |

Tokens change whenever the database reseeds, so copy the current ones from Back office → Tables, or
just tap a card on the hub at `/` — it logs the right job in and hands you a live link. Every code on
screen has **Download PNG** beside it, so a sticker can be saved and printed without the print dialog.

## Resetting

`cd backend && npm run seed:fresh` wipes the demo tenant and rebuilds it — which is what hands every
job its password again. Plain `npm run seed` leaves an existing tenant alone. Deleting
`backend/.data/mongo` has the same effect on next boot, since a virgin database auto-seeds. A Render
redeploy reseeds too, which is why the live tokens never match localhost's. Set `AUTO_SEED=false` for
a clean install.
