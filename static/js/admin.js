/* ============================================================
   CRETA — admin.js
   PIN gate · Session persistence · Stats · Appointments · Blocked days
   ============================================================ */
"use strict";

const pinGate   = document.getElementById("pinGate");
const adminWrap = document.getElementById("adminWrap");
const pinDigits = document.querySelectorAll(".pin-digit");
const pinError  = document.getElementById("pinError");
const toast     = document.getElementById("toast");

let currentView    = "today";
let toastTimer     = null;
let autoRefreshTimer = null;


// ── Session check on load ────────────────────────────────────
// If session is still active (cookie), skip PIN and go straight to panel
(async function checkExistingSession() {
  try {
    const res = await fetch("/api/admin/check-session");
    if (res.ok) {
      showPanel();
    } else {
      pinDigits[0]?.focus();
    }
  } catch {
    pinDigits[0]?.focus();
  }
})();


// ── PIN Gate ─────────────────────────────────────────────────
pinDigits.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 1);
    if (input.value && i < pinDigits.length - 1) {
      pinDigits[i + 1].focus();
    }
    if (Array.from(pinDigits).every(d => d.value.length === 1)) {
      submitPin();
    }
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !input.value && i > 0) {
      pinDigits[i - 1].focus();
    }
  });
});

async function submitPin() {
  const pin = Array.from(pinDigits).map(d => d.value).join("");
  try {
    const res = await fetch("/api/admin/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pin }),
    });
    if (res.ok) {
      showPanel();
    } else {
      pinError.textContent = "PIN incorrecto. Intentá de nuevo.";
      pinDigits.forEach(d => { d.value = ""; d.style.borderColor = "rgba(232,136,136,0.6)"; });
      setTimeout(() => {
        pinDigits.forEach(d => { d.style.borderColor = ""; });
        pinError.textContent = "";
      }, 1400);
      pinDigits[0].focus();
    }
  } catch {
    pinError.textContent = "Error de conexión.";
  }
}

function showPanel() {
  pinGate.style.opacity    = "0";
  pinGate.style.transition = "opacity 0.35s";
  setTimeout(() => { pinGate.hidden = true; }, 350);
  adminWrap.hidden = false;
  initPanel();
}


// ── Panel init ───────────────────────────────────────────────
function initPanel() {
  updateSubtitle();
  loadStats();
  loadView("today");
  setupNavigation();
  setupControls();

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  });
}


// ── Stats bar ────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch("/api/admin/stats");
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById("statPendingToday").textContent   = data.pending_today;
    document.getElementById("statConfirmedToday").textContent = data.confirmed_today;
    document.getElementById("statPendingAll").textContent     = data.pending_all;
    document.getElementById("statTotalToday").textContent     = data.today;
  } catch { /* silently ignore */ }
}


// ── Navigation ───────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".snav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      clearAutoRefresh();
      loadView(currentView);
      updateSubtitle();
    });
  });
}

function updateSubtitle() {
  const subtitle = document.getElementById("viewSubtitle");
  const title    = document.getElementById("viewTitle");
  const today    = new Date();
  const fmt      = d => d.toLocaleDateString("es-UY", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const map = {
    today:   ["Turnos de hoy",       fmt(today)],
    week:    ["Turnos de la semana", `Semana del ${fmt(today)}`],
    all:     ["Todos los turnos",    ""],
    blocked: ["Días bloqueados",     ""],
  };
  const [t, s] = map[currentView] || ["Turnos", ""];
  title.textContent    = t;
  subtitle.textContent = s;
}


// ── Controls ─────────────────────────────────────────────────
function setupControls() {
  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadView(currentView);
    loadStats();
  });
  document.getElementById("filterDate").addEventListener("change",   () => loadView(currentView));
  document.getElementById("filterStatus").addEventListener("change", () => loadView(currentView));
}


// ── Load view ────────────────────────────────────────────────
function loadView(view) {
  const apptSection    = document.getElementById("viewAppointments");
  const blockedSection = document.getElementById("viewBlocked");
  clearAutoRefresh();

  if (view === "blocked") {
    apptSection.hidden    = true;
    blockedSection.hidden = false;
    loadBlockedDays();
    return;
  }

  apptSection.hidden    = false;
  blockedSection.hidden = true;
  loadAppointments(view);

  // Auto-refresh every 60s only on "today" view
  if (view === "today") {
    const note = document.getElementById("autoRefreshNote");
    let secs = 60;
    note.textContent = `Actualización automática en ${secs}s`;
    autoRefreshTimer = setInterval(() => {
      secs--;
      if (secs <= 0) {
        loadAppointments("today");
        loadStats();
        secs = 60;
      }
      note.textContent = `Actualización automática en ${secs}s`;
    }, 1000);
  } else {
    const note = document.getElementById("autoRefreshNote");
    if (note) note.textContent = "";
  }
}

function clearAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}


// ── Appointments ─────────────────────────────────────────────
async function loadAppointments(view) {
  const tbody        = document.getElementById("apptTbody");
  const statusFilter = document.getElementById("filterStatus")?.value || "";
  const dateFilter   = document.getElementById("filterDate")?.value   || "";
  const today        = new Date().toISOString().split("T")[0];

  tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Cargando…</td></tr>`;

  let url = `/api/admin/appointments?`;
  if (view === "today")      url += `view=day&date=${dateFilter || today}`;
  else if (view === "week")  url += `view=week&date=${dateFilter || today}`;
  else                       url += `view=all`;
  if (statusFilter)          url += `&status=${statusFilter}`;

  try {
    const res  = await fetch(url);
    if (res.status === 401) { location.reload(); return; }
    const data = await res.json();
    renderAppointments(data.appointments || []);
  } catch {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error al cargar.</td></tr>`;
  }
}

