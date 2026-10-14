// Thin client for the Supabase RPC functions (supabase/schema.sql). No SDK needed.
// When window.TAPRIZZ_API is empty the site runs in static mode (stores.js only).
(function () {
  var cfg = window.TAPRIZZ_API || {};

  function enabled() { return !!(cfg.url && cfg.anonKey); }

  function rpc(name, args, opts) {
    return fetch(cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify(args || {}),
      keepalive: !!(opts && opts.keepalive)
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
        if (!res.ok) {
          var err = new Error((body && body.message) || "request_failed");
          err.code = err.message;
          throw err;
        }
        return body;
      });
    });
  }

  // Friendly text for the error codes raised by the database functions
  var MESSAGES = {
    name_required: "Please enter your name.",
    phone_invalid: "Please enter a valid mobile number.",
    store_paused: "This offer is paused right now. Please check back soon.",
    store_not_found: "We could not find this store.",
    invalid_token: "This owner link is not valid. Ask for a fresh one.",
    forbidden: "That admin key is not correct.",
    need_one_real_deal: "At least one slot needs a deal and a chance above 0%.",
    prizes_must_have_4_slots: "Exactly 4 slots are needed.",
    deal_text_too_long: "Deal text can be up to 60 characters.",
    wheel_text_too_long: "Wheel text can be up to 14 characters.",
    weight_invalid: "Chances must be numbers between 0 and 100.",
    valid_days_invalid: "Coupon validity must be between 1 and 365 days."
  };
  function friendly(err) {
    return MESSAGES[err && err.code] || "Something went wrong. Please check your connection and try again.";
  }

  window.TQ = { enabled: enabled, rpc: rpc, friendly: friendly };
})();
