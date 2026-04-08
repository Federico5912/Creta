/* ============================================================
   CRETA — admin.js
   PIN · Stats · Hoy · Semana · Todos · Días bloqueados
   ============================================================ */
"use strict";

// ── Globals ──────────────────────────────────────────────────
let currentView      = "today";
let autoRefreshTimer = null;
let toastTimer       = null;

// ── DOM refs ─────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const pinGate   = $("pinGate");
const adminWrap = $("adminWrap");
const pinError  = $("pinError");
const toast     = $("toast");


// ═══════════════════════════════════════════════════════════════
// 1. PIN GATE
// ═══════════════════════════════════════════════════════════════

const pinDigits = $$(".pin-digit");
pinDigits[0]?.focus();

pinDigits.forEach((inp, i) => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "").slice(0, 1);
    if (inp.value && i < pinDigits.length - 1) pinDigits[i + 1].focus();
    if ([...pinDigits].every(d => d.value.length === 1)) submitPin();
  });
  inp.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !inp.value && i > 0) pinDigits[i - 1].focus();
  });
});

async function submitPin() {
  const pin = [...pinDigits].map(d => d.value).join("");
  try {
    const res  = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      enterPanel();
    } else {
      const data     = await res.json().catch(() => ({}));
      const msg      = data.error || "PIN incorrecto.";
      const isLocked = msg.toLowerCase().includes("bloqueado");
      pinError.textContent = msg;
      pinDigits.forEach(d => { d.value = ""; d.style.borderColor = "rgba(232,136,136,0.6)"; });
      setTimeout(() => {
        pinDigits.forEach(d => d.style.borderColor = "");
        if (!isLocked) pinError.textContent = "";
      }, isLocked ? 10000 : 1600);
      if (!isLocked) pinDigits[0].focus();
    }
  } catch {
    pinError.textContent = "Error de conexión.";
  }
}

function enterPanel() {
  pinGate.style.transition = "opacity 0.35s";
  pinGate.style.opacity    = "0";
  setTimeout(() => pinGate.hidden = true, 350);
  adminWrap.hidden = false;
  initPanel();
}


// ═══════════════════════════════════════════════════════════════
// 2. PANEL INIT — todo el setup va aquí
// ═══════════════════════════════════════════════════════════════

function initPanel() {

  // — Logout
  $("logoutBtn")?.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  });

  // — Navigation
  $$(".snav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".snav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      switchView(currentView);
    });
  });

  // — Filters
  $("refreshBtn")?.addEventListener("click", () => {
    switchView(currentView);
    loadStats();
  });
  $("filterDate")?.addEventListener("change",   () => switchView(currentView));
  $("filterStatus")?.addEventListener("change", () => switchView(currentView));

  // — Blocked days buttons
  $("openBlockBtn")?.addEventListener("click", () => {
    const f = $("blockForm");
    if (!f) return;
    f.hidden = !f.hidden;
    if (!f.hidden) {
      $("blockDate").min = new Date().toISOString().split("T")[0];
      $("blockDate").focus();
    }
  });

  $("cancelBlockBtn")?.addEventListener("click", () => {
    const f = $("blockForm");
    if (f) f.hidden = true;
  });

  $("confirmBlockBtn")?.addEventListener("click", () => confirmBlockDay());

  // — Initial load
  loadStats();
  switchView("today");
  setSubtitle("today");
}


// ═══════════════════════════════════════════════════════════════
// 3. VIEW ROUTER
// ═══════════════════════════════════════════════════════════════

function switchView(view) {
  currentView = view;
  setSubtitle(view);
  stopAutoRefresh();

  const apptEl    = $("viewAppointments");
  const blockedEl = $("viewBlocked");

  if (!apptEl || !blockedEl) {
    console.error("CRETA: no se encontraron los divs de vista");
    return;
  }

  if (view === "blocked") {
    apptEl.hidden    = true;
    blockedEl.hidden = false;
    loadBlockedDays();
  } else {
    apptEl.hidden    = false;
    blockedEl.hidden = true;
    loadAppointments(view);
    if (view === "today") startAutoRefresh();
  }
}

