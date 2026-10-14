(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var key = (params.get("s") || "demo").toLowerCase();
  var preview = key === "__preview";
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var store = null;
  if (preview) {
    try { store = JSON.parse(sessionStorage.getItem("taprizz:preview")); } catch (e) { /* ignore */ }
  } else {
    store = window.STORES[key];
  }

  if (!store) {
    document.querySelector(".page").innerHTML =
      '<header class="hero"><p class="eyebrow">Taprizz</p><h1>Store not found</h1>' +
      '<p class="branch">Please check the QR code or link.</p></header>';
    return;
  }

  var ACCENT = store.color || "#e11d48";
  var IVORY = "#f4f1ea";
  var GAME = Games[store.game] ? store.game : "wheel";
  var BLANK_MESSAGE = store.blankMessage || "Better luck next time";

  // A prize with an empty label is a blank slot (no reward).
  var prizes = (store.prizes || []).map(function (p) {
    var label = (p.label || "").trim(), blank = !label;
    return {
      label: label,
      blank: blank,
      weight: p.weight == null ? 1 : +p.weight,
      short: (p.short || "").trim() || (blank ? (store.blankShort || "NEXT TIME") : label)
    };
  });

  // ---------- page header ----------
  document.title = store.name + " | Crazy Deal";
  document.documentElement.style.setProperty("--accent", ACCENT);
  $("storeName").textContent = store.name;
  $("branch").textContent = store.branch;
  $("tagline").textContent = store.tagline ||
    (GAME === "scratch" ? "Scratch the card. Unlock a crazy deal." : "Spin the wheel. Unlock a crazy deal.");
  if (preview) $("previewBar").classList.remove("hidden");

  // ---------- storage (guarded: private mode must not break the page) ----------
  var REC_KEY = "taprizz:" + store.code, LEAD_KEY = "taprizz:lead";
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function clear(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  var lead = preview ? null : read(LEAD_KEY);

  // ---------- links ----------
  function setLink(id, href) {
    var el = $(id);
    if (href) { el.href = href; el.classList.remove("hidden"); } else { el.classList.add("hidden"); }
  }
  function waLink(rec) {
    if (!store.whatsapp) return "";
    var msg = store.whatsappMsg || "Hi!";
    if (rec && !prizes[rec.idx].blank) {
      msg = "Hi " + store.name + "! " + (lead && lead.name ? "I’m " + lead.name + ". " : "") +
        "I won “" + prizes[rec.idx].label + "” (code " + rec.code + ").";
    }
    return "https://wa.me/" + store.whatsapp + "?text=" + encodeURIComponent(msg);
  }
  setLink("reviewBtn", store.aiReviewUrl || store.googleReviewUrl);
  setLink("igBtn", store.instagram);
  setLink("waBtn", waLink(null));

  // ---------- play record (decided + saved BEFORE anything is shown, so refreshing cannot re-roll) ----------
  function cooldownMs() {
    return (store.playCooldownHours == null ? 24 : store.playCooldownHours) * 3600 * 1000;
  }

  function loadRecord() {
    if (preview) return null;
    var r = read(REC_KEY);
    if (!r || typeof r.idx !== "number" || !prizes[r.idx]) return null;
    if (prizes[r.idx].blank) {
      if (Date.now() > r.issued + cooldownMs()) { clear(REC_KEY); return null; }
      return r;
    }
    if (!Coupon.verify(window.STORES, r.code).ok) { clear(REC_KEY); return null; } // expired
    return r;
  }

  function validUntil(rec) {
    return Coupon.fmt(Coupon.addDays(new Date(rec.issued), store.validDays || 30));
  }

  function sendLog(rec) {
    if (preview || !store.sheetWebhook) return;
    var p = prizes[rec.idx];
    var body = JSON.stringify({
      time: new Date(rec.issued).toISOString(),
      store: store.name,
      branch: store.branch,
      game: GAME,
      name: (lead && lead.name) || "",
      phone: (lead && lead.phone) || "",
      result: p.blank ? "No reward" : p.label,
      code: rec.code || "",
      validUntil: p.blank ? "" : validUntil(rec)
    });
    try {
      fetch(store.sheetWebhook, {
        method: "POST", mode: "no-cors", keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body
      });
    } catch (e) { /* the customer experience must never depend on this */ }
  }

  function decide() {
    var idx = Rand.weighted(prizes.map(function (p) { return p.weight; }));
    var now = new Date();
    var rec = {
      idx: idx,
      issued: now.getTime(),
      code: prizes[idx].blank ? "" : Coupon.make(store, idx, now)
    };
    if (!preview) write(REC_KEY, rec);
    sendLog(rec);
    return rec;
  }

  // ---------- result ----------
  function showResult(rec, returning) {
    var p = prizes[rec.idx];
    $("gateCard").classList.add("hidden");
    $("gameCard").classList.add("hidden");

    if (p.blank) {
      $("ticketEyebrow").textContent = returning ? "Welcome back" : "Not this time";
      $("prizeLabel").textContent = BLANK_MESSAGE;
      $("prizeNote").textContent = "Thanks for playing. Come back soon for another chance.";
      $("ticketBottomWrap").classList.add("hidden");
    } else {
      $("ticketEyebrow").textContent = returning ? "Welcome back · your reward" : "Congratulations · you won";
      $("prizeLabel").textContent = p.label;
      $("prizeNote").textContent = store.minPurchaseNote || "Redeem it on your next visit";
      $("couponCode").textContent = rec.code;
      $("validAt").textContent = store.branch;
      $("expires").textContent = validUntil(rec);
      $("ticketBottomWrap").classList.remove("hidden");
    }

    setLink("waBtn", waLink(rec));
    var card = $("resultCard"), nav = $("actions");
    card.classList.remove("hidden"); nav.classList.remove("hidden");
    card.classList.add("rise"); nav.classList.add("rise", "d1");
    if (!returning && !p.blank) confetti();
  }

  $("copyBtn").addEventListener("click", function () {
    var btn = this, code = $("couponCode").textContent;
    function done() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = code; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta); done();
    }
  });

  // One-shot celebration (wins only). Skipped for reduced motion.
  function confetti() {
    if (reduceMotion) return;
    var cv = $("confetti"), cx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx.scale(dpr, dpr);
    var colors = [ACCENT, IVORY, "#ffffff", "#9b9ba8"], parts = [], i;
    for (i = 0; i < 70; i++) {
      parts.push({
        x: innerWidth / 2, y: innerHeight * 0.38,
        vx: (Rand.float() - 0.5) * 11, vy: -Rand.float() * 11 - 3,
        w: 5 + Rand.float() * 5, h: 3 + Rand.float() * 4,
        r: Rand.float() * 6, vr: (Rand.float() - 0.5) * 0.3, c: colors[i % colors.length]
      });
    }
    var start = performance.now();
    (function frame(now) {
      var t = now - start;
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.globalAlpha = Math.max(0, 1 - t / 1600);
        cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        cx.restore();
      });
      if (t < 1600) requestAnimationFrame(frame); else cx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  // ---------- flow ----------
  function startGame() {
    $("gateCard").classList.add("hidden");
    $("gameCard").classList.remove("hidden");
    $("gameHint").textContent = Games[GAME].hint;
    Games[GAME].mount($("gameHost"), {
      store: store, prizes: prizes, accent: ACCENT, reduceMotion: reduceMotion,
      blankMessage: BLANK_MESSAGE,
      decide: decide,
      complete: function (rec) { showResult(rec, false); }
    });
  }

  function showGate() {
    var card = $("gateCard");
    card.classList.remove("hidden");
    $("consent").textContent = "By continuing, you agree that " + store.name + " may contact you about offers.";
    var nameEl = $("leadName"), phoneEl = $("leadPhone"), errEl = $("leadError");
    function fail(msg, el) { errEl.textContent = msg; errEl.classList.remove("hidden"); el.focus(); }

    $("leadForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = nameEl.value.trim(), phone = phoneEl.value.replace(/[\s-]/g, "");
      if (name.length < 2) return fail("Please enter your name.", nameEl);
      if (!/^\+?\d{10,14}$/.test(phone)) return fail("Please enter a valid mobile number.", phoneEl);
      errEl.classList.add("hidden");
      lead = { name: name, phone: phone };
      if (!preview) write(LEAD_KEY, lead);
      startGame();
    });
  }

  var existing = loadRecord();
  if (existing) {
    showResult(existing, true);
  } else if (store.collectLead === true && !lead) {
    showGate();
  } else {
    startGame();
  }
})();
