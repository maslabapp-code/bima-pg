// frontend/guest.js — Dashboard guest: read-only, 1 project saja.
// Sengaja dibuat terpisah dari app.js (bukan dipangkas) supaya guest
// tidak pernah memuat kode tambah/edit/hapus/upload sama sekali.

const API = "";

const colors = {
  maroon: "#0E4AA8",
  green: "#0F8C90",
  green2: "#32A852",
  blue: "#2378D6",
  gray: "#A8B4C2",
  red: "#D93025",
  gold: "#2378D6",
};

const statusOptions = ["Belum Mulai", "On Track", "In Progress", "Selesai", "Terlambat"];
const statusMeta = {
  "Selesai": { color: colors.green2 },
  "On Track": { color: colors.blue },
  "In Progress": { color: colors.green },
  "Belum Mulai": { color: colors.gray },
  "Terlambat": { color: colors.red },
};

function normalizeStatus(value) {
  const raw = String(value ?? "").trim();
  const found = statusOptions.find(item => item.toLowerCase() === raw.toLowerCase());
  if (found) return found;
  if (["done", "selesai", "complete", "completed", "true"].includes(raw.toLowerCase())) return "Selesai";
  if (["progress", "inprogress", "in progress"].includes(raw.toLowerCase())) return "In Progress";
  return "Belum Mulai";
}

