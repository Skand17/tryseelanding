// Remembers a referral code from ?ref=CODE so the invite can be credited when the visitor signs up.
(function () {
  try {
    var ref = new URLSearchParams(location.search).get("ref");
    if (ref && /^[A-Za-z0-9_-]{3,32}$/.test(ref)) localStorage.setItem("trysee-ref", ref);
  } catch (e) { /* storage may be blocked; nothing to do */ }
})();
