// Trysee account page: sign in, credits, packs, promo codes, invites and (for creators) the creator dashboard.
// Talks to Supabase Auth (public anon key, no SDK) and the Trysee API. All text from the API is inserted with textContent.
(function () {
  "use strict";

  var SB = "https://kgxklwpqcropiprelklc.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtneGtsd3BxY3JvcGlwcmVsa2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzAwMjIsImV4cCI6MjEwNjQ0NjAyMn0.KD49csjq0IGgfXYxmXhg-CtNVEHNsSZ6JirTjz2H8vc";
  var API = SB + "/functions/v1/trysee";
  var STORE_KEY = "trysee-auth";
  // Sample data is only available when the page is opened from disk (file:) with ?demo=1. It is inert on https.
  var DEMO = location.protocol === "file:" && /[?&]demo=1\b/.test(location.search);

  var $ = function (id) { return document.getElementById(id); };
  var session = null;

  // ---------- small helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function say(text, kind) {
    var s = $("status");
    s.textContent = text || "";
    s.className = "status" + (kind ? " " + kind : "");
  }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }
  function num(n) { return (Number(n) || 0).toLocaleString("en-IN"); }
  function inr(n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function fmtDate(at) {
    if (at == null || at === "") return "";
    var d = new Date(typeof at === "number" && at < 1e12 ? at * 1000 : at);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return s && s.access_token && s.refresh_token && s.user && s.user.id ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    session = s;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: session lasts for this visit only */ }
  }
  function clearSession() {
    session = null;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }
  function sessionFromAuth(j) {
    var exp = j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600));
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: exp, user: { id: j.user && j.user.id, email: j.user && j.user.email } };
  }

  // ---------- Supabase Auth ----------
  function authError(j) {
    var m = String((j && (j.msg || j.error_description || j.message || j.error)) || "");
    return /not confirmed/i.test(m) ? "Please confirm your email first. We sent you a link (check spam too)."
      : /invalid login/i.test(m) ? "Wrong email or password."
      : /already registered|already been registered/i.test(m) ? "An account with this email already exists. Try signing in."
      : /password/i.test(m) && /(short|least|weak)/i.test(m) ? "Password must be at least 8 characters."
      : /rate limit|too many|seconds/i.test(m) ? "Too many attempts. Please wait a minute and try again."
      : /valid email|invalid email/i.test(m) ? "That email address doesn't look right."
      : m || "Something went wrong. Please try again.";
  }
  function authCall(path, body) {
    return fetch(SB + path, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify(body) })
      .catch(function () { var e = new Error("Can't reach Trysee right now. Check your connection and try again."); e.offline = true; throw e; })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(authError(j)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  var refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = authCall("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(function (j) { saveSession(sessionFromAuth(j)); return true; })
        .catch(function (e) { if (!e.offline && e.status >= 400 && e.status < 500) clearSession(); return false; })
        .then(function (ok) { refreshing = null; return ok; });
    }
    return refreshing;
  }
  function freshToken() {
    if (DEMO) return Promise.resolve("demo");
    if (!session) return Promise.resolve(null);
    if (session.expires_at - Math.floor(Date.now() / 1000) < 60) return refresh().then(function () { return session && session.access_token; });
    return Promise.resolve(session.access_token);
  }

  // ---------- Trysee API ----------
  function api(path, body, retried) {
    if (DEMO) return demoApi(path);
    return freshToken().then(function (token) {
      if (!token) { var e = new Error("LOGIN_REQUIRED"); e.code = "LOGIN_REQUIRED"; e.status = 401; throw e; }
      return fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Trysee-Tz": tz() },
        body: JSON.stringify(Object.assign({ installId: session.user.id }, body || {}))
      }).catch(function () {
        var e = new Error("Can't reach Trysee right now. Check your connection and try again."); e.offline = true; throw e;
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && !retried && session) {
            return refresh().then(function (ok) { if (ok) return api(path, body, true); throw apiErr(r, j); });
          }
          if (!r.ok) throw apiErr(r, j);
          return j;
        });
      });
    });
  }
  function apiErr(r, j) {
    var e = new Error((j && (j.message || j.error)) || "Request failed (" + r.status + ").");
    e.status = r.status; e.code = j && j.error; e.serverMessage = j && j.message;
    return e;
  }
  function plans() {
    if (DEMO) return demoApi("/api/plans");
    return fetch(API + "/api/plans", { headers: { "X-Trysee-Tz": tz() } })
      .then(function (r) { if (!r.ok) throw new Error("plans"); return r.json(); });
  }

  // ---------- views ----------
  function show(which) {
    $("loading").hidden = which !== "loading";
    $("auth").hidden = which !== "auth";
    $("app").hidden = which !== "app";
    $("who").hidden = which !== "app";
  }
  function showForm(id) {
    ["formIn", "formUp", "formForgot"].forEach(function (f) { $(f).hidden = f !== id; });
    say("");
    var first = $(id).querySelector("input");
    if (first) first.focus();
  }
  function signedOut(msg, kind) {
    clearSession();
    show("auth");
    showForm("formIn");
    if (msg) say(msg, kind);
  }

  // ---------- auth forms ----------
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  function bindAuth() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-show]"), function (b) {
      b.addEventListener("click", function () { showForm(b.getAttribute("data-show")); });
    });
    var ref = null;
    try { ref = localStorage.getItem("trysee-ref"); } catch (e) { /* ignore */ }
    if (ref) $("refBanner").hidden = false;

    $("formIn").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("inEmail").value.trim(), pass = $("inPass").value;
      if (!email || !pass) return say("Enter your email and password.", "err");
      busy($("inGo"), true, "Signing in…"); say("");
      authCall("/auth/v1/token?grant_type=password", { email: email, password: pass })
        .then(function (j) { saveSession(sessionFromAuth(j)); $("inPass").value = ""; start(); })
        .catch(function (err) { say(err.message, "err"); })
        .then(function () { busy($("inGo"), false, "Sign in"); });
    });

    $("formUp").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("upEmail").value.trim(), pass = $("upPass").value, name = $("upName").value.trim();
      if (!email) return say("Enter your email.", "err");
      if (pass.length < 8) return say("Password must be at least 8 characters.", "err");
      var data = { name: name };
      busy($("upGo"), true, "Creating…"); say("");
      authCall("/auth/v1/signup?redirect_to=" + encodeURIComponent("https://trysee.app/confirmed.html"), { email: email, password: pass, data: data })
        .then(function (j) {
          if (j && j.access_token) { saveSession(sessionFromAuth(j)); return start(); }
          $("upPass").value = "";
          showForm("formIn");
          $("inEmail").value = email;
          say("Check your email to confirm your account. Click the link we sent (check spam too), then sign in here.", "ok");
        })
        .catch(function (err) { say(err.message, "err"); })
        .then(function () { busy($("upGo"), false, "Create account"); });
    });

    $("formForgot").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("fgEmail").value.trim();
      if (!email) return say("Enter your email.", "err");
      busy($("fgGo"), true, "Sending…"); say("");
      authCall("/auth/v1/recover?redirect_to=" + encodeURIComponent("https://trysee.app/reset.html"), { email: email })
        .then(function () { say("If an account exists for that email, we've sent a link to reset your password.", "ok"); })
        .catch(function (err) { say(err.message, "err"); })
        .then(function () { busy($("fgGo"), false, "Send reset link"); });
    });

    $("signOut").addEventListener("click", function () {
      var tok = session && session.access_token;
      if (tok && !DEMO) fetch(SB + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + tok } }).catch(function () {});
      signedOut("You're signed out.", "ok");
    });
  }

  // ---------- signed-in rendering ----------
  var LABELS = {
    PHOTO: "Photo Try-On", LIVE: "Live Try-On", PURCHASE: "Credit purchase", FREE_GRANT: "Welcome credit", REFUND: "Refund",
    PROMO: "Promo code", REFERRAL_BONUS: "Friend invite bonus", REFERRAL_REWARD: "Referral reward", MERGE_IN: "Credits moved", MERGE_OUT: "Credits moved"
  };
  function setBalance(n) { $("bal").textContent = num(n); }

  function renderActivity(list) {
    var ul = $("activity"); ul.textContent = "";
    if (!list || !list.length) { ul.appendChild(el("li", "muted", "No activity yet. Your first try-on will show up here.")); return; }
    list.forEach(function (a) {
      var li = el("li"), left = el("span", null, LABELS[a.kind] || "Credit change");
      left.appendChild(el("span", "d", fmtDate(a.at)));
      var d = Number(a.delta) || 0;
      li.appendChild(left);
      li.appendChild(el("span", d < 0 ? "neg" : "pos", (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d)));
      ul.appendChild(li);
    });
  }
  function renderOrders(list) {
    var ul = $("orders"); ul.textContent = "";
    if (!list || !list.length) { ul.appendChild(el("li", "muted", "No purchases yet.")); return; }
    list.forEach(function (o) {
      var li = el("li"), left = el("span", null, (o.label || (num(o.credits) + " credits")));
      left.appendChild(el("span", "d", fmtDate(o.at) + (o.credits ? " · " + num(o.credits) + " credits" : "")));
      li.appendChild(left);
      li.appendChild(el("span", "amt", inr(o.price)));
      ul.appendChild(li);
    });
  }
  function renderPacks(p) {
    var box = $("packs"); box.textContent = ""; box.setAttribute("aria-busy", "false");
    var top = (p && p.topup) || [];
    if (!top.length) { box.appendChild(el("p", "muted", "Credit packs aren't available right now. Please try again in a moment.")); return; }
    top.forEach(function (t) {
      var card = el("div", "pack" + (t.badge ? " pop" : ""));
      if (t.badge) card.appendChild(el("span", "tagb", t.badge));
      card.appendChild(el("div", "n", t.name));
      card.appendChild(el("div", "cr", num(t.credits) + " credits"));
      card.appendChild(el("div", "p", inr(t.price)));
      var ul = el("ul", "pf");
      [num(t.photoTryOns) + " AI try-ons or " + num(t.liveSessions) + " live " + (t.liveSessions === 1 ? "session" : "sessions"),
        "Photo Try-On supported", "Live Try-On supported", "No subscription", "Credits do not expire"].forEach(function (x) { ul.appendChild(el("li", null, x)); });
      card.appendChild(ul);
      var b = el("button", "btn", "Buy for " + inr(t.price));
      b.type = "button";
      b.setAttribute("aria-label", "Buy " + t.name + " pack, " + num(t.credits) + " credits for " + inr(t.price));
      b.addEventListener("click", function () { checkout(t.sku, b, "Buy for " + inr(t.price)); });
      card.appendChild(b);
      box.appendChild(card);
    });
  }
  function renderReferral(r) {
    var link = r && r.link;
    $("refLink").value = link || "";
    $("refCopy").disabled = !link;
    var s = (r && r.stats) || {};
    $("refStats").textContent = link
      ? "Invited: " + num(s.invited) + " · Made their first try-on: " + num(s.qualified) + " · Credits earned: " + num(s.creditsEarned) + " · Rewards left this month: " + num(s.rewardsLeftThisMonth)
      : "";
  }
  function renderCreator(c) {
    var sec = $("creatorSec");
    if (!c || !c.creator) { sec.hidden = true; return; }
    sec.hidden = false;
    $("crLink").value = c.link || "";
    var s = c.stats || {};
    var k = $("crKpis"); k.textContent = "";
    [["Sign-ups", num(s.signups)], ["Purchasers", num(s.purchasers)], ["Orders", num(s.orders)], ["Commission rate", num(c.ratePercent) + "%"],
     ["Earned", inr(s.earnedInr)], ["Pending", inr(s.pendingInr)], ["Paid", inr(s.paidInr)], ["Payable now", inr(s.payableInr)]].forEach(function (x) {
      var d = el("div", "kpi"); d.appendChild(el("b", null, x[1])); d.appendChild(el("span", null, x[0])); k.appendChild(d);
    });
    var ul = $("crRecent"); ul.textContent = "";
    var rec = c.recent || [];
    if (!rec.length) ul.appendChild(el("li", "muted", "No commissions yet."));
    rec.forEach(function (x) {
      var li = el("li"), left = el("span", null, String(x.status || "").replace(/^./, function (m) { return m.toUpperCase(); }));
      left.appendChild(el("span", "d", fmtDate(x.at)));
      li.appendChild(left); li.appendChild(el("span", "amt", inr(x.amountInr)));
      ul.appendChild(li);
    });
    $("crNote").textContent = "Commission is " + num(c.ratePercent) + "% of the net amount paid on purchases made within 30 days of a sign-up through your link. Payouts are monthly by UPI or bank transfer once your payable balance reaches " + inr(c.minPayoutInr) + "; smaller amounts roll over. Commissions can be reversed if a payment is refunded or charged back.";
  }

  // ---------- actions ----------
  function checkout(sku, btn, label) {
    btn.disabled = true; btn.textContent = "Opening payment page…"; say("");
    api("/api/checkout", { sku: sku }).then(function (j) {
      if (!j || typeof j.url !== "string" || !/^https:\/\//i.test(j.url)) throw new Error("We couldn't start the payment. Please try again.");
      if (DEMO) { say("Demo mode: would open " + j.url, "ok"); btn.disabled = false; btn.textContent = label; return; }
      location.href = j.url;
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = label;
      if (e.status === 401) return signedOut("Please sign in again to continue.", "err");
      say(e.status === 429 ? "Too many attempts. Please wait a minute and try again." : e.offline ? e.message : (e.serverMessage || "We couldn't start the payment. Please try again."), "err");
    });
  }
  function redeem(e) {
    e.preventDefault();
    var code = $("promoCode").value.trim();
    if (!code) return say("Enter a promo code.", "err");
    busy($("promoGo"), true, "Redeeming…"); say("");
    api("/api/promo/redeem", { code: code }).then(function (j) {
      $("promoCode").value = "";
      if (j && j.credits != null) setBalance(j.credits);
      say(j && j.added ? "Done! " + num(j.added) + (j.added === 1 ? " credit was" : " credits were") + " added to your account." : "Promo code applied.", "ok");
      return api("/api/credits").then(function (c) { renderActivity(c.activity); }).catch(function () {});
    }).catch(function (err) {
      if (err.status === 401) return signedOut("Please sign in again to continue.", "err");
      say(err.code === "PROMO_INVALID" ? (err.serverMessage || "That code isn't valid or has expired.")
        : err.code === "PROMO_USED" ? (err.serverMessage || "You've already used this code.")
        : err.status === 429 ? "Too many attempts. Please wait a minute and try again."
        : err.offline ? err.message : (err.serverMessage || "Couldn't redeem that code. Please try again."), "err");
    }).then(function () { busy($("promoGo"), false, "Redeem"); });
  }
  function copyFrom(inputId, btn) {
    var inp = $(inputId), v = inp.value;
    if (!v) return;
    function done(ok) {
      var old = btn.textContent;
      btn.textContent = ok ? "Copied" : "Press Ctrl+C";
      say(ok ? "Link copied." : "Select the link and copy it.", ok ? "ok" : "err");
      setTimeout(function () { btn.textContent = old; }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function () { done(true); }, function () { inp.select(); done(false); });
    else { inp.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (x) { /* ignore */ } done(ok); }
  }

  // ---------- load everything ----------
  function storedRef() { try { var r = localStorage.getItem("trysee-ref"); return r && /^[A-Za-z0-9_-]{3,32}$/.test(r) ? r : undefined; } catch (e) { return undefined; } }
  function clearRef() { try { localStorage.removeItem("trysee-ref"); } catch (e) { /* ignore */ } }
  var loadId = 0;
  function load() {
    var my = ++loadId;
    $("apiError").hidden = true;
    $("packs").setAttribute("aria-busy", "true");
    var failures = 0, unauthorized = false;
    function guard(p) {
      return p.catch(function (e) { if (e.status === 401) unauthorized = true; failures++; return null; });
    }
    // The first call makes sure this sign-in has its account wallet: it creates it, grants the welcome credit once and applies an invite code.
    var linking = DEMO ? Promise.resolve() : api("/api/auth/link", { ref: storedRef() }).then(function () { clearRef(); }).catch(function () { /* the calls below report real problems */ });
    function after(fn) { return linking.then(fn); }
    var tasks = [
      guard(after(function () { return api("/api/account"); })).then(function (a) {
        if (my !== loadId || !a) return;
        $("hello").textContent = a.name ? "Hi, " + a.name : "";
        if (a.credits != null) setBalance(a.credits);
        renderOrders(a.history);
      }),
      guard(after(function () { return api("/api/credits"); })).then(function (c) {
        if (my !== loadId || !c) return;
        setBalance(c.credits);
        renderActivity(c.activity);
      }),
      guard(plans()).then(function (p) { if (my === loadId && p) renderPacks(p); }),
      guard(after(function () { return api("/api/referral"); })).then(function (r) { if (my === loadId && r) renderReferral(r); }),
      after(function () { return api("/api/creator"); }).then(function (c) { if (my === loadId) renderCreator(c); }).catch(function () { if (my === loadId) $("creatorSec").hidden = true; })
    ];
    return Promise.all(tasks).then(function () {
      if (my !== loadId) return;
      if (unauthorized && !DEMO) return signedOut("Your session expired. Please sign in again.", "err");
      if (failures) {
        $("apiErrorMsg").textContent = "Some of your account details couldn't be loaded. Trysee may be briefly unavailable.";
        $("apiError").hidden = false;
        if ($("bal").textContent === "–") $("bal").textContent = "?";
        if ($("packs").getAttribute("aria-busy") === "true") { $("packs").setAttribute("aria-busy", "false"); $("packs").textContent = ""; $("packs").appendChild(el("p", "muted", "Credit packs couldn't be loaded. Use \"Try again\" above.")); }
        if ($("activity").textContent === "Loading…") $("activity").textContent = "";
        if ($("orders").textContent === "Loading…") $("orders").textContent = "";
      }
    });
  }
  function start() {
    say("");
    if (!DEMO && !session) { show("auth"); showForm("formIn"); return; }
    $("whoEmail").textContent = session ? session.user.email || "" : "demo@example.com";
    show("app");
    return load();
  }

  // ---------- demo (file: + ?demo=1 only) ----------
  function demoApi(path) {
    var now = Date.now(), day = 86400000;
    var data = {
      "/api/account": { name: "Aarav", email: "demo@example.com", credits: 17, history: [{ label: "Popular pack", credits: 20, price: 249, currency: "INR", at: now - 5 * day }, { label: "Starter pack", credits: 5, price: 99, currency: "INR", at: now - 40 * day }] },
      "/api/credits": { credits: 17, activity: [{ kind: "PHOTO", delta: -1, at: now - day }, { kind: "REFERRAL_REWARD", delta: 2, at: now - 2 * day }, { kind: "LIVE", delta: -4, at: now - 3 * day }, { kind: "PROMO", delta: 5, at: now - 4 * day }, { kind: "PURCHASE", delta: 20, at: now - 5 * day }, { kind: "FREE_GRANT", delta: 1, at: now - 40 * day }] },
      "/api/plans": { currency: "INR", config: {}, topup: [
        { sku: "s", name: "Starter", credits: 5, badge: "", price: 99, photoTryOns: 5, liveSessions: 1 },
        { sku: "p", name: "Popular", credits: 20, badge: "Most Popular", price: 249, photoTryOns: 20, liveSessions: 5 },
        { sku: "v", name: "Value", credits: 50, badge: "", price: 499, photoTryOns: 50, liveSessions: 12 },
        { sku: "w", name: "Power", credits: 120, badge: "", price: 999, photoTryOns: 120, liveSessions: 30 }] },
      "/api/referral": { code: "AARAV7", link: "https://trysee.app/invite.html?ref=AARAV7", friendBonus: 1, referrerReward: 2, monthlyCap: 20, stats: { invited: 4, qualified: 2, creditsEarned: 4, rewardsLeftThisMonth: 18 } },
      "/api/creator": { creator: true, code: "AARAV7", link: "https://trysee.app/r/AARAV7", ratePercent: 15, minPayoutInr: 500, stats: { signups: 42, purchasers: 6, orders: 8, earnedInr: 612.5, pendingInr: 120, paidInr: 0, payableInr: 492.5 }, recent: [{ at: now - day, amountInr: 37.35, status: "pending" }, { at: now - 6 * day, amountInr: 74.7, status: "approved" }] },
      "/api/checkout": { url: "https://example.com/pay", orderId: "demo" },
      "/api/promo/redeem": { credits: 22, added: 5 }
    };
    return new Promise(function (res, rej) {
      setTimeout(function () { data[path] ? res(JSON.parse(JSON.stringify(data[path]))) : rej(new Error("demo")); }, 150);
    });
  }

  // ---------- init ----------
  function init() {
    bindAuth();
    $("retry").addEventListener("click", load);
    $("promoForm").addEventListener("submit", redeem);
    $("refCopy").addEventListener("click", function () { copyFrom("refLink", $("refCopy")); });
    $("crCopy").addEventListener("click", function () { copyFrom("crLink", $("crCopy")); });
    session = readSession();
    show("loading");
    start();
  }
  init();
})();
