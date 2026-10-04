// Landing page visuals. Everything is drawn in code (no photos), so the page is light and needs no assets.
// The products, prices and stores below are ILLUSTRATIVE examples, not real listings.
(() => {
  const SKIN = "#e4b898", SKIN2 = "#cf9c7b", HAIR = "#2b1c18", PAPER = "#f3efea";

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
  }

  // A garment on a 200 x 280 canvas, drawn as worn (shoulders at y~98). `flat` = product-photo version (no skin, no hands).
  function garment(type, c, flat) {
    const d = shade(c, -0.14), l = shade(c, 0.14), neck = flat ? PAPER : SKIN2;
    const hands = flat ? "" : `<circle cx="25" cy="226" r="11" fill="${SKIN}"/><circle cx="175" cy="226" r="11" fill="${SKIN}"/>`;
    const longBody = `M64 98 Q100 110 136 98 L166 116 L184 214 L164 218 L146 150 L143 142 L143 270 L57 270 L57 142 L54 150 L36 218 L16 214 L34 116 Z`;
    const cuffs = `<path d="M14 206 L38 211 L36 221 L12 216Z" fill="${d}"/><path d="M186 206 L162 211 L164 221 L188 216Z" fill="${d}"/>`;
    if (type === "tee") {
      return `<path d="M66 98 Q100 110 134 98 L166 118 L150 152 L143 142 L143 270 L57 270 L57 142 L50 152 L34 118 Z" fill="${c}"/>
        <path d="M82 99 Q100 128 118 99 Z" fill="${neck}"/><path d="M82 99 Q100 128 118 99" fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
        <path d="M57 258 L143 258" stroke="${d}" stroke-width="3" opacity=".45"/>`;
    }
    if (type === "shirt") {
      return `<path d="${longBody}" fill="${c}"/>${cuffs}
        <path d="M84 94 L100 128 L76 114 Z" fill="${l}"/><path d="M116 94 L100 128 L124 114 Z" fill="${l}"/>
        <path d="M100 128 L100 270" stroke="${d}" stroke-width="3"/>
        ${[148, 178, 208, 238, 260].map((y) => `<circle cx="100" cy="${y}" r="3" fill="${l}"/>`).join("")}
        <rect x="112" y="152" width="20" height="22" rx="2" fill="none" stroke="${d}" stroke-width="2"/>${hands}`;
    }
    if (type === "jacket") {
      return `<path d="${longBody}" fill="${c}"/>${cuffs}
        <path d="M86 104 L114 104 L118 270 L82 270 Z" fill="#f1eee9"/>
        ${flat ? "" : `<path d="M88 100 Q100 120 112 100Z" fill="${SKIN2}"/>`}
        <path d="M70 100 L88 104 L80 156 Z" fill="${l}"/><path d="M130 100 L112 104 L120 156 Z" fill="${l}"/>
        <path d="M86 104 L82 270 M114 104 L118 270" stroke="${d}" stroke-width="3"/>
        <rect x="64" y="170" width="20" height="24" rx="2" fill="none" stroke="${d}" stroke-width="2"/><rect x="116" y="170" width="20" height="24" rx="2" fill="none" stroke="${d}" stroke-width="2"/>${hands}`;
    }
    // hoodie
    return `<path d="M68 96 Q66 56 100 52 Q134 56 132 96 Q100 82 68 96Z" fill="${d}"/>
      <path d="${longBody}" fill="${c}"/>${cuffs}
      <path d="M78 98 Q100 136 122 98 Q100 112 78 98Z" fill="${neck}"/>
      <path d="M92 120 L90 156 M108 120 L110 156" stroke="${l}" stroke-width="3" stroke-linecap="round"/>
      <path d="M66 214 L134 214 L142 254 L58 254Z" fill="${d}" opacity=".55"/>${hands}`;
  }

  function person(type, c) {
    const arms = type === "tee"
      ? `<path d="M40 126 L22 206 L44 212 L58 148Z" fill="${SKIN}"/><path d="M160 126 L178 206 L156 212 L142 148Z" fill="${SKIN}"/><circle cx="31" cy="214" r="11" fill="${SKIN}"/><circle cx="169" cy="214" r="11" fill="${SKIN}"/>`
      : "";
    return `<svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <ellipse cx="100" cy="46" rx="25" ry="29" fill="${SKIN}"/><ellipse cx="75" cy="48" rx="4" ry="7" fill="${SKIN2}"/><ellipse cx="125" cy="48" rx="4" ry="7" fill="${SKIN2}"/>
      <path d="M74 44 Q72 12 100 12 Q128 12 126 44 Q120 28 100 27 Q82 28 74 44Z" fill="${HAIR}"/>
      <rect x="90" y="68" width="20" height="36" rx="6" fill="${SKIN2}"/>${arms}${garment(type, c, false)}</svg>`;
  }
  const flat = (type, c) => `<svg viewBox="6 80 188 196" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${garment(type, c, true)}</svg>`;

  // ---- illustrative catalogue ----
  const P = {
    myntra:   { store: "Myntra",   name: "Men's Oversized Cotton Shirt", price: "₹1,299", was: "₹2,599", type: "shirt",  c: "#5b84c4", bg: "#e8eef8", path: "men/shirts/oversized-cotton-shirt" },
    amazon:   { store: "Amazon",   name: "Linen Blend Shirt",            price: "₹1,899", was: "₹2,999", type: "shirt",  c: "#d6c29d", bg: "#f4efe4", path: "linen-blend-shirt" },
    ajio:     { store: "AJIO",     name: "Relaxed Fit T-Shirt",          price: "₹799",   was: "₹1,599", type: "tee",    c: "#86a077", bg: "#eaf0e5", path: "men/relaxed-fit-tshirt" },
    hm:       { store: "H&M",      name: "Denim Jacket",                 price: "₹2,499", was: "",       type: "jacket", c: "#4d6d99", bg: "#e6ecf4", path: "men/denim-jacket" },
    zara:     { store: "Zara",     name: "Textured Overshirt",           price: "₹3,990", was: "",       type: "jacket", c: "#34343a", bg: "#ecebea", path: "man/overshirt" },
    nike:     { store: "Nike",     name: "Training Hoodie",              price: "₹3,295", was: "",       type: "hoodie", c: "#3a4252", bg: "#e9ebef", path: "men/training-hoodie" },
    adidas:   { store: "Adidas",   name: "Track Jacket",                 price: "₹4,299", was: "",       type: "jacket", c: "#27437a", bg: "#e6eaf3", path: "men/track-jacket" },
    meesho:   { store: "Meesho",   name: "Printed Casual Shirt",         price: "₹399",   was: "₹899",   type: "shirt",  c: "#c8594f", bg: "#f6e8e5", path: "men/printed-shirt" },
    flipkart: { store: "Flipkart", name: "Cotton Polo T-Shirt",          price: "₹549",   was: "₹1,199", type: "tee",    c: "#dfb544", bg: "#f6efdc", path: "men/polo-tshirt" },
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pill = (k) => `<span class="tp" data-try="${k}" role="button" tabindex="0"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>Try with Trysee</span>`;
  const fillFlat = (el, k, withPill) => { const p = P[k]; el.style.background = p.bg; el.innerHTML = flat(p.type, p.c) + (withPill ? pill(k) : ""); };

  // ---- hero ----
  const h = P.myntra;
  fillFlat($(".h-img"), "myntra");
  $(".h-me").innerHTML = person(h.type, h.c);
  function aim() { // point the animated cursor at the real position of the "Try with Trysee" button
    const page = $(".h-page"), b = $(".h-try");
    if (!page || !b) return;
    const pr = page.getBoundingClientRect(), br = b.getBoundingClientRect();
    page.style.setProperty("--bx", Math.round(br.left - pr.left + br.width * 0.55) + "px");
    page.style.setProperty("--by", Math.round(br.top - pr.top + br.height * 0.6) + "px");
  }
  aim(); addEventListener("resize", aim); if (document.fonts?.ready) document.fonts.ready.then(aim);

  // ---- stores ("Shop where you already shop.") ----
  const storeOrder = ["amazon", "myntra", "ajio", "hm", "zara", "nike", "adidas", "meesho", "flipkart"];
  $("#stores").innerHTML = storeOrder.map((k) => {
    const p = P[k];
    return `<article class="sc"><div class="sc-top"><i></i><i></i><i></i><span class="sc-name">${p.store}</span></div>
      <div class="sc-body"><div class="sc-img" data-k="${k}"></div><div class="sc-info"><b>${p.name}</b><span>${p.price}${p.was ? ` <s>${p.was}</s>` : ""}</span></div></div></article>`;
  }).join("");
  $$("#stores .sc-img").forEach((el) => fillFlat(el, el.dataset.k, true));

  // ---- tabs ("One Trysee. Thousands of products.") ----
  const tabKeys = ["amazon", "myntra", "ajio", "hm", "zara"];
  $("#tabstrip").innerHTML = tabKeys.map((k) => `<button role="tab" data-k="${k}">${P[k].store}</button>`).join("");
  let tabTimer = null, tabIdx = 1;
  function showTab(k) {
    const p = P[k];
    $$("#tabstrip button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === k)));
    $("#t-url").textContent = `${p.store.toLowerCase().replace("&", "and")}.com/${p.path}`;
    fillFlat($("#t-img"), k, true);
    $("#t-name").textContent = p.name;
    $("#t-price").innerHTML = `${p.price}${p.was ? ` <s>${p.was}</s>` : ""}`;
    $("#t-store").textContent = p.store;
    $("#t-me").innerHTML = person(p.type, p.c);
    const st = $("#t-stage"); st.classList.remove("swap"); void st.offsetWidth; st.classList.add("swap");
  }
  function autoTabs() { clearInterval(tabTimer); tabTimer = setInterval(() => { tabIdx = (tabIdx + 1) % tabKeys.length; showTab(tabKeys[tabIdx]); }, 4200); }
  $("#tabstrip").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tabIdx = tabKeys.indexOf(b.dataset.k); showTab(b.dataset.k); clearInterval(tabTimer);
    clearTimeout(autoTabs.t); autoTabs.t = setTimeout(autoTabs, 12000);
  });
  showTab(tabKeys[tabIdx]);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) autoTabs();

  // ---- discovery ("Find something. Try it instantly.") ----
  const found = ["myntra", "amazon", "ajio", "hm"];
  $("#found").innerHTML = found.map((k) => {
    const p = P[k];
    return `<article class="pc"><div class="pc-img" data-k="${k}"></div><div class="pc-body"><div class="pc-name">${p.name.replace("Men's ", "")}</div>
      <div class="pc-meta"><b>${p.price}</b><span>${p.store}</span></div><button class="pc-try" data-try="${k}">✦ Try On</button></div></article>`;
  }).join("");
  $$("#found .pc-img").forEach((el) => fillFlat(el, el.dataset.k, true));

  // ---- journey ("From your favorite store to you.") ----
  $("#j-grid").innerHTML = ["myntra", "amazon", "ajio", "zara"].map((k) => `<div class="jt" data-k="${k}"></div>`).join("");
  $$("#j-grid .jt").forEach((el) => fillFlat(el, el.dataset.k));
  fillFlat($("#j-img"), "amazon");
  $("#j-me").innerHTML = person(P.amazon.type, P.amazon.c);

  // ---- pricing currency: rupees for India (detected from the time zone), dollars elsewhere; the visitor can switch ----
  {
    const packs = $$("#packs .pack");
    const fmt = (n, c) => (c === "INR" ? "₹" + Math.round(n).toLocaleString("en-IN") : "$" + (Number.isInteger(n) ? n : n.toFixed(2)));
    const setCur = (c) => {
      for (const p of packs) {
        const passes = +p.dataset.passes, price = +p.dataset[c.toLowerCase()];
        $(".p", p).textContent = fmt(price, c);
        $(".pp", p).textContent = (c === "INR" ? "₹" + Math.round(price / passes) : "$" + (price / passes).toFixed(2)) + " per pass";
      }
      $$("#curSwitch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cur === c)));
      $("#curNote").textContent = c === "INR" ? "Prices in Indian rupees (UPI, cards, netbanking, wallets)." : "Prices in US dollars. Checkout outside India is not open yet.";
    };
    let saved = null; try { saved = localStorage.getItem("trysee-cur"); } catch {}
    const india = /^Asia\/(Kolkata|Calcutta)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    setCur(saved === "USD" || saved === "INR" ? saved : india ? "INR" : "USD");
    $("#curSwitch").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setCur(b.dataset.cur);
      try { localStorage.setItem("trysee-cur", b.dataset.cur); } catch {}
    });
  }

  // ---- try-on modal (shared by every "Try On" button) ----
  const modal = $("#tm");
  let timer = null;
  function openTry(k) {
    const p = P[k];
    $("#tm-title").textContent = `${p.name} · ${p.store}`;
    fillFlat($("#tm-prod"), k);
    $("#tm-me").innerHTML = person(p.type, p.c);
    modal.classList.remove("done"); modal.hidden = false; document.body.style.overflow = "hidden";
    clearTimeout(timer); timer = setTimeout(() => modal.classList.add("done"), 1500);
    $("#tm-close").focus();
  }
  function closeTry() { modal.hidden = true; document.body.style.overflow = ""; clearTimeout(timer); }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-try]"); if (b) openTry(b.dataset.try); });
  document.addEventListener("keydown", (e) => { const b = e.target.closest?.(".tp[data-try]"); if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openTry(b.dataset.try); } });
  $("#tm-close").onclick = closeTry; $("#tm-back").onclick = closeTry;
  modal.addEventListener("click", (e) => { if (e.target === modal) closeTry(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeTry(); });
})();
