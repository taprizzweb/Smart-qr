(function () {
  var params = new URLSearchParams(location.search);
  var key = (params.get("s") || "demo").toLowerCase();
  var store = window.STORES[key];

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!store) {
    document.querySelector(".page").innerHTML =
      '<header class="hero"><p class="eyebrow">Taprizz</p><h1>Store not found</h1>' +
      '<p class="branch">Please check the QR code or link.</p></header>';
    return;
  }

  var ACCENT = store.color || "#e11d48";
  var INK = "#15151b";
  var IVORY = "#f4f1ea";
  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  // ---------- page setup ----------
  document.title = store.name + " | Spin to Win";
  document.documentElement.style.setProperty("--accent", ACCENT);
  $("storeName").textContent = store.name;
  $("branch").textContent = store.branch;
  $("tagline").textContent = store.tagline;

  function setLink(id, href) {
    var el = $(id);
    if (href) el.href = href; else el.classList.add("hidden");
  }
  setLink("reviewBtn", store.aiReviewUrl || store.googleReviewUrl);
  setLink("waBtn", store.whatsapp
    ? "https://wa.me/" + store.whatsapp + "?text=" + encodeURIComponent(store.whatsappMsg || "Hi!")
    : "");
  setLink("igBtn", store.instagram);

  // ---------- storage (guarded: private mode must not break the page) ----------
  var STORE_KEY = "taprizz:" + store.code;
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }

  // ---------- wheel ----------
  var prizes = store.prizes;
  var n = prizes.length;
  var seg = (2 * Math.PI) / n;
  var canvas = $("wheel");
  var ctx = canvas.getContext("2d");

  function segStyle(i) {
    if (n % 2 === 1 && i === n - 1) return { bg: IVORY, fg: "#15151b" };
    return i % 2 === 0 ? { bg: INK, fg: IVORY } : { bg: ACCENT, fg: "#ffffff" };
  }

  function drawWheel() {
    var size = canvas.width, c = size / 2;
    var ringW = size * 0.045;
    var R = c - ringW;
    ctx.clearRect(0, 0, size, size);

    // segments
    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 + i * seg, s = segStyle(i);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = s.bg;
      ctx.fill();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.fg;
      var text = (prizes[i].short || prizes[i].label).toUpperCase();
      ctx.font = "600 " + Math.round(size * (text.length > 9 ? 0.05 : 0.06)) + "px " + FONT;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
      ctx.fillText(text, R - size * 0.06, 0, R * 0.6);
      ctx.restore();
    }

    // depth: darker toward the center, same hue family
    var g = ctx.createRadialGradient(c, c, R * 0.1, c, c, R);
    g.addColorStop(0, "rgba(0,0,0,0.45)");
    g.addColorStop(0.55, "rgba(0,0,0,0.05)");
    g.addColorStop(1, "rgba(255,255,255,0.06)");
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();

    // segment dividers
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    for (var d = 0; d < n; d++) {
      var ang = -Math.PI / 2 + d * seg;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(ang) * size * 0.07, c + Math.sin(ang) * size * 0.07);
      ctx.lineTo(c + Math.cos(ang) * R, c + Math.sin(ang) * R);
      ctx.stroke();
    }

    // outer ring
    ctx.beginPath();
    ctx.arc(c, c, c - ringW / 2, 0, 2 * Math.PI);
    ctx.lineWidth = ringW;
    ctx.strokeStyle = IVORY;
    ctx.stroke();

    // ring studs
    var studs = Math.max(n * 4, 24);
    for (var k = 0; k < studs; k++) {
      var t = (k / studs) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(c + Math.cos(t) * (c - ringW / 2), c + Math.sin(t) * (c - ringW / 2), ringW * 0.17, 0, 2 * Math.PI);
      ctx.fillStyle = k % 2 === 0 ? ACCENT : "#15151b";
      ctx.fill();
    }

    // inner lip
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
  }
  drawWheel();

  function pickPrize() {
    var total = 0, i;
    for (i = 0; i < n; i++) total += prizes[i].weight || 1;
    var roll = Math.random() * total;
    for (i = 0; i < n; i++) {
      roll -= prizes[i].weight || 1;
      if (roll < 0) return i;
    }
    return n - 1;
  }

  // ---------- result ----------

  function showCoupon(rec, returning) {
    var prize = prizes[rec.prize];
    var exp = Coupon.addDays(new Date(rec.issued), store.validDays || 30);
    $("ticketEyebrow").textContent = returning ? "Welcome back · your reward" : "Congratulations · you won";
    $("prizeLabel").textContent = prize.label;
    $("prizeNote").textContent = store.minPurchaseNote || "Redeem it on your next visit";
    $("couponCode").textContent = rec.code;
    $("validAt").textContent = store.branch;
    $("expires").textContent = Coupon.fmt(exp);

    $("gameCard").classList.add("hidden");
    var ticket = $("couponCard"), actions = $("actions");
    ticket.classList.remove("hidden");
    actions.classList.remove("hidden");
    ticket.classList.add("rise");
    actions.classList.add("rise", "d1");
  }

  $("copyBtn").addEventListener("click", function () {
    var btn = this, code = $("couponCode").textContent;
    function done() {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy"; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = code; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta); done();
    }
  });

  // ---------- one-shot celebration ----------
  function confetti() {
    if (reduceMotion) return;
    var cv = $("confetti"), cx = cv.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cx.scale(dpr, dpr);
    var colors = [ACCENT, IVORY, "#ffffff", "#9b9ba8"];
    var parts = [];
    for (var i = 0; i < 70; i++) {
      parts.push({
        x: innerWidth / 2, y: innerHeight * 0.38,
        vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 3,
        w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length]
      });
    }
    var start = performance.now();
    (function frame(now) {
      var t = now - start;
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save();
        cx.globalAlpha = Math.max(0, 1 - t / 1600);
        cx.translate(p.x, p.y); cx.rotate(p.r);
        cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        cx.restore();
      });
      if (t < 1600) requestAnimationFrame(frame); else cx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  // Returning visitor with a still-valid coupon sees it again (no second spin).
  var existing = load();
  if (existing && existing.code && Coupon.verify(window.STORES, existing.code).ok) {
    showCoupon(existing, true);
    return;
  }

  var spinning = false, turns = 0;
  $("spinBtn").addEventListener("click", function () {
    if (spinning) return;
    spinning = true;
    var btn = this;
    btn.disabled = true;
    btn.textContent = "Good luck…";

    var idx = pickPrize();
    var jitter = (Math.random() - 0.5) * seg * 0.7;
    var target = -((idx + 0.5) * seg) + jitter;   // brings segment idx under the pointer
    turns += 6;                                    // at least six full turns
    var deg = (turns * 2 * Math.PI + target) * 180 / Math.PI;
    canvas.style.transform = "rotate(" + deg + "deg)";

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      var now = new Date();
      var rec = { code: Coupon.make(store, idx, now), prize: idx, issued: now.getTime() };
      save(rec);
      if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
      showCoupon(rec, false);
      confetti();
    }
    canvas.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, reduceMotion ? 300 : 5400);   // fallback if transitionend never fires
  });
})();
