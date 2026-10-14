# Smart QR (smartqr.taprizz.in)

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
4. Deploy on Vercel with root directory `smartqr`, then attach `smartqr.taprizz.in` (CNAME at the DNS host).
5. Open `https://smartqr.taprizz.in/admin/` on the phone, enter the key, then Install / Add to Home Screen.

## Admin

Dashboard with totals across all shops (views, button taps, top shops). Create a shop (name, address, colour, logo photo, review/map/WhatsApp/Instagram, optional website, up to 6 of your own extra buttons (open a link, phone call, email), game on/off, live/paused), see page views and taps, copy the link, download the QR. Wrong keys are slowed and refused by the database.

Upgrading an existing database: run `supabase/schema.sql` again. It adds the new columns safely.
