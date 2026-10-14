// Har store ka data yahin hai. Naya store jodne ke liye ek block copy karo aur badlo.
// Store ka link: https://<tumhari-site>/?s=<store-key>   (QR isi link ka banega)

// Coupon signature ke liye secret. Isse apna kuch random rakho aur live karne ke baad mat badlo
// (badalne par purane coupons invalid ho jayenge).
window.TAPRIZZ_SALT = "change-me-before-going-live";

window.STORES = {
  demo: {
    code: "DEMO",                         // sirf A-Z / 0-9, 3-8 characters, har store ka unique
    name: "Demo Cafe",
    branch: "Pacific Mall, Jaipur",
    tagline: "Spin karo, crazy deal jeeto!",
    color: "#e11d48",                    // brand color
    validDays: 30,                       // coupon kitne din valid rahega
    minPurchaseNote: "Agli purchase par valid",
    whatsapp: "919999999999",            // country code ke saath, + ya space ke bina
    whatsappMsg: "Hi! Mujhe Demo Cafe ke baare mein jaanna hai.",
    instagram: "https://instagram.com/",
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID",
    aiReviewUrl: "",                     // AI review portal ka link ready hone par yahan daalo
    prizes: [
      // short = wheel par dikhne wala chhota text, label = jeetne par dikhne wala poora text
      // weight = kitna zyada, utna zyada milega (relative)
      { short: "10% OFF",  label: "10% off on your next purchase",     weight: 30 },
      { short: "20% OFF",  label: "20% off on your next purchase",     weight: 15 },
      { short: "FREE ITEM", label: "Free add-on with your next order", weight: 10 },
      { short: "5% OFF",   label: "5% off on your next purchase",      weight: 35 },
      { short: "30% OFF",  label: "Crazy deal: 30% off next purchase", weight: 4 },
      { short: "BUY 1 GET 1", label: "Buy 1 Get 1 on your next visit", weight: 6 }
    ]
  }
};