function statusCounts(rows) {
  const counts = Object.fromEntries(statusOptions.map(status => [status, 0]));
  rows.forEach(row => {
    const status = normalizeStatus(row.status);
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function percent(a, b) { return b ? (a / b) * 100 : 0; }
function formatPercent(value) { return `${Math.round(value || 0)}%`; }

let project = null;
let activeTab = "overview";
let searchQuery = "";

// ── Definisi kolom per tabel (disamakan dengan dashboard utama) ──
const tableConfigs = {
  eir: {
    title: "EIR - Exchange Information Requirement",
    columns: [
      { key: "no", label: "No" },
      { key: "category", label: "Kategori" },
      { key: "question", label: "Pertanyaan Kesepakatan" },
      { key: "answer", label: "Jawaban / Requirement" },
      { key: "purpose", label: "Untuk Apa?" },
      { key: "originator", label: "Oleh Siapa?" },
      { key: "format", label: "Format" },
      { key: "neededAt", label: "Kapan Dibutuhkan?", type: "date" },
      { key: "pic", label: "PIC" },
      { key: "agreed", label: "Disepakati", type: "checkbox" },
      { key: "notes", label: "Catatan" },
    ],
  },
  bep: {
    title: "BEP - BIM Execution Plan",
    columns: [
      { key: "no", label: "No" },
      { key: "topic", label: "Topik Kesepakatan" },
      { key: "agreement", label: "Kesepakatan Kerja" },
      { key: "software", label: "Software / Platform" },
      { key: "format", label: "Format Output" },
      { key: "naming", label: "Naming Convention" },
      { key: "review", label: "Cara Review & Approval" },
      { key: "pic", label: "PIC" },
      { key: "agreed", label: "Disepakati", type: "checkbox" },
      { key: "notes", label: "Catatan" },
    ],
  },
  midp: {
    title: "MIDP - Master Information Delivery Plan",
    columns: [
      { key: "no", label: "No" },
      { key: "code", label: "Kode Deliverable" },
      { key: "name", label: "Nama Deliverable" },
      { key: "discipline", label: "Disiplin" },
      { key: "infoType", label: "Tipe Informasi" },
      { key: "format", label: "Format File" },
      { key: "loin", label: "Level of Info Need" },
      { key: "phase", label: "Fase Proyek" },
      { key: "deadline", label: "Deadline", type: "date" },
      { key: "pic", label: "PIC" },
      { key: "receiver", label: "Penerima Informasi" },
      { key: "status", label: "Status", type: "status" },
      { key: "realization", label: "Tgl Realisasi", type: "date" },
      { key: "notes", label: "Catatan" },
    ],
  },
  tidp: {
    title: "TIDP - Task Information Delivery Plan",
    columns: [
      { key: "no", label: "No" },
      { key: "midpCode", label: "Kode MIDP Terkait" },
      { key: "code", label: "Kode Deliverable" },
      { key: "name", label: "Nama Deliverable" },
      { key: "infoType", label: "Tipe Informasi" },
      { key: "format", label: "Format File" },
      { key: "loin", label: "Level of Info Need" },
      { key: "phase", label: "Fase Proyek" },
      { key: "deadline", label: "Deadline", type: "date" },
      { key: "pic", label: "PIC Internal" },
      { key: "discipline", label: "Disiplin" },
      { key: "status", label: "Status", type: "status" },
      { key: "notes", label: "Catatan / Dependensi" },
    ],
  },
  curve: {
    title: "Kurva S - Rencana vs Aktual",
    columns: [
      { key: "no", label: "No" },
      { key: "label", label: "Periode", type: "date" },
      { key: "planned", label: "Rencana Kumulatif (%)" },
      { key: "actual", label: "Aktual Kumulatif (%)" },
      { key: "notes", label: "Keterangan" },
    ],
  },
  cdeChecklist: {
    title: "Checklist Folderisasi CDE ISO 19650",
    columns: [
      { key: "no", label: "No" },
      { key: "phase", label: "Fase / Ruang Data" },
      { key: "folder", label: "Folder ISO 19650" },
      { key: "document", label: "Dokumen / Konten" },
      { key: "required", label: "Wajib", type: "checkbox" },
      { key: "available", label: "Sudah Ada", type: "checkbox" },
      { key: "pic", label: "PIC" },
      { key: "notes", label: "Catatan" },
    ],
  },
  cdeRegister: {
    title: "CDE Register Dokumen",
    columns: [
      { key: "no", label: "No" },
      { key: "code", label: "Kode Dokumen" },
      { key: "name", label: "Nama File / Dokumen" },
      { key: "folder", label: "Folder CDE" },
      { key: "state", label: "Tahap ISO 19650" },
      { key: "discipline", label: "Disiplin" },
      { key: "status", label: "Status Review", type: "status" },
      { key: "reviewer", label: "Reviewer" },
      { key: "date", label: "Tanggal Submit", type: "date" },
      { key: "fileName", label: "File", type: "file" },
      { key: "notes", label: "Catatan" },
    ],
  },
  agreement: {
    title: "Agreement dan Penawaran",
    columns: [
      { key: "no", label: "No" },
      { key: "docType", label: "Jenis Dokumen" },
      { key: "code", label: "Kode / Nomor" },
      { key: "name", label: "Nama File" },
      { key: "party", label: "Pihak Terkait" },
      { key: "package", label: "Paket / Scope" },
      { key: "value", label: "Nilai / No Penawaran" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Tanggal", type: "date" },
      { key: "fileName", label: "File", type: "file" },
      { key: "notes", label: "Catatan" },
    ],
  },
};

const projectInfoFields = [
  { key: "companyName", label: "Nama Perusahaan" },
  { key: "projectName", label: "Nama Proyek" },
  { key: "period", label: "Periode Dashboard" },
  { key: "phase", label: "Fase Proyek" },
  { key: "managerName", label: "BIM Manager / Koordinator" },
  { key: "managerRole", label: "Jabatan" },
  { key: "appointingParty", label: "Appointing Party / Owner" },
  { key: "leadAppointedParty", label: "Lead Appointed Party" },
  { key: "projectLocation", label: "Lokasi Proyek" },
  { key: "contractType", label: "Jenis Kontrak" },
  { key: "bimObjective", label: "Tujuan BIM" },
  { key: "informationStandard", label: "Standar Informasi" },
];

const TABS = [
  { key: "overview", label: "Ringkasan" },
  { key: "eir", label: "EIR" },
  { key: "bep", label: "BEP" },
  { key: "midp", label: "MIDP" },
  { key: "tidp", label: "TIDP" },
  { key: "curve", label: "Kurva S" },
  { key: "cdeChecklist", label: "CDE Checklist" },
  { key: "cdeRegister", label: "CDE Register" },
  { key: "agreement", label: "Agreement" },
];

function drawDonut(canvasId, items) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let start = -Math.PI / 2;
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) / 2 - 15, inner = radius * .58;
  items.forEach(item => {
    const angle = item.value / total * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, start + angle); ctx.closePath();
    ctx.fillStyle = item.color; ctx.fill(); start += angle;
  });
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.fillStyle = colors.green; ctx.font = "bold 30px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(total), cx, cy - 2);
  ctx.fillStyle = "#6b7a74"; ctx.font = "12px Inter, sans-serif"; ctx.fillText("deliverable", cx, cy + 20);
}

function formatPeriodLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const dd  = String(d.getDate()).padStart(2, "0");
  const mmm = MONTHS[d.getMonth()];
  const yy  = String(d.getFullYear()).slice(2);
  return `${dd} ${mmm} ${yy}`;
}

