// All store data lives here. To add a store, copy a block and edit it.
// Store link: https://<your-site>/?s=<store-key>   (generate the QR from this link)

// Secret used to sign coupons. Set it to something random before going live and never change it
// afterwards (changing it invalidates every coupon already issued).
window.TAPRIZZ_SALT = "change-me-before-going-live";

window.STORES = {
  demo: {
    code: "DEMO",                         // A-Z / 0-9 only, 3-8 characters, unique per store
    name: "Demo Cafe",
    branch: "Pacific Mall, Jaipur",
    tagline: "Spin the wheel. Unlock a crazy deal.",
    color: "#e11d48",                    // brand colour (the single accent used across the page)
    validDays: 30,                       // days a coupon stays valid
    minPurchaseNote: "Redeem it on your next visit",
    whatsapp: "919999999999",            // with country code, no + or spaces
    whatsappMsg: "Hi! I would like to know more about Demo Cafe.",
    instagram: "https://instagram.com/",
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID",
    aiReviewUrl: "",                     // paste the AI review portal link here when ready
    prizes: [
      // short = text shown on the wheel, label = full text shown when won
      // weight = relative probability (higher = more likely)
      { short: "10% OFF",  label: "10% off on your next purchase",     weight: 30 },
      { short: "20% OFF",  label: "20% off on your next purchase",     weight: 15 },
      { short: "FREE ITEM", label: "Free add-on with your next order", weight: 10 },
      { short: "5% OFF",   label: "5% off on your next purchase",      weight: 35 },
      { short: "30% OFF",  label: "Crazy deal: 30% off next purchase", weight: 4 },
      { short: "BUY 1 GET 1", label: "Buy 1 Get 1 on your next visit", weight: 6 }
    ]
  }
};
