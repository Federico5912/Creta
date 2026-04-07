/* ============================================================
   CRETA — main.js
   ============================================================ */
"use strict";

// ── Cursor ──────────────────────────────────────────────────
const cursor    = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
let mx = -100, my = -100, cx = -100, cy = -100;

document.addEventListener("mousemove", e => {
  mx = e.clientX; my = e.clientY;
  cursorDot.style.left = mx + "px";
  cursorDot.style.top  = my + "px";
});
(function animateCursor() {
  cx += (mx - cx) * 0.12;
  cy += (my - cy) * 0.12;
  cursor.style.left = cx + "px";
  cursor.style.top  = cy + "px";
  requestAnimationFrame(animateCursor);
})();


// ── Nav scroll ──────────────────────────────────────────────
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 60);
}, { passive: true });


// ── Mobile menu ─────────────────────────────────────────────
const burger     = document.getElementById("burger");
const mobileMenu = document.getElementById("mobileMenu");

burger.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("open");
  burger.setAttribute("aria-expanded", String(isOpen));
});
document.querySelectorAll(".mm-link").forEach(l =>
  l.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  })
);


// ── Reveal on scroll ─────────────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const delay = entry.target.dataset.delay || 0;
    setTimeout(() => entry.target.classList.add("visible"), delay);
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12 });

function observeReveals(root = document) {
  root.querySelectorAll(".reveal:not(.visible)").forEach((el, i) => {
    el.dataset.delay = (i % 4) * 80;
    revealObserver.observe(el);
  });
}
observeReveals();


// ── Counter animation ────────────────────────────────────────
const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target, target = parseInt(el.dataset.target, 10);
    const start = performance.now();
    (function tick(now) {
      const t = Math.min((now - start) / 1600, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    })(performance.now());
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });
document.querySelectorAll(".stat-n").forEach(s => counterObserver.observe(s));


// ── Services ─────────────────────────────────────────────────
let servicesCache = [];

async function loadServices() {
  const grid = document.getElementById("servicesGrid");
  if (!grid) return;
  try {
    const res  = await fetch("/api/services");
    const data = await res.json();
    servicesCache = data.services;
    renderServices(data.services);
    populateServiceSelect(data.services);
  } catch {
    renderServices(FALLBACK_SERVICES);
    populateServiceSelect(FALLBACK_SERVICES);
  }
}

const FALLBACK_SERVICES = [
  { id:1, icon:"✦", name:"Cosmetología Lifting Facial",        description:"Estimula el colágeno y reafirma la piel.", duration_minutes:60 },
  { id:2, icon:"⚡", name:"Electrofitness Pasivo",               description:"Tonifica y modela mediante estimulación muscular.", duration_minutes:45 },
  { id:3, icon:"◈", name:"Depilación Láser",                    description:"Eliminación definitiva del vello con láser.", duration_minutes:30 },
  { id:4, icon:"◉", name:"Eliminación de Adiposidad Localizada",description:"Ultrasonido focalizado no invasivo.", duration_minutes:50 },
  { id:5, icon:"◇", name:"Eliminación de Flacidez",             description:"Radiofrecuencia que restaura la firmeza.", duration_minutes:60 },
];

function renderServices(services) {
  const grid = document.getElementById("servicesGrid");
  grid.innerHTML = services.map((s, i) => `
    <article class="service-card reveal" data-delay="${i * 100}">
      <span class="sc-icon">${s.icon}</span>
      <span class="sc-num">0${s.id}</span>
      <h3 class="sc-name">${s.name}</h3>
      <p class="sc-desc">${s.description}</p>
      <span class="sc-duration">Duración: ${s.duration_minutes} min</span>
    </article>
  `).join("");
  observeReveals(grid);
}

function populateServiceSelect(services) {
  const sel = document.getElementById("appt-service");
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccionar servicio…</option>' +
    services.map(s => `<option value="${s.id}">${s.name} (${s.duration_minutes} min)</option>`).join("");
}

loadServices();


// ── Dynamic slot loading ──────────────────────────────────────
const serviceSelect = document.getElementById("appt-service");
const dateInput     = document.getElementById("appt-date");
const timeSelect    = document.getElementById("appt-time");
const slotsStatus   = document.getElementById("slotsStatus");

// Set min date = today
if (dateInput) {
  dateInput.min = new Date().toISOString().split("T")[0];
}

