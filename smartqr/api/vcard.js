// /vcard/<shop>  ->  a .vcf contact card for the shop. Opening it lets the visitor save the contact in one tap.
// Built from the shop's public page data only (name, phone, website, address). Nothing about the visitor is stored.
var SUPABASE_URL = process.env.SQ_SUPABASE_URL || "https://khthtasavgtpqhesvavc.supabase.co";
var SUPABASE_KEY = process.env.SQ_SUPABASE_KEY || "sb_publishable_noWmUI3q27X9DotwveN1aQ_Ku5tFfGr";

function esc(v) { return String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }

function page(res, status, title, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + title +
    '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f5f7;color:#10131a;font:400 16px/1.5 system-ui,sans-serif;text-align:center}h1{margin:0 0 8px;font-size:26px;font-weight:600}p{margin:0;color:#5b6270}</style></head><body><main><h1>' +
    title + "</h1><p>" + text + "</p></main></body></html>");
}

function card(shop) {
  var phone = /^[0-9]{8,15}$/.test(shop.contactPhone || "") ? shop.contactPhone : (/^[0-9]{8,15}$/.test(shop.whatsapp || "") ? shop.whatsapp : "");
  var lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(shop.name), "ORG:" + esc(shop.name)];
  if (phone) lines.push("TEL;TYPE=WORK,VOICE:+" + phone);
  if (/^https:\/\/\S+$/.test(shop.website || "")) lines.push("URL:" + shop.website);
  if (shop.address) lines.push("ADR;TYPE=WORK:;;" + esc(shop.address) + ";;;;");
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

module.exports = function handler(req, res) {
  var slug = String((req.query && req.query.s) || "").toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return page(res, 404, "Contact not found", "Please check the link.");
  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 6000);
  fetch(SUPABASE_URL + "/rest/v1/rpc/sq_get_shop", {
    method: "POST", signal: ctl.signal,
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    body: JSON.stringify({ p_slug: slug })
  }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.text(); }).then(function (t) {
    clearTimeout(timer);
    var shop = t ? JSON.parse(t) : null;
    if (!shop || shop.active === false || !shop.saveContact) return page(res, 404, "Contact not available", "This shop has not turned on contact saving.");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/vcard; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="' + slug + '.vcf"');
    res.setHeader("Cache-Control", "no-store");
    res.end(card(shop));
  }).catch(function () { clearTimeout(timer); page(res, 503, "Please try again", "We could not prepare the contact just now."); });
};
