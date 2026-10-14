// Coupon banana aur verify karna. Index aur verify page dono yahi use karte hain.
// Note: ye client-side signature hai, casual misuse rokne ke liye. Strong fraud-proofing ke liye server chahiye.
(function () {
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  function sign(payload) {
    return ("0000000" + fnv(window.TAPRIZZ_SALT + payload).toString(36).toUpperCase()).slice(-4);
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  // YYMMDD, local time
  function ymd(d) {
    return pad(d.getFullYear() % 100) + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function parseYmd(s) {
    return new Date(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6));
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function make(store, prizeIdx, date) {
    var payload = store.code + "-" + ymd(date || new Date()) + "-" + prizeIdx;
    return payload + "-" + sign(payload);
  }

  function findStore(stores, code) {
    for (var k in stores) if (stores[k].code === code) return stores[k];
    return null;
  }

  function verify(stores, raw) {
    var code = (raw || "").trim().toUpperCase();
    var m = /^([A-Z0-9]{3,8})-(\d{6})-(\d{1,2})-([A-Z0-9]{4})$/.exec(code);
    if (!m) return { ok: false, reason: "Code ka format galat hai." };
    var store = findStore(stores, m[1]);
    if (!store) return { ok: false, reason: "Ye code kisi store ka nahi hai." };
    if (sign(m[1] + "-" + m[2] + "-" + m[3]) !== m[4]) return { ok: false, reason: "Code asli nahi hai." };
    var prize = store.prizes[+m[3]];
    if (!prize) return { ok: false, reason: "Prize nahi mila." };
    var issued = parseYmd(m[2]);
    var expires = addDays(issued, store.validDays || 30);
    var endOfExpiry = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate(), 23, 59, 59);
    var res = { ok: true, code: code, store: store, prize: prize, issued: issued, expires: expires };
    if (new Date() > endOfExpiry) { res.ok = false; res.reason = "Coupon expire ho chuka hai."; }
    return res;
  }

  function fmt(d) {
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  window.Coupon = { make: make, verify: verify, addDays: addDays, fmt: fmt };
})();
