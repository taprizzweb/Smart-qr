(function () {
  var params = new URLSearchParams(location.search);
  var key = (params.get("s") || "demo").toLowerCase();
  var store = window.STORES[key];

  var $ = function (id) { return document.getElementById(id); };

  if (!store) {
    document.querySelector(".page").innerHTML =
      '<header class="hero"><h1>Store nahi mila</h1><p class="branch">QR code ya link check karo.</p></header>';
    return;
  }

  // ---------- page setup ----------
  document.title = store.name + " | Crazy Deal";
  document.documentElement.style.setProperty("--brand", store.color || "#e11d48");
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

  // ---------- storage (try/catch: private mode mein bhi page chale) ----------
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

  function segColor(i) {
    var c = [store.color || "#e11d48", "#fbbf24", "#ffffff"];
    var col = c[i % 2 === 0 ? 0 : 1];
    if (n % 2 === 1 && i === n - 1) col = c[2]; // odd count: last segment alag rang ka
    return col;
  }

  function drawWheel() {
    var size = canvas.width, r = size / 2;
    ctx.clearRect(0, 0, size, size);
    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 + i * seg;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = segColor(i);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      var fill = segColor(i);
      ctx.fillStyle = fill === "#e11d48" || fill === store.color ? "#fff" : "#111827";
      var text = prizes[i].short || prizes[i].label;
      var fs = text.length > 9 ? 34 : 42;
      ctx.font = "800 " + fs + "px system-ui, sans-serif";
      ctx.fillText(text, r - 40, 0, r * 0.62);
      ctx.restore();
    }
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
  function showCoupon(rec) {
    var prize = prizes[rec.prize];
    $("prizeLabel").textContent = prize.label;
    $("couponCode").textContent = rec.code;
    var exp = Coupon.addDays(new Date(rec.issued), store.validDays || 30);
    $("terms").innerHTML =
      "<strong>Sirf " + escapeHtml(store.branch) + " branch mein valid.</strong><br>" +
      escapeHtml(store.minPurchaseNote || "Agli purchase par valid") +
      " &middot; " + Coupon.fmt(exp) + " tak.<br>Billing par ye code dikhao. Screenshot le lo.";
    $("gameCard").classList.add("hidden");
    $("couponCard").classList.remove("hidden");
    $("actions").classList.remove("hidden");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // purana valid coupon ho to wahi dikha do (dobara spin nahi)
  var existing = load();
  if (existing && existing.code) {
    var check = Coupon.verify(window.STORES, existing.code);
    if (check.ok) { showCoupon(existing); return; }
  }

  var spinning = false, turns = 0;
  $("spinBtn").addEventListener("click", function () {
    if (spinning) return;
    spinning = true;
    $("spinBtn").disabled = true;

    var idx = pickPrize();
    var jitter = (Math.random() - 0.5) * seg * 0.7;
    // segment idx ko upar pointer ke neeche laane ke liye rotation
    var target = -((idx + 0.5) * seg) + jitter;
    turns += 6; // har baar kam se kam 6 poore chakkar
    var deg = (turns * 2 * Math.PI + target) * 180 / Math.PI;
    canvas.style.transform = "rotate(" + deg + "deg)";

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      var now = new Date();
      var rec = { code: Coupon.make(store, idx, now), prize: idx, issued: now.getTime() };
      save(rec);
      showCoupon(rec);
    }
    canvas.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 5200); // fallback (reduced motion / transitionend miss)
  });
})();