function renderAppointments(appointments) {
  const tbody = document.getElementById("apptTbody");
  const count = document.getElementById("tableCount");

  count.textContent = `${appointments.length} turno${appointments.length !== 1 ? "s" : ""}`;

  if (appointments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Sin turnos para mostrar.</td></tr>`;
    return;
  }

  tbody.innerHTML = appointments.map(a => {
    const badgeClass = { pending:"badge-pending", confirmed:"badge-confirmed", cancelled:"badge-cancelled" }[a.status];
    const label      = { pending:"Pendiente",     confirmed:"Confirmado",      cancelled:"Cancelado" }[a.status];
    const dateStr    = new Date(a.date + "T00:00:00").toLocaleDateString("es-UY", { day:"2-digit", month:"2-digit", year:"numeric" });

    const contactCell = `
      <div class="contact-cell">
        <a href="tel:${a.client_phone}" class="cc-phone"><i class="fas fa-phone"></i> ${a.client_phone}</a>
        ${a.client_email ? `<a href="mailto:${a.client_email}" class="cc-email"><i class="fas fa-envelope"></i> ${a.client_email}</a>` : ""}
      </div>`;

    const notesEl = a.notes
      ? `<div class="appt-notes"><i class="fas fa-sticky-note"></i> ${a.notes}</div>`
      : "";

    const clientCell = `<div>${a.client_name}${notesEl}</div>`;

    const actions = a.status === "pending"
      ? `<button class="act-btn act-confirm" onclick="confirmAppt(${a.id})"><i class="fas fa-check"></i> Confirmar</button>
         <button class="act-btn act-cancel"  onclick="cancelAppt(${a.id})"><i class="fas fa-times"></i> Cancelar</button>`
      : a.status === "confirmed"
      ? `<button class="act-btn act-cancel" onclick="cancelAppt(${a.id})"><i class="fas fa-times"></i> Cancelar</button>`
      : `<span class="act-done">—</span>`;

    return `<tr>
      <td class="td-id">${a.id}</td>
      <td>${dateStr}</td>
      <td class="td-time">${a.start_time}<br><span class="time-end">${a.end_time}</span></td>
      <td>${a.service}</td>
      <td>${clientCell}</td>
      <td>${contactCell}</td>
      <td><span class="badge ${badgeClass}">${label}</span></td>
      <td class="td-actions">${actions}</td>
    </tr>`;
  }).join("");
}

async function confirmAppt(id) {
  try {
    const res  = await fetch(`/api/admin/appointments/${id}/confirm`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { showToast("Turno confirmado. Emails enviados.", "success"); loadView(currentView); loadStats(); }
    else         { showToast(data.error || "Error.", "error"); }
  } catch { showToast("Error de conexión.", "error"); }
}

async function cancelAppt(id) {
  if (!confirm("¿Confirmás la cancelación de este turno?")) return;
  try {
    const res  = await fetch(`/api/admin/appointments/${id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { showToast("Turno cancelado. Emails enviados.", "success"); loadView(currentView); loadStats(); }
    else         { showToast(data.error || "Error.", "error"); }
  } catch { showToast("Error de conexión.", "error"); }
}


// ── Blocked days ─────────────────────────────────────────────
async function loadBlockedDays() {
  const list = document.getElementById("blockedList");
  list.innerHTML = "<p class='loading-row'>Cargando…</p>";
  try {
    const res  = await fetch("/api/admin/blocked-days");
    const data = await res.json();
    renderBlockedDays(data.blocked_days || []);
  } catch {
    list.innerHTML = "<p class='loading-row'>Error al cargar.</p>";
  }
}

function renderBlockedDays(days) {
  const list = document.getElementById("blockedList");
  if (days.length === 0) {
    list.innerHTML = "<p class='loading-row'>No hay días bloqueados.</p>";
    return;
  }
  list.innerHTML = days.map(d => {
    const dateStr = new Date(d.date + "T00:00:00").toLocaleDateString("es-UY", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    return `<div class="blocked-item">
      <div>
        <p class="bi-date">${dateStr}</p>
        ${d.reason ? `<p class="bi-reason">${d.reason}</p>` : ""}
      </div>
      <button class="bi-remove" onclick="unblockDay(${d.id})" title="Desbloquear"><i class="fas fa-times"></i></button>
    </div>`;
  }).join("");
}

document.getElementById("openBlockBtn")?.addEventListener("click", () => {
  document.getElementById("blockForm").hidden = false;
  document.getElementById("blockDate").min = new Date().toISOString().split("T")[0];
});
document.getElementById("cancelBlockBtn")?.addEventListener("click", () => {
  document.getElementById("blockForm").hidden = true;
});
document.getElementById("confirmBlockBtn")?.addEventListener("click", async () => {
  const d      = document.getElementById("blockDate").value;
  const reason = document.getElementById("blockReason").value;
  if (!d) { showToast("Seleccioná una fecha.", "error"); return; }
  try {
    const res  = await fetch("/api/admin/blocked-days", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ date: d, reason }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast("Día bloqueado.", "success");
      document.getElementById("blockForm").hidden      = true;
      document.getElementById("blockDate").value       = "";
      document.getElementById("blockReason").value     = "";
      loadBlockedDays();
    } else { showToast(data.error || "Error.", "error"); }
  } catch { showToast("Error de conexión.", "error"); }
});

async function unblockDay(id) {
  if (!confirm("¿Desbloquear este día?")) return;
  try {
    const res = await fetch(`/api/admin/blocked-days/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("Día desbloqueado.", "success"); loadBlockedDays(); }
    else         { showToast("Error.", "error"); }
  } catch { showToast("Error de conexión.", "error"); }
}


// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className   = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3200);
}
