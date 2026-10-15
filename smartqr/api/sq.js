// /sq/<code>  ->  307 redirect to wherever the owner pointed that code (changeable any time from the admin).
// The printed QR only ever contains /sq/<code>, so it never needs reprinting. Nothing about the visitor is stored.
// The URL and key below are the public ones (same as config.js); SQ_SUPABASE_URL / SQ_SUPABASE_KEY can override them.
var SUPABASE_URL = process.env.SQ_SUPABASE_URL || "https://pjophsiodkctmyyfkpnm.supabase.co";
var SUPABASE_KEY = process.env.SQ_SUPABASE_KEY || "sb_publishable_d55Z9QXsWQ7SStVMNpAIfw_kme_frrL";

function page(res, status, title, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + title +
    '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f5f7;color:#10131a;font:400 16px/1.5 system-ui,sans-serif;text-align:center}h1{margin:0 0 8px;font-size:26px;font-weight:600}p{margin:0;color:#5b6270}</style></head><body><main><h1>' +
    title + "</h1><p>" + text + "</p></main></body></html>");
}

module.exports = function handler(req, res) {
  var code = String((req.query && req.query.code) || "").toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(code)) return page(res, 404, "Link not found", "Please check the QR code.");

  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 6000);
  fetch(SUPABASE_URL + "/rest/v1/rpc/sq_resolve", {
    method: "POST", signal: ctl.signal,
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    body: JSON.stringify({ p_code: code })
  }).then(function (r) {
    if (!r.ok) throw new Error("http " + r.status);
    return r.text();
  }).then(function (t) {
    clearTimeout(timer);
    var out = t ? JSON.parse(t) : null, to = "";
    if (out && typeof out.target === "string" && /^https:\/\/\S+$/.test(out.target)) to = out.target;
    else if (out && typeof out.shop === "string" && /^[a-z0-9-]{2,40}$/.test(out.shop)) to = (String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() === "http" ? "http://" : "https://") + String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim() + "/" + out.shop + "?q=" + code;
    if (!to) return page(res, 404, "Not active yet", "This QR code is not active right now. Please ask the staff.");
    res.statusCode = 307;
    res.setHeader("Location", to);
    res.setHeader("Cache-Control", "no-store");
    res.end();
  }).catch(function () {
    clearTimeout(timer);
    page(res, 503, "Please try again", "We could not open this link just now. Scan again in a moment.");
  });
};
