# Taprizz Crazy Deal

Premium static deal-game pages for stores: **spin wheel** or **scratch card**. No server, no database, no build step.

## Add a store (easiest way)
1. Open `admin.html`, fill the form (game, deals, blank slots, links), click **Preview**.
2. Click **Copy store block** and paste it inside `window.STORES = { ... }` in `stores.js`.
3. Deploy. The store link is `https://<your-site>/?s=<store-key>`; the admin page shows the QR for it.
4. Cashiers verify coupons at `https://<your-site>/verify.html`.

## Deals, blanks and odds
- Every slot has a `label` (the deal), an optional `short` (text on the wheel) and a `weight`.
- **Leave `label` empty to make a blank slot** (customer wins nothing).
- Chance of a slot = its weight / total weight. Weight `0` means never.
- Outcomes use the browser's cryptographically secure random (`crypto.getRandomValues`). The result is drawn and saved *before* the animation / scratch reveal, so refreshing the page cannot re-roll it.

## What the owner receives
Nothing is sent anywhere unless you turn it on. Options (all free):
- **Customer details:** set `collectLead: true` to ask for name + mobile number before playing (with a consent line).
- **Google Sheet log:** set `sheetWebhook` (setup in `docs/owner-sheet.gs`). Every play adds a row: time, store, branch, game, name, phone, result, coupon code, valid-until.
- **WhatsApp:** after a win, the WhatsApp link opens a message to the store with the customer's name and coupon code already filled in.
- **Redemption:** the cashier checks the code on `verify.html`. "Redeemed" is remembered only on that cashier's device.

## Deploy (free)
Vercel / Netlify / Cloudflare Pages / GitHub Pages. No build command; publish the root folder.

## Run locally
`python3 -m http.server 8000`, then open `http://localhost:8000/?s=demo` (wheel) or `?s=demo-scratch`.

## Before going live
- Change `TAPRIZZ_SALT` in `stores.js` and never change it afterwards.
- Coupon signing is client-side: it deters casual misuse but is not strong fraud protection.
- The one-play limit is per browser (localStorage); a new browser or incognito window can play again.
- When the AI review portal is ready, put its link in `aiReviewUrl`. Until then the AI review row opens the Google review link.
