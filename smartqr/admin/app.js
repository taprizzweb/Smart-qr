(function () {
  "use strict";

  var cfg = window.SQ || {};
  var app = document.getElementById("app");
  var KEY = "sq:adminKey", NUDGE = "sq:installNudge";
  var COLORS = ["#2563eb", "#0e9f8e", "#16a34a", "#f59e0b", "#e11d48", "#7c3aed", "#ea580c", "#0f172a"];
  var RESERVED = ["admin", "assets", "vendor", "icons", "api", "config", "p", "sw", "sq"];
  var adminKey = null, deferredInstall = null, current = "";

  try { adminKey = localStorage.getItem(KEY) || null; } catch (e) { /* storage blocked */ }

  // ---------- small helpers ----------
  function h(tag, props, kids) {
    var el = document.createElement(tag), k;
    for (k in (props || {})) {
      var v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function icon(path, size) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", size || 22); s.setAttribute("height", size || 22); s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.9");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", path); s.appendChild(p);
    return s;
  }
  var ICONS = {
    dash: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    shops: "M4 9l1.2-4.5h13.6L20 9M4 9v10h16V9M4 9h16M9 19v-5h6v5",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    back: "M15 18l-6-6 6-6",
    plus: "M12 5v14M5 12h14",
    qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"
  };

  function lum(hex) {
    var n = parseInt(hex.slice(1), 16), f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  }
  function onColor(hex) { return /^#[0-9a-f]{6}$/i.test(hex) && lum(hex) > 0.4 ? "#10131a" : "#ffffff"; }
  function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase() || "?"; }
  function slugify(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }
  function base() { return String(cfg.base || location.origin).replace(/\/+$/, ""); }
  function pageUrl(slug) { return base() + "/" + slug; }
  function linkUrl(code) { return base() + "/sq/" + code; }
  // A QR printed with a temporary *.vercel.app address would stop working once the real domain is used.
  function tempAddress() { return !cfg.base && /\.vercel\.app$/i.test(location.hostname); }
  // Next free number for printed stands: the highest all-digit code plus one, kept at 3+ digits (001, 002 ...).
  function nextNumber(links) {
    var max = 0, width = 3;
    (links || []).forEach(function (l) { if (/^[0-9]{1,9}$/.test(l.code)) { max = Math.max(max, parseInt(l.code, 10)); width = Math.max(width, l.code.length); } });
    var n = String(max + 1); while (n.length < width) n = "0" + n;
    return n;
  }
  function randomCode() {
    var chars = "abcdefghjkmnpqrstuvwxyz23456789", out = "", a = new Uint32Array(6), i;
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (i = 0; i < 6; i++) out += chars.charAt(a[i] % chars.length);
    return out;
  }

  var toastTimer = null;
  function toast(msg, bad) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function copy(text, okMsg) {
    function done() { toast(okMsg || "Copied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else { fallback(); }
    function fallback() {
      var ta = h("textarea", { value: text, style: "position:fixed;opacity:0" }); document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Could not copy. Select and copy it by hand.", true); }
      document.body.removeChild(ta);
    }
  }

  // ---------- server calls ----------
  function rpc(name, args) {
    return fetch(cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify(args || {})
    }).then(function (res) {
      return res.text().then(function (t) {
        var body = null; try { body = t ? JSON.parse(t) : null; } catch (e) { /* ignore */ }
        if (!res.ok) { var err = new Error((body && body.message) || "http " + res.status); err.code = err.message; throw err; }
        return body;
      });
    }, function () { var e = new Error("offline"); e.code = "offline"; throw e; });
  }
  function errText(e) {
    var m = (e && e.message) || "";
    if (/Could not find the function|PGRST20[0-9]|schema cache|sq_links/.test(m) || m === "http 404") return "The database is not updated yet. Run the latest schema.sql in Supabase, then try again.";
    if (m === "offline") return "No connection. Check your internet and try again.";
    if (m === "forbidden") return "That admin key is not correct.";
    if (m === "name_required") return "Please enter the shop name.";
    if (m === "shop_not_found") return "This shop no longer exists.";
    if (/slug_check/.test(m)) return "Page link: use 2 to 40 lowercase letters, numbers or hyphens. Words like admin are reserved.";
    if (/review_url_check/.test(m)) return "The AI review link must start with https://";
    if (/map_url_check/.test(m)) return "The location link must start with https://";
    if (m === "code_taken") return "This QR number is already used. Choose another one.";
    if (m === "code_check") return "QR code name: 3 to 40 lowercase letters, numbers or hyphens.";
    if (m === "destination_required") return "Choose where this QR should open.";
    if (m === "link_not_found") return "This QR link no longer exists.";
    if (/sq_links_target_check/.test(m)) return "The link must start with https://";
    if (/website_check/.test(m)) return "The website link must start with https://";
    if (/bad_buttons/.test(m)) return "One of the extra buttons is not valid. Check its name and link.";
    if (/contact_phone_check/.test(m)) return "Contact phone: digits only, with country code.";
    if (/menu_url_check/.test(m)) return "The menu link must start with https://";
    if (/facebook_check/.test(m)) return "The Facebook link must start with https://";
    if (/zomato_check/.test(m)) return "The Zomato link must start with https://";
    if (/instagram_check/.test(m)) return "Instagram must be a handle or an https:// link.";
    if (/whatsapp_check/.test(m)) return "WhatsApp number: digits only, with country code.";
    if (/color_check/.test(m)) return "Please pick a valid colour.";
    if (/logo/.test(m)) return "That logo is too large or not a supported image.";
    return "Something went wrong. Please try again.";
  }
  // Wrap a server call: a wrong key sends you back to sign-in, anything else shows the reason.
  // Resolves to FAIL when the call did not succeed (a successful call can legitimately return null).
  var FAIL = { failed: true };
  function guarded(p, onFail) {
    return p.catch(function (e) {
      if (e.message === "forbidden") { signOut(); toast("Please sign in again.", true); return FAIL; }
      if (onFail) onFail(e); else toast(errText(e), true);
      return FAIL;
    });
  }

  function signOut() {
    adminKey = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    location.hash = "#/";
    route();
  }

  // ---------- input cleaning ----------
  function normUrl(v) {
    v = (v || "").trim();
    if (!v) return { ok: true, value: "" };
    if (/^https:\/\//i.test(v)) return { ok: true, value: v };
    if (/^http:\/\//i.test(v)) return { ok: true, value: "https://" + v.slice(7) };
    if (/^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(v)) return { ok: true, value: "https://" + v };
    return { ok: false };
  }
  function normIg(v) {
    v = (v || "").trim();
    if (!v) return { ok: true, value: "" };
    if (/^https?:\/\//i.test(v) || /^(www\.)?instagram\.com\//i.test(v)) { var u = normUrl(v); return u.ok && /instagram\.com/i.test(u.value) ? u : { ok: false }; }
    var handle = v.replace(/^@/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? { ok: true, value: "https://www.instagram.com/" + handle + "/" } : { ok: false };
  }
  function normWa(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (!d) return { ok: true, value: "" };
    if (d.length === 10) d = "91" + d;
    return d.length >= 8 && d.length <= 15 ? { ok: true, value: d } : { ok: false };
  }
  function normFb(v) {
    v = (v || "").trim();
    if (!v) return { ok: true, value: "" };
    if (/^https?:\/\//i.test(v) || /^(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)\//i.test(v)) { var u = normUrl(v); return u.ok && /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me)(\/|$|\?)/i.test(u.value) ? u : { ok: false }; }
    var handle = v.replace(/^@/, "");
    return /^[A-Za-z0-9.]{5,50}$/.test(handle) ? { ok: true, value: "https://www.facebook.com/" + handle } : { ok: false };
  }
  function waLabel(d) { return /^91\d{10}$/.test(d) ? "+91 " + d.slice(2, 7) + " " + d.slice(7) : "+" + d; }

  // ---------- logo: shrink any photo to a small web image ----------
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { resolve({ im: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      im.src = url;
    });
  }
  function encode(im, max, q) {
    var w = im.naturalWidth || 512, hh = im.naturalHeight || 512, s = Math.min(1, max / Math.max(w, hh));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(hh * s));
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    var out = c.toDataURL("image/webp", q);
    return /^data:image\/webp/.test(out) ? out : c.toDataURL("image/png");
  }
  function processLogo(file) {
    return readImage(file).then(function (r) {
      var sizes = [512, 384, 256], logo = "", i;
      for (i = 0; i < sizes.length; i++) { logo = encode(r.im, sizes[i], 0.9); if (logo.length <= 380000) break; }
      var thumb = "", ts = [96, 64, 48];
      for (i = 0; i < ts.length; i++) { thumb = encode(r.im, ts[i], 0.8); if (thumb.length <= 19000) break; }
      URL.revokeObjectURL(r.url);
      if (logo.length > 380000 || thumb.length > 19000) throw new Error("too big");
      return { logo: logo, thumb: thumb };
    });
  }

  // ---------- shared pieces ----------
  function screen(kids, opts) {
    app.innerHTML = "";
    var s = h("div", { class: "screen" + (opts && opts.bar ? " has-bar" : "") }, kids);
    app.appendChild(s);
    window.scrollTo(0, 0);
    return s;
  }
  function nav(active) {
    return h("nav", { class: "nav", "aria-label": "Main" }, [h("div", {}, [
      h("a", { href: "#/", "aria-current": active === "dash" ? "page" : null }, [icon(ICONS.dash), "Dashboard"]),
      h("a", { href: "#/shops", "aria-current": active === "shops" ? "page" : null }, [icon(ICONS.shops), "Shops"]),
      h("a", { href: "#/links", "aria-current": active === "links" ? "page" : null }, [icon(ICONS.qr), "QR links"]),
      h("a", { href: "#/settings", "aria-current": active === "settings" ? "page" : null }, [icon(ICONS.gear), "Settings"])
    ])]);
  }
  function thumb(s) {
    var t = h("div", { class: "thumb" });
    t.style.setProperty("--c", s.color || "#2563eb"); t.style.setProperty("--on", onColor(s.color));
    if (s.logoThumb || s.logo) t.appendChild(h("img", { src: s.logoThumb || s.logo, alt: "" })); else t.textContent = initials(s.name);
    return t;
  }
  function isStandalone() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }

  // ---------- views ----------
  function viewNoServer() {
    screen([h("div", { class: "login" }, [h("div", { class: "box" }, [
      h("h1", { text: "Server not connected" }),
      h("p", { text: "This app needs its server details before it can load shops. Add the project URL and key to config.js, then reopen the app." })
    ])])]);
  }

  function viewLogin(msg) {
    var input = h("input", { id: "key", type: "password", autocomplete: "current-password", placeholder: "Your admin key" });
    var err = h("p", { class: "err", role: "alert", style: "color:var(--danger);font-size:14px;margin:0 0 12px" }, [msg || ""]);
    var btn = h("button", { class: "btn primary", type: "submit", text: "Sign in" });
    var form = h("form", { onsubmit: function (e) {
      e.preventDefault();
      var k = input.value.trim(); if (!k) { err.textContent = "Enter your admin key."; return; }
      btn.disabled = true; btn.textContent = "Checking...";
      rpc("sq_admin_list", { p_key: k }).then(function () {
        adminKey = k; try { localStorage.setItem(KEY, k); } catch (x) { /* ignore */ }
        location.hash = "#/"; route();
      }, function (x) {
        btn.disabled = false; btn.textContent = "Sign in"; err.textContent = errText(x);
      });
    } }, [
      h("div", { class: "field" }, [h("label", { for: "key", text: "Admin key" }), input]),
      err, btn,
      h("p", { class: "muted", style: "margin:14px 0 0;font-size:13px", text: "Your key stays on this phone and is never shown again." })
    ]);
    screen([h("div", { class: "login" }, [h("div", { class: "box" }, [
      h("img", { class: "mark", src: "icons/icon-192.png", alt: "" }),
      h("h1", { text: "Smart QR Admin" }),
      h("p", { text: "Create and manage shop pages." }),
      form
    ])])]);
    input.focus();
  }

  var installDismissed = false;
  try { installDismissed = localStorage.getItem(NUDGE) === "1"; } catch (e) { /* ignore */ }

  function installCard(compact) {
    if (isStandalone()) return null;
    if (deferredInstall) {
      return h("div", { class: "card" }, [
        h("h3", { text: "Install this app" }),
        h("p", { class: "muted", style: "margin:4px 0 12px", text: "Put Smart QR Admin on your home screen. It opens full screen, like any app." }),
        h("div", { class: "row", style: "gap:8px" }, [
          h("button", { class: "btn primary", type: "button", text: "Install", onclick: function () {
            deferredInstall.prompt();
            deferredInstall.userChoice.then(function () { deferredInstall = null; route(); });
          } }),
          compact ? h("button", { class: "btn", type: "button", text: "Not now", onclick: function () {
            installDismissed = true; try { localStorage.setItem(NUDGE, "1"); } catch (e) { /* ignore */ } route();
          } }) : null
        ])
      ]);
    }
    if (isIos()) {
      return h("div", { class: "card" }, [
        h("h3", { text: "Install on iPhone" }),
        h("p", { class: "muted", style: "margin:4px 0 0", text: "In Safari, tap the Share button, then \"Add to Home Screen\"." })
      ]);
    }
    return compact ? null : h("div", { class: "card" }, [
      h("h3", { text: "Install this app" }),
      h("p", { class: "muted", style: "margin:4px 0 0", text: "Open this page in Chrome, tap the menu (three dots), then \"Install app\" or \"Add to Home screen\"." })
    ]);
  }

  var TAP_LABELS = [["review", "AI review"], ["map", "Location"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["website", "Website"], ["contact", "Contact saves"], ["menu", "Menu"], ["facebook", "Facebook"], ["zomato", "Zomato"], ["custom", "Extra buttons"], ["game", "Game opens"]];

  function viewDash() {
    current = "dash";
    var range = h("select", { "aria-label": "Period" }, [7, 30, 90].map(function (d) { return h("option", { value: d, text: "Last " + d + " days" }); }));
    range.value = "30";
    var body = h("div", {}, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
    var nudge = installDismissed ? null : installCard(true);
    screen([
      h("div", { class: "top" }, [
        h("div", {}, [h("h1", { text: "Dashboard" }), h("p", { class: "sub", text: "All your shops together" })]),
        h("a", { class: "btn primary small", href: "#/new" }, [icon(ICONS.plus, 18), "Add shop"])
      ]),
      nudge,
      h("div", { class: "field", style: "margin:12px 0 0" }, [range]),
      body,
      nav("dash")
    ]);
    function load() {
      guarded(rpc("sq_admin_overview", { p_key: adminKey, p_days: +range.value }), function (e) {
        body.innerHTML = "";
        body.appendChild(h("div", { class: "empty" }, [h("p", { text: errText(e) }), h("button", { class: "btn", type: "button", text: "Try again", onclick: load })]));
      }).then(function (r) {
        if (r === FAIL) return;
        body.innerHTML = "";
        if (!r.shops) {
          body.appendChild(h("div", { class: "empty" }, [
            h("h2", { text: "Welcome" }),
            h("p", { text: "Add your first shop to get its page link and QR code. Numbers appear here once people start scanning." }),
            h("a", { class: "btn primary", href: "#/new", style: "margin-top:12px" }, [icon(ICONS.plus, 18), "Add shop"])
          ]));
          return;
        }
        var c = r.counts || {}, taps = 0, k;
        for (k in c) if (k !== "view") taps += c[k];
        var max = Math.max.apply(null, r.daily.map(function (d) { return d.views; }).concat([1]));
        body.appendChild(h("div", { class: "card" }, [
          h("h2", { text: "Overview" }),
          h("div", { class: "kv" }, [
            h("div", {}, [h("b", { text: String(c.view || 0) }), h("span", { text: "Page views" })]),
            h("div", {}, [h("b", { text: String(taps) }), h("span", { text: "Button taps" })]),
            h("div", {}, [h("b", { text: r.live + "/" + r.shops }), h("span", { text: "Shops live" })])
          ]),
          h("div", { class: "bars", role: "img", "aria-label": "Page views per day, last 14 days" }, r.daily.map(function (d) {
            return h("i", { style: "height:" + Math.max(4, Math.round(d.views / max * 100)) + "%", title: d.d + ": " + d.views });
          })),
          h("div", { class: "axis" }, [h("span", { text: "14 days ago" }), h("span", { text: "Today" })])
        ]));
        body.appendChild(h("div", { class: "card" }, [
          h("h2", { text: "Which buttons get tapped" }),
          h("div", { class: "kv" }, TAP_LABELS.map(function (p) { return h("div", {}, [h("b", { text: String(c[p[0]] || 0) }), h("span", { text: p[1] })]); }))
        ]));
        var top = h("div", { class: "card" }, [h("h2", { text: "Top shops" })]);
        r.top.forEach(function (t) {
          top.appendChild(h("a", { class: "shop", style: "margin-top:8px", href: "#/shop/" + encodeURIComponent(t.slug) }, [
            h("div", { class: "meta" }, [h("b", { text: t.name }), h("span", { text: t.views + " views · " + t.taps + " taps" })]),
            h("div", { class: "end" }, [h("b", { class: t.active ? "" : "off", text: t.active ? "Live" : "Paused" })])
          ]));
        });
        top.appendChild(h("a", { class: "btn", href: "#/shops", style: "margin-top:12px;width:100%", text: "See all shops" }));
        body.appendChild(top);
      });
    }
    range.addEventListener("change", load);
    load();
  }

  function viewList() {
    current = "list";
    var holder = h("div", {}, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
    var search = h("input", { type: "search", placeholder: "Search shops", "aria-label": "Search shops" });
    var count = h("p", { class: "sub", text: "Loading..." });
    screen([
      h("div", { class: "top" }, [
        h("div", {}, [h("h1", { text: "Shops" }), count]),
        h("a", { class: "btn primary small", href: "#/new" }, [icon(ICONS.plus, 18), "Add shop"])
      ]),
      h("div", { class: "field search" }, [search]),
      holder,
      nav("shops")
    ]);

    var all = [];
    function paint() {
      var q = search.value.trim().toLowerCase();
      var list = all.filter(function (s) { return !q || (s.name + " " + (s.address || "") + " " + s.slug).toLowerCase().indexOf(q) > -1; });
      holder.innerHTML = "";
      if (!all.length) {
        holder.appendChild(h("div", { class: "empty" }, [
          h("h2", { text: "No shops yet" }),
          h("p", { text: "Add the first shop to get its page and QR code." }),
          h("a", { class: "btn primary", href: "#/new", style: "margin-top:12px" }, [icon(ICONS.plus, 18), "Add shop"])
        ]));
        return;
      }
      if (!list.length) { holder.appendChild(h("div", { class: "empty" }, [h("p", { text: "No shop matches \"" + search.value.trim() + "\"." })])); return; }
      list.forEach(function (s) {
        holder.appendChild(h("a", { class: "shop", href: "#/shop/" + encodeURIComponent(s.slug) }, [
          thumb(s),
          h("div", { class: "meta" }, [h("b", { text: s.name }), h("span", { text: s.address || pageUrl(s.slug).replace(/^https?:\/\//, "") })]),
          h("div", { class: "end" }, [h("b", { class: s.active ? "" : "off", text: s.active ? "Live" : "Paused" }), h("span", { text: (s.views30 || 0) + " views" })])
        ]));
      });
    }
    search.addEventListener("input", paint);

    guarded(rpc("sq_admin_list", { p_key: adminKey }), function (e) {
      holder.innerHTML = ""; count.textContent = "Could not load";
      holder.appendChild(h("div", { class: "empty" }, [h("p", { text: errText(e) }), h("button", { class: "btn", type: "button", text: "Try again", onclick: viewList })]));
    }).then(function (rows) {
      if (rows === FAIL) return;
      all = rows; count.textContent = rows.length + (rows.length === 1 ? " shop" : " shops"); paint();
    });
  }

  // ---------- QR links: <domain>/sq/<code> -> any destination you choose, changeable any time ----------
  function destText(l) { return l.shopSlug ? "Shop: " + (l.shopName || l.shopSlug) : String(l.target || "").replace(/^https?:\/\//, ""); }

  function viewLinks() {
    current = "links";
    var holder = h("div", {}, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
    var search = h("input", { type: "search", placeholder: "Search QR links", "aria-label": "Search QR links" });
    var count = h("p", { class: "sub", text: "Loading..." });
    screen([
      h("div", { class: "top" }, [
        h("div", {}, [h("h1", { text: "QR links" }), count]),
        h("a", { class: "btn primary small", href: "#/link/new" }, [icon(ICONS.plus, 18), "New QR"])
      ]),
      h("div", { class: "field search" }, [search]),
      holder,
      nav("links")
    ]);
    var all = [];
    function sortKey(l) { return /^[0-9]+$/.test(l.code) ? [0, parseInt(l.code, 10)] : [1, 0]; }
    function byCode(a, b) { var x = sortKey(a), y = sortKey(b); return x[0] - y[0] || x[1] - y[1] || a.code.localeCompare(b.code); }
    function destFull(l) { return l.shopSlug ? pageUrl(l.shopSlug) : (l.target || ""); }
    function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function downloadCsv() {
      var rows = [["Number", "QR link", "Business", "Note", "Opens", "Status", "Times opened", "Last opened"]].concat(all.slice().sort(byCode).map(function (l) {
        return [l.code, linkUrl(l.code), l.shopName || "", l.label || "", destFull(l), l.active ? "Live" : "Paused", l.clicks, l.lastOpened ? l.lastOpened.slice(0, 10) : ""];
      }));
      var blob = new Blob(["\ufeff" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n")], { type: "text/csv" });
      var a = h("a", { href: URL.createObjectURL(blob), download: "qr-list.csv" }); document.body.appendChild(a); a.click(); a.remove();
    }
    var csvBtn = h("button", { class: "btn small", type: "button", text: "Download list (CSV)", onclick: downloadCsv, hidden: true });
    holder.parentNode.insertBefore(h("div", { style: "margin:8px 0 0" }, [csvBtn]), holder);
    function paint() {
      var q = search.value.trim().toLowerCase();
      var list = all.filter(function (l) { return !q || (l.code + " " + (l.label || "") + " " + (l.shopName || "") + " " + destText(l)).toLowerCase().indexOf(q) > -1; }).sort(byCode);
      csvBtn.hidden = !all.length;
      holder.innerHTML = "";
      if (!all.length) {
        holder.appendChild(h("div", { class: "empty" }, [
          h("h2", { text: "No QR links yet" }),
          h("p", { text: "Make a permanent QR. Print it once, then change where it opens whenever you like." }),
          h("a", { class: "btn primary", href: "#/link/new", style: "margin-top:12px" }, [icon(ICONS.plus, 18), "New QR"])
        ]));
        return;
      }
      if (!list.length) { holder.appendChild(h("div", { class: "empty" }, [h("p", { text: "No QR link matches \"" + search.value.trim() + "\"." })])); return; }
      list.forEach(function (l) {
        var t = h("div", { class: "thumb num", text: l.code }); t.style.setProperty("--c", "#10131a"); t.style.setProperty("--on", "#ffffff");
        holder.appendChild(h("a", { class: "shop", href: "#/link/" + encodeURIComponent(l.code) }, [
          t,
          h("div", { class: "meta" }, [h("b", { text: l.shopName || l.label || "Any link" }), h("span", { text: "/sq/" + l.code + (l.shopName && l.label ? " · " + l.label : "") }), h("span", { text: "→ " + destFull(l).replace(/^https?:\/\//, "") })]),
          h("div", { class: "end" }, [h("b", { class: l.active ? "" : "off", text: l.active ? "Live" : "Paused" }), h("span", { text: l.clicks + (l.clicks === 1 ? " open" : " opens") })])
        ]));
      });
    }
    search.addEventListener("input", paint);
    guarded(rpc("sq_admin_links", { p_key: adminKey }), function (e) {
      holder.innerHTML = ""; count.textContent = "Could not load";
      holder.appendChild(h("div", { class: "empty" }, [h("p", { text: errText(e) }), h("button", { class: "btn", type: "button", text: "Try again", onclick: viewLinks })]));
    }).then(function (rows) {
      if (rows === FAIL) return;
      all = rows; count.textContent = rows.length + (rows.length === 1 ? " QR link" : " QR links"); paint();
    });
  }

  // Owner access for the red "Today's deal" box. The owner gets one private link and can change nothing else.
  function dealCard(src) {
    var out = h("div"), btn = h("button", { class: "btn small", type: "button", text: "Get manager link" });
    function show(token, fresh) {
      var url = base() + "/m/" + token, msg = "Hi! Here is your private link to set today's deal for your Smart QR. Open it, write the offer and tap Show on my page. You can only change the deal.\n" + url;
      out.innerHTML = "";
      out.appendChild(h("div", { class: "linkbox", style: "margin-top:12px" }, [h("span", { text: url })]));
      out.appendChild(h("div", { class: "actions3" }, [
        h("button", { class: "btn small", type: "button", text: "Copy link", onclick: function () { copy(url, "Manager link copied"); } }),
        h("a", { class: "btn small", href: "https://wa.me/?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener", text: "WhatsApp" }),
        h("button", { class: "btn small", type: "button", text: "New link", onclick: function () {
          if (window.confirm("Make a new manager link? The old link will stop working and today's deal will be removed.")) request(true);
        } })
      ]));
      if (fresh) toast("New manager link ready");
    }
    function request(reset) {
      btn.disabled = true;
      fetch("/api/offer?a=link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: adminKey, code: src.code, reset: !!reset }) })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (r) {
          btn.disabled = false;
          if (r.s === 200) return show(r.j.token, reset);
          if (r.s === 503) return toast(r.j.error === "not_configured" ? "The deal store is not set up yet. Finish the setup on Vercel first." : "The deal store is not reachable. Try again.", true);
          if (r.s === 403) return toast("Please sign in again.", true);
          toast("Something went wrong. Please try again.", true);
        }, function () { btn.disabled = false; toast("No connection. Check your internet and try again.", true); });
    }
    btn.addEventListener("click", function () { request(false); });
    return h("div", { class: "card" }, [h("h2", { text: "Deal and information (for the owner)" }),
      h("p", { class: "muted", style: "margin:0 0 12px", text: "Give the owner a private link. They can only write two boxes for this QR: the red Today's deal and a note under Information. Nothing else. The text is not saved in your database. A deal removes itself when its time is over." }),
      btn, out]);
  }

  function viewLinkEdit(code) {
    current = "linkedit";
    var isNew = !code;
    var top = h("div", { class: "top" }, [h("a", { class: "back", href: "#/links" }, [icon(ICONS.back, 20), "QR links"])]);
    screen([top, h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
    var shopsP = guarded(rpc("sq_admin_list", { p_key: adminKey }), function (e) { toast(errText(e), true); });
    var allLinksP = rpc("sq_admin_links", { p_key: adminKey }).catch(function () { return []; });
    var linkP = isNew ? Promise.resolve({ code: "", label: "", target: "", shopSlug: null, active: true, clicks: 0 }) : guarded(rpc("sq_admin_link_get", { p_key: adminKey, p_code: code }), function (e) {
      screen([top, h("div", { class: "empty" }, [h("p", { text: errText(e) })]), nav("links")]);
    });
    Promise.all([linkP, shopsP, allLinksP]).then(function (r) { if (r[0] !== FAIL && r[1] !== FAIL) build(r[0], r[1], r[2]); });

    function build(src, shops, allLinks) {
      var st = { code: src.code, label: src.label || "", mode: src.shopSlug || (isNew && shops.length) ? "shop" : "url", shopSlug: src.shopSlug || (shops[0] && shops[0].slug) || "", target: src.target || "", active: src.active !== false };
      if (!isNew && !src.shopSlug) st.mode = "url";
      var orig = JSON.stringify(st);
      var dirty = h("p", { class: "dirty", text: "Unsaved changes", hidden: true });
      function touch() { dirty.hidden = JSON.stringify(st) === orig; }
      function err(el, msg) {
        var f = el.closest(".field"), old = f.querySelector(".err"); if (old) old.remove();
        f.appendChild(h("span", { class: "err", role: "alert", text: msg })); el.focus();
      }

      var codeIn = h("input", { id: "l-code", type: "text", value: st.code, maxlength: "40", autocomplete: "off", autocapitalize: "none", spellcheck: "false", readonly: !isNew, placeholder: "table-5" });
      codeIn.addEventListener("input", function () { st.code = codeIn.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); if (codeIn.value !== st.code) codeIn.value = st.code; touch(); });
      var label = h("input", { id: "l-label", type: "text", value: st.label, maxlength: "80", autocomplete: "off", placeholder: "Table 5 standee" });
      label.addEventListener("input", function () { st.label = label.value; touch(); });
      var target = h("input", { id: "l-target", type: "url", value: st.target, inputmode: "url", autocomplete: "off", autocapitalize: "none", placeholder: "https://..." });
      target.addEventListener("input", function () { st.target = target.value; touch(); });
      var pick = h("select", { id: "l-shop", "aria-label": "Shop page" }, shops.map(function (s) { return h("option", { value: s.slug, text: s.name }); }));
      pick.value = st.shopSlug; pick.addEventListener("change", function () { st.shopSlug = pick.value; touch(); });
      var mode = h("select", { id: "l-mode", "aria-label": "Opens" }, [h("option", { value: "shop", text: "One of my shop pages" }), h("option", { value: "url", text: "Any link" })]);
      mode.value = st.mode;
      var shopField = h("div", { class: "field" }, [h("label", { for: "l-shop", text: "Shop page" }), pick, shops.length ? null : h("span", { class: "hint", text: "No shops yet. Use Any link, or add a shop first." })]);
      var urlField = h("div", { class: "field" }, [h("label", { for: "l-target", text: "Link" }), target, h("span", { class: "hint", text: "Must start with https://. You can change it any time and the printed QR keeps working." })]);
      function paintMode() { shopField.hidden = st.mode !== "shop"; urlField.hidden = st.mode !== "url"; }
      mode.addEventListener("change", function () { st.mode = mode.value; paintMode(); touch(); });
      paintMode();

      var nextNo = nextNumber(allLinks);
      var gen = isNew ? h("div", { class: "row", style: "justify-content:flex-start;gap:8px;flex-wrap:wrap" }, [
        h("button", { class: "btn small", type: "button", text: "Use next number " + nextNo, onclick: function () { st.code = nextNo; codeIn.value = nextNo; touch(); } }),
        h("button", { class: "btn small", type: "button", text: "Make a random code", onclick: function () { st.code = randomCode(); codeIn.value = st.code; touch(); } })
      ]) : null;
      var cb = h("input", { type: "checkbox", role: "switch", "aria-label": "QR is active" }); cb.checked = st.active;
      cb.addEventListener("change", function () { st.active = cb.checked; touch(); });

      var saveBtn = h("button", { class: "btn primary", type: "button", text: isNew ? "Create QR link" : "Save changes" });
      saveBtn.addEventListener("click", function () {
        Array.prototype.forEach.call(app.querySelectorAll(".field .err"), function (n) { n.remove(); });
        var body = { code: isNew ? st.code.trim() : src.code, label: st.label.trim(), active: !!st.active };
        if (isNew && !/^[a-z0-9-]{3,40}$/.test(body.code)) return err(codeIn, "Use 3 to 40 lowercase letters, numbers or hyphens.");
        if (st.mode === "shop") { if (!st.shopSlug) return err(pick, "Choose a shop page."); body.shopSlug = st.shopSlug; }
        else { var u = normUrl(st.target); if (!u.ok || !u.value) return err(target, "Enter a link that starts with https://"); body.target = u.value; }
        if (isNew) body.create = true;
        saveBtn.disabled = true; saveBtn.textContent = "Saving...";
        guarded(rpc("sq_admin_link_save", { p_key: adminKey, p_link: body }), function (e) { toast(errText(e), true); }).then(function (r) {
          saveBtn.disabled = false; saveBtn.textContent = isNew ? "Create QR link" : "Save changes";
          if (r === FAIL) return;
          toast(r.created ? "QR link created" : "Saved");
          if (r.created) location.hash = "#/link/" + encodeURIComponent(r.code); else viewLinkEdit(src.code);
        });
      });

      var kids = [
        top,
        h("div", { class: "top", style: "min-height:0;margin-bottom:8px" }, [h("h1", { text: isNew ? "New QR link" : (src.label || "/sq/" + src.code) })]),
        h("div", { class: "card" }, [h("h2", { text: "QR code" }),
          h("div", { class: "field" }, [h("label", { for: "l-code", text: "Code in the link" }),
            h("div", { class: "prefix" }, [h("span", { text: base().replace(/^https?:\/\//, "") + "/sq/" }), codeIn]),
            h("span", { class: "hint", text: isNew ? "Printed in the QR, so choose it once. It cannot be changed later." : "Fixed, because the QR code points here." }), gen]),
          h("div", { class: "field" }, [h("label", { for: "l-label", text: "Note for yourself (optional)" }), label])]),
        h("div", { class: "card" }, [h("h2", { text: "Opens" }),
          h("div", { class: "field" }, [h("label", { for: "l-mode", text: "This QR opens" }), mode]),
          shopField, urlField]),
        h("div", { class: "card" }, [h("h2", { text: "Status" }),
          h("div", { class: "setting" }, [h("div", {}, [h("b", { text: "QR is active" }), h("small", { text: "Turn off to pause it. People scanning see a short \"not active\" message." })]), h("label", { class: "switch" }, [cb, h("i")])])])
      ];

      if (!isNew) {
        var delWrap = h("div");
        kids.push(
          h("div", { class: "card" }, [h("h2", { text: "Share" }),
            tempAddress() ? h("p", { class: "warn", role: "alert", text: "This address is temporary. Set your own domain before printing." }) : null,
            h("div", { class: "linkbox" }, [h("span", { text: linkUrl(src.code) })]),
            h("div", { class: "actions3" }, [
              h("button", { class: "btn small", type: "button", text: "Copy link", onclick: function () { copy(linkUrl(src.code), "Link copied"); } }),
              h("a", { class: "btn small", href: linkUrl(src.code), target: "_blank", rel: "noopener", text: "Test it" }),
              h("button", { class: "btn small", type: "button", text: "QR code", onclick: function () { openQrUrl({ title: src.label || "/sq/" + src.code, url: linkUrl(src.code), file: "sq-" + src.code }); } })
            ])]),
          dealCard(src),
          h("div", { class: "card" }, [h("h2", { text: "Numbers" }),
            h("div", { class: "kv" }, [
              h("div", {}, [h("b", { text: String(src.clicks || 0) }), h("span", { text: "Times opened" })]),
              h("div", {}, [h("b", { style: "font-size:16px", text: src.lastOpened ? new Date(src.lastOpened).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Never" }), h("span", { text: "Last opened" })])
            ])]),
          h("div", { class: "card" }, [h("h2", { text: "Delete" }),
            h("p", { class: "muted", style: "margin:0 0 12px", text: "Removes this QR link. A printed QR with this code will show \"not active\"." }),
            h("button", { class: "btn danger", type: "button", text: "Delete this QR link...", onclick: function () {
              confirmDelete(delWrap, { typed: src.code, button: "Delete QR link", keep: "Keep it", done: "QR link deleted", hash: "#/links",
                call: function () { return rpc("sq_admin_link_delete", { p_key: adminKey, p_code: src.code }); } });
            } }), delWrap])
        );
      }
      kids.push(h("div", { class: "bar" }, [h("div", {}, [h("a", { class: "btn", href: "#/links", text: "Cancel" }), saveBtn, dirty])]));
      screen(kids, { bar: true });
    }
  }

  function viewSettings() {
    current = "settings";
    var status = h("p", { class: "muted", style: "margin:4px 0 0", text: "Checking..." });
    screen([
      h("div", { class: "top" }, [h("div", {}, [h("h1", { text: "Settings" })])]),
      installCard(false),
      h("div", { class: "card" }, [
        h("h2", { text: "Server" }),
        h("div", { class: "row" }, [h("b", { style: "font-weight:500", text: cfg.url.replace(/^https?:\/\//, "") })]),
        status
      ]),
      h("div", { class: "card" }, [
        h("h2", { text: "Shop pages" }),
        h("p", { class: "muted", style: "margin:0", text: "Pages open at " + base().replace(/^https?:\/\//, "") + "/shop-name" })
      ]),
      h("div", { class: "card" }, [
        h("h2", { text: "Account" }),
        h("button", { class: "btn danger", type: "button", text: "Sign out of this phone", onclick: signOut })
      ]),
      h("p", { class: "muted", style: "text-align:center;margin:20px 0 0;font-size:12px", text: "Smart QR Admin 1.0 · Powered by Taprizz" }),
      nav("settings")
    ]);
    guarded(rpc("sq_admin_list", { p_key: adminKey }), function () { status.textContent = "Can't reach the server."; }).then(function (rows) {
      if (rows !== FAIL) status.textContent = "Connected. " + rows.length + (rows.length === 1 ? " shop." : " shops.");
    });
  }

  function viewEdit(slug) {
    current = "edit";
    var isNew = !slug;
    var blank = { slug: "", name: "", address: "", color: "#2563eb", reviewUrl: "", mapUrl: "", whatsapp: "", instagram: "", website: "", zomato: "", menuUrl: "", facebook: "", saveContact: false, contactPhone: "", buttons: [], gameOn: true, active: true, logo: null, logoThumb: null };
    screen([h("div", { class: "top" }, [h("a", { class: "back", href: "#/shops" }, [icon(ICONS.back, 20), "Shops"])]), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
    var linksP = rpc("sq_admin_links", { p_key: adminKey }).catch(function () { return []; });
    if (isNew) { linksP.then(function (l) { build(blank, l); }); return; }
    guarded(rpc("sq_admin_get", { p_key: adminKey, p_slug: slug }), function (e) {
      screen([h("div", { class: "top" }, [h("a", { class: "back", href: "#/shops" }, [icon(ICONS.back, 20), "Shops"])]),
        h("div", { class: "empty" }, [h("p", { text: errText(e) })]), nav("shops")]);
    }).then(function (s) { if (s !== FAIL) linksP.then(function (l) { build(s, l); }); });

    function build(src, links) {
      var st = JSON.parse(JSON.stringify(src));
      ["address", "reviewUrl", "mapUrl", "whatsapp", "instagram", "website", "zomato", "menuUrl", "facebook"].forEach(function (k) { if (st[k] == null) st[k] = ""; });
      st.buttons = (st.buttons || []).map(function (b) { return { kind: b.kind, label: b.label, value: b.kind === "call" ? waLabel(b.value) : b.value }; });
      st.qrCode = ""; st.contactPhoneRaw = st.contactPhone ? waLabel(st.contactPhone) : "";
      st.color = String(st.color || "#2563eb").toLowerCase();
      st.whatsappRaw = st.whatsapp ? waLabel(st.whatsapp) : ""; st.instagramRaw = st.instagram; st.logoChanged = false;
      var orig = JSON.stringify(st), slugTouched = !isNew;

      // preview
      var pv = h("div", { class: "preview", "aria-label": "Preview of the page" });
      function paintPreview() {
        pv.style.setProperty("--c", st.color); pv.style.setProperty("--on", onColor(st.color));
        pv.innerHTML = "";
        pv.appendChild(h("div", { class: "pw" }, [h("span", { text: "Powered by Taprizz" })]));
        pv.appendChild(h("h3", { text: st.name || "Shop name" }));
        pv.appendChild(h("p", { text: st.address || " " }));
        var two = h("div", { class: "two" }, []);
        two.appendChild(h("i")); if (st.whatsappRaw) two.appendChild(h("i"));
        var more = [];
        if (st.saveContact) more.push(h("i"));
        if (st.menuUrl.trim()) more.push(h("i"));
        if (st.facebook.trim()) more.push(h("i"));
        if (st.website.trim()) more.push(h("i"));
        if (st.zomato.trim()) more.push(h("i", { style: "background:#e23744" }));
        st.buttons.forEach(function () { more.push(h("i")); });
        pv.appendChild(h("div", { class: "bx" }, [st.reviewUrl ? h("i", { style: "height:46px" }) : null, two, st.instagramRaw ? h("i") : null].concat(more, [st.gameOn ? h("i", { class: "dark" }) : null])));
        var lg = h("div", { class: "lg" });
        if (st.logo || st.logoThumb) lg.appendChild(h("img", { src: st.logo || st.logoThumb, alt: "" }));
        else lg.appendChild(h("div", { class: "mono", text: initials(st.name) }));
        pv.appendChild(lg);
      }

      var dirty = h("p", { class: "dirty", text: "Unsaved changes", hidden: true });
      function touch() { paintPreview(); dirty.hidden = JSON.stringify(st) === orig; }

      function bind(input, key, after) {
        input.addEventListener("input", function () { st[key] = input.value; if (after) after(); touch(); });
        return input;
      }
      var name = bind(h("input", { id: "f-name", type: "text", value: st.name, maxlength: "80", autocomplete: "off", placeholder: "Jaipur Vistas Cafe" }), "name", function () {
        if (isNew && !slugTouched) { st.slug = slugify(st.name); slugIn.value = st.slug; }
      });
      var address = bind(h("input", { id: "f-address", type: "text", value: st.address, maxlength: "160", autocomplete: "off", placeholder: "Branch address" }), "address");
      var slugIn = h("input", { id: "f-slug", type: "text", value: st.slug, maxlength: "40", autocomplete: "off", autocapitalize: "none", spellcheck: "false", readonly: !isNew, placeholder: "jaipur-vistas-cafe" });
      slugIn.addEventListener("input", function () { slugTouched = true; st.slug = slugIn.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); if (slugIn.value !== st.slug) slugIn.value = st.slug; touch(); });
      var review = bind(h("input", { id: "f-review", type: "url", value: st.reviewUrl, inputmode: "url", autocomplete: "off", placeholder: "https://reviews.taprizz.in/..." }), "reviewUrl");
      var map = bind(h("input", { id: "f-map", type: "url", value: st.mapUrl, inputmode: "url", autocomplete: "off", placeholder: "Paste the Google Maps link" }), "mapUrl");
      var wa = h("input", { id: "f-wa", type: "tel", value: st.whatsappRaw, inputmode: "tel", autocomplete: "off", placeholder: "98765 43210" });
      var waHint = h("span", { class: "hint", text: "With or without +91. We add 91 to 10-digit numbers." });
      wa.addEventListener("input", function () {
        st.whatsappRaw = wa.value; var n = normWa(wa.value);
        waHint.textContent = n.ok && n.value ? "Opens WhatsApp chat with " + waLabel(n.value) : n.ok ? "With or without +91. We add 91 to 10-digit numbers." : "Enter a valid number.";
        touch();
      });
      var website = bind(h("input", { id: "f-web", type: "url", value: st.website, inputmode: "url", autocomplete: "off", autocapitalize: "none", placeholder: "www.yourshop.com" }), "website");

      var myLinks = (links || []).filter(function (l) { return l.shopSlug === src.slug && !isNew; });
      var nextNo = nextNumber(links);
      var qrIn = h("input", { id: "f-qr", type: "text", value: "", maxlength: "40", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: nextNo });
      qrIn.addEventListener("input", function () { st.qrCode = qrIn.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); if (qrIn.value !== st.qrCode) qrIn.value = st.qrCode; touch(); });
      var useNext = h("button", { class: "btn small", type: "button", text: "Use " + nextNo, onclick: function () { st.qrCode = nextNo; qrIn.value = nextNo; touch(); } });
      var qrList = myLinks.length ? h("div", { class: "chips" }, myLinks.map(function (l) {
        return h("a", { class: "chip", href: "#/link/" + encodeURIComponent(l.code) }, [l.code, h("small", { text: l.clicks + (l.clicks === 1 ? " open" : " opens") })]);
      })) : null;
      var cpIn = h("input", { id: "f-cphone", type: "tel", value: st.contactPhoneRaw, inputmode: "tel", autocomplete: "off", placeholder: "Empty uses the WhatsApp number" });
      cpIn.addEventListener("input", function () { st.contactPhoneRaw = cpIn.value; touch(); });
      var menuIn = bind(h("input", { id: "f-menu", type: "url", value: st.menuUrl, inputmode: "url", autocomplete: "off", autocapitalize: "none", placeholder: "Link to your menu (website, PDF, Drive)" }), "menuUrl");
      var fbIn = bind(h("input", { id: "f-fb", type: "text", value: st.facebook, autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "Page name or facebook.com link" }), "facebook");
      var zomato = bind(h("input", { id: "f-zomato", type: "url", value: st.zomato, inputmode: "url", autocomplete: "off", autocapitalize: "none", placeholder: "Paste the Zomato restaurant link" }), "zomato");

      // extra buttons (owner's own: menu, booking, offer, call, email...)
      var MAXB = 6, btnList = h("div"), addBtn = h("button", { class: "btn small", type: "button", onclick: function () {
        if (st.buttons.length >= MAXB) return;
        st.buttons.push({ kind: "link", label: "", value: "" }); paintButtons(); touch();
        var rows = btnList.querySelectorAll(".btrow input"); if (rows.length) rows[rows.length - 2].focus();
      } });
      var KIND_HINT = { link: ["Button name, e.g. View menu", "https://..."], call: ["Button name, e.g. Call us", "98765 43210"], email: ["Button name, e.g. Email us", "hello@shop.com"] };
      function paintButtons() {
        btnList.innerHTML = "";
        st.buttons.forEach(function (b, i) {
          var kind = h("select", { "aria-label": "Button type " + (i + 1) }, [h("option", { value: "link", text: "Open a link" }), h("option", { value: "call", text: "Phone call" }), h("option", { value: "email", text: "Email" })]);
          kind.value = b.kind;
          var label = h("input", { type: "text", maxlength: "28", value: b.label, autocomplete: "off", "aria-label": "Button name " + (i + 1), placeholder: KIND_HINT[b.kind][0] });
          var value = h("input", { type: "text", value: b.value, autocomplete: "off", autocapitalize: "none", spellcheck: "false", "aria-label": "Button destination " + (i + 1), placeholder: KIND_HINT[b.kind][1], inputmode: b.kind === "call" ? "tel" : b.kind === "email" ? "email" : "url" });
          kind.addEventListener("change", function () { b.kind = kind.value; b.value = ""; paintButtons(); touch(); });
          label.addEventListener("input", function () { b.label = label.value; touch(); });
          value.addEventListener("input", function () { b.value = value.value; touch(); });
          btnList.appendChild(h("div", { class: "field btrow" }, [
            h("div", { class: "hd" }, [kind, h("button", { class: "btn small", type: "button", "aria-label": "Remove button " + (i + 1), text: "Remove", onclick: function () { st.buttons.splice(i, 1); paintButtons(); touch(); } })]),
            label, value
          ]));
        });
        addBtn.textContent = st.buttons.length ? "Add another button" : "Add a button";
        addBtn.hidden = st.buttons.length >= MAXB;
      }
      var ig = bind(h("input", { id: "f-ig", type: "text", value: st.instagramRaw, autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "@handle or link" }), "instagramRaw");

      // colour
      var swWrap = h("div", { class: "swatches", role: "group", "aria-label": "Page colour" });
      var custom = h("input", { type: "color", value: st.color, "aria-label": "Pick any colour" });
      function paintSw() { Array.prototype.forEach.call(swWrap.querySelectorAll(".sw"), function (b) { b.setAttribute("aria-pressed", b.dataset.c === st.color.toLowerCase() ? "true" : "false"); }); custom.value = st.color; }
      COLORS.forEach(function (c) {
        var b = h("button", { class: "sw", type: "button", "data-c": c, "aria-label": "Colour " + c, "aria-pressed": "false", onclick: function () { st.color = c; paintSw(); touch(); } });
        b.style.setProperty("--s", c); swWrap.appendChild(b);
      });
      custom.addEventListener("input", function () { st.color = custom.value; paintSw(); touch(); });
      swWrap.appendChild(custom);

      // logo
      var logoMsg = h("p", { class: "hint", style: "margin:8px 0 0", text: "A clear PNG or JPG works best. We shrink it for you.", role: "status" });
      var logoThumb = h("div", { class: "thumb" });
      var fileIn = h("input", { class: "sr", id: "f-logo", type: "file", accept: "image/*" });
      var addLbl = h("label", { class: "btn small", for: "f-logo", text: "Add logo" });
      var rm = h("button", { class: "btn small", type: "button", text: "Remove", onclick: function () {
        st.logo = null; st.logoThumb = null; st.logoChanged = true; fileIn.value = ""; logoMsg.textContent = "Logo removed. Save to keep it."; paintLogo(); touch();
      } });
      function paintLogo() {
        logoThumb.innerHTML = ""; logoThumb.style.setProperty("--c", st.color); logoThumb.style.setProperty("--on", onColor(st.color));
        if (st.logo || st.logoThumb) logoThumb.appendChild(h("img", { src: st.logo || st.logoThumb, alt: "Current logo" })); else logoThumb.textContent = initials(st.name);
        addLbl.textContent = st.logo || st.logoThumb ? "Change logo" : "Add logo"; rm.hidden = !(st.logo || st.logoThumb);
      }
      fileIn.addEventListener("change", function () {
        var f = fileIn.files && fileIn.files[0]; if (!f) return;
        if (!/^image\//.test(f.type)) { logoMsg.textContent = "Please choose an image file."; fileIn.value = ""; return; }
        logoMsg.textContent = "Preparing logo...";
        processLogo(f).then(function (r) {
          st.logo = r.logo; st.logoThumb = r.thumb; st.logoChanged = true; logoMsg.textContent = "Logo ready. Save to keep it."; paintLogo(); touch();
        }, function () { logoMsg.textContent = "That image could not be used. Try a different file."; fileIn.value = ""; });
      });

      function toggle(key, title, sub) {
        var cb = h("input", { type: "checkbox", role: "switch", "aria-label": title }); cb.checked = !!st[key];
        cb.addEventListener("change", function () { st[key] = cb.checked; touch(); });
        return h("div", { class: "setting" }, [h("div", {}, [h("b", { text: title }), h("small", { text: sub })]), h("label", { class: "switch" }, [cb, h("i")])]);
      }
      function field(label, id, input, hint, extra) {
        return h("div", { class: "field" }, [h("label", { for: id, text: label }), input, hint ? (typeof hint === "string" ? h("span", { class: "hint", text: hint }) : hint) : null, extra || null]);
      }
      function err(el, msg) {
        var f = el.closest(".field"), old = f.querySelector(".err"); if (old) old.remove();
        f.appendChild(h("span", { class: "err", role: "alert", text: msg })); el.focus();
      }
      function clearErrs() { Array.prototype.forEach.call(app.querySelectorAll(".field .err"), function (n) { n.remove(); }); }

      // save
      var saveBtn = h("button", { class: "btn primary", type: "button", text: isNew ? "Create shop" : "Save changes" });
      saveBtn.addEventListener("click", function () {
        clearErrs();
        var nm = st.name.trim(); if (!nm) return err(name, "Please enter the shop name.");
        var sg = st.slug.trim(); if (isNew) {
          if (!/^[a-z0-9-]{2,40}$/.test(sg)) return err(slugIn, "Use 2 to 40 lowercase letters, numbers or hyphens.");
          if (RESERVED.indexOf(sg) > -1) return err(slugIn, "\"" + sg + "\" is reserved. Choose another link.");
        }
        var u1 = normUrl(st.reviewUrl); if (!u1.ok) return err(review, "Enter a link that starts with https://");
        var u2 = normUrl(st.mapUrl); if (!u2.ok) return err(map, "Enter a link that starts with https://");
        var w = normWa(st.whatsappRaw); if (!w.ok) return err(wa, "Enter a valid WhatsApp number.");
        var i = normIg(st.instagramRaw); if (!i.ok) return err(ig, "Enter an Instagram handle like @shopname, or a link.");
        var cpn = normWa(st.contactPhoneRaw); if (!cpn.ok) return err(cpIn, "Enter a valid phone number.");
        if (st.saveContact && !cpn.value && !w.value) return err(cpIn, "Add a phone number (here or as the WhatsApp number) for the contact.");
        var mu = normUrl(st.menuUrl); if (!mu.ok) return err(menuIn, "Enter the menu link, it starts with https://");
        var fbn = normFb(st.facebook); if (!fbn.ok) return err(fbIn, "Enter your Facebook page name or a facebook.com link.");
        var wb = normUrl(st.website); if (!wb.ok) return err(website, "Enter a website like www.yourshop.com");
        var zm = normUrl(st.zomato); if (!zm.ok) return err(zomato, "Enter the Zomato link, it starts with https://");
        if (zm.value && !/^https:\/\/([a-z0-9-]+\.)*(zomato\.com|zoma\.to)(\/|$|\?)/i.test(zm.value)) return err(zomato, "This does not look like a Zomato link (zomato.com or zoma.to).");
        var btns = [], bi;
        for (bi = 0; bi < st.buttons.length; bi++) {
          var b = st.buttons[bi], rowIn = btnList.querySelectorAll(".btrow")[bi].querySelectorAll("input"), bl = String(b.label || "").trim(), bv = String(b.value || "").trim(), nv;
          if (!bl) return err(rowIn[0], "Give button " + (bi + 1) + " a name.");
          if (b.kind === "link") { nv = normUrl(bv); if (!nv.ok || !nv.value) return err(rowIn[1], "Enter a link like www.yourshop.com/menu"); bv = nv.value; }
          else if (b.kind === "call") { nv = normWa(bv); if (!nv.ok || !nv.value) return err(rowIn[1], "Enter a valid phone number."); bv = nv.value; }
          else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bv)) return err(rowIn[1], "Enter a valid email address.");
          btns.push({ kind: b.kind, label: bl, value: bv });
        }
        var qrNo = st.qrCode.trim();
        if (qrNo && !/^[a-z0-9-]{3,40}$/.test(qrNo)) return err(qrIn, "QR number: 3 to 40 letters, numbers or hyphens, like " + nextNo + ".");
        var body = { slug: isNew ? sg : st.slug, name: nm, address: st.address.trim(), color: st.color, reviewUrl: u1.value, mapUrl: u2.value,
          whatsapp: w.value, instagram: i.value, website: wb.value, zomato: zm.value, menuUrl: mu.value, facebook: fbn.value, saveContact: !!st.saveContact, contactPhone: cpn.value, buttons: btns, gameOn: !!st.gameOn, active: !!st.active };
        if (st.logoChanged) { body.logo = st.logo; body.logoThumb = st.logoThumb; }
        if (qrNo) body.qrCode = qrNo;
        saveBtn.disabled = true; saveBtn.textContent = "Saving...";
        guarded(rpc("sq_admin_save", { p_key: adminKey, p_shop: body }), function (e) {
          if (qrNo && (e.message === "code_taken" || e.message === "code_check")) err(qrIn, errText(e)); else toast(errText(e), true);
        }).then(function (r) {
          saveBtn.disabled = false; saveBtn.textContent = isNew ? "Create shop" : "Save changes";
          if (r === FAIL) return;
          toast((r.created ? "Shop created" : "Saved") + (r.qrCode ? ". QR: /sq/" + r.qrCode : ""));
          if (r.created) location.hash = "#/shop/" + encodeURIComponent(r.slug); else viewEdit(st.slug);
        });
      });

      var kids = [
        h("div", { class: "top" }, [h("a", { class: "back", href: "#/shops" }, [icon(ICONS.back, 20), "Shops"])]),
        h("div", { class: "top", style: "min-height:0;margin-bottom:8px" }, [h("h1", { text: isNew ? "New shop" : (src.name || "Shop") })]),
        pv,
        h("div", { class: "card" }, [h("h2", { text: "Shop" }),
          field("Shop name", "f-name", name),
          field("Branch address", "f-address", address),
          field("Page link", "f-slug", h("div", { class: "prefix" }, [h("span", { text: base().replace(/^https?:\/\//, "") + "/" }), slugIn]),
            isNew ? "Printed in the QR code, so choose it once. It cannot be changed later." : "Fixed, because the QR code points here.")]),
        h("div", { class: "card" }, [h("h2", { text: "QR number" }),
          qrList,
          h("div", { class: "field", style: qrList ? "margin-top:12px" : "" }, [
            h("label", { for: "f-qr", text: myLinks.length ? "Add another QR number (optional)" : "QR number (optional)" }),
            h("div", { class: "prefix" }, [h("span", { text: base().replace(/^https?:\/\//, "") + "/sq/" }), qrIn]),
            h("span", { class: "hint", text: "Type a number like " + nextNo + " and this shop's QR becomes " + base().replace(/^https?:\/\//, "") + "/sq/" + nextNo + ". Next free number: " + nextNo + "." }),
            useNext])]),
        h("div", { class: "card" }, [h("h2", { text: "Look" }),
          h("div", { class: "field" }, [h("span", { class: "lbl", text: "Page colour" }), swWrap, h("span", { class: "hint", text: "The page background fades from this colour." })]),
          h("div", { class: "field" }, [h("span", { class: "lbl", text: "Shop logo" }), h("div", { class: "logo-row" }, [logoThumb, h("div", { class: "acts" }, [addLbl, fileIn, rm])]), logoMsg])]),
        h("div", { class: "card" }, [h("h2", { text: "Buttons on the page" }),
          field("AI review link", "f-review", review, "Leave empty to hide the AI Review button."),
          field("Location link", "f-map", map, "Empty uses a Google Maps search for the shop name and address."),
          field("WhatsApp number", "f-wa", wa, waHint),
          toggle("saveContact", "Save to contacts button", "Customers tap once to save your name and number in their phone."),
          field("Contact phone", "f-cphone", cpIn, "Used for the Save to contacts button. Empty uses the WhatsApp number."),
          field("Menu", "f-menu", menuIn, "Optional. Shows a View our menu button with a food icon. Empty hides it."),
          field("Instagram", "f-ig", ig, "Empty hides the Instagram button."),
          field("Facebook", "f-fb", fbIn, "Optional. Page name or link. Empty hides the Facebook button."),
          field("Website", "f-web", website, "Optional. Empty hides the website button."),
          field("Zomato", "f-zomato", zomato, "Optional. Shows a red Zomato button. Empty hides it."),
          toggle("gameOn", "Quick game button", "A fun spin wheel. Nothing is saved.")]),
        h("div", { class: "card" }, [h("h2", { text: "More buttons" }),
          h("p", { class: "muted", style: "margin:-4px 0 14px", text: "Add your own buttons, up to 6: menu, booking, offers, call, email." }),
          btnList, addBtn]),
        h("div", { class: "card" }, [h("h2", { text: "Status" }), toggle("active", "Page is live", "Turn off to pause the page. The QR shows a short break message.")])
      ];

      if (!isNew) {
        var linkText = h("span", { text: pageUrl(src.slug) });
        var delWrap = h("div");
        var statsBox = h("div", {}, [h("p", { class: "muted", text: "Loading numbers..." })]);
        var range = h("select", { "aria-label": "Period" }, [7, 30, 90].map(function (d) { return h("option", { value: d, text: "Last " + d + " days" }); }));
        range.value = "30";
        function loadStats() {
          guarded(rpc("sq_admin_stats", { p_key: adminKey, p_slug: src.slug, p_days: +range.value }), function () { statsBox.textContent = "Could not load the numbers."; }).then(function (r) {
            if (r === FAIL) return;
            var c = r.counts || {}, max = Math.max.apply(null, r.daily.map(function (d) { return d.views; }).concat([1]));
            statsBox.innerHTML = "";
            var rows = [["view", "Page views"], ["review", "AI review taps"], ["map", "Location taps"], ["whatsapp", "WhatsApp taps"], ["instagram", "Instagram taps"]];
            if (src.saveContact) rows.push(["contact", "Contact saves"]);
            if (src.menuUrl) rows.push(["menu", "Menu taps"]);
            if (src.facebook) rows.push(["facebook", "Facebook taps"]);
            if (src.website) rows.push(["website", "Website taps"]);
            if (src.zomato) rows.push(["zomato", "Zomato taps"]);
            (src.buttons || []).forEach(function (b, i) { rows.push(["b" + i, b.label + " taps"]); });
            rows.push(["game", "Game opens"]);
            statsBox.appendChild(h("div", { class: "kv" }, rows
              .map(function (p) { return h("div", {}, [h("b", { text: String(c[p[0]] || 0) }), h("span", { text: p[1] })]); })));
            statsBox.appendChild(h("div", { class: "bars", role: "img", "aria-label": "Page views per day, last 14 days" }, r.daily.map(function (d) {
              return h("i", { style: "height:" + Math.max(4, Math.round(d.views / max * 100)) + "%", title: d.d + ": " + d.views });
            })));
            statsBox.appendChild(h("div", { class: "axis" }, [h("span", { text: "14 days ago" }), h("span", { text: "Today" })]));
          });
        }
        range.addEventListener("change", loadStats);
        kids.push(
          h("div", { class: "card" }, [h("h2", { text: "Share" }),
            h("div", { class: "linkbox" }, [linkText]),
            h("div", { class: "actions3" }, [
              h("button", { class: "btn small", type: "button", text: "Copy link", onclick: function () { copy(pageUrl(src.slug), "Link copied"); } }),
              h("a", { class: "btn small", href: pageUrl(src.slug), target: "_blank", rel: "noopener", text: "Open page" }),
              h("button", { class: "btn small", type: "button", text: "QR code", onclick: function () { openQr(src); } })
            ])]),
          h("div", { class: "card" }, [h("div", { class: "row", style: "margin-bottom:12px" }, [h("h2", { style: "margin:0", text: "Numbers" }), h("div", { class: "field", style: "margin:0;width:150px" }, [range])]), statsBox]),
          h("div", { class: "card" }, [h("h2", { text: "Delete" }),
            h("p", { class: "muted", style: "margin:0 0 12px", text: "Removes the page and its numbers. A printed QR code will stop working." }),
            h("button", { class: "btn danger", type: "button", text: "Delete this shop...", onclick: function () { showDelete(delWrap, src); } }), delWrap])
        );
        setTimeout(loadStats, 0);
      }

      kids.push(h("div", { class: "bar" }, [h("div", {}, [h("a", { class: "btn", href: "#/shops", text: "Cancel" }), saveBtn, dirty])]));
      screen(kids, { bar: true });
      paintPreview(); paintSw(); paintLogo(); paintButtons();
    }
  }

  // Typed-name confirmation shared by shops and QR links. `call()` returns the server promise.
  function confirmDelete(wrap, o) {
    wrap.innerHTML = "";
    var input = h("input", { type: "text", "aria-label": "Type " + o.typed + " to confirm", autocomplete: "off", placeholder: o.typed });
    var go = h("button", { class: "btn danger", type: "button", text: o.button, disabled: true });
    input.addEventListener("input", function () { go.disabled = input.value.trim().toLowerCase() !== o.typed.trim().toLowerCase(); });
    go.addEventListener("click", function () {
      go.disabled = true; go.textContent = "Deleting...";
      guarded(o.call(), function (e) { toast(errText(e), true); go.textContent = o.button; go.disabled = false; }).then(function (r) {
        if (r !== FAIL) { toast(o.done); location.hash = o.hash; }
      });
    });
    wrap.appendChild(h("div", { class: "confirm" }, [
      h("p", { text: "Type " + o.typed + " to confirm." }),
      h("div", { class: "field", style: "margin:0" }, [input]),
      h("div", { class: "acts" }, [h("button", { class: "btn", type: "button", text: o.keep, onclick: function () { wrap.innerHTML = ""; } }), go])
    ]));
    input.focus();
  }
  function showDelete(wrap, shop) {
    confirmDelete(wrap, { typed: shop.name, button: "Delete shop", keep: "Keep shop", done: "Shop deleted", hash: "#/shops",
      call: function () { return rpc("sq_admin_delete", { p_key: adminKey, p_slug: shop.slug }); } });
  }

  // ---------- QR sheet ----------
  var qrDialog = null;
  function openQr(shop) { openQrUrl({ title: shop.name, url: pageUrl(shop.slug), file: shop.slug + "-qr" }); }
  function openQrUrl(o) {
    var url = o.url, qr = qrcode(0, "M"); qr.addData(url); qr.make();
    var n = qr.getModuleCount(), margin = 4, cell = Math.max(4, Math.floor(1024 / (n + margin * 2))), size = cell * (n + margin * 2);
    var cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    var g = cv.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size); g.fillStyle = "#10131a";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    cv.setAttribute("aria-label", "QR code for " + o.title);

    if (qrDialog) qrDialog.remove();
    qrDialog = h("dialog", { "aria-label": "QR code" });
    function blob(cb) { cv.toBlob(cb, "image/png"); }
    function save(href, name) { var a = h("a", { href: href, download: name }); document.body.appendChild(a); a.click(); a.remove(); }
    var share = h("button", { class: "btn", type: "button", text: "Share", onclick: function () {
      blob(function (b) {
        var f = new File([b], o.file + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: o.title }).catch(function () {});
        else copy(url, "Link copied");
      });
    } });
    qrDialog.appendChild(h("div", { class: "sheet" }, [
      h("h2", { text: o.title }), h("p", { class: "muted", style: "margin:2px 0 0;word-break:break-all", text: url }),
      tempAddress() ? h("p", { class: "warn", role: "alert", text: "This is a temporary address. Do not print this QR yet. Set your own domain first, or the printed QR will stop working." }) : null,
      cv,
      h("div", { class: "acts" }, [
        h("button", { class: "btn primary", type: "button", text: "Download PNG", onclick: function () {
          blob(function (b) { save(URL.createObjectURL(b), o.file + ".png"); });
        } }),
        share,
        h("button", { class: "btn", type: "button", text: "Download SVG (print)", onclick: function () {
          var svg = qr.createSvgTag({ cellSize: 10, margin: 4, scalable: true });
          save(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), o.file + ".svg");
        } }),
        h("button", { class: "btn", type: "button", text: "Close", onclick: function () { qrDialog.close(); } })
      ])
    ]));
    qrDialog.addEventListener("click", function (e) { if (e.target === qrDialog) qrDialog.close(); });
    document.body.appendChild(qrDialog); qrDialog.showModal();
  }

  // ---------- router + install ----------
  function route() {
    if (!cfg.url || !cfg.anonKey) return viewNoServer();
    if (!adminKey) return viewLogin();
    var p = (location.hash || "#/").slice(1).split("/").filter(Boolean);
    if (p[0] === "new") return viewEdit(null);
    if (p[0] === "shop" && p[1]) return viewEdit(decodeURIComponent(p[1]));
    if (p[0] === "settings") return viewSettings();
    if (p[0] === "shops") return viewList();
    if (p[0] === "links") return viewLinks();
    if (p[0] === "link" && p[1] === "new") return viewLinkEdit(null);
    if (p[0] === "link" && p[1]) return viewLinkEdit(decodeURIComponent(p[1]));
    return viewDash();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; if (current === "dash" || current === "settings") route(); });
  window.addEventListener("appinstalled", function () { deferredInstall = null; toast("Installed. Open Smart QR from your home screen."); if (current === "dash" || current === "settings") route(); });

  if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); }); }
  route();
})();
