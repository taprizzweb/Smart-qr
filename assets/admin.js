(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var prizes = [
    { label: "10% off on your next purchase", short: "10% OFF", weight: 30 },
    { label: "20% off on your next purchase", short: "20% OFF", weight: 15 },
    { label: "", short: "", weight: 45 },
    { label: "Buy 1 Get 1 on your next visit", short: "BUY 1 GET 1", weight: 10 }
  ];

  function esc(s) { return String(s).replace(/"/g, "&quot;"); }

  function renderPrizes() {
    var total = prizes.reduce(function (t, p) { return t + Math.max(0, +p.weight || 0); }, 0);
    $("prizes").innerHTML = prizes.map(function (p, i) {
      var pct = total > 0 ? (Math.max(0, +p.weight || 0) / total * 100).toFixed(1) : "0.0";
      return '<div class="prize-row" data-i="' + i + '">' +
        '<div class="field"><label>Deal text' + (p.label.trim() ? "" : " (blank slot)") + '</label>' +
          '<input data-f="label" value="' + esc(p.label) + '" placeholder="Empty = blank slot"></div>' +
        '<div class="field"><label>Shown on wheel</label><input data-f="short" value="' + esc(p.short) + '" placeholder="Short text"></div>' +
        '<div class="field"><label>Weight</label><input data-f="weight" type="number" min="0" value="' + esc(p.weight) + '"></div>' +
        '<div class="odds"><span>' + pct + '%</span><button type="button" class="link-btn rm" aria-label="Remove slot ' + (i + 1) + '">Remove</button></div>' +
      '</div>';
    }).join("");

    var blanks = prizes.filter(function (p) { return !p.label.trim(); })
      .reduce(function (t, p) { return t + Math.max(0, +p.weight || 0); }, 0);
    $("oddsNote").textContent = total > 0
      ? "Chance a customer wins nothing: " + (blanks / total * 100).toFixed(1) + "%."
      : "Add at least one slot with a weight above 0.";
  }

  $("prizes").addEventListener("input", function (e) {
    var row = e.target.closest(".prize-row"); if (!row) return;
    var p = prizes[+row.dataset.i], f = e.target.dataset.f;
    p[f] = e.target.value;
    // refresh only the numbers (keeps the caret in the field being typed in)
    var total = prizes.reduce(function (t, x) { return t + Math.max(0, +x.weight || 0); }, 0);
    document.querySelectorAll(".prize-row").forEach(function (r, i) {
      var w = Math.max(0, +prizes[i].weight || 0);
      r.querySelector(".odds span").textContent = (total > 0 ? w / total * 100 : 0).toFixed(1) + "%";
    });
    var blanks = prizes.filter(function (x) { return !x.label.trim(); })
      .reduce(function (t, x) { return t + Math.max(0, +x.weight || 0); }, 0);
    $("oddsNote").textContent = total > 0 ? "Chance a customer wins nothing: " + (blanks / total * 100).toFixed(1) + "%."
      : "Add at least one slot with a weight above 0.";
    update();
  });
  $("prizes").addEventListener("click", function (e) {
    if (!e.target.classList.contains("rm")) return;
    prizes.splice(+e.target.closest(".prize-row").dataset.i, 1);
    renderPrizes(); update();
  });
  $("addPrize").addEventListener("click", function () {
    if (prizes.length >= 12) return;
    prizes.push({ label: "", short: "", weight: 10 });
    renderPrizes(); update();
  });

  function config() {
    var c = {
      code: $("code").value.trim().toUpperCase(),
      name: $("name").value.trim(),
      branch: $("branch").value.trim(),
      color: $("color").value,
      game: $("game").value,
      validDays: +$("validDays").value || 30,
      minPurchaseNote: "Redeem it on your next visit",
      playCooldownHours: $("cooldown").value === "" ? 24 : +$("cooldown").value,
      blankMessage: $("blankMessage").value.trim() || "Better luck next time",
      collectLead: $("collectLead").checked,
      sheetWebhook: $("sheetWebhook").value.trim(),
      whatsapp: $("whatsapp").value.replace(/\D/g, ""),
      whatsappMsg: "Hi! I would like to know more about " + ($("name").value.trim() || "your store") + ".",
      instagram: $("instagram").value.trim(),
      googleReviewUrl: $("googleReviewUrl").value.trim(),
      aiReviewUrl: $("aiReviewUrl").value.trim()
    };
    var tag = $("tagline").value.trim();
    if (tag) c.tagline = tag;
    c.prizes = prizes.map(function (p) {
      var o = { label: p.label.trim(), weight: Math.max(0, +p.weight || 0) };
      if (p.short.trim()) o.short = p.short.trim();
      return o;
    });
    return c;
  }

  function problems(c, key) {
    var out = [];
    if (!/^[a-z0-9-]{2,30}$/.test(key)) out.push("Store key: use lowercase letters, digits or hyphens.");
    if (!/^[A-Z0-9]{3,8}$/.test(c.code)) out.push("Coupon prefix must be 3-8 letters or digits.");
    if (!c.name) out.push("Store name is required.");
    if (!c.branch) out.push("Branch is required.");
    if (c.prizes.length < 2) out.push("Add at least two slots.");
    if (!c.prizes.some(function (p) { return p.label && p.weight > 0; })) out.push("At least one real deal needs a weight above 0.");
    if (c.sheetWebhook && !/^https:\/\//.test(c.sheetWebhook)) out.push("Webhook URL must start with https://");
    return out;
  }

  var qr = null;
  function update() {
    var key = $("key").value.trim().toLowerCase(), c = config(), probs = problems(c, key);
    var base = ($("base").value.trim() || location.origin).replace(/\/+$/, "");
    var link = base + "/?s=" + encodeURIComponent(key || "your-store");
    $("link").value = link;
    $("out").textContent = JSON.stringify(key || "your-store") + ": " + JSON.stringify(c, null, 2) + ",";
    var box = $("problems");
    box.textContent = probs.join(" ");
    box.classList.toggle("hidden", !probs.length);
    $("previewBtn").disabled = probs.length > 0;
    $("copyCfg").disabled = probs.length > 0;

    if (window.QRCode && key) {
      $("qr").innerHTML = "";
      qr = new QRCode($("qr"), { text: link, width: 160, height: 160, colorDark: "#0a0a0d", colorLight: "#f4f1ea", correctLevel: QRCode.CorrectLevel.M });
    }
  }

  document.querySelectorAll("#admin input, #admin select, #base").forEach(function (el) {
    el.addEventListener("input", update);
  });

  $("previewBtn").addEventListener("click", function () {
    try { sessionStorage.setItem("taprizz:preview", JSON.stringify(config())); } catch (e) { return; }
    window.open("index.html?s=__preview", "_blank");
  });

  function copy(text, btn, label) {
    function done() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = label; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done(); }
  }
  $("copyCfg").addEventListener("click", function () { copy($("out").textContent, this, "Copy store block"); });

  $("dlQr").addEventListener("click", function () {
    var cv = $("qr").querySelector("canvas"); if (!cv) return;
    var a = document.createElement("a");
    a.download = ($("key").value.trim() || "store") + "-qr.png"; a.href = cv.toDataURL("image/png"); a.click();
  });

  renderPrizes();
  update();
})();
