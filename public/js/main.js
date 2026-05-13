const nav = document.getElementById("nav-links");
if (!document.querySelector('link[rel="manifest"]')) {
  const manifestLink = document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = "/manifest.webmanifest";
  document.head.appendChild(manifestLink);
}
if (!document.querySelector('meta[name="theme-color"]')) {
  const themeMeta = document.createElement("meta");
  themeMeta.name = "theme-color";
  themeMeta.content = "#1f5f4a";
  document.head.appendChild(themeMeta);
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
const toggle = document.getElementById("menu-toggle");
if (toggle) {
  toggle.addEventListener("click", () => nav.classList.toggle("open"));
}
if (nav) {
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
}

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

document.querySelectorAll("img").forEach((img, idx) => {
  if (!img.hasAttribute("loading")) img.setAttribute("loading", idx < 2 ? "eager" : "lazy");
  if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
});
function initGa4(id) {
  if (!id || window.gtag) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id);
}
const GA4_ID = window.ASSIGN_GA4_ID || "";
if (GA4_ID) {
  initGa4(GA4_ID);
} else {
  fetch("/api/public/site-config")
    .then((r) => r.json())
    .then((cfg) => initGa4(cfg.ga4_measurement_id || ""))
    .catch(() => {});
}
window.trackEvent = function trackEvent(name, params = {}) {
  if (typeof window.gtag === "function") window.gtag("event", name, params);
};

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) e.target.classList.add("show");
  });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
  const buttons = tabsRoot.querySelectorAll(".tab-btn");
  const panels = tabsRoot.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-tab");
      buttons.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const target = tabsRoot.querySelector(`#${id}`);
      if (target) target.classList.add("active");
    });
  });
});

document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("pointermove", (event) => {
    const r = btn.getBoundingClientRect();
    const x = event.clientX - r.left - r.width / 2;
    const y = event.clientY - r.top - r.height / 2;
    btn.style.transform = `translateY(-2px) perspective(500px) rotateX(${(-y / 18).toFixed(2)}deg) rotateY(${(x / 18).toFixed(2)}deg)`;
  });
  btn.addEventListener("pointerleave", () => {
    btn.style.transform = "";
  });
});

const waTriggers = document.querySelectorAll(".wa-picker-trigger");
if (waTriggers.length > 0) {
  const popup = document.createElement("div");
  popup.className = "wa-picker";
  popup.innerHTML = `
    <button class="wa-close" type="button" aria-label="Close">×</button>
    <h4>Choose WhatsApp Number</h4>
    <a href="https://wa.me/919119235092" target="_blank" rel="noopener">+91 91192 35092</a>
    <a href="https://wa.me/447434761786" target="_blank" rel="noopener">+44 7434 761786</a>
  `;
  document.body.appendChild(popup);

  const closeBtn = popup.querySelector(".wa-close");
  const closePopup = () => popup.classList.remove("open");
  closeBtn.addEventListener("click", closePopup);
  document.addEventListener("click", (event) => {
    if (!popup.contains(event.target) && !event.target.closest(".wa-picker-trigger")) {
      closePopup();
    }
  });

  waTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      popup.classList.toggle("open");
      window.trackEvent("whatsapp_picker_open", { page: window.location.pathname });
    });
  });
}

document.querySelectorAll("a.btn,button.btn").forEach((el) => {
  el.addEventListener("click", () => {
    const text = (el.textContent || "").trim().slice(0, 60);
    if (!text) return;
    window.trackEvent("cta_click", { cta_text: text, page: window.location.pathname });
  });
});

async function loadPublicDiscounts() {
  const mount = document.getElementById("promo-mount");
  if (!mount) return;
  try {
    const res = await fetch("/api/public/discount-codes");
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("invalid");
    const data = await res.json();
    const rows = (data.discount_codes || []).slice(0, 3);
    if (rows.length === 0) {
      mount.innerHTML = `
        <div class="promo-banner">
          <div>
            <p class="badge">Seasonal Offers</p>
            <h2>Custom Offers Available</h2>
            <p>Ask our team for current student benefits when you submit your assignment brief.</p>
          </div>
          <a class="btn btn-primary" href="/pages/contact.html#enquiry">Get Quote</a>
        </div>`;
      return;
    }
    mount.innerHTML = rows.map((d) => {
      const valueText = d.discount_type === "fixed" ? `${d.discount_value} off` : `${d.discount_value}% off`;
      return `
        <div class="promo-banner">
          <div>
            <p class="badge">Live Promo</p>
            <h2>${d.title}</h2>
            <p>Use code <strong>${d.code}</strong> for <strong>${valueText}</strong>. ${d.description || "Submit your brief to claim this offer."}</p>
          </div>
          <a class="btn btn-primary" href="/pages/contact.html#enquiry">Claim Offer</a>
        </div>`;
    }).join("");
  } catch {
    mount.innerHTML = `
      <div class="promo-banner">
        <div>
          <p class="badge">Seasonal Offers</p>
          <h2>Offers Updating</h2>
          <p>Discount offers are being refreshed. Contact us for latest available promo support.</p>
        </div>
        <a class="btn btn-primary" href="/pages/contact.html#enquiry">Contact Team</a>
      </div>`;
  }
}

loadPublicDiscounts();

function initHeroParticles() {
  const canvas = document.getElementById("hero-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let raf = null;
  let particles = [];
  const count = 48;
  const colors = ["rgba(31,95,74,0.24)", "rgba(47,140,106,0.22)", "rgba(213,161,74,0.22)", "rgba(70,160,190,0.2)"];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (particles.length === 0) {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: 1.3 + Math.random() * 2.2,
        c: colors[Math.floor(Math.random() * colors.length)]
      }));
    }
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -8) p.x = w + 8;
      if (p.x > w + 8) p.x = -8;
      if (p.y < -8) p.y = h + 8;
      if (p.y > h + 8) p.y = -8;
      ctx.beginPath();
      ctx.fillStyle = p.c;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    raf = requestAnimationFrame(tick);
  }

  resize();
  tick();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = null;
    } else if (!document.hidden && !raf) {
      raf = requestAnimationFrame(tick);
    }
  });
}

initHeroParticles();