async function fetchSlots() {
  const serviceId = serviceSelect?.value;
  const dateVal   = dateInput?.value;
  if (!serviceId || !dateVal) return;

  timeSelect.disabled = true;
  timeSelect.innerHTML = '<option value="">Consultando disponibilidad…</option>';
  slotsStatus.textContent = "Cargando horarios…";
  slotsStatus.className   = "slots-status loading";

  try {
    const res  = await fetch(`/api/availability?service_id=${serviceId}&date=${dateVal}`);
    const data = await res.json();

    if (!res.ok) {
      slotsStatus.textContent = data.error || "No disponible para esa fecha.";
      slotsStatus.className   = "slots-status empty";
      timeSelect.innerHTML    = '<option value="">Sin disponibilidad</option>';
      return;
    }

    const slots = data.available_slots || [];
    if (slots.length === 0) {
      slotsStatus.textContent = "No hay turnos disponibles para esa fecha.";
      slotsStatus.className   = "slots-status empty";
      timeSelect.innerHTML    = '<option value="">Sin turnos disponibles</option>';
      return;
    }

    slotsStatus.textContent = `${slots.length} horario${slots.length > 1 ? "s" : ""} disponible${slots.length > 1 ? "s" : ""}`;
    slotsStatus.className   = "slots-status";
    timeSelect.innerHTML    = '<option value="">Elegí un horario</option>' +
      slots.map(s => `<option value="${s}">${s}</option>`).join("");
    timeSelect.disabled = false;

  } catch {
    slotsStatus.textContent = "Error al consultar disponibilidad.";
    slotsStatus.className   = "slots-status empty";
    timeSelect.innerHTML    = '<option value="">Error al cargar</option>';
  }
}

serviceSelect?.addEventListener("change", () => {
  // Limpiar estado visual al cambiar servicio
  slotsStatus.textContent = "";
  slotsStatus.className   = "slots-status";
  timeSelect.innerHTML    = '<option value="">Elegí servicio y fecha primero</option>';
  timeSelect.disabled     = true;
  fetchSlots();
});
dateInput?.addEventListener("change", fetchSlots);


// ── Appointment Form ─────────────────────────────────────────
const apptForm = document.getElementById("apptForm");
const apptMsg  = document.getElementById("apptMsg");

if (apptForm) {
  apptForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn  = document.getElementById("apptSubmit");
    if (btn.disabled) return;  // guard doble click

    const text = btn.querySelector(".btn-text");
    const load = btn.querySelector(".btn-loader");

    btn.disabled = true;
    text.hidden  = true;
    load.hidden  = false;
    setMsg(apptMsg, "", "");

    const body = {
      name:       apptForm.elements["name"].value,
      phone:      apptForm.elements["phone"].value,
      email:      apptForm.elements["email"].value,
      service_id: parseInt(apptForm.elements["service_id"].value, 10),
      date:       apptForm.elements["date"].value,
      time:       apptForm.elements["time"].value,
      notes:      apptForm.elements["notes"].value,
    };

    if (!body.time) {
      setMsg(apptMsg, "Por favor seleccioná un horario.", "error");
      btn.disabled = false; text.hidden = false; load.hidden = true;
      return;
    }

    try {
      const res  = await fetch("/api/appointment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(apptMsg, data.message, "success");
        apptForm.reset();
        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">Elegí servicio y fecha primero</option>';
        slotsStatus.textContent = "";
      } else if (res.status === 409) {
        setMsg(apptMsg, "Ese horario se acaba de ocupar. Buscando disponibilidad actualizada…", "error");
        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">Actualizando horarios…</option>';
        await fetchSlots();
      } else {
        setMsg(apptMsg, data.error || "Ocurrió un error. Intentá de nuevo.", "error");
      }
    } catch {
      setMsg(apptMsg, "Error de conexión. Intentá de nuevo o contactanos por teléfono.", "error");
    } finally {
      btn.disabled = false;
      text.hidden  = false;
      load.hidden  = true;
    }
  });
}


// ── Contact Form ─────────────────────────────────────────────
const contactForm = document.getElementById("contactForm");
const cfMsg       = document.getElementById("cfMsg");

if (contactForm) {
  contactForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("cfSubmit");
    btn.disabled = true;
    setMsg(cfMsg, "", "");
    try {
      const res  = await fetch("/api/contact", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    contactForm.elements["name"].value,
          email:   contactForm.elements["email"].value,
          message: contactForm.elements["message"].value,
        }),
      });
      const data = await res.json();
      if (res.ok) { setMsg(cfMsg, data.message, "success"); contactForm.reset(); }
      else         { setMsg(cfMsg, data.error || "Ocurrió un error.", "error"); }
    } catch {
      setMsg(cfMsg, "Error de conexión.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}


// ── Helpers ──────────────────────────────────────────────────
function setMsg(el, text, type) {
  el.textContent = text;
  el.className   = "form-msg" + (type ? " " + type : "");
}

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", e => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
});