function setSubtitle(view) {
  const today = new Date();
  const fmt   = d => d.toLocaleDateString("es-UY", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const titles = {
    today:   ["Turnos de hoy",        fmt(today)],
    week:    ["Turnos de la semana",  "Semana actual"],
    all:     ["Todos los turnos",     "Historial completo"],
    blocked: ["Días bloqueados",      "Gestión de disponibilidad"],
  };
  const [t, s] = titles[view] || ["Turnos", ""];
  setEl("viewTitle",    t);
  setEl("viewSubtitle", s);
}


// ═══════════════════════════════════════════════════════════════
// 4. STATS
// ═══════════════════════════════════════════════════════════════

async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) return;
    const d = await res.json();
    setEl("statPendingToday",   d.pending_today   ?? "—");
    setEl("statConfirmedToday", d.confirmed_today ?? "—");
    setEl("statPendingAll",     d.pending_all     ?? "—");
    setEl("statTotalToday",     d.today           ?? "—");
  } catch {/* silently ignore */}
}


// ═══════════════════════════════════════════════════════════════
// 5. APPOINTMENTS — Hoy / Semana / Todos
// ═══════════════════════════════════════════════════════════════

async function loadAppointments(view) {
  const tbody  = $("apptTbody");
  const count  = $("tableCount");
  const today  = new Date().toISOString().split("T")[0];
  const status = $("filterStatus")?.value || "";
  const date   = $("filterDate")?.value   || "";

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="loading-row"><span class="spinner"></span> Cargando…</td></tr>`;
  if (count) count.textContent = "";

  // Build URL
  let url = "/api/admin/appointments?";
  if      (view === "today") url += `view=day&date=${date || today}`;
  else if (view === "week")  url += `view=week&date=${date || today}`;
  else                       url += "view=all";
  if (status) url += `&status=${status}`;

  try {
    const res = await fetch(url);
    if (res.status === 401) { location.reload(); return; }
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error del servidor (${res.status}).</td></tr>`;
      return;
    }
    const data = await res.json();
    renderAppointments(data.appointments || []);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error de red. Revisá la conexión.</td></tr>`;
  }
}

function renderAppointments(list) {
  const tbody = $("apptTbody");
  const count = $("tableCount");
  if (!tbody) return;

  if (count) count.textContent = `${list.length} turno${list.length !== 1 ? "s" : ""}`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Sin turnos para este período.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(a => {
    const bc = { pending:"badge-pending", confirmed:"badge-confirmed", cancelled:"badge-cancelled" }[a.status] || "";
    const bl = { pending:"Pendiente",     confirmed:"Confirmado",      cancelled:"Cancelado"      }[a.status] || a.status;
    const ds = new Date(a.date + "T00:00:00").toLocaleDateString("es-UY", { day:"2-digit", month:"2-digit", year:"numeric" });

    const notes  = a.notes     ? `<div class="appt-notes"><i class="fas fa-sticky-note"></i> ${esc(a.notes)}</div>` : "";
    const email  = a.client_email ? `<a href="mailto:${esc(a.client_email)}" class="cc-email"><i class="fas fa-envelope"></i> ${esc(a.client_email)}</a>` : "";

    let actions = `<span class="act-done">—</span>`;
    if (a.status === "pending") {
      actions = `
        <button class="act-btn act-confirm" onclick="confirmAppt(${a.id})"><i class="fas fa-check"></i> Confirmar</button>
        <button class="act-btn act-cancel"  onclick="cancelAppt(${a.id})"><i class="fas fa-times"></i> Cancelar</button>`;
    } else if (a.status === "confirmed") {
      actions = `<button class="act-btn act-cancel" onclick="cancelAppt(${a.id})"><i class="fas fa-times"></i> Cancelar</button>`;
    }

    return `<tr>
      <td class="td-id">${a.id}</td>
      <td>${ds}</td>
      <td class="td-time">${esc(a.start_time)}<span class="time-end"> → ${esc(a.end_time)}</span></td>
      <td>${esc(a.service || "")}</td>
      <td><div>${esc(a.client_name)}${notes}</div></td>
      <td><div class="contact-cell">
        <a href="tel:${esc(a.client_phone)}" class="cc-phone"><i class="fas fa-phone"></i> ${esc(a.client_phone)}</a>
        ${email}
      </div></td>
      <td><span class="badge ${bc}">${bl}</span></td>
      <td class="td-actions">${actions}</td>
    </tr>`;
  }).join("");
}

async function confirmAppt(id) {
  try {
    const res  = await fetch(`/api/admin/appointments/${id}/confirm`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      showToast("✓ Turno confirmado. Emails enviados.", "success");
      switchView(currentView);
      loadStats();
    } else {
      showToast(data.error || "No se pudo confirmar.", "error");
    }
  } catch { showToast("Error de conexión.", "error"); }
}

async function cancelAppt(id) {
  if (!confirm("¿Cancelar este turno?\nSe enviará un email al cliente avisando.")) return;
  try {
    const res  = await fetch(`/api/admin/appointments/${id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      showToast("Turno cancelado. Emails enviados.", "success");
      switchView(currentView);
      loadStats();
    } else {
      showToast(data.error || "No se pudo cancelar.", "error");
    }
  } catch { showToast("Error de conexión.", "error"); }
}


