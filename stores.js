// All store data lives here. To add a store, use admin.html (fill the form, copy the block) or copy one below.
// Store link: https://smartqr.taprizz.in/?s=<store-key>   (generate the QR from this link)

// Secret used to sign coupons. Set it to something random before going live and never change it
// afterwards (changing it invalidates every coupon already issued).
window.TAPRIZZ_SALT = "change-me-before-going-live";

// Optional server mode (owner dashboards, central redemption, server-side random).
// Paste your Supabase project URL and publishable (anon) key. Leave empty to stay fully static.
// Stores created in admin.html live in the database; stores listed below stay static.
window.TAPRIZZ_API = { url: "", anonKey: "" };

window.STORES = {
  // ---------- Spin wheel example ----------
  demo: {
    code: "DEMO",                         // A-Z / 0-9 only, 3-8 characters, unique per store
    name: "Demo Cafe",
    branch: "Pacific Mall, Jaipur",
    tagline: "Spin the wheel. Unlock a crazy deal.",
    color: "#e11d48",                    // brand colour (the single accent used across the page)
    game: "wheel",                       // "wheel" or "scratch"
    validDays: 30,                       // days a coupon stays valid
    minPurchaseNote: "Redeem it on your next visit",
    playCooldownHours: 24,               // after a blank result, how long before the same phone can play again
    blankMessage: "Better luck next time",
    collectLead: true,                   // ask for name + phone before playing
    sheetWebhook: "",                    // Google Sheet webhook URL (see docs/owner-sheet.gs); empty = nothing is sent
    whatsapp: "919999999999",            // with country code, no + or spaces
    whatsappMsg: "Hi! I would like to know more about Demo Cafe.",
    instagram: "https://instagram.com/",
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID",
    aiReviewUrl: "",                     // paste the AI review portal link here when ready
    prizes: [
      // Exactly 4 slots. label = full text shown when won. LEAVE IT EMPTY to make a blank slot (no reward).
      // short = text on the wheel (optional, max 14 chars). weight = relative chance (0 = never).
      { label: "Pick any item at cost price",        short: "AT COST",     weight: 10 },
      { label: "Flat 1% off on your next purchase",  short: "1% OFF",      weight: 30 },
      { label: "Free add-on with your next order",   short: "FREE ADD-ON", weight: 10 },
      { label: "",                                   short: "NEXT TIME",   weight: 50 }
    ]
  },

  // ---------- Scratch card example ----------
  "demo-scratch": {
    code: "SCRATCH",
    name: "Demo Salon",
    branch: "Pacific Mall, Jaipur",
    tagline: "Scratch the card. Unlock a crazy deal.",
    color: "#c8a24a",
    game: "scratch",
    validDays: 30,
    minPurchaseNote: "Redeem it on your next visit",
    playCooldownHours: 24,
    blankMessage: "Better luck next time",
    collectLead: false,
    sheetWebhook: "",
    whatsapp: "919999999999",
    whatsappMsg: "Hi! I would like to book an appointment at Demo Salon.",
    instagram: "https://instagram.com/",
    googleReviewUrl: "",
    aiReviewUrl: "",
    prizes: [
      { label: "Pick any service at cost price",     weight: 10 },
      { label: "Flat 1% off your next visit",        weight: 30 },
      { label: "Free hair spa with any service",     weight: 10 },
      { label: "",                                   weight: 50 }
    ]
  }
};
