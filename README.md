# Smart QR by Taprizz (smartqr.taprizz.in)

Domain: **smartqr.taprizz.in** (not live until it is deployed and the DNS record is added). A separate product from the review stands (reviews.taprizz.in). Premium deal-game pages for stores: **spin wheel** (4 slots) or **scratch card**.
Runs in two modes:

| | Static mode | Server mode (recommended) |
|---|---|---|
| Backend | none | Supabase (free tier) |
| Offers set by | you, in `stores.js` | **the store owner**, from a private link |
| Result decided by | the browser | the database (secure random) |
| Owner reports | optional Google Sheet | built-in dashboard, CSV export |
| Redeem coupons | per-device only | central, exactly once |
| One play per customer | per browser | per phone number |

## Server mode setup (about 10 minutes)
1. In Supabase, run `supabase/schema.sql` (SQL editor). Everything is prefixed `tq_`, so it can share a project.
2. Set your private admin key (pick a long random one, keep it secret):
   ```sql
   insert into public.tq_settings(key, value)
   values ('master_hash', encode(sha256(convert_to('YOUR-LONG-ADMIN-SECRET','utf8')),'hex'))
   on conflict (key) do update set value = excluded.value;
   ```
3. In `stores.js` set `window.TAPRIZZ_API = { url: "https://<ref>.supabase.co", anonKey: "<publishable key>" }`.
4. Deploy the folder (Vercel / Netlify / Cloudflare Pages / GitHub Pages). No build step.

## Add a store
1. Open `admin.html`, fill the form (game, 4 starting offers, links), click **Preview**.
2. Enter your admin key and click **Publish to server**. You get the **owner link** once; send it to the store owner privately.
3. Put the QR (shown on the page) at the counter. Customer link: `https://<site>/?s=<store-key>`.

## What the owner can do (`owner.html#s=<store>&k=<secret>`)
- Change the 4 offers (deal text, chance %, wheel text) and the coupon validity. Changes apply immediately;
  coupons already issued keep their original text.
- Pause / resume the campaign.
- See plays, wins, customers, redemptions, review taps, Instagram/WhatsApp taps, reviews and a 14-day chart.
- See every customer (name, phone, result, code) and export CSV; tap a number to message them on WhatsApp.
- Verify a coupon at billing and mark it redeemed (works once only).
- Owners cannot touch branding, game type or other stores. A lost link is replaced from `admin.html` ("New owner link").

## AI review reports
The AI review tool posts each review to `tq_log_review`; see `docs/review-bot.md`. The owner sees them on their dashboard,
so you never forward reports.

## Deals, blanks and odds
- Exactly 4 slots. A slot with an empty deal is a blank (no reward). Chances must total 100%.
- Server mode: the database picks the result with a secure random source, one play per phone, and the result is saved before
  the animation, so refreshing cannot re-roll it. Static mode uses `crypto.getRandomValues` in the browser.

## Static mode (no server)
Leave `TAPRIZZ_API` empty and list stores in `stores.js` (`admin.html` > "Static block" generates the entry). Optional Google Sheet
log: `docs/owner-sheet.gs`. `verify.html` checks signed coupons; set `TAPRIZZ_SALT` before going live and never change it.

## Run locally
`python3 -m http.server 8000`, then open `http://localhost:8000/?s=demo` (wheel) or `?s=demo-scratch`.

## Security notes
- Tables have RLS on with no policies; the public key can only call the `tq_*` functions, each of which checks what it needs
  (owner secret, admin key). Owner secrets and the admin key are stored only as SHA-256 hashes.
- The owner link carries its secret in the URL fragment (never sent to a server) and is removed from the address bar on open.
  Treat it like a password.
- Anything customers type is shown as plain text, and stored links must be `https://`.
- Phone numbers are personal data. The form shows a consent line; add a privacy policy for your stores.
- Supabase free projects pause after about a week without activity. Use a project that stays active (or a paid plan) for live stores.
