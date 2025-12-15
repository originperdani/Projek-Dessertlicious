const hamburger = document.getElementById("hamburger");
const mobileMenu = document.getElementById("mobileMenu");
if (hamburger && mobileMenu) {
  hamburger.addEventListener("click", () => {
    mobileMenu.style.display =
      mobileMenu.style.display === "flex" ? "none" : "flex";
  });
}
const slider = document.getElementById("slider");
const dots = document.getElementById("sliderDots");
let current = 0;
if (slider && dots) {
  const slides = [...slider.querySelectorAll(".slide")];
  function renderDots() {
    dots.innerHTML = "";
    slides.forEach((_, i) => {
      const b = document.createElement("button");
      if (i === current) b.classList.add("active");
      b.addEventListener("click", () => {
        current = i;
        updateSlide();
      });
      dots.appendChild(b);
    });
  }
  const LOCAL_PLACES = [
    {
      id: "unpam_pusat",
      title: "Universitas Pamulang (Pusat)",
      subtitle: "Jl. Surya Kencana, Pamulang, Tangerang Selatan, Banten, 15417",
      lat: -6.3435,
      lon: 106.7388,
    },
    {
      id: "unpam_viktor",
      title: "Universitas Pamulang (Kampus Viktor)",
      subtitle: "Jl. Raya Viktor, Buaran, Serpong, Tangerang Selatan",
      lat: -6.3332,
      lon: 106.7356,
    },
    {
      id: "unpam_witana",
      title: "Universitas Pamulang (Gedung Witana)",
      subtitle: "Witana Harja, Pamulang, Tangerang Selatan",
      lat: -6.3439,
      lon: 106.7432,
    },
    {
      id: "pamulang_square",
      title: "Pamulang Square",
      subtitle: "Jl. Siliwangi, Pamulang Barat, Tangerang Selatan",
      lat: -6.3457,
      lon: 106.7413,
    },
    {
      id: "ui_depok",
      title: "Universitas Indonesia (Depok)",
      subtitle: "Kampus UI, Beji, Depok",
      lat: -6.3628,
      lon: 106.8286,
    },
  ];
  function searchLocal(q) {
    const s = String(q || "").toLowerCase();
    const scored = LOCAL_PLACES.map((p) => {
      const t = p.title.toLowerCase();
      const sub = p.subtitle.toLowerCase();
      let score = 0;
      if (t.startsWith(s)) score += 3;
      if (t.includes(s)) score += 2;
      if (sub.includes(s)) score += 1;
      return { ...p, score };
    }).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6);
  }
  function dedupeAndSort(items, store) {
    const uniq = [];
    const seen = new Set();
    for (const it of items) {
      const key = `${Number(it.lat).toFixed(5)},${Number(it.lon).toFixed(5)}|${
        it.title
      }`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(it);
    }
    return uniq
      .map((it) => ({
        ...it,
        dist: store
          ? haversine(store.lat, store.lon, Number(it.lat), Number(it.lon))
          : 0,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  }
  const PLACES_PROVIDER =
    localStorage.getItem("PLACES_PROVIDER") || window.PLACES_PROVIDER || "";
  const PLACES_TOKEN =
    localStorage.getItem("PLACES_TOKEN") || window.PLACES_TOKEN || "";
  let userLoc;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLoc = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
      },
      () => {}
    );
  }
  async function providerSuggestions(q, store) {
    try {
      const prox = userLoc || store;
      if (PLACES_PROVIDER.toLowerCase() === "mapbox" && PLACES_TOKEN) {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          q
        )}.json?types=place,poi,address&language=id&limit=10${
          prox ? `&proximity=${prox.lon},${prox.lat}` : ""
        }&bbox=106.6,-6.5,107.0,-6.2&access_token=${PLACES_TOKEN}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.features || []).map((f) => ({
          title: f.text || f.place_name || q,
          subtitle: f.place_name || "",
          lat: f.center?.[1],
          lon: f.center?.[0],
        }));
      }
      if (PLACES_PROVIDER.toLowerCase() === "locationiq" && PLACES_TOKEN) {
        const url = `https://api.locationiq.com/v1/autocomplete.php?key=${PLACES_TOKEN}&q=${encodeURIComponent(
          q
        )}&limit=10&countrycodes=id`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data || []).map((d) => ({
          title: d.display_place || d.address?.name || q,
          subtitle: d.display_address || d.address?.road || "",
          lat: Number(d.lat),
          lon: Number(d.lon),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }
  let abortLocalCtrl, abortGlobalCtrl;
  async function fetchSuggestionsFast(q) {
    const local = searchLocal(q);
    if (local.length) renderSuggestions(local);
    try {
      const store = await getStoreCoords();
      const prov = await providerSuggestions(q, store);
      if (prov && prov.length) {
        renderSuggestions(dedupeAndSort([...local, ...prov], store));
      }
      const delta = 0.6;
      const minLon = store.lon - delta;
      const minLat = store.lat - delta;
      const maxLon = store.lon + delta;
      const maxLat = store.lat + delta;
      const urlLocal = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=id&namedetails=1&addressdetails=1&accept-language=id&viewbox=${minLon},${minLat},${maxLon},${maxLat}&bounded=1&q=${encodeURIComponent(
        q
      )}`;
      const urlGlobal = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&countrycodes=id&namedetails=1&addressdetails=1&accept-language=id&q=${encodeURIComponent(
        q
      )}`;
      if (abortLocalCtrl) abortLocalCtrl.abort();
      if (abortGlobalCtrl) abortGlobalCtrl.abort();
      abortLocalCtrl = new AbortController();
      abortGlobalCtrl = new AbortController();
      const [resLocal, resGlobal] = await Promise.all([
        fetch(urlLocal, {
          headers: { "User-Agent": "Dessertlicious-DE/1.0" },
          signal: abortLocalCtrl.signal,
        }),
        fetch(urlGlobal, {
          headers: { "User-Agent": "Dessertlicious-DE/1.0" },
          signal: abortGlobalCtrl.signal,
        }),
      ]);
      const dataLocal = resLocal.ok ? await resLocal.json() : [];
      const dataGlobal = resGlobal.ok ? await resGlobal.json() : [];
      const merged = [...dataGlobal, ...dataLocal];
      const seen = new Set();
      const items = [];
      for (const d of merged) {
        const id = d.place_id || `${d.lat},${d.lon}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const title =
          d.namedetails?.name ||
          d.name ||
          d.address?.amenity ||
          d.address?.building ||
          d.address?.road ||
          d.display_name;
        const addrParts = [
          d.address?.house_number,
          d.address?.road,
          d.address?.neighbourhood,
          d.address?.village,
          d.address?.suburb,
          d.address?.hamlet,
          d.address?.city_district,
          d.address?.city,
          d.address?.county,
          d.address?.state,
          d.address?.postcode,
        ].filter(Boolean);
        const subtitle = addrParts.join(", ");
        items.push({
          title,
          subtitle,
          lat: d.lat,
          lon: d.lon,
        });
      }
      const combined =
        local.length > 0
          ? dedupeAndSort([...local, ...items], store)
          : dedupeAndSort(items, store);
      renderSuggestions(combined);
    } catch {
      if (!local.length) renderSuggestions([]);
    }
  }
  function updateSlide() {
    slides.forEach((s, i) => {
      s.classList.toggle("active", i === current);
    });
    [...dots.children].forEach((d, i) => {
      d.classList.toggle("active", i === current);
    });
  }
  renderDots();
  updateSlide();
  setInterval(() => {
    current = (current + 1) % slides.length;
    updateSlide();
  }, 4000);
}
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("reveal");
      }
    });
  },
  { threshold: 0.12 }
);
document
  .querySelectorAll(
    ".card,.category,.tile,.promo-box,.footer-grid,.special-card,.showcase-tile,.brand-box,.cta-strip,.promo-card"
  )
  .forEach((el) => observer.observe(el));
const cartBtn = document.getElementById("cartBtn");
const cartCount = document.getElementById("cartCount");
const CART_KEY = "cartItems";
const AUTH_KEY = "authUser";
const MERCHANT_WA = "6281234567890";
const ADMIN_WAS = ["085793930723", "085770200063", "089604067142"];
function getCart() {
  try {
    const v = localStorage.getItem(CART_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}
function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}
function updateCartBadge() {
  if (!cartCount) return;
  const items = getCart();
  const total = items.reduce((s, i) => s + (i.qty || 1), 0);
  cartCount.textContent = String(total);
}
function getAuth() {
  try {
    const v = localStorage.getItem(AUTH_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function setAuth(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}
function updateLoginButton() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;
  const user = getAuth();
  btn.textContent = user ? "Keluar" : "Masuk";
  btn.className = user ? "btn-outline" : "btn";
  btn.onclick = () => {
    const current = getAuth();
    if (current) {
      clearAuth();
      location.reload();
    } else {
      location.href = "login.html";
    }
  };
}
function parsePrice(text) {
  const n = parseInt(String(text || "").replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
function idr(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}
const CAKE_ITEMS = new Set([
  "Strawberry Shortcake",
  "Chocolate Fudge",
  "Red Velvet",
  "Tiramisu",
  "Matcha Cheesecake",
]);
const PASTRY_ITEMS = new Set([
  "Croissant Butter",
  "Pain Au Chocolat",
  "Danish Fruit",
  "Brownies Almond",
  "Churros Cinnamon",
]);
const PUDING_ITEMS = new Set([
  "Pannacotta Berry",
  "Mango Pudding",
  "Caramel Custard",
  "Chocolate Mousse",
  "Vanilla Pudding",
]);
const NAME_TO_IMAGE = {
  "Strawberry Shortcake": "./assets/strawberry-shortcake.jpeg",
  "Chocolate Fudge": "./assets/chocolate-fudge.jpeg",
  "Red Velvet": "./assets/red-velvet.jpeg",
  Tiramisu: "./assets/tiramisu.jpeg",
  "Matcha Cheesecake": "./assets/matcha-cheesecake.jpeg",
  "Croissant Butter": "./assets/croissant-butter.jpeg",
  "Pain Au Chocolat": "./assets/pain-au-chocolat.jpeg",
  "Danish Fruit": "./assets/danish-fruit.jpeg",
  "Brownies Almond": "./assets/brownies-almond.jpeg",
  "Churros Cinnamon": "./assets/churros manis.jpeg",
  "Pannacotta Berry": "./assets/pannacotta-berry.jpeg",
  "Mango Pudding": "./assets/mango-pudding.jpeg",
  "Caramel Custard": "./assets/caramel-custard.jpeg",
  "Chocolate Mousse": "./assets/chocolate-mousse.jpeg",
  "Vanilla Pudding": "./assets/vanilla-pudding.jpeg",
};
const NAME_TO_PRICE = {
  "Strawberry Shortcake": 24000,
  "Chocolate Fudge": 26000,
  "Red Velvet": 25000,
  Tiramisu: 28000,
  "Matcha Cheesecake": 29000,
  "Croissant Butter": 15000,
  "Pain Au Chocolat": 17000,
  "Danish Fruit": 16000,
  "Brownies Almond": 18000,
  "Churros Cinnamon": 14000,
  "Pannacotta Berry": 20000,
  "Mango Pudding": 19000,
  "Caramel Custard": 18000,
  "Chocolate Mousse": 21000,
  "Vanilla Pudding": 17000,
};
function resolveImageForName(name) {
  return NAME_TO_IMAGE[name] || "";
}
function getCategoryByName(name) {
  if (CAKE_ITEMS.has(name)) return "cake";
  if (PASTRY_ITEMS.has(name)) return "pastry";
  if (PUDING_ITEMS.has(name)) return "puding";
  return "";
}
function computePromo(code, category, subtotal) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  let rate = 0;
  let valid = false;
  if (c === "CAKE20" && category === "cake") {
    rate = 0.2;
    valid = true;
  } else if (c === "PASTRY15" && category === "pastry") {
    rate = 0.15;
    valid = true;
  } else if (c === "PUDING10" && category === "puding") {
    rate = 0.1;
    valid = true;
  }
  const amount = Math.floor(subtotal * rate);
  return { amount, valid, code: c };
}
function computePromoForItems(code, items) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  let rate = 0;
  let target = "";
  if (c === "CAKE20") {
    rate = 0.2;
    target = "cake";
  } else if (c === "PASTRY15") {
    rate = 0.15;
    target = "pastry";
  } else if (c === "PUDING10") {
    rate = 0.1;
    target = "puding";
  }
  const eligibleSum = items
    .filter((it) => getCategoryByName(it.name) === target)
    .reduce((s, it) => s + it.price * (it.qty || 1), 0);
  const amount = Math.floor(eligibleSum * rate);
  return { amount, valid: amount > 0 && rate > 0, code: c };
}
document.querySelectorAll(".add-cart").forEach((btn) =>
  btn.addEventListener("click", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const name =
      btn.getAttribute("data-name") ||
      btn.closest(".special-card")?.querySelector("h3")?.textContent ||
      btn.closest(".menu-card")?.querySelector(".menu-info h4")?.textContent ||
      "Item";
    const priceText =
      btn.closest(".special-card")?.querySelector(".price")?.textContent ||
      btn.closest(".menu-bottom")?.querySelector(".price")?.textContent ||
      "";
    const price = parsePrice(priceText);
    const imgSrc =
      btn.closest(".menu-card")?.querySelector("img")?.src ||
      btn.closest(".special-card")?.querySelector("img")?.src ||
      resolveImageForName(name) ||
      "";
    const items = getCart();
    const ex = items.find((i) => i.name === name);
    if (ex) {
      ex.qty = (ex.qty || 1) + 1;
      if (!ex.img && imgSrc) ex.img = imgSrc;
    } else {
      items.push({ name, price, qty: 1, img: imgSrc });
    }
    setCart(items);
    showToast(`${name} ditambahkan ke keranjang`);
    showAddedModal(name);
  })
);

document.querySelectorAll(".order-btn").forEach((btn) =>
  btn.addEventListener("click", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const name =
      btn.getAttribute("data-name") ||
      btn.closest(".menu-card")?.querySelector(".menu-info h4")?.textContent ||
      "Item";
    const priceText =
      btn.closest(".menu-bottom")?.querySelector(".price")?.textContent || "";
    const priceAttr = btn.getAttribute("data-price");
    const price = priceAttr ? Number(priceAttr) : parsePrice(priceText);
    const imgSrc =
      btn.closest(".menu-card")?.querySelector("img")?.src ||
      btn.closest(".special-card")?.querySelector("img")?.src ||
      "";
    try {
      sessionStorage.setItem("orderItem", name);
      sessionStorage.setItem("orderPrice", String(price));
      if (imgSrc) sessionStorage.setItem("orderImg", imgSrc);
    } catch {}
    const q = encodeURIComponent(name);
    const qi = imgSrc ? `&img=${encodeURIComponent(imgSrc)}` : "";
    location.href = `order.html?item=${q}&price=${price}${qi}`;
  })
);

function initOrderPage() {
  const form = document.getElementById("orderPageForm");
  if (!form) return;
  const params = new URLSearchParams(location.search);
  const isMulti = params.get("multi") === "1";
  let multiItems = [];
  if (isMulti) {
    try {
      multiItems =
        JSON.parse(sessionStorage.getItem("orderMulti") || "[]") || [];
    } catch {
      multiItems = [];
    }
    if (!Array.isArray(multiItems) || multiItems.length === 0) {
      const fallback = getCart().filter((i) =>
        typeof i.sel === "undefined" ? true : !!i.sel
      );
      multiItems = Array.isArray(fallback) ? fallback : [];
    }
  }
  let name = params.get("item");
  let price = parseInt(params.get("price") || "0", 10);
  let img = params.get("img");
  try {
    const sName = sessionStorage.getItem("orderItem");
    const sPrice = parseInt(sessionStorage.getItem("orderPrice") || "0", 10);
    const sImg = sessionStorage.getItem("orderImg");
    if (sName) name = sName;
    if (!price || isNaN(price)) price = sPrice;
    if (!img && sImg) img = sImg;
  } catch {}
  name = name || "Item";
  price = isNaN(price) ? 0 : price;
  const itemEl = document.getElementById("orderItemPage");
  const qtyEl = document.getElementById("orderQtyPage");
  const totalEl = document.getElementById("orderTotalPage");
  const priceEl = document.getElementById("orderPricePage");
  const shipEl = document.getElementById("orderShipPage");
  const methodEl = document.getElementById("orderMethodPage");
  const payEl = document.getElementById("orderPayPage");
  const distanceRow = document.getElementById("distanceRow");
  const distanceEl = document.getElementById("distanceKmPage");
  const courierRow = document.getElementById("courierRow");
  const courierEl = document.getElementById("orderCourierPage");
  const subtotalEl = document.getElementById("orderSubtotalPage");
  const imgEl = document.getElementById("orderImgPage");
  const promoEl = document.getElementById("promoCodePage");
  const applyPromoBtn = document.getElementById("applyPromoPage");
  const promoStatusEl = document.getElementById("promoStatusPage");
  const discountEl = document.getElementById("orderDiscountPage");
  const itemsListRow = document.getElementById("orderItemsListRow");
  const itemsListEl = document.getElementById("orderItemsListPage");
  const selectEl = document.getElementById("orderSelectPage");
  const qrisModal = document.getElementById("qrisModal");
  const qrisAmountEl = document.getElementById("qrisAmount");
  const qrisSimBtn = document.getElementById("qrisSimulate");
  const qrisCancelBtn = document.getElementById("qrisCancel");
  itemEl.value = name;
  if (priceEl) {
    priceEl.value = idr(price);
    priceEl.setAttribute("disabled", "true");
    priceEl.setAttribute("readonly", "true");
  }
  if (itemEl) {
    itemEl.setAttribute("disabled", "true");
    itemEl.setAttribute("readonly", "true");
  }
  if (imgEl && img) {
    imgEl.src = img;
    imgEl.style.display = "block";
  }
  if (selectEl) {
    const allNames = [
      ...CAKE_ITEMS.values(),
      ...PASTRY_ITEMS.values(),
      ...PUDING_ITEMS.values(),
    ];
    selectEl.innerHTML =
      `<option value="">Pilih menu…</option>` +
      allNames
        .map(
          (n) =>
            `<option value="${n}" ${n === name ? "selected" : ""}>${n} (${idr(
              NAME_TO_PRICE[n] || 0
            )})</option>`
        )
        .join("");
    selectEl.addEventListener("change", () => {
      const sel = selectEl.value;
      if (!sel) return;
      name = sel;
      price = NAME_TO_PRICE[sel] || 0;
      const imgSrc = resolveImageForName(sel);
      if (itemEl) itemEl.value = name;
      if (priceEl) priceEl.value = idr(price);
      if (imgEl) {
        if (imgSrc) {
          imgEl.src = imgSrc;
          imgEl.style.display = "block";
        } else {
          imgEl.src = "";
          imgEl.style.display = "none";
        }
      }
      recalc();
    });
  }
  if (isMulti) {
    if (imgEl) {
      imgEl.src = "";
      imgEl.style.display = "none";
    }
    const qtyRow = document
      .getElementById("qtyMinusPage")
      ?.closest(".form-row");
    if (qtyRow) qtyRow.style.display = "none";
    const menuRow = itemEl?.closest(".form-row");
    const priceRow = priceEl?.closest(".form-row");
    if (menuRow) menuRow.style.display = "none";
    if (priceRow) priceRow.style.display = "none";
    if (itemsListRow) itemsListRow.style.display = "block";
    if (itemsListEl) {
      itemsListEl.innerHTML = multiItems
        .map(
          (it) =>
            `<div class="card reveal" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:10px">
                <img src="${
                  it.img || resolveImageForName(it.name) || ""
                }" alt="${
              it.name
            }" style="width:64px;height:64px;object-fit:cover;border-radius:12px" />
                <div>
                  <div style="font-weight:700">${it.name}</div>
                  <div style="color:#55626e">${idr(it.price)}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="min-width:28px;text-align:center">${
                  it.qty || 1
                }</div>
                <div style="font-weight:700">${idr(
                  it.price * (it.qty || 1)
                )}</div>
              </div>
            </div>`
        )
        .join("");
    }
  }
  // single-item order page
  const previewEl = document.getElementById("orderPreviewText");
  const waBtn = document.getElementById("orderWhatsApp");
  const copyBtn = document.getElementById("orderCopy");
  function calcShip(method, km) {
    if (method !== "delivery") return 0;
    const d = Math.max(0, Number(km || 0));
    function bracketPrice(distanceKm) {
      const x = Math.ceil(distanceKm);
      if (x <= 10) return 15000;
      if (x <= 20) return 20000;
      if (x <= 30) return 25000;
      if (x <= 40) return 30000;
      return 30000 + Math.max(0, x - 40) * 1000;
    }
    return bracketPrice(d);
  }
  function formatWaNumber(raw) {
    const digits = String(raw || "").replace(/[^0-9]/g, "");
    if (!digits) return MERCHANT_WA;
    if (digits.startsWith("0")) return "62" + digits.slice(1);
    if (digits.startsWith("62")) return digits;
    return digits;
  }
  async function geocodeAddress(addr) {
    const q = encodeURIComponent(addr);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&q=${q}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Dessertlicious-DE/1.0" },
    });
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
    }
    throw new Error("no result");
  }
  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  async function routeDistanceKm(lat1, lon1, lat2, lon2) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("route failed");
      const data = await res.json();
      const m = data?.routes?.[0]?.distance || 0;
      return m / 1000;
    } catch {
      return haversine(lat1, lon1, lat2, lon2);
    }
  }
  const STORE_ADDRESS =
    "PURI BUKIT DEPOK BLOK F4 NO.23 RT.13 RW.10 SASAKPANJANG TAJUR HALANG BOGOR";
  let STORE_COORDS;
  async function getStoreCoords() {
    if (STORE_COORDS) return STORE_COORDS;
    try {
      const form = document.getElementById("orderPageForm");
      const latAttr = form?.getAttribute("data-store-lat");
      const lonAttr = form?.getAttribute("data-store-lon");
      if (latAttr && lonAttr) {
        STORE_COORDS = { lat: Number(latAttr), lon: Number(lonAttr) };
      } else {
        STORE_COORDS = await geocodeAddress(STORE_ADDRESS);
      }
    } catch {
      STORE_COORDS = { lat: -6.336, lon: 106.738 };
    }
    return STORE_COORDS;
  }
  let distanceTimer;
  async function autoDistanceFromAddress() {
    if (methodEl.value !== "delivery") return;
    const addr = document.getElementById("buyerAddressPage").value.trim();
    if (!addr) return;
    try {
      const store = await getStoreCoords();
      if (selectedDest) {
        const km = await routeDistanceKm(
          store.lat,
          store.lon,
          selectedDest.lat,
          selectedDest.lon
        );
        if (distanceEl) distanceEl.value = String(km.toFixed(2));
        recalc();
        return;
      }
      const dest = await geocodeAddress(addr);
      const km = await routeDistanceKm(
        store.lat,
        store.lon,
        dest.lat,
        dest.lon
      );
      if (distanceEl) distanceEl.value = String(km.toFixed(2));
      recalc();
    } catch {}
  }
  const suggestBox = document.getElementById("addressSuggest");
  let selectedDest = null;
  function renderSuggestions(items) {
    if (!suggestBox) return;
    if (!items.length) {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      return;
    }
    suggestBox.style.display = "block";
    suggestBox.className = "suggest-list";
    suggestBox.innerHTML = items
      .map(
        (it) =>
          `<div class="suggest-item" data-lat="${it.lat}" data-lon="${it.lon}"><div class="suggest-item-title">${it.title}</div><div class="suggest-item-sub">${it.subtitle}</div></div>`
      )
      .join("");
    suggestBox.querySelectorAll(".suggest-item").forEach((el) =>
      el.addEventListener("click", async () => {
        const addrEl = document.getElementById("buyerAddressPage");
        if (addrEl) {
          const t = el.querySelector(".suggest-item-title")?.textContent || "";
          const s = el.querySelector(".suggest-item-sub")?.textContent || "";
          addrEl.value = s ? `${t}, ${s}` : t;
        }
        suggestBox.style.display = "none";
        const store = await getStoreCoords();
        const lat = Number(el.getAttribute("data-lat"));
        const lon = Number(el.getAttribute("data-lon"));
        selectedDest = { lat, lon };
        const km = await routeDistanceKm(store.lat, store.lon, lat, lon);
        if (distanceEl) distanceEl.value = String(km.toFixed(2));
        recalc();
      })
    );
  }
  let suggestTimer;
  const geocodeCache = new Map();
  let lastSuggestions = [];
  async function fetchSuggestions(q) {
    try {
      const store = await getStoreCoords();
      const delta = 0.6;
      const minLon = store.lon - delta;
      const minLat = store.lat - delta;
      const maxLon = store.lon + delta;
      const maxLat = store.lat + delta;
      const urlLocal = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=id&namedetails=1&addressdetails=1&accept-language=id&viewbox=${minLon},${minLat},${maxLon},${maxLat}&bounded=1&q=${encodeURIComponent(
        q
      )}`;
      const urlGlobal = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&countrycodes=id&namedetails=1&addressdetails=1&accept-language=id&q=${encodeURIComponent(
        q
      )}`;
      const cacheKeyLocal = `local:${q}`;
      const cacheKeyGlobal = `global:${q}`;
      const pLocal =
        geocodeCache.get(cacheKeyLocal) ||
        fetch(urlLocal, { headers: { "User-Agent": "Dessertlicious-DE/1.0" } })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => {
            geocodeCache.set(cacheKeyLocal, d);
            return d;
          });
      const pGlobal =
        geocodeCache.get(cacheKeyGlobal) ||
        fetch(urlGlobal, { headers: { "User-Agent": "Dessertlicious-DE/1.0" } })
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => {
            geocodeCache.set(cacheKeyGlobal, d);
            return d;
          });
      const dataGlobal = await pGlobal;
      const itemsGlobal = normalizeSuggestions(dataGlobal);
      lastSuggestions = dedupeAndSort(itemsGlobal, store);
      renderSuggestions(lastSuggestions);
      const dataLocal = await pLocal;
      const merged = [...itemsGlobal, ...normalizeSuggestions(dataLocal)];
      lastSuggestions = dedupeAndSort(merged, store);
      renderSuggestions(lastSuggestions);
    } catch {
      renderSuggestions([]);
    }
  }
  function normalizeSuggestions(arr) {
    const out = [];
    for (const d of arr || []) {
      const title =
        d.namedetails?.name ||
        d.name ||
        d.address?.amenity ||
        d.address?.building ||
        d.address?.road ||
        d.display_name;
      const addrParts = [
        d.address?.house_number,
        d.address?.road,
        d.address?.neighbourhood,
        d.address?.village,
        d.address?.suburb,
        d.address?.hamlet,
        d.address?.city_district,
        d.address?.city,
        d.address?.county,
        d.address?.state,
        d.address?.postcode,
      ].filter(Boolean);
      out.push({
        id: d.place_id || `${d.lat},${d.lon}`,
        title,
        subtitle: addrParts.join(", "),
        lat: d.lat,
        lon: d.lon,
      });
    }
    return out;
  }
  function dedupeAndSort(items, store) {
    const seen = new Set();
    const uniq = [];
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      uniq.push(it);
    }
    return uniq
      .map((it) => ({
        ...it,
        dist: store
          ? haversine(store.lat, store.lon, Number(it.lat), Number(it.lon))
          : 0,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  }
  function buildMessage() {
    const qty = Math.max(1, Number(qtyEl.value || 1));
    const buyer = document.getElementById("buyerNamePage").value.trim();
    const phone = document.getElementById("buyerPhonePage").value.trim();
    const addr = document.getElementById("buyerAddressPage").value.trim();
    const method = methodEl.value;
    const payMethod = payEl?.value || "cash";
    const dist = Number(distanceEl?.value || 0);
    const courier = courierEl?.value || "-";
    const date = document.getElementById("orderDatePage").value;
    const time = document.getElementById("orderTimePage").value;
    const note = document.getElementById("orderNotePage").value.trim();
    const ship = calcShip(method, dist);
    let parts = [];
    let netSubtotal = 0;
    if (typeof isMulti !== "undefined" && isMulti) {
      const subtotal = multiItems.reduce(
        (s, it) => s + it.price * (it.qty || 1),
        0
      );
      const promo = computePromoForItems(promoEl?.value, multiItems);
      netSubtotal = Math.max(0, subtotal - promo.amount);
      const list = multiItems
        .map(
          (it) =>
            `- ${it.name} x${it.qty || 1} @ ${idr(it.price)} = ${idr(
              it.price * (it.qty || 1)
            )}`
        )
        .join("\n");
      parts = [
        `Halo Dessertlicious, saya ingin pesan:`,
        list,
        `Subtotal: ${idr(netSubtotal)}`,
        promo.amount > 0
          ? `Promo: ${promo.code} (−${idr(promo.amount)})`
          : `Promo: -`,
      ];
    } else {
      const category = getCategoryByName(name);
      const subtotal = price * qty;
      const promo = computePromo(promoEl?.value, category, subtotal);
      netSubtotal = Math.max(0, subtotal - promo.amount);
      parts = [
        `Halo Dessertlicious, saya ingin pesan:`,
        `Menu: ${name}`,
        `Jumlah: ${qty}`,
        `Harga: ${idr(price)} (Subtotal: ${idr(netSubtotal)})`,
        promo.amount > 0
          ? `Promo: ${promo.code} (−${idr(promo.amount)})`
          : `Promo: -`,
      ];
    }
    const total = idr(netSubtotal + ship);
    parts = parts.concat([
      `Kurir: ${method === "delivery" ? courier.toUpperCase() : "-"}`,
      `Ongkir: ${idr(ship)}`,
      `Total: ${total}`,
      `Metode: ${method === "delivery" ? "Diantar" : "Ambil di toko"}`,
      `Pembayaran: ${payMethod === "cashless" ? "Non Tunai (QRIS)" : "Tunai"}`,
      `Jadwal: ${date || "-"} ${time || ""}`,
      `Nama: ${buyer || "-"}`,
      `No. HP: ${phone || "-"}`,
      `Alamat: ${addr || "-"}`,
      `Catatan: ${note || "-"}`,
    ]);
    return parts.join("\n");
  }
  function recalc() {
    const qty = Math.max(1, Number(qtyEl.value || 1));
    const ship = calcShip(methodEl.value, Number(distanceEl?.value || 0));
    let promo, netSubtotal;
    if (typeof isMulti !== "undefined" && isMulti) {
      const subtotal = multiItems.reduce(
        (s, it) => s + it.price * (it.qty || 1),
        0
      );
      promo = computePromoForItems(promoEl?.value, multiItems);
      netSubtotal = Math.max(0, subtotal - promo.amount);
    } else {
      const category = getCategoryByName(name);
      const subtotal = price * qty;
      promo = computePromo(promoEl?.value, category, subtotal);
      netSubtotal = Math.max(0, subtotal - promo.amount);
    }
    if (discountEl) discountEl.textContent = idr(promo.amount);
    if (shipEl) shipEl.textContent = idr(ship);
    if (subtotalEl) subtotalEl.textContent = idr(netSubtotal);
    totalEl.textContent = idr(netSubtotal + ship);
    if (promoStatusEl) {
      const c = String(promoEl?.value || "").trim();
      if (!c) {
        promoStatusEl.textContent = "";
        promoStatusEl.className = "promo-status";
      } else if (promo.valid) {
        promoStatusEl.textContent = "Kode promo diterapkan";
        promoStatusEl.className = "promo-status ok";
      } else {
        promoStatusEl.textContent = "Kode promo tidak berlaku untuk menu ini";
        promoStatusEl.className = "promo-status err";
      }
    }
    if (previewEl) {
      const msg = buildMessage();
      previewEl.textContent = msg;
      const to = formatWaNumber(
        document.getElementById("buyerPhonePage").value
      );
      if (waBtn) {
        const adminMsg =
          "Halo Dessertlicious 😊\nSaya tertarik untuk memesan dessert. Boleh minta rekomendasinya?";
        const finalMsg = to === MERCHANT_WA ? adminMsg : msg;
        waBtn.href = `https://wa.me/${to}?text=${encodeURIComponent(finalMsg)}`;
      }
    }
  }
  recalc();
  function toggleDistance() {
    if (!distanceRow) return;
    distanceRow.style.display =
      methodEl.value === "delivery" ? "block" : "none";
    if (courierRow)
      courierRow.style.display =
        methodEl.value === "delivery" ? "block" : "none";
  }
  toggleDistance();
  document.getElementById("qtyPlusPage").addEventListener("click", () => {
    qtyEl.value = String(Math.max(1, Number(qtyEl.value || 1)) + 1);
    recalc();
  });
  document.getElementById("qtyMinusPage").addEventListener("click", () => {
    qtyEl.value = String(Math.max(1, Number(qtyEl.value || 1) - 1));
    recalc();
  });
  qtyEl.addEventListener("input", recalc);
  form
    .querySelectorAll("input,textarea,select")
    .forEach((el) => el.addEventListener("input", recalc));
  const addrEl = document.getElementById("buyerAddressPage");
  if (addrEl)
    addrEl.addEventListener("input", () => {
      clearTimeout(suggestTimer);
      clearTimeout(distanceTimer);
      selectedDest = null;
      const v = addrEl.value.trim();
      if (methodEl.value === "delivery" && v.length >= 1) {
        suggestTimer = setTimeout(() => fetchSuggestionsFast(v), 90);
        distanceTimer = setTimeout(autoDistanceFromAddress, 600);
      } else {
        renderSuggestions([]);
      }
    });
  if (addrEl)
    addrEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = document.querySelector("#addressSuggest .suggest-item");
        if (first) first.click();
      }
    });
  methodEl.addEventListener("change", () => {
    toggleDistance();
    recalc();
    autoDistanceFromAddress();
  });
  if (courierEl) courierEl.addEventListener("change", recalc);
  if (promoEl) promoEl.addEventListener("input", recalc);
  if (applyPromoBtn) applyPromoBtn.addEventListener("click", recalc);
  if (payEl) payEl.addEventListener("change", recalc);
  function updatePromoStyle() {
    recalc();
  }
  document
    .getElementById("applyPromoPage")
    ?.addEventListener("click", updatePromoStyle);
  promoEl?.addEventListener("input", updatePromoStyle);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const payMethod = payEl?.value || "cash";
    if (payMethod === "cashless") {
      const qty = Math.max(1, Number(qtyEl.value || 1));
      let netSubtotal;
      if (typeof isMulti !== "undefined" && isMulti) {
        const subtotal = multiItems.reduce(
          (s, it) => s + it.price * (it.qty || 1),
          0
        );
        const promo = computePromoForItems(promoEl?.value, multiItems);
        netSubtotal = Math.max(0, subtotal - promo.amount);
      } else {
        const category = getCategoryByName(name);
        const subtotal = price * qty;
        const promo = computePromo(promoEl?.value, category, subtotal);
        netSubtotal = Math.max(0, subtotal - promo.amount);
      }
      const ship = calcShip(methodEl.value, Number(distanceEl?.value || 0));
      const total = netSubtotal + ship;
      if (qrisAmountEl) qrisAmountEl.textContent = idr(total);
      if (qrisModal) qrisModal.classList.add("show");
      return;
    }
    const qty = Math.max(1, Number(qtyEl.value || 1));
    const items = getCart();
    const ex = items.find((i) => i.name === name);
    if (ex) {
      ex.qty = (ex.qty || 1) + qty;
      ex.price = price;
    } else {
      items.push({ name, price, qty });
    }
    setCart(items);
    showToast("Pesanan ditambahkan: " + name);
    setTimeout(() => (location.href = "cart.html"), 600);
  });
  if (qrisCancelBtn)
    qrisCancelBtn.addEventListener("click", () => {
      if (qrisModal) qrisModal.classList.remove("show");
    });
  if (qrisSimBtn)
    qrisSimBtn.addEventListener("click", () => {
      if (qrisModal) qrisModal.classList.remove("show");
      showToast("Pembayaran QRIS berhasil");
      if (typeof isMulti !== "undefined" && isMulti) {
        const items = getCart();
        const keep = items.filter((i) => !i.sel);
        setCart(keep);
      }
      setTimeout(() => (location.href = "index.html"), 800);
    });
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const msg = buildMessage();
      if (navigator.clipboard) navigator.clipboard.writeText(msg);
      showToast("Pesan disalin");
    });
  }
  let adminModal;
  function ensureAdminModal() {
    if (adminModal) return;
    adminModal = document.createElement("div");
    adminModal.className = "modal";
    adminModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-title">Pilih Admin WhatsApp</div>
        <div class="modal-body">Silakan pilih admin tujuan untuk mengirim pesanan.</div>
        <div class="modal-actions" style="justify-content: space-between">
          <div style="display:flex;gap:8px">
            <button class="btn" data-admin-index="0">Admin 1</button>
            <button class="btn-outline" data-admin-index="1">Admin 2</button>
            <button class="btn-outline" data-admin-index="2">Admin 3</button>
          </div>
          <button class="btn-outline" id="adminSelectCancel">Batal</button>
        </div>
      </div>`;
    document.body.appendChild(adminModal);
    adminModal
      .querySelector(".modal-backdrop")
      .addEventListener("click", hideAdminModal);
    adminModal
      .querySelector("#adminSelectCancel")
      .addEventListener("click", hideAdminModal);
    adminModal.querySelectorAll("[data-admin-index]").forEach((b) =>
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-admin-index"));
        const num = ADMIN_WAS[idx] || MERCHANT_WA;
        const msg = buildMessage();
        const url = `https://wa.me/${formatWaNumber(
          num
        )}?text=${encodeURIComponent(msg)}`;
        hideAdminModal();
        location.href = url;
      })
    );
  }
  function showAdminModal() {
    ensureAdminModal();
    adminModal.classList.add("show");
  }
  function hideAdminModal() {
    if (adminModal) adminModal.classList.remove("show");
  }
  if (waBtn) {
    waBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showAdminModal();
    });
  }
}

initOrderPage();
updateCartBadge();
updateLoginButton();
if (cartBtn) {
  cartBtn.addEventListener("click", () => {
    location.href = "cart.html";
  });
}
const cartList = document.getElementById("cartList");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const selectAll = document.getElementById("selectAll");
const removeSelectedBtn = document.getElementById("removeSelectedBtn");
const selectedInfo = document.getElementById("selectedInfo");
function renderCart() {
  if (!cartList) return;
  const items = getCart();
  updateCartBadge();
  if (!items.length) {
    cartList.innerHTML =
      '<div class="card reveal" style="text-align:center">Keranjang kosong</div>';
    if (cartTotal) cartTotal.textContent = idr(0);
    if (selectedInfo) selectedInfo.textContent = "0 item";
    if (selectAll) selectAll.checked = false;
    return;
  }
  items.forEach((it) => {
    if (typeof it.qty !== "number" || it.qty < 1) it.qty = 1;
    if (typeof it.sel === "undefined") it.sel = true;
  });
  setCart(items);
  let html = "";
  items.forEach((it, idx) => {
    const line = it.price * (it.qty || 1);
    html += `<div class="card reveal" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" class="sel" data-index="${idx}" ${
      it.sel ? "checked" : ""
    } />
        <div>
          <div style="font-weight:700">${it.name}</div>
          <div style="color:#55626e">${idr(it.price)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn-outline qty-minus" data-index="${idx}">−</button>
          <div style="min-width:28px;text-align:center">${it.qty}</div>
          <button class="btn-outline qty-plus" data-index="${idx}">+</button>
        </div>
        <div style="font-weight:700">${idr(line)}</div>
        <button class="btn-outline remove-item" data-index="${idx}">Hapus</button>
      </div>
    </div>`;
  });
  cartList.innerHTML = html;
  const selected = items.filter((i) => i.sel);
  const totalSel = selected.reduce((s, it) => s + it.price * (it.qty || 1), 0);
  if (cartTotal) cartTotal.textContent = idr(totalSel);
  if (selectedInfo) selectedInfo.textContent = `${selected.length} item`;
  if (selectAll) selectAll.checked = selected.length === items.length;
  document.querySelectorAll(".remove-item").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-index"));
      const items = getCart();
      items.splice(idx, 1);
      setCart(items);
      renderCart();
      showToast("Item dihapus");
    })
  );
  document.querySelectorAll(".qty-plus").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-index"));
      const items = getCart();
      items[idx].qty = (items[idx].qty || 1) + 1;
      setCart(items);
      renderCart();
    })
  );
  document.querySelectorAll(".qty-minus").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-index"));
      const items = getCart();
      const q = (items[idx].qty || 1) - 1;
      items[idx].qty = q < 1 ? 1 : q;
      setCart(items);
      renderCart();
    })
  );
  document.querySelectorAll(".sel").forEach((b) =>
    b.addEventListener("change", () => {
      const idx = Number(b.getAttribute("data-index"));
      const items = getCart();
      items[idx].sel = b.checked;
      setCart(items);
      renderCart();
    })
  );
}
renderCart();
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    const items = getCart();
    if (!items.length) {
      showToast("Keranjang kosong");
      return;
    }
    const buy = items.filter((i) => i.sel);
    if (!buy.length) {
      showToast("Pilih item terlebih dahulu");
      return;
    }
    try {
      sessionStorage.setItem("orderMulti", JSON.stringify(buy));
    } catch {}
    location.href = "order.html?multi=1";
  });
}
if (clearAllBtn) {
  clearAllBtn.addEventListener("click", () => {
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
    renderCart();
    showToast("Keranjang dikosongkan");
  });
}
if (selectAll) {
  selectAll.addEventListener("change", () => {
    const items = getCart();
    items.forEach((i) => (i.sel = selectAll.checked));
    setCart(items);
    renderCart();
  });
}
if (removeSelectedBtn) {
  removeSelectedBtn.addEventListener("click", () => {
    const items = getCart();
    const keep = items.filter((i) => !i.sel);
    setCart(keep);
    renderCart();
    showToast("Item terpilih dihapus");
  });
}
const form = document.getElementById("newsletterForm");
const email = document.getElementById("newsletterEmail");
const note = document.getElementById("newsletterNote");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = email.value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (!ok) {
      note.textContent = "Masukkan email yang valid";
      note.style.color = "#ff6b6b";
      return;
    }
    note.textContent = "Terima kasih! Kamu berhasil berlangganan";
    note.style.color = "#0f8e8b";
    email.value = "";
  });
}
const toast = document.getElementById("toast");
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}
let addedModal;
function ensureAddedModal() {
  if (!addedModal) {
    addedModal = document.createElement("div");
    addedModal.className = "modal";
    addedModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-title" id="addedTitle">Ditambahkan</div>
        <div class="modal-body" id="addedBody"></div>
        <div class="modal-actions">
          <button class="btn" id="addedOk">OK</button>
        </div>
      </div>`;
    document.body.appendChild(addedModal);
    addedModal
      .querySelector(".modal-backdrop")
      .addEventListener("click", hideAddedModal);
    addedModal
      .querySelector("#addedOk")
      .addEventListener("click", hideAddedModal);
  }
}
function showAddedModal(name) {
  ensureAddedModal();
  addedModal.querySelector("#addedTitle").textContent = "Ditambahkan";
  addedModal.querySelector("#addedBody").textContent =
    name + " ditambahkan ke keranjang";
  addedModal.classList.add("show");
}
function hideAddedModal() {
  if (addedModal) addedModal.classList.remove("show");
}

