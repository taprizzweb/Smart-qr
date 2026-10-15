// "Today's deal" announcement for one QR link (/sq/<code>). One small function, five actions:
//   GET  ?a=get&c=<code>        public: the live deal text for that QR, or {}
//   GET  ?a=me&t=<token>        manager: what is live now
//   POST ?a=set                 manager: {t, text, ttl}    (ttl = seconds, up to 7 days)
//   POST ?a=clear               manager: {t}
//   POST ?a=link                admin:   {key, code, reset} -> the private manager link for that QR
// The deal text lives ONLY in a small Redis store (Upstash) and deletes itself when it expires. Nothing is written to Supabase.
// Needs two settings on Vercel: the Redis store (UPSTASH_REDIS_REST_URL / _TOKEN, added by the Upstash integration)
// and SQ_MANAGER_SECRET (any long random text). Without them the page simply shows no deal.
var crypto = require("crypto");
var SUPABASE_URL = process.env.SQ_SUPABASE_URL || "https://pjophsiodkctmyyfkpnm.supabase.co";
var SUPABASE_KEY = process.env.SQ_SUPABASE_KEY || "sb_publishable_d55Z9QXsWQ7SStVMNpAIfw_kme_frrL";
var MAX_TEXT = 90, MIN_TTL = 600, MAX_TTL = 7 * 24 * 3600;

function cfg() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
    secret: process.env.SQ_MANAGER_SECRET || ""
  };
}
function send(res, status, obj, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache || "no-store");
  res.end(JSON.stringify(obj));
}
function redis(c, cmd) {
  return fetch(c.url, { method: "POST", headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" }, body: JSON.stringify(cmd) })
    .then(function (r) { if (!r.ok) throw new Error("redis " + r.status); return r.json(); })
    .then(function (j) { return j.result; });
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise(function (resolve) {
    var d = ""; req.on("data", function (x) { d += x; if (d.length > 20000) req.destroy(); });
    req.on("end", function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on("error", function () { resolve({}); });
  });
}
function sign(c, code, salt) { return crypto.createHmac("sha256", c.secret).update(code + ":" + (salt || "")).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 24); }
function same(a, b) { var x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }
// A manager token is "<code>.<signature>"; it only ever grants control of that one code.
function verify(c, t) {
  t = String(t || ""); var i = t.lastIndexOf(".");
  var code = t.slice(0, i), sig = t.slice(i + 1);
  if (i < 3 || !/^[a-z0-9-]{3,40}$/.test(code) || !sig) return Promise.resolve(null);
  return redis(c, ["GET", "sq:salt:" + code]).then(function (salt) { return same(sig, sign(c, code, salt)) ? code : null; });
}
function cleanText(v) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }

module.exports = function handler(req, res) {
  var a = String((req.query && req.query.a) || ""), c = cfg();
  var configured = !!(c.url && c.token && c.secret);

  if (a === "get") {
    var code = String((req.query && req.query.c) || "").toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(code) || !c.url || !c.token) return send(res, 200, {}, "public, s-maxage=15, stale-while-revalidate=30");
    return redis(c, ["GET", "sq:offer:" + code]).then(function (raw) {
      var o = null; try { o = raw ? JSON.parse(raw) : null; } catch (e) { /* ignore */ }
      if (!o || !o.t || (o.u && o.u * 1000 < Date.now())) return send(res, 200, {}, "public, s-maxage=15, stale-while-revalidate=30");
      send(res, 200, { text: o.t }, "public, s-maxage=15, stale-while-revalidate=30");
    }).catch(function () { send(res, 200, {}); });
  }
  if (!configured) return send(res, 503, { error: "not_configured" });

  if (a === "me" && req.method === "GET") {
    return verify(c, req.query && req.query.t).then(function (code) {
      if (!code) return send(res, 403, { error: "bad_link" });
      return redis(c, ["GET", "sq:offer:" + code]).then(function (raw) {
        var o = null; try { o = raw ? JSON.parse(raw) : null; } catch (e) { /* ignore */ }
        if (o && o.u && o.u * 1000 < Date.now()) o = null;
        send(res, 200, { code: code, text: o ? o.t : "", until: o ? o.u : 0 });
      });
    }).catch(function () { send(res, 503, { error: "store" }); });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });

  readBody(req).then(function (b) {
    if (a === "set" || a === "clear") {
      return verify(c, b.t).then(function (code) {
        if (!code) return send(res, 403, { error: "bad_link" });
        if (a === "clear") return redis(c, ["DEL", "sq:offer:" + code]).then(function () { send(res, 200, { ok: true }); });
        var text = cleanText(b.text), ttl = Math.floor(Number(b.ttl));
        if (text.length < 3 || text.length > MAX_TEXT) return send(res, 400, { error: "text" });
        if (!(ttl >= MIN_TTL && ttl <= MAX_TTL)) return send(res, 400, { error: "ttl" });
        var until = Math.floor(Date.now() / 1000) + ttl;
        return redis(c, ["SET", "sq:offer:" + code, JSON.stringify({ t: text, u: until }), "EX", String(ttl)]).then(function () { send(res, 200, { ok: true, until: until }); });
      });
    }
    if (a === "link") {
      var code = String(b.code || "").toLowerCase();
      if (!/^[a-z0-9-]{3,40}$/.test(code) || typeof b.key !== "string" || !b.key) return send(res, 400, { error: "input" });
      // Only the admin key (checked by your database, nothing stored) can create a manager link, and the QR must exist.
      return fetch(SUPABASE_URL + "/rest/v1/rpc/sq_admin_link_get", {
        method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
        body: JSON.stringify({ p_key: b.key, p_code: code })
      }).then(function (r) {
        if (!r.ok) return send(res, 403, { error: "forbidden" });
        var next = b.reset ? crypto.randomBytes(9).toString("hex") : null;
        var step = next ? redis(c, ["SET", "sq:salt:" + code, next]).then(function () { return next; }) : redis(c, ["GET", "sq:salt:" + code]);
        return step.then(function (salt) { return (b.reset ? redis(c, ["DEL", "sq:offer:" + code]) : Promise.resolve()).then(function () { send(res, 200, { code: code, token: code + "." + sign(c, code, salt) }); }); });
      });
    }
    send(res, 400, { error: "action" });
  }).catch(function () { send(res, 503, { error: "store" }); });
};
