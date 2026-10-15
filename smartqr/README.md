# Smart QR (smarty.taprizz.in)

One QR per shop opens a mini one-page site: AI review, location, WhatsApp, Instagram, a no-storage game, the shop logo. The phone-installable admin lives at `/admin/`.

Static site, no build step. Data lives in Supabase behind `security definer` functions (RLS on, no policies). The page stores no visitor data, only counts.

## Setup

1. Run `supabase/schema.sql` in a Supabase project (all objects are `sq_` prefixed).
2. Set your private admin key (choose a long one, never share it in chat):
   ```sql
   insert into public.sq_settings(key,value)
   values ('admin_hash', encode(sha256(convert_to('YOUR-LONG-ADMIN-KEY','utf8')),'hex'))
   on conflict (key) do update set value = excluded.value;
   ```
3. Put the project URL and publishable (anon) key in `config.js`.
4. Deploy on Vercel with root directory `smartqr`, then attach `smarty.taprizz.in` (CNAME at the DNS host).
5. Open `https://smarty.taprizz.in/admin/` on the phone, enter the key, then Install / Add to Home Screen.

## QR links

Permanent QR codes of the form `<your-domain>/sq/<code>`. The printed QR never changes. In the admin (QR links tab) choose where each code opens (one of your shop pages or any https link), change it any time, pause it, or delete it. `api/sq.js` does the redirect (307, never cached) and only counts opens. Set `base` in `config.js` to your real domain before printing; until then the admin warns on `*.vercel.app` addresses.

## Today's deal (red announcement box)

Per QR link (`/sq/<code>`): in the admin, open the QR link and tap **Get manager link**. The owner opens that private link on their phone, writes a short offer and picks how long it shows. They can change nothing else. The red box appears on the shop page only for visitors who came through that QR.

The deal text is **not stored in Supabase**. It lives in a small Upstash Redis store and deletes itself when its time is over. One-time setup on Vercel (project -> Storage -> Create database -> Upstash Redis, connect it to the project; this adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`), plus an environment variable `SQ_MANAGER_SECRET` set to any long random text. Without these the box simply does not show.

## Admin

Dashboard with totals across all shops (views, button taps, top shops). Create a shop (name, address, colour, logo photo, review/map/WhatsApp/Instagram, optional website, up to 6 of your own extra buttons (open a link, phone call, email), game on/off, live/paused), see page views and taps, copy the link, download the QR. Wrong keys are slowed and refused by the database.

Upgrading an existing database: run `supabase/schema.sql` again. It adds the new columns safely.
