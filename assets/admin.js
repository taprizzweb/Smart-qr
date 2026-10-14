(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  // Exactly 4 slots. weight = chance in percent.
  var prizes = [
    { label: "Pick any item at cost price", short: "AT COST", weight: 10 },
    { label: "Flat 1% off on your next purchase", short: "1% OFF", weight: 30 },
    { label: "Free add-on with your next order", short: "FREE ADD-ON", weight: 10 },
    { label: "", short: "NEXT TIME", weight: 50 }
  ];

  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function renderPrizes() {
    var box = $("prizes");
    box.innerHTML = "";
    prizes.forEach(function (p, i) {
      function field(label, input) { return el("div", { class: "field" }, [el("label", { text: label, for: input.id }), input]); }
      var deal = el("input", { id: "pz-label-" + i, type: "text", maxlength: "60", value: p.label, placeholder: "Empty = no reward" });
      var short = el("input", { id: "pz-short-" + i, type: "text", maxlength: "14", value: p.short, placeholder: "Short text" });
      var pct = el("input", { id: "pz-pct-" + i, type: "number", min: "0", max: "100", step: "1", value: String(p.weight), inputmode: "numeric" });
      [["label", deal], ["short", short], ["weight", pct]].forEach(function (pair) {
        pair[1].addEventListener("input", function () { p[pair[0]] = pair[1].value; odds(); update(); });
      });
      box.appendChild(el("div", { class: "slot" }, [
        el("p", { class: "slot-title", text: "Slot " + (i + 1) }),
        field("Deal", deal),
        el("div", { class: "slot-row" }, [field("Shown on wheel", short), field("Chance (%)", pct)])
      ]));
    });
    odds();
  }

  function total() { return prizes.reduce(function (t, p) { return t + (+p.weight || 0); }, 0); }

  function odds() {
    var t = total();
    $("oddsNote").textContent = "Chances add up to " + t + "%" + (t === 100 ? "." : ". They must add up to 100%.");
    $("oddsNote").className = "hint left" + (t === 100 ? "" : " is-error");
  }

  function config() {
    var c = {
      key: $("key").value.trim().toLowerCase(),
      code: $("code").value.trim().toUpperCase(),
      name: $("name").value.trim(),
      branch: $("branch").value.trim(),
      tagline: $("tagline").value.trim(),
      color: $("color").value,
      game: $("game").value,
      validDays: +$("validDays").value || 30,
      cooldownHours: $("cooldown").value === "" ? 24 : +$("cooldown").value,
      blankMessage: $("blankMessage").value.trim() || "Better luck next time",
      collectLead: $("collectLead").checked,
      whatsapp: $("whatsapp").value.replace(/\D/g, ""),
      instagram: $("instagram").value.trim(),
      googleReviewUrl: $("googleReviewUrl").value.trim(),
      aiReviewUrl: $("aiReviewUrl").value.trim()
    };
    c.prizes = prizes.map(function (p) {
      var o = { label: String(p.label).trim(), weight: Math.max(0, +p.weight || 0) };
      if (String(p.short).trim()) o.short = String(p.short).trim();
      return o;
    });
    return c;
  }

  function problems(c) {
    var out = [];
    if (!/^[a-z0-9-]{2,30}$/.test(c.key)) out.push("Store key: lowercase letters, digits or hyphens.");
    if (!/^[A-Z0-9]{3,8}$/.test(c.code)) out.push("Coupon prefix must be 3-8 letters or digits.");
    if (!c.name) out.push("Store name is required.");
    if (!c.branch) out.push("Branch is required.");
    if (total() !== 100) out.push("Chances must add up to 100%.");
    if (!c.prizes.some(function (p) { return p.label && p.weight > 0; })) out.push("At least one real deal needs a chance above 0%.");
    ["instagram", "googleReviewUrl", "aiReviewUrl"].forEach(function (f) {
      if (c[f] && !/^https:\/\//.test(c[f])) out.push("Links must start with https://");
    });
    if (c.whatsapp && !/^\d{8,15}$/.test(c.whatsapp)) out.push("WhatsApp number: digits only, with country code.");
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function base() { return ($("base").value.trim() || "https://smartqr.taprizz.in").replace(/\/+$/, ""); }
  function customerLink(key) { return base() + "/?s=" + encodeURIComponent(key || "your-store"); }

  function staticBlock(c) {
    var o = JSON.parse(JSON.stringify(c)), key = o.key;
    delete o.key; delete o.cooldownHours; delete o.blankMessage;
    o.playCooldownHours = c.cooldownHours; o.blankMessage = c.blankMessage;
    o.minPurchaseNote = "Redeem it on your next visit";
    o.whatsappMsg = "Hi! I would like to know more about " + (c.name || "your store") + ".";
    return JSON.stringify(key || "your-store") + ": " + JSON.stringify(o, null, 2) + ",";
  }

  function update() {
    var c = config(), probs = problems(c), link = customerLink(c.key);
    $("link").value = link;
    $("out").textContent = staticBlock(c);
    var box = $("problems");
    box.textContent = probs.join(" ");
    box.classList.toggle("hidden", !probs.length);
    $("previewBtn").disabled = probs.length > 0;
    $("publishBtn").disabled = probs.length > 0;
    $("copyCfg").disabled = probs.length > 0;
    if (window.QRCode && c.key) {
      $("qr").innerHTML = "";
      new QRCode($("qr"), { text: link, width: 160, height: 160, colorDark: "#0a0a0d", colorLight: "#f4f1ea", correctLevel: QRCode.CorrectLevel.M });
    }
  }

  document.querySelectorAll("#admin input, #admin select, #base").forEach(function (e) { e.addEventListener("input", update); });

  function copy(text, btn, label) {
    function done() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = label; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* ignore */ } document.body.removeChild(ta); done(); }
  }

  $("previewBtn").addEventListener("click", function () {
    var c = config(), s = JSON.parse(JSON.stringify(c));
    s.playCooldownHours = c.cooldownHours;
    try { sessionStorage.setItem("taprizz:preview", JSON.stringify(s)); } catch (e) { return; }
    window.open("index.html?s=__preview", "_blank");
  });
  $("copyCfg").addEventListener("click", function () { copy($("out").textContent, this, "Copy static block"); });
  $("dlQr").addEventListener("click", function () {
    var cv = $("qr").querySelector("canvas"); if (!cv) return;
    var a = document.createElement("a"); a.download = (config().key || "store") + "-qr.png"; a.href = cv.toDataURL("image/png"); a.click();
  });

  // ---------- server ----------
  var serverOn = window.TQ && TQ.enabled();
  $("serverOnly").classList.toggle("hidden", !serverOn);
  $("noServer").classList.toggle("hidden", serverOn);

  function master() { return $("master").value; }
  try { $("master").value = sessionStorage.getItem("taprizz:master") || ""; } catch (e) { /* ignore */ }

  function ownerLink(key, token) { return base() + "/owner.html#s=" + encodeURIComponent(key) + "&k=" + token; }

  function showOwner(key, token) {
    $("ownerLink").textContent = ownerLink(key, token);
    $("ownerBox").classList.remove("hidden");
  }
  $("copyOwner").addEventListener("click", function () { copy($("ownerLink").textContent, this, "Copy owner link"); });

  $("publishBtn").addEventListener("click", function () {
    var c = config(), msg = $("publishMsg");
    if (!master()) { msg.textContent = "Enter your admin key."; msg.className = "hint left is-error"; return; }
    try { sessionStorage.setItem("taprizz:master", master()); } catch (e) { /* ignore */ }
    msg.textContent = "Publishing…"; msg.className = "hint left";
    var store = JSON.parse(JSON.stringify(c));
    TQ.rpc("tq_admin_upsert_store", { p_master: master(), p_store: store }).then(function (r) {
      if (r.created) {
        msg.textContent = "Published. Customer link is live.";
        showOwner(r.key, r.ownerToken);
      } else {
        msg.textContent = "Updated. The owner link is unchanged (use “New owner link” below if it was lost).";
        $("ownerBox").classList.add("hidden");
      }
      msg.className = "hint left";
      loadStores();
    }, function (err) { msg.textContent = TQ.friendly(err); msg.className = "hint left is-error"; });
  });

  function loadStores() {
    if (!serverOn || !master()) return;
    TQ.rpc("tq_admin_list", { p_master: master() }).then(function (list) {
      $("storesCard").classList.remove("hidden");
      var box = $("storeList");
      box.innerHTML = "";
      if (!list.length) { box.appendChild(el("p", { class: "empty", text: "No stores yet." })); return; }
      list.forEach(function (s) {
        var row = el("div", { class: "row" }, [
          el("div", { class: "row-main" }, [
            el("span", { class: "row-title", text: s.name }),
            el("span", { class: "row-sub inline", text: s.key + (s.active ? "" : " · paused") })
          ]),
          el("div", { class: "row-meta", text: s.branch + " · " + s.plays + " plays · " + s.reviews + " reviews" })
        ]);
        var actions = el("div", { class: "btn-row", style: "margin:10px 0 0" }, [
          el("button", { type: "button", class: "secondary", text: "Copy customer link", onclick: function () { copy(customerLink(s.key), this, "Copy customer link"); } }),
          el("button", { type: "button", class: "secondary", text: "New owner link", onclick: function () {
            var b = this;
            if (!confirm("Create a new owner link for " + s.name + "? The old link will stop working.")) return;
            TQ.rpc("tq_admin_reset_token", { p_master: master(), p_key: s.key }).then(function (r) {
              showOwner(s.key, r.ownerToken); $("ownerBox").scrollIntoView({ behavior: "smooth", block: "center" });
            }, function (err) { b.textContent = TQ.friendly(err); });
          } })
        ]);
        row.appendChild(actions);
        box.appendChild(row);
      });
    }, function () { /* wrong key: stay quiet until they publish */ });
  }

  renderPrizes();
  update();
  loadStores();
})();
