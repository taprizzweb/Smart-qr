// Scratch card game. The outcome is drawn (securely) on the FIRST touch, saved, and only then written under the foil.
(function () {
  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var REVEAL_AT = 0.5; // fraction of foil removed before the card auto-reveals

  function mount(host, env) {
    host.innerHTML =
      '<div class="scratch-wrap">' +
        '<div class="scratch-under" aria-live="polite">' +
          '<p class="eyebrow scratch-eyebrow"></p>' +
          '<p class="scratch-prize"></p>' +
        '</div>' +
        '<canvas class="scratch-foil" aria-label="Scratch area"></canvas>' +
      '</div>' +
      '<button class="link-btn" type="button">Can’t scratch? Tap to reveal</button>';

    var wrap = host.querySelector(".scratch-wrap");
    var under = host.querySelector(".scratch-under");
    var eyebrow = host.querySelector(".scratch-eyebrow");
    var prizeEl = host.querySelector(".scratch-prize");
    var foil = host.querySelector(".scratch-foil");
    var revealBtn = host.querySelector(".link-btn");
    var ctx = foil.getContext("2d");

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = wrap.getBoundingClientRect();
    var W = foil.width = Math.round(rect.width * dpr);
    var H = foil.height = Math.round(rect.height * dpr);

    function paintFoil() {
      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#3b3b45"); g.addColorStop(0.5, "#23232b"); g.addColorStop(1, "#3b3b45");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // fine brushed texture
      for (var i = 0; i < 1400; i++) {
        ctx.fillStyle = "rgba(255,255,255," + (Rand.float() * 0.05).toFixed(3) + ")";
        ctx.fillRect(Rand.float() * W, Rand.float() * H, 1.5 * dpr, 1.5 * dpr);
      }
      // diagonal sheen
      var s = ctx.createLinearGradient(0, 0, W, H);
      s.addColorStop(0.35, "rgba(255,255,255,0)"); s.addColorStop(0.5, "rgba(255,255,255,0.07)"); s.addColorStop(0.65, "rgba(255,255,255,0)");
      ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);

      // accent hairline frame
      ctx.strokeStyle = env.accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(14 * dpr, 14 * dpr, W - 28 * dpr, H - 28 * dpr);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "rgba(244,241,234,0.85)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 " + Math.round(15 * dpr) + "px " + FONT;
      if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(3 * dpr) + "px";
      ctx.fillText("SCRATCH TO REVEAL", W / 2, H / 2);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    paintFoil();

    var rec = null, pending = null, finished = false;

    // Outcome is requested on the FIRST touch (saved/decided before anything is written under the foil).
    function decideOnce() {
      if (pending) return pending;
      pending = env.decide().then(function (r) {
        rec = r;
        if (r.already) {                       // this phone already played: skip straight to the same result
          finished = true;
          foil.classList.add("is-gone");
          revealBtn.classList.add("hidden");
          env.complete(r);
          return r;
        }
        var p = env.prizes[r.idx];
        eyebrow.textContent = p.blank ? "Not this time" : "Your reward";
        prizeEl.textContent = p.blank ? env.blankMessage : p.label;
        under.classList.add("is-ready");
        return r;
      }, function (err) {
        pending = null;                        // allow another try
        drawing = false;
        env.onError(err);
        throw err;
      });
      return pending;
    }

    var drawing = false;

    function revealedFraction() {
      var d = ctx.getImageData(0, 0, W, H).data;
      var step = Math.max(4, Math.round(W / 60)), hit = 0, tot = 0;
      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          tot++;
          if (d[(y * W + x) * 4 + 3] < 64) hit++;
        }
      }
      return hit / tot;
    }

    function finish() {
      if (finished) return;
      decideOnce().then(function (r) {
        if (finished) return;
        finished = true;
        foil.classList.add("is-gone");
        revealBtn.classList.add("hidden");
        setTimeout(function () { env.complete(r); }, env.reduceMotion ? 100 : 750);
      }, function () { /* error already shown */ });
    }

    var last = null, moves = 0;
    function pos(e) {
      var r = foil.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    }
    function stroke(a, b) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 40 * dpr;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    foil.addEventListener("pointerdown", function (e) {
      if (finished) return;
      decideOnce().catch(function () { /* error already shown */ });
      drawing = true; last = pos(e);
      try { foil.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      stroke(last, last);
      e.preventDefault();
    });
    foil.addEventListener("pointermove", function (e) {
      if (!drawing || finished) return;
      var p = pos(e);
      stroke(last, p); last = p;
      if (++moves % 10 === 0 && revealedFraction() >= REVEAL_AT) finish();
    });
    function end() {
      if (!drawing) return;
      drawing = false;
      if (!finished && revealedFraction() >= REVEAL_AT) finish();
    }
    foil.addEventListener("pointerup", end);
    foil.addEventListener("pointercancel", end);

    revealBtn.addEventListener("click", finish);
  }

  window.Games = window.Games || {};
  window.Games.scratch = { mount: mount, hint: "One card per visit. Reward valid at this branch only." };
})();