let orderModal;
function ensureOrderModal() {
  if (!orderModal) {
    orderModal = document.createElement("div");
    orderModal.className = "modal";
    orderModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-title">Form Pemesanan</div>
        <form id="orderForm">
          <div class="form-row">
            <label>Menu</label>
            <input type="text" id="orderItem" readonly />
          </div>
          <div class="form-row">
            <label>Jumlah</label>
            <div class="qty-input">
              <button type="button" class="btn-outline" id="qtyMinus">−</button>
              <input type="number" id="orderQty" min="1" value="1" style="width:60px;text-align:center" />
              <button type="button" class="btn-outline" id="qtyPlus">+</button>
            </div>
          </div>
          <div class="form-row">
            <label>Nama Lengkap</label>
            <input type="text" id="buyerName" placeholder="Nama kamu" required />
          </div>
          <div class="form-row">
            <label>No. HP</label>
            <input type="tel" id="buyerPhone" placeholder="08xxxxxxxxxx" required />
          </div>
          <div class="form-row">
            <label>Alamat</label>
            <textarea id="buyerAddress" rows="2" placeholder="Alamat pengiriman"></textarea>
          </div>
          <div class="form-row">
            <label>Metode</label>
            <select id="orderMethod">
              <option value="pickup">Ambil di toko</option>
              <option value="delivery">Diantar</option>
            </select>
          </div>
          <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label>Tanggal</label>
              <input type="date" id="orderDate" />
            </div>
            <div>
              <label>Waktu</label>
              <input type="time" id="orderTime" />
            </div>
          </div>
          <div class="form-row">
            <label>Catatan</label>
            <textarea id="orderNote" rows="2" placeholder="Catatan tambahan"></textarea>
          </div>
          <div class="form-row">
            <div class="order-total">Total: <span id="orderTotal">Rp 0</span></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-outline" id="orderCancel">Batal</button>
            <button type="submit" class="btn" id="orderSubmit">Pesan</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(orderModal);
    orderModal
      .querySelector(".modal-backdrop")
      .addEventListener("click", hideOrderModal);
    orderModal
      .querySelector("#orderCancel")
      .addEventListener("click", hideOrderModal);
    const form = orderModal.querySelector("#orderForm");
    const qtyEl = orderModal.querySelector("#orderQty");
    const totalEl = orderModal.querySelector("#orderTotal");
    function recalc() {
      const price = Number(orderModal.getAttribute("data-price") || 0);
      const qty = Math.max(1, Number(qtyEl.value || 1));
      totalEl.textContent = idr(price * qty);
    }
    orderModal.querySelector("#qtyPlus").addEventListener("click", () => {
      qtyEl.value = String(Math.max(1, Number(qtyEl.value || 1)) + 1);
      recalc();
    });
    orderModal.querySelector("#qtyMinus").addEventListener("click", () => {
      qtyEl.value = String(Math.max(1, Number(qtyEl.value || 1) - 1));
      recalc();
    });
    qtyEl.addEventListener("input", recalc);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = orderModal.querySelector("#orderItem").value;
      const qty = Math.max(1, Number(qtyEl.value || 1));
      // Tambahkan ke keranjang sebagai pesanan
      const items = getCart();
      const ex = items.find((i) => i.name === name);
      const price = Number(orderModal.getAttribute("data-price") || 0);
      if (ex) {
        ex.qty = (ex.qty || 1) + qty;
      } else {
        items.push({ name, price, qty });
      }
      setCart(items);
      hideOrderModal();
      showToast("Pesanan dibuat untuk " + name);
    });
  }
}
function showOrderModal(name, price) {
  ensureOrderModal();
  orderModal.setAttribute("data-price", String(price || 0));
  orderModal.querySelector("#orderItem").value = name || "Item";
  orderModal.querySelector("#orderQty").value = "1";
  orderModal.classList.add("show");
  const totalEl = orderModal.querySelector("#orderTotal");
  totalEl.textContent = idr(price || 0);
}
function hideOrderModal() {
  if (orderModal) orderModal.classList.remove("show");
}
document.querySelectorAll(".copy-code").forEach((btn) =>
  btn.addEventListener("click", () => {
    const code = btn.getAttribute("data-code");
    if (code && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    showToast("Kode disalin: " + code);
  })
);
document.querySelectorAll(".copy-text").forEach((btn) =>
  btn.addEventListener("click", () => {
    const t = btn.getAttribute("data-text");
    if (t && navigator.clipboard) {
      navigator.clipboard.writeText(t);
    }
    showToast("Disalin: " + (t || ""));
  })
);
function updateCountdown() {
  document.querySelectorAll(".countdown").forEach((el) => {
    const end = el.getAttribute("data-end");
    if (!end) {
      el.textContent = "";
      return;
    }
    const t = new Date(end).getTime() - Date.now();
    if (t <= 0) {
      el.textContent = "Berakhir";
      return;
    }
    const d = Math.floor(t / (1000 * 60 * 60 * 24));
    const h = Math.floor((t % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((t % (1000 * 60 * 60)) / (1000 * 60));
    el.textContent = `${d}h ${h}j ${m}m`;
  });
}
updateCountdown();
setInterval(updateCountdown, 30000);
const tabs = document.querySelectorAll(".menu-tabs a");
if (tabs.length) {
  function setCat(cat) {
    document.body.classList.remove("cake", "pastry", "puding");
    document.body.classList.add(cat);
    tabs.forEach((a) => {
      const t = a.getAttribute("href").replace("#", "");
      if (t === cat) {
        a.classList.remove("btn-outline");
        a.classList.add("btn");
      } else {
        a.classList.remove("btn");
        a.classList.add("btn-outline");
      }
    });
  }
  tabs.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const cat = a.getAttribute("href").slice(1);
      setCat(cat);
      const sec = document.getElementById(cat);
      if (sec) sec.scrollIntoView({ behavior: "smooth" });
      history.replaceState(null, "", `#${cat}`);
    })
  );
  const initial = location.hash
    ? location.hash.slice(1)
    : document.body.classList.contains("pastry")
    ? "pastry"
    : document.body.classList.contains("puding")
    ? "puding"
    : "cake";
  setCat(["cake", "pastry", "puding"].includes(initial) ? initial : "cake");
}

function initAuthPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;
  const regForm = document.getElementById("registerForm");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginNote = document.getElementById("loginNote");
  const registerNote = document.getElementById("registerNote");
  tabLogin.addEventListener("click", () => {
    tabLogin.className = "btn";
    tabRegister.className = "btn-outline";
    loginForm.style.display = "block";
    regForm.style.display = "none";
  });
  tabRegister.addEventListener("click", () => {
    tabLogin.className = "btn-outline";
    tabRegister.className = "btn";
    loginForm.style.display = "none";
    regForm.style.display = "block";
  });
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document
      .getElementById("loginEmail")
      .value.trim()
      .toLowerCase();
    const pass = document.getElementById("loginPassword").value;
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const u = users.find((x) => x.email === email && x.password === pass);
    if (!u) {
      loginNote.textContent = "Email atau kata sandi salah";
      return;
    }
    setAuth({ email: u.email, name: u.name });
    location.href = "index.html#beranda";
  });
  regForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const email = document
      .getElementById("regEmail")
      .value.trim()
      .toLowerCase();
    const pass = document.getElementById("regPassword").value;
    const conf = document.getElementById("regConfirm").value;
    if (!name || !email || !pass || pass.length < 6 || pass !== conf) {
      registerNote.textContent = "Periksa data: sandi minimal 6 dan harus sama";
      return;
    }
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.some((x) => x.email === email)) {
      registerNote.textContent = "Email sudah terdaftar";
      return;
    }
    users.push({ name, email, password: pass });
    localStorage.setItem("users", JSON.stringify(users));
    registerNote.textContent = "Pendaftaran berhasil, silakan masuk";
    tabLogin.click();
  });
}
initAuthPage();
