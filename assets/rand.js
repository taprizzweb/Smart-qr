// Cryptographically secure randomness (falls back to Math.random only if crypto is unavailable).
(function () {
  function float() {
    try {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296; // [0, 1)
    } catch (e) {
      return Math.random();
    }
  }

  // Weighted pick: returns an index. A weight of 0 means "never". All-zero weights fall back to uniform.
  function weighted(weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) return Math.floor(float() * weights.length);
    var roll = float() * total;
    for (i = 0; i < weights.length; i++) {
      var w = Math.max(0, weights[i]);
      if (roll < w) return i;
      roll -= w;
    }
    return weights.length - 1;
  }

  window.Rand = { float: float, weighted: weighted };
})();
