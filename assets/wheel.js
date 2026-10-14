// Spin wheel game. Mounted by app.js; calls env.decide() on spin and env.complete(rec) when it stops.
(function () {
  var INK = "#15151b", IVORY = "#f4f1ea";
  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  function mount(host, env) {
    var prizes = env.prizes, n = prizes.length, seg = (2 * Math.PI) / n, ACCENT = env.accent;

    host.innerHTML =
      '<div class="wheel-wrap">' +
        '<svg class="pointer" viewBox="0 0 28 36" aria-hidden="true">' +
          '<path d="M14 36 2.5 15.5A14 14 0 1 1 25.5 15.5Z" fill="#f4f1ea"/><circle cx="14" cy="13" r="4.5" fill="#0a0a0d"/></svg>' +
        '<canvas width="800" height="800" role="img" aria-label="Prize wheel"></canvas>' +
        '<div class="hub"></div>' +
      '</div>' +
      '<button class="primary" type="button">Spin the wheel</button>';

    var canvas = host.querySelector("canvas"), ctx = canvas.getContext("2d"), btn = host.querySelector("button");

    function segStyle(i) {
      if (n % 2 === 1 && i === n - 1) return { bg: IVORY, fg: INK };
      return i % 2 === 0 ? { bg: INK, fg: IVORY } : { bg: ACCENT, fg: "#ffffff" };
    }

    function draw() {
      var size = canvas.width, c = size / 2, ringW = size * 0.045, R = c - ringW, i;
      ctx.clearRect(0, 0, size, size);

      for (i = 0; i < n; i++) {
        var a0 = -Math.PI / 2 + i * seg, s = segStyle(i);
        ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a0 + seg); ctx.closePath();
        ctx.fillStyle = s.bg; ctx.fill();

        ctx.save();
        ctx.translate(c, c); ctx.rotate(a0 + seg / 2);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillStyle = s.fg; ctx.globalAlpha = prizes[i].blank ? 0.72 : 1;
        var text = prizes[i].short.toUpperCase();
        var base = n > 8 ? 0.042 : 0.054;
        ctx.font = "600 " + Math.round(size * (text.length > 9 ? base * 0.85 : base)) + "px " + FONT;
        if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
        ctx.fillText(text, R - size * 0.06, 0, R * 0.6);
        ctx.restore();
      }

      var g = ctx.createRadialGradient(c, c, R * 0.1, c, c, R);
      g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(0.55, "rgba(0,0,0,0.05)"); g.addColorStop(1, "rgba(255,255,255,0.06)");
      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 2;
      for (i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + i * seg;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(ang) * size * 0.07, c + Math.sin(ang) * size * 0.07);
        ctx.lineTo(c + Math.cos(ang) * R, c + Math.sin(ang) * R);
        ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(c, c, c - ringW / 2, 0, 2 * Math.PI);
      ctx.lineWidth = ringW; ctx.strokeStyle = IVORY; ctx.stroke();

      var studs = Math.max(n * 4, 24);
      for (var k = 0; k < studs; k++) {
        var t = (k / studs) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(c + Math.cos(t) * (c - ringW / 2), c + Math.sin(t) * (c - ringW / 2), ringW * 0.17, 0, 2 * Math.PI);
        ctx.fillStyle = k % 2 === 0 ? ACCENT : INK; ctx.fill();
      }

      ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI);
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke();
    }
    draw();

    var spinning = false;
    btn.addEventListener("click", function () {
      if (spinning) return;
      spinning = true;
      btn.disabled = true;
      btn.textContent = "Good luck\u2026";

      // The outcome is decided (and saved) BEFORE the animation; in server mode the database decides.
      env.decide().then(function (rec) {
        if (rec.already) { env.complete(rec); return; }   // this phone already played: show the same result
        var jitter = (Rand.float() - 0.5) * seg * 0.7;
        var target = -((rec.idx + 0.5) * seg) + jitter;      // brings the chosen segment under the pointer
        var deg = (6 * 2 * Math.PI + target) * 180 / Math.PI; // six full turns, then land
        canvas.style.transform = "rotate(" + deg + "deg)";

        var done = false;
        function finish() {
          if (done) return;
          done = true;
          env.complete(rec);
        }
        canvas.addEventListener("transitionend", finish, { once: true });
        setTimeout(finish, env.reduceMotion ? 300 : 5400);   // fallback if transitionend never fires
      }, function (err) {
        spinning = false;
        btn.disabled = false;
        btn.textContent = "Spin the wheel";
        env.onError(err);
      });
    });
  }

  window.Games = window.Games || {};
  window.Games.wheel = { mount: mount, hint: "One spin per visit. Reward valid at this branch only." };
})();
