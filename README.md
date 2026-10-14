# Taprizz Crazy Deal

Premium static spin-wheel deal page for stores. No server, no database, no build step.

## Add a store
1. In `stores.js`, copy the `demo` block, give it a new key (e.g. `cafe-xyz`) and edit the details.
   The `code` must be unique per store.
2. The store link is `https://<your-site>/?s=cafe-xyz`. Generate the QR from this link.
3. Cashiers verify coupons at `https://<your-site>/verify.html`.

## Deploy (free)
Connect the repo to Vercel, Netlify, Cloudflare Pages or GitHub Pages. No build command is needed; publish the root folder.

## Run locally
`python3 -m http.server 8000`, then open `http://localhost:8000/?s=demo`.

## Before going live
- Change `TAPRIZZ_SALT` in `stores.js` (and never change it afterwards).
- Coupon signing is client-side. It deters casual misuse but is not strong fraud protection. "Redeemed" is stored only on the cashier's device.
- The one-spin limit is per browser (localStorage); a new browser or incognito window can spin again.
- When the AI review portal is ready, put its link in the store's `aiReviewUrl`. Until then the button opens the Google review link.
