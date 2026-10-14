# Taprizz Crazy Deal

Static spin-wheel deal page for stores. No server, no database, no build step.

## Naya store kaise jodein
1. `stores.js` mein `demo` block copy karke naya key banao (e.g. `cafe-xyz`) aur data badlo.
   `code` har store ka unique hona chahiye.
2. Us store ka link: `https://<tumhari-site>/?s=cafe-xyz` — isi link ka QR banao.
3. Cashier coupon check kare: `https://<tumhari-site>/verify.html`.

## Deploy (free)
Vercel / Netlify / Cloudflare Pages / GitHub Pages par repo connect karo. Build command ki zarurat nahi, root folder publish hota hai.

## Local chalane ke liye
`python3 -m http.server 8000` phir `http://localhost:8000/?s=demo`

## Zaroori
- `stores.js` mein `TAPRIZZ_SALT` live karne se pehle badlo (baad mein nahi).
- Coupon signature client-side hai: casual misuse rokta hai, strong fraud-proofing nahi. "Used" mark sirf cashier ke device par save hota hai.
- Spin limit per device hai (localStorage). Naya browser/incognito se dobara spin ho sakta hai.
- AI review portal ready hone par store ke `aiReviewUrl` mein link daalo; tab tak button Google review link kholta hai.
