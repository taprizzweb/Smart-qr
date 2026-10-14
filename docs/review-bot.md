# Sending AI review reports to the owner

Every time the AI review tool generates (or the customer posts) a review, call one function and it shows up on the
store owner's dashboard, under "AI reviews", with the rating and the average.

The review link on the deal page already carries the store: `https://your-ai-review-site/?store=<store-key>`.
Read `store` from the URL in the bot and pass it back below.

```js
await fetch("https://<project-ref>.supabase.co/rest/v1/rpc/tq_log_review", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: "<publishable anon key>",
    Authorization: "Bearer <publishable anon key>"
  },
  body: JSON.stringify({
    p_key: "cafe-xyz",            // the store key from ?store=
    p_rating: 5,                  // 1 to 5
    p_review: "Loved the cold coffee!",
    p_reviewer: "Aman"            // optional
  })
});
```

Notes
- Rating must be 1 to 5; review text is cut at 2000 characters; an unknown store key is rejected.
- The anon key is public by design. The function can only add a review row, nothing else.
- Taps on the "AI review" row are counted separately, so the owner sees taps and finished reviews side by side.