// ═══════════════════════════════════════════════════════════════
// 6. DÍAS BLOQUEADOS
// ═══════════════════════════════════════════════════════════════

async function loadBlockedDays() {
  const list = $("blockedList");
  if (!list) return;
  list.innerHTML = "<p class='loading-row'><span class='spinner'></span> Cargando…</p>";

  try {
    const res = await fetch("/api/admin/blocked-days");
    if (res.status === 401) { location.reload(); return; }
    if (!res.ok) {
      list.innerHTML = `<p class='loading-row'>Error del servidor (${res.status}).</p>`;
      return;
    }
    const data = await res.json();
    renderBlockedDays(data.blocked_days || []);
  } catch {
    list.innerHTML = "<p class='loading-row'>Error de red al cargar los días bloqueados.</p>";
  }
}

function renderBlockedDays(days) {
  const list = $("blockedList");
  if (!list) return;

  if (!days.length) {
    list.innerHTML = "<p class='loading-row'>No hay días bloqueados actualmente.</p>";
    return;
  }

  list.innerHTML = days.map(d => {
    const ds = new Date(d.date + "T00:00:00").toLocaleDateString("es-UY", {
      weekday:"long", day:"numeric", month:"long", year:"numeric"
    });
    return `<div class="blocked-item">
      <div>
        <p class="bi-date">${ds}</p>
        <p class="bi-reason">${d.reason ? esc(d.reason) : "Sin motivo especificado"}</p>
      </div>
      <button class="bi-remove" onclick="unblockDay(${d.id})" title="Desbloquear este día">
        <i class="fas fa-times"></i>
      </button>
    </div>`;
  }).join("");
}

async function confirmBlockDay() {
  const dateVal = $("blockDate")?.value;
  const reason  = $("blockReason")?.value?.trim() || "";
  if (!dateVal) { showToast("Seleccioná una fecha.", "error"); return; }

  try {
    const res  = await fetch("/api/admin/blocked-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateVal, reason }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast("Día bloqueado correctamente.", "success");
      const f = $("blockForm");
      if (f) f.hidden = true;
      if ($("blockDate"))  $("blockDate").value  = "";
      if ($("blockReason")) $("blockReason").value = "";
      loadBlockedDays();
    } else {
      showToast(data.error || "No se pudo bloquear el día.", "error");
    }
  } catch { showToast("Error de conexión.", "error"); }
}

async function unblockDay(id) {
  if (!confirm("¿Quitar el bloqueo de este día?\nLos clientes podrán reservar nuevamente.")) return;
  try {
    const res = await fetch(`/api/admin/blocked-days/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Día desbloqueado.", "success");
      loadBlockedDays();
    } else {
      showToast("No se pudo desbloquear.", "error");
    }
  } catch { showToast("Error de conexión.", "error"); }
}


// ═══════════════════════════════════════════════════════════════
// 7. AUTO-REFRESH
// ═══════════════════════════════════════════════════════════════

function startAutoRefresh() {
  const note = $("autoRefreshNote");
  let secs   = 60;
  if (note) note.textContent = `Actualización automática en ${secs}s`;
  autoRefreshTimer = setInterval(() => {
    secs--;
    if (note) note.textContent = `Actualización automática en ${secs}s`;
    if (secs <= 0) {
      loadAppointments("today");
      loadStats();
      secs = 60;
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const note = $("autoRefreshNote");
  if (note) note.textContent = "";
}


// ═══════════════════════════════════════════════════════════════
// 8. HELPERS
// ═══════════════════════════════════════════════════════════════

function showToast(msg, type = "") {
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

function setEl(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
