(function () {
  "use strict";

  var app = document.getElementById("app");

  // DOM helper. Everything customers typed (names, review text) is inserted as text, never as HTML.
  function h(tag, props, kids) {
    var el = document.createElement(tag), k;
    for (k in (props || {})) {
      if (k === "class") el.className = props[k];
      else if (k === "text") el.textContent = props[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), props[k]);
      else if (props[k] !== null && props[k] !== undefined) el.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }

  function fmtTime(t) {
    try { return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return String(t); }
  }
  function fmtDate(t) {
    try { return new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" }); } catch (e) { return String(t); }
  }

  // ---------- auth: link looks like owner.html#s=<store>&k=<secret>. The secret never goes to a server log. ----------
  var creds = null;
  (function () {
    var p = new URLSearchParams(location.hash.slice(1));
    try {
      if (p.get("s") && p.get("k")) sessionStorage.setItem("taprizz:owner", JSON.stringify({ s: p.get("s"), k: p.get("k") }));
      creds = JSON.parse(sessionStorage.getItem("taprizz:owner") || "null");
    } catch (e) { creds = p.get("s") && p.get("k") ? { s: p.get("s"), k: p.get("k") } : null; }
    if (location.hash) history.replaceState(null, "", location.pathname);
  })();

  function message(title, text) {
    app.innerHTML = "";
    app.appendChild(h("header", { class: "hero" }, [
      h("p", { class: "eyebrow", text: "Owner dashboard" }),
      h("h1", { text: title }),
      h("p", { class: "branch", text: text })
    ]));
  }

  if (!TQ.enabled()) return message("Not connected", "The server is not set up yet. Please contact Taprizz.");
  if (!creds) return message("Owner link needed", "Open the private link you received from Taprizz.");

  var days = 30, data = null;

  function load() {
    return TQ.rpc("tq_owner_dashboard", { p_key: creds.s, p_token: creds.k, p_days: days }).then(function (d) {
      data = d; render();
    }, function (err) {
      message("Can’t open dashboard", TQ.friendly(err));
    });
  }

  // ---------- helpers ----------
  function section(title, kids, note) {
    return h("section", { class: "card admin" }, [
      h("h2", { class: "card-title", text: title }),
      note ? h("p", { class: "hint left", text: note }) : null
    ].concat(kids));
  }

  function statTile(value, label) {
    return h("div", { class: "stat" }, [h("div", { class: "stat-value", text: String(value) }), h("div", { class: "stat-label", text: label })]);
  }

  // weights -> whole percentages that add up to exactly 100 (largest remainder)
  function toPercents(prizes) {
    var total = prizes.reduce(function (t, p) { return t + Math.max(0, +p.weight || 0); }, 0);
    if (!total) return prizes.map(function () { return 0; });
    var raw = prizes.map(function (p) { return Math.max(0, +p.weight || 0) / total * 100; });
    var out = raw.map(Math.floor), left = 100 - out.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (r, i) { return { i: i, f: r - Math.floor(r) }; })
      .sort(function (a, b) { return b.f - a.f; })
      .slice(0, left).forEach(function (x) { out[x.i]++; });
    return out;
  }

  // ---------- render ----------
  function render() {
    var s = data.store, st = data.stats;
    app.innerHTML = "";

    app.appendChild(h("header", { class: "hero" }, [
      h("p", { class: "eyebrow", text: "Owner dashboard" }),
      h("h1", { text: s.name }),
      h("p", { class: "branch", text: s.branch })
    ]));

    // live / paused
    var toggle = h("button", { type: "button", class: s.active ? "secondary" : "primary", text: s.active ? "Pause offers" : "Resume offers",
      onclick: function () { saveOffers({ active: !s.active }); } });
    app.appendChild(h("section", { class: "card admin status" }, [
      h("div", {}, [
        h("p", { class: "status-title", text: s.active ? "Offers are live" : "Offers are paused" }),
        h("p", { class: "hint left", text: s.active ? "Customers can play right now." : "Customers see a paused message. Nothing is lost." })
      ]),
      toggle
    ]));

    // stats
    var range = h("select", { "aria-label": "Report period", onchange: function () { days = +this.value; load(); } },
      [7, 30, 90].map(function (d) { return h("option", { value: d, text: "Last " + d + " days" }); }));
    range.value = String(days);
    app.appendChild(section("Report", [
      h("div", { class: "field" }, [h("label", { text: "Period" }), range]),
      h("div", { class: "stats" }, [
        statTile(st.plays, "Plays"),
        statTile(st.wins, "Wins"),
        statTile(st.leads, "Customers"),
        statTile(st.redeemed, "Redeemed"),
        statTile(st.reviewTaps, "AI review taps"),
        statTile(st.reviews + (st.avgRating ? " · " + st.avgRating + "★" : ""), "Reviews"),
        statTile(st.instagramTaps, "Instagram taps"),
        statTile(st.whatsappTaps, "WhatsApp taps")
      ]),
      bars(data.daily)
    ]));

    app.appendChild(offersForm());
    app.appendChild(redeemBox());
    app.appendChild(customers());
    app.appendChild(reviews());
    app.appendChild(h("footer", { class: "footer" }, ["Powered by ", h("a", { href: "https://taprizz.in", target: "_blank", rel: "noopener", text: "taprizz.in" })]));
  }

  function bars(daily) {
    var max = Math.max.apply(null, daily.map(function (d) { return d.plays; }).concat([1]));
    return h("div", {}, [
      h("p", { class: "hint left", text: "Plays per day, last 14 days" }),
      h("div", { class: "bars", role: "img", "aria-label": "Plays per day for the last 14 days" },
        daily.map(function (d) {
          return h("div", { class: "bar", title: d.d + ": " + d.plays, style: "height:" + Math.max(3, Math.round(d.plays / max * 100)) + "%" });
        })),
      h("div", { class: "bar-axis" }, [h("span", { text: daily[0].d.slice(5) }), h("span", { text: daily[daily.length - 1].d.slice(5) })])
    ]);
  }

  // ---------- offers ----------
  var slotEls = [];
  function offersForm() {
    var s = data.store, pcts = toPercents(s.prizes), isWheel = s.game === "wheel";
    slotEls = [];
    var total = h("p", { class: "hint left" });
    var msg = h("p", { class: "hint left", role: "status" });

    function updateTotal() {
      var sum = slotEls.reduce(function (t, e) { return t + (+e.pct.value || 0); }, 0);
      total.textContent = "Chances add up to " + sum + "%" + (sum === 100 ? "." : ". They must add up to 100%.");
      total.className = "hint left" + (sum === 100 ? "" : " is-error");
      return sum;
    }

    var rows = s.prizes.map(function (p, i) {
      var label = h("input", { type: "text", maxlength: 60, value: p.label, placeholder: "Leave empty for no reward", id: "deal" + i });
      var short = h("input", { type: "text", maxlength: 14, value: p.short || "", placeholder: "Short text", id: "short" + i });
      var pct = h("input", { type: "number", min: 0, max: 100, step: 1, value: pcts[i], id: "pct" + i, inputmode: "numeric", oninput: updateTotal });
      slotEls.push({ label: label, short: short, pct: pct });
      return h("div", { class: "slot" }, [
        h("p", { class: "slot-title", text: "Slot " + (i + 1) }),
        h("div", { class: "field" }, [h("label", { for: "deal" + i, text: "Deal" }), label]),
        h("div", { class: "slot-row" }, [
          isWheel ? h("div", { class: "field" }, [h("label", { for: "short" + i, text: "Shown on wheel" }), short]) : null,
          h("div", { class: "field" }, [h("label", { for: "pct" + i, text: "Chance (%)" }), pct])
        ])
      ]);
    });

    var validDays = h("input", { type: "number", min: 1, max: 365, value: s.validDays, id: "validDays", inputmode: "numeric" });

    var save = h("button", { type: "button", class: "primary", text: "Save offers", onclick: function () {
      if (updateTotal() !== 100) { msg.textContent = "Chances must add up to 100%."; msg.className = "hint left is-error"; return; }
      saveOffers({
        prizes: slotEls.map(function (e) { return { label: e.label.value.trim(), short: e.short.value.trim(), weight: +e.pct.value || 0 }; }),
        validDays: +validDays.value, msgEl: msg
      });
    } });

    var box = section("Your offers", rows.concat([
      h("div", { class: "field" }, [h("label", { for: "validDays", text: "Coupon valid for (days)" }), validDays]),
      total, save, msg
    ]), "You decide what each slot gives. Leave a deal empty to make it a no-reward slot. Changes apply immediately; coupons already issued stay as they were.");
    updateTotal();
    return box;
  }

  function saveOffers(o) {
    var s = data.store;
    var body = {
      p_key: creds.s, p_token: creds.k,
      p_prizes: o.prizes || s.prizes,
      p_active: o.active === undefined ? s.active : o.active,
      p_valid_days: o.validDays || s.validDays
    };
    if (o.msgEl) { o.msgEl.textContent = "Saving…"; o.msgEl.className = "hint left"; }
    TQ.rpc("tq_owner_update", body).then(function () { return load(); }).then(function () {
      var m = document.querySelector('[role="status"]');
      if (m && o.prizes) { m.textContent = "Saved. Your offers are live."; }
    }, function (err) {
      if (o.msgEl) { o.msgEl.textContent = TQ.friendly(err); o.msgEl.className = "hint left is-error"; } else { alert(TQ.friendly(err)); }
    });
  }

  // ---------- redeem ----------
  var redeemState = null;   // survives a dashboard refresh, so the cashier still sees the last result

  function redeemBox() {
    var input = h("input", { type: "text", class: "code-input", placeholder: "CAFEXYZ-AB12CD", autocapitalize: "characters", spellcheck: "false", id: "rcode" });
    var out = h("div", { class: "result hidden", role: "status" });
    var go = h("div", { class: "btn-row" });

    function paint(st) {
      out.className = "result " + st.cls;
      out.innerHTML = "";
      out.appendChild(h("strong", { text: st.title }));
      st.lines.forEach(function (l) { if (l) out.appendChild(h("div", { text: l })); });
    }
    function show(cls, title, lines) {
      redeemState = { cls: cls, title: title, lines: lines, code: input.value };
      paint(redeemState);
    }
    if (redeemState) { input.value = redeemState.code; paint(redeemState); }

    function call(redeem) {
      var code = input.value.trim();
      if (!code) return;
      TQ.rpc("tq_owner_verify", { p_key: creds.s, p_token: creds.k, p_code: code, p_redeem: redeem }).then(function (r) {
        go.innerHTML = "";
        var who = [r.name, r.phone].filter(Boolean).join(" · ");
        if (r.status === "invalid") return show("bad", "Not valid", ["This code was not issued by your store."]);
        if (r.status === "expired") return show("bad", "Expired", [r.result, "Expired " + fmtDate(r.validUntil)]);
        if (r.status === "redeemed") return show("warn", "Already redeemed", [r.result, "Used " + fmtTime(r.redeemedAt)]);
        if (r.status === "redeemed_now") { load(); return show("ok", "Redeemed", [r.result, who]); }
        show("ok", "Valid coupon", [r.result, who, "Valid until " + fmtDate(r.validUntil)]);
        go.appendChild(h("button", { type: "button", class: "primary", text: "Redeem now", onclick: function () { call(true); } }));
      }, function (err) { show("bad", "Could not check", [TQ.friendly(err)]); });
    }

    return section("Verify and redeem", [
      h("div", { class: "field" }, [h("label", { for: "rcode", text: "Customer’s coupon code" }), input]),
      h("button", { type: "button", class: "secondary", text: "Check code", onclick: function () { call(false); } }),
      out, go
    ], "Check a coupon at billing, then mark it redeemed so it cannot be used twice.");
  }

  // ---------- customers ----------
  function status(p) {
    if (!p.isWin) return "No reward";
    if (p.redeemedAt) return "Redeemed " + fmtDate(p.redeemedAt);
    if (new Date(p.validUntil) < new Date()) return "Expired";
    return "Valid until " + fmtDate(p.validUntil);
  }

  function customers() {
    var list = data.plays;
    var rows = list.length ? list.map(function (p) {
      var digits = (p.phone || "").replace(/\D/g, "");
      return h("div", { class: "row" }, [
        h("div", { class: "row-main" }, [
          h("span", { class: "row-title", text: p.name || "Guest" }),
          p.phone ? h("a", { class: "row-link", href: "https://wa.me/" + digits, target: "_blank", rel: "noopener", text: p.phone }) : null
        ]),
        h("div", { class: "row-sub", text: p.isWin ? p.result : "No reward" }),
        h("div", { class: "row-meta", text: fmtTime(p.time) + " · " + status(p) + (p.code ? " · " + p.code : "") })
      ]);
    }) : [h("p", { class: "empty", text: "No plays yet. They will appear here as customers scan your QR." })];

    var exp = h("button", { type: "button", class: "secondary", text: "Export CSV", onclick: exportCsv });
    return section("Customers", [h("div", { class: "rows" }, rows), list.length ? exp : null], "Latest 300 plays. Tap a number to message the customer on WhatsApp.");
  }

  function exportCsv() {
    function cell(v) {
      v = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;           // stop spreadsheet formula injection
      return '"' + v.replace(/"/g, '""') + '"';
    }
    var lines = [["Time", "Name", "Phone", "Result", "Code", "Status"].join(",")];
    data.plays.forEach(function (p) {
      lines.push([fmtTime(p.time), p.name, p.phone, p.isWin ? p.result : "No reward", p.code, status(p)].map(cell).join(","));
    });
    var a = h("a", { href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })), download: data.store.key + "-customers.csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ---------- reviews ----------
  function reviews() {
    var list = data.reviews;
    var rows = list.length ? list.map(function (r) {
      return h("div", { class: "row" }, [
        h("div", { class: "row-main" }, [
          h("span", { class: "row-title", text: new Array(r.rating + 1).join("★") + new Array(6 - r.rating).join("☆") }),
          h("span", { class: "row-sub inline", text: r.reviewer || "Customer" })
        ]),
        r.review ? h("div", { class: "row-sub", text: r.review }) : null,
        h("div", { class: "row-meta", text: fmtTime(r.time) })
      ]);
    }) : [h("p", { class: "empty", text: "No reviews yet. Reviews written with the AI review tool will show up here." })];
    return section("AI reviews", [h("div", { class: "rows" }, rows)]);
  }

  load();
})();