// Grafik Kurva S (kanvas 2D) — versi lihat-saja, tanpa interaksi klik-untuk-edit
function drawCurveChart(canvasId, points) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !points.length) return;
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const parentBox = parent ? parent.getBoundingClientRect() : { width: 0 };
  const cssWidth = Math.max(260, Math.floor(parentBox.width || canvas.clientWidth || 720));
  const cssHeight = 320;

  canvas.style.width = "100%";
  canvas.style.maxWidth = "100%";
  canvas.style.height = cssHeight + "px";
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = cssWidth, height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 34, right: 26, bottom: 48, left: 48 };
  const labels = points.map(p => formatPeriodLabel(p.label) || p.label);
  const planned = points.map(p => Number(p.planned || 0));
  const actual  = points.map(p => Number(p.actual || 0));
  const max = Math.max(...planned, ...actual, 10);
  const yMax = Math.ceil(max / 5) * 5;
  const chartW = Math.max(1, width - padding.left - padding.right);
  const chartH = Math.max(1, height - padding.top - padding.bottom);

  ctx.strokeStyle = "#e5ece7"; ctx.lineWidth = 1; ctx.fillStyle = "#6b7a74"; ctx.font = "12px Inter, sans-serif"; ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + chartH - chartH * (i / 5);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
    ctx.fillText(String(Math.round(yMax * i / 5)), padding.left - 8, y + 4);
  }

  const xFor = idx => padding.left + (labels.length === 1 ? 0 : chartW * idx / (labels.length - 1));
  const yFor = val => padding.top + chartH - chartH * (val / yMax);
  const labelStep = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(chartW / 82))));
  labels.forEach((label, idx) => {
    if (idx !== 0 && idx !== labels.length - 1 && idx % labelStep !== 0) return;
    ctx.fillStyle = "#6b7a74"; ctx.textAlign = "center";
    ctx.fillText(label, xFor(idx), height - 16);
  });

  function drawSeries(values, color, hideZeroTail) {
    ctx.beginPath();
    let started = false;
    values.forEach((value, idx) => {
      if (hideZeroTail && value === 0 && idx > 0) return;
      const x = xFor(idx), y = yFor(value);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    values.forEach((value, idx) => {
      if (hideZeroTail && value === 0 && idx > 0) return;
      ctx.beginPath(); ctx.arc(xFor(idx), yFor(value), 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    });
  }
  drawSeries(planned, colors.maroon, false);
  drawSeries(actual, colors.green2, true);

  const legends = [{ name: "Rencana", color: colors.maroon }, { name: "Aktual", color: colors.green2 }];
  let offset = 0;
  legends.forEach(item => {
    ctx.fillStyle = item.color; ctx.fillRect(padding.left + offset, 12, 18, 4);
    ctx.fillStyle = "#6b7a74"; ctx.textAlign = "left"; ctx.fillText(item.name, padding.left + offset + 24, 17);
    offset += 96;
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(value) {
  if (!value) return "–";
  const d = new Date(value);
  if (isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Init ──
(async function init() {
  try {
    const meRes = await fetch(`${API}/api/auth/me`, { credentials: "include" });
    if (meRes.status === 401) { window.location.replace("/login.html"); return; }
    const me = await meRes.json();

    // Halaman ini khusus guest — role lain diarahkan ke dashboard biasa
    if (me.role !== "guest") { window.location.replace("/"); return; }

    document.getElementById("userGreeting").textContent = `Halo, ${me.fullName || me.username} — Mode Guest (Lihat Saja)`;

    if (!me.allowedProjectId) {
      showError("Akun kamu belum ditetapkan ke project manapun. Hubungi admin untuk mengatur akses.");
      return;
    }

    const res = await fetch(`${API}/api/projects/${me.allowedProjectId}`, { credentials: "include" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError(err.error || "Gagal memuat data project.");
      return;
    }
    project = await res.json();

    document.getElementById("projectNameTitle").textContent = project.projectInfo?.projectName || "BIMA Dashboard";
    document.title = `${project.projectInfo?.projectName || "Project"} — Guest View`;

    renderTabs();
    switchTab("overview");

    document.getElementById("loadingState").style.display = "none";
    document.getElementById("content").style.display = "block";
  } catch (err) {
    showError("Tidak bisa konek ke server: " + err.message);
  }
})();

function showError(msg) {
  document.getElementById("loadingState").style.display = "none";
  const el = document.getElementById("errorState");
  el.style.display = "block";
  el.textContent = "⚠️ " + msg;
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
  window.location.replace("/login.html");
});

document.getElementById("tabSearch").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderActiveTab();
});

function renderTabs() {
  const wrap = document.getElementById("guestTabs");
  wrap.innerHTML = TABS.map(t =>
    `<button class="guest-tab-btn${t.key === activeTab ? " active" : ""}" data-tab="${t.key}">${escapeHtml(t.label)}</button>`
  ).join("");
  wrap.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(key) {
  activeTab = key;
  searchQuery = "";
  document.getElementById("tabSearch").value = "";
  document.querySelectorAll(".guest-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === key));
  document.getElementById("tabSearch").style.display = key === "overview" ? "none" : "";
  renderActiveTab();
}

function renderActiveTab() {
  if (activeTab === "overview") {
    renderOverview();
    return;
  }
  renderDataTable(activeTab);
  if (activeTab === "curve") {
    // Render ulang di frame berikutnya supaya lebar canvas terbaca benar dari DOM
    requestAnimationFrame(() => drawCurveChart("guestCurveChart", (project.curve || []).filter(p =>
      !searchQuery || String(p.label ?? "").toLowerCase().includes(searchQuery) || String(p.notes ?? "").toLowerCase().includes(searchQuery)
    )));
  }
}

function renderOverview() {
  document.getElementById("tabTitle").textContent = "Ringkasan Project";
  document.getElementById("tabHint").textContent = "Gambaran umum progres project ini.";

  const deliverables = [...(project.midp || []), ...(project.tidp || [])];
  const total = deliverables.length;
  const counts = statusCounts(deliverables);
  const done = counts["Selesai"] || 0;
  const progress = (counts["On Track"] || 0) + (counts["In Progress"] || 0);
  const notStarted = counts["Belum Mulai"] || 0;
  const late = counts["Terlambat"] || 0;

  const cdeRequired = (project.cdeChecklist || []).filter(r => r.required).length;
  const cdeAvailable = (project.cdeChecklist || []).filter(r => r.required && r.available).length;
  const eirDone = percent((project.eir || []).filter(r => r.agreed).length, (project.eir || []).length);
  const bepDone = percent((project.bep || []).filter(r => r.agreed).length, (project.bep || []).length);

  const kpis = [
    { label: "Total Deliverable", value: total, sub: "MIDP + TIDP", color: colors.green },
    { label: "Selesai", value: done, sub: `${formatPercent(percent(done, total))} dari total`, color: colors.green2 },
    { label: "On Track / In Progress", value: progress, sub: "Dalam pengawalan", color: colors.blue },
    { label: "Belum Mulai", value: notStarted, sub: "Menunggu aktivitas", color: colors.gray },
    { label: "Terlambat", value: late, sub: late ? "Perlu perhatian" : "Tidak ada keterlambatan", color: late ? colors.red : colors.green2 },
    { label: "Checklist CDE Wajib", value: `${cdeAvailable}/${cdeRequired || 0}`, sub: "Dokumen wajib tersedia", color: colors.maroon },
    { label: "EIR / BEP Agreed", value: formatPercent((eirDone + bepDone) / 2), sub: "Kesepakatan informasi", color: colors.gold },
    { label: "Dokumen Agreement", value: (project.agreement || []).length, sub: "Total dokumen tercatat", color: colors.blue },
  ];

  const info = project.projectInfo || {};

  document.getElementById("tabContentWrap").innerHTML = `
    <div class="kpi-grid" style="margin-bottom:20px">
      ${kpis.map(k => `
        <div class="kpi-card" style="--accent:${k.color}">
          <small>${escapeHtml(k.label)}</small>
          <strong>${escapeHtml(String(k.value))}</strong>
          <span>${escapeHtml(k.sub)}</span>
        </div>`).join("")}
    </div>

    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-bottom:16px" class="overview-charts-grid">
      <div class="panel table-card" style="margin-bottom:0">
        <h3 style="margin-top:0">Status Deliverable (MIDP + TIDP)</h3>
        <div class="donut-wrap">
          <canvas id="guestStatusDonut" width="220" height="220"></canvas>
          <div class="legend" id="guestStatusLegend"></div>
        </div>
      </div>
      <div class="panel table-card" style="margin-bottom:0">
        <h3 style="margin-top:0">Progres per Disiplin</h3>
        <div class="bar-stack" id="guestDisciplineBars"></div>
      </div>
    </div>

    <div class="panel table-card" style="margin-bottom:16px">
      <h3 style="margin-top:0">Tren Kurva S (Rencana vs Aktual)</h3>
      <canvas id="guestOverviewCurve" height="260"></canvas>
    </div>

    <div class="panel table-card" style="margin-bottom:16px">
      <h3 style="margin-top:0">Informasi Project</h3>
      <div class="info-grid">
        ${projectInfoFields.map(f => `
          <div class="info-item">
            <small>${escapeHtml(f.label)}</small>
            <span>${escapeHtml(info[f.key]) || "–"}</span>
          </div>`).join("")}
      </div>
    </div>
  `;

  const donutItems = statusOptions.map(name => ({ name, value: counts[name] || 0, color: statusMeta[name].color }));
  drawDonut("guestStatusDonut", donutItems);
  document.getElementById("guestStatusLegend").innerHTML = donutItems.map(item =>
    `<div class="legend-row"><span><i style="background:${item.color}"></i>${escapeHtml(item.name)}</span><strong>${item.value} · ${formatPercent(percent(item.value, total))}</strong></div>`
  ).join("");

  const disciplines = ["Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control"];
  document.getElementById("guestDisciplineBars").innerHTML = disciplines.map(d => {
    const rows = deliverables.filter(row => row.discipline === d);
    const dTotal = rows.length || 1;
    const dCounts = statusCounts(rows);
    const segments = statusOptions.map(status => {
      const value = dCounts[status] || 0;
      return `<span class="segment" title="${escapeHtml(status)}: ${value}" style="width:${percent(value, dTotal)}%;background:${statusMeta[status].color}"></span>`;
    }).join("");
    return `<div class="discipline-row"><strong>${escapeHtml(d)}</strong><div class="stacked-track">${segments}</div><span>${dCounts["Selesai"] || 0}/${rows.length}</span></div>`;
  }).join("");

  requestAnimationFrame(() => drawCurveChart("guestOverviewCurve", project.curve || []));
}

function renderCell(row, col) {
  const value = row[col.key];

  if (col.type === "checkbox") {
    return value ? `<span class="checkbox-view disabled">✔️ Ya</span>` : `<span class="muted-cell">Tidak</span>`;
  }
  if (col.type === "date") {
    return `<span class="date-cell">${formatDate(value)}</span>`;
  }
  if (col.type === "status") {
    return value ? `<span class="status-badge status-ontrack">${escapeHtml(value)}</span>` : `<span class="empty-cell">–</span>`;
  }
  if (col.type === "file") {
    const url = row.serverUrl;
    if (!value && !url) return `<span class="empty-cell">Belum ada file</span>`;
    return url
      ? `<a class="server-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">📄 ${escapeHtml(value || "Buka file")}</a>`
      : `<span class="file-chip">📄 ${escapeHtml(value)}</span>`;
  }
  if (!value && value !== 0) return `<span class="empty-cell">–</span>`;
  return escapeHtml(value);
}

function renderDataTable(key) {
  const config = tableConfigs[key];
  const rows = project[key] || [];

  document.getElementById("tabTitle").textContent = config.title;
  document.getElementById("tabHint").textContent = `${rows.length} baris data — mode lihat saja`;

  const filtered = !searchQuery ? rows : rows.filter(row =>
    config.columns.some(col => String(row[col.key] ?? "").toLowerCase().includes(searchQuery))
  );

  const head = config.columns.map(col => `<th style="min-width:140px">${escapeHtml(col.label)}</th>`).join("");
  const body = filtered.map(row =>
    `<tr>${config.columns.map(col => `<td>${renderCell(row, col)}</td>`).join("")}</tr>`
  ).join("") || `<tr><td colspan="${config.columns.length}" class="empty-cell">Belum ada data di tabel ini.</td></tr>`;

  const chartHtml = key === "curve"
    ? `<div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:16px">
         <canvas id="guestCurveChart" height="320"></canvas>
       </div>`
    : "";

  document.getElementById("tabContentWrap").innerHTML = chartHtml + `
    <table class="data-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}
