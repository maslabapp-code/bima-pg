// ─────────────────────────────────────────────────────────────
// BIMA Dashboard - Mode PostgreSQL via Backend API
// app.js versi database: localStorage diganti dengan REST API
// ─────────────────────────────────────────────────────────────

// URL backend API. Kalau frontend & backend satu server: "" (sama origin).
// Kalau frontend dibuka dari file:// atau port berbeda, isi alamat backend:
const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:3001"
  : "";  // sama origin jika dibuka via server

const STORE_KEY = "bima_midp_tidp_dashboard_v8";
const LEGACY_STORE_KEYS = ["bima_midp_tidp_dashboard_v7", "bima_midp_tidp_dashboard_v6", "bima_midp_tidp_dashboard_v5", "bima_midp_tidp_dashboard_v4", "bima_midp_tidp_dashboard_v3", "bima_midp_tidp_dashboard_v2"];

// ── API helpers ──
// Semua API call include credentials (cookie JWT)
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (res.status === 401) { window.location.replace("/login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (res.status === 401) { window.location.replace("/login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (res.status === 401) { window.location.replace("/login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", credentials: "include" });
  if (res.status === 401) { window.location.replace("/login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Flag: apakah backend tersedia?
let USE_DB = false;

// ── Pagination state ──────────────────────────────────────
const PAGE_SIZE   = 25; // baris per halaman
const pageState   = {}; // { [tableKey]: currentPage }
const searchState = {}; // { [tableKey]: searchQuery }

function getPage(key)           { return pageState[key] || 1; }
function setPage(key, page)     { pageState[key] = page; }
function resetPage(key)         { pageState[key] = 1; }
function getSearch(key)         { return searchState[key] || ""; }
function setSearch(key, query)  { searchState[key] = query; pageState[key] = 1; }
function resetAllPages() {
  Object.keys(pageState).forEach(k => delete pageState[k]);
  Object.keys(searchState).forEach(k => delete searchState[k]);
}

// ── Auth state ────────────────────────────────────────────
let currentUser = null; // { id, username, fullName, role }

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (res.status === 401) {
      window.location.replace("/login.html");
      return false;
    }
    currentUser = await res.json();
    // Guest punya halaman sendiri yang lebih simpel — jangan biarkan dia di dashboard ini
    if (currentUser.role === "guest") {
      window.location.replace("/guest.html");
      return false;
    }
    return true;
  } catch {
    window.location.replace("/login.html");
    return false;
  }
}

async function doLogout() {
  await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
  window.location.replace("/login.html");
}

function isAdmin() { return currentUser?.role === "admin"; }
function isGuest() { return currentUser?.role === "guest"; }

// Menu yang disembunyikan untuk role user
const USER_HIDDEN_MENUS = ["agreement"];

// Terapkan pembatasan berdasarkan role
function applyRoleRestrictions() {
  if (isAdmin()) return; // admin: akses penuh ke semua menu

  if (isGuest()) {
    applyGuestReadOnly();
    return;
  }

  // Sembunyikan menu agreement untuk user
  USER_HIDDEN_MENUS.forEach(menuKey => {
    const btn = document.querySelector(`.nav-btn[data-target="${menuKey}"]`);
    if (btn) btn.style.display = "none";

    // Jika sedang di tab yang disembunyikan, pindah ke overview
    if (activeTab === menuKey) switchTab("overview");
  });

  // User biasa: sembunyikan tombol berbahaya
  const restrict = ["resetBtn", "newProjectBtn", "editProjectBtn"];
  restrict.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // Sembunyikan tombol hapus baris di semua tabel
  document.querySelectorAll(".btn-delete-row, [data-action='delete']").forEach(el => {
    el.style.display = "none";
  });
}

// Guest: hanya boleh melihat 1 project yang ditetapkan admin, sama sekali tidak bisa ubah apapun.
// (Pembatasan sesungguhnya sudah dikunci di backend — ini cuma menyembunyikan
// kontrol yang memang tidak akan berhasil dipakai, biar UI tidak membingungkan.)
function applyGuestReadOnly() {
  // Guest tetap bisa lihat semua menu/tab, jadi USER_HIDDEN_MENUS tidak diterapkan.

  // Sembunyikan semua tombol "+ Tambah ..."
  document.querySelectorAll("[data-add]").forEach(el => el.style.display = "none");
  const addCurveBtn = document.getElementById("addCurvePointBtn");
  if (addCurveBtn) addCurveBtn.style.display = "none";

  // Sembunyikan tombol kelola project & reset data
  ["resetBtn", "newProjectBtn", "editProjectBtn", "editEirInfoBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // Endpoint upload: tampil tapi tidak bisa diubah
  const endpointInput = document.getElementById("serverEndpoint");
  if (endpointInput) endpointInput.setAttribute("readonly", "true");

  // Guest hanya punya 1 project (sudah difilter dari server) — kunci dropdown-nya
  const projectSelect = document.getElementById("projectSelect");
  if (projectSelect) {
    projectSelect.setAttribute("disabled", "true");
    const wrap = projectSelect.closest(".ts-wrapper") || projectSelect.parentElement;
    if (wrap) wrap.style.pointerEvents = "none";
  }
}

// Helper switchTab dipakai di applyRoleRestrictions
function switchTab(key) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  const btn = document.querySelector(`.nav-btn[data-target="${key}"]`);
  const page = document.getElementById(key);
  if (btn) btn.classList.add("active");
  if (page) page.classList.add("active-page");
  activeTab = key;
  document.body.dataset.section = key;
  redrawCharts?.();
}

// Render info user di topbar
function renderUserInfo() {
  if (!currentUser) return;
  const existing = document.getElementById("userInfoBar");
  if (existing) existing.remove();

  const roleBadge = isAdmin()
    ? `<span class="user-role-badge" style="background:#0F8C90;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;letter-spacing:.05em">ADMIN</span>`
    : isGuest()
    ? `<span class="user-role-badge" style="background:#b8720b;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;letter-spacing:.05em">GUEST</span>`
    : `<span class="user-role-badge" style="background:rgba(255,255,255,.18);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.05em">USER</span>`;

  const navTabs = document.querySelector(".nav-tabs");
  if (!navTabs) return;

  const userCard = document.createElement("div");
  userCard.id = "userInfoBar";
  userCard.innerHTML = `
    <!-- Mode NORMAL: card lengkap -->
    <div class="user-card-full">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:20px">👤</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${currentUser.fullName || currentUser.username}
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:1px">
            @${currentUser.username}
          </div>
        </div>
        ${roleBadge}
      </div>
      ${isAdmin() ? `
      <a href="/logs.html" class="user-menu-link">📋 Activity Log</a>
      <a href="/users.html" class="user-menu-link">⚙ Kelola User</a>` : ""}
      <button onclick="doLogout()" class="user-logout-btn">⬡ Logout</button>
    </div>

    <!-- Mode MINI: ikon-ikon kecil saja -->
    <div class="user-card-mini">
      <button class="user-mini-icon" title="${currentUser.fullName || currentUser.username} (${currentUser.role.toUpperCase()})">👤</button>
      ${isAdmin() ? `
      <a href="/logs.html" class="user-mini-icon" title="Activity Log">📋</a>
      <a href="/users.html" class="user-mini-icon" title="Kelola User">⚙</a>` : ""}
      <button class="user-mini-icon" onclick="doLogout()" title="Logout">🚪</button>
    </div>
  `;
  navTabs.after(userCard);
}

async function checkBackend() {
  // Coba sampai 3x dengan jeda — antisipasi server baru restart
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
      USE_DB = true;
      console.log("✅ Backend terhubung, mode: PostgreSQL");
      return;
    } catch {
      console.warn(`⚠️  Backend tidak merespons (percobaan ${attempt}/3)`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
  }
  USE_DB = false;
  console.warn("⚠️  Backend tidak tersedia, fallback ke localStorage");
}

const colors = {
  maroon: "#0E4AA8",
  green: "#0F8C90",
  green2: "#32A852",
  gold: "#2378D6",
  blue: "#2378D6",
  gray: "#A8B4C2",
  red: "#D93025",
  yellow: "#C07C00",
  mint: "#EFF8FF"
};

const statusOptions = ["Belum Mulai", "On Track", "In Progress", "Selesai", "Terlambat"];
const statusMeta = {
  "Selesai": { color: colors.green2, className: "status-selesai" },
  "On Track": { color: colors.blue, className: "status-ontrack" },
  "In Progress": { color: colors.green, className: "status-inprogress" },
  "Belum Mulai": { color: colors.gray, className: "status-belum" },
  "Terlambat": { color: colors.red, className: "status-terlambat" }
};

// ── Deadline urgency helpers ──────────────────────────────────────────────────
// Returns number of days from today to deadline string (negative = past deadline)
function daysUntilDeadline(deadlineStr) {
  if (!deadlineStr || deadlineStr === "TBC") return null;
  const normalized = normalizeDateValueSafe(deadlineStr);
  if (!normalized) return null;
  const deadline = new Date(normalized + "T00:00:00");
  if (isNaN(deadline)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((deadline - today) / (1000 * 60 * 60 * 24));
}

// Safe version: tries both iso format and text parse
function normalizeDateValueSafe(val) {
  if (!val) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) return val;
  const d = new Date(val);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return "";
}

// Returns urgency class for a row: "overdue" | "warning" | "normal" | null
function deadlineUrgency(row) {
  if (isDone(row)) return null; // selesai → tidak perlu warning
  const days = daysUntilDeadline(row.deadline);
  if (days === null) return null;
  if (days < 0) return "overdue";   // sudah lewat → merah
  if (days <= 7) return "warning";  // ≤7 hari → kuning
  return "normal";
}

// Returns a deadline chip element with appropriate color
function deadlineChip(row) {
  const label = row.deadline || "TBC";
  const urgency = deadlineUrgency(row);
  if (urgency === "overdue") {
    const days = daysUntilDeadline(row.deadline);
    const overDays = Math.abs(days);
    return `<span class="status-mini deadline-overdue" title="Terlambat ${overDays} hari">⚠ ${escapeHtml(label)}</span>`;
  }
  if (urgency === "warning") {
    const days = daysUntilDeadline(row.deadline);
    return `<span class="status-mini deadline-warning" title="${days} hari lagi">⏰ ${escapeHtml(label)}</span>`;
  }
  return `<span class="status-mini status-wip">${escapeHtml(label)}</span>`;
}
const reviewStatusOptions = ["Draft", "Internal Review", "In Review", "Reviewed", "Approved", "Published", "Archived", "Rejected"];
const agreementStatusOptions = ["Draft", "Terkirim", "Negosiasi", "In Review", "Disetujui", "Ditolak", "Final"];



// ── LOD (Level of Development) definitions ───────────────
const LOD_OPTIONS = [
  { value: "LOD 100", label: "LOD 100 (Konseptual)",   desc: "Bentuk dasar/massa 3D untuk studi awal dan estimasi volume/luas." },
  { value: "LOD 200", label: "LOD 200 (Skematik)",     desc: "Geometri dan ukuran masih umum/generik untuk desain awal dan analisis ruang." },
  { value: "LOD 300", label: "LOD 300 (Terperinci)",   desc: "Dimensi dan geometri sudah akurat, siap untuk gambar kerja/konstruksi." },
  { value: "LOD 350", label: "LOD 350 (Terkoordinasi)",desc: "Detail koneksi antar elemen/sistem untuk koordinasi dan clash detection." },
  { value: "LOD 400", label: "LOD 400 (Fabrikasi)",    desc: "Detail lengkap untuk proses fabrikasi/manufaktur, termasuk spesifikasi pabrikan." },
  { value: "LOD 500", label: "LOD 500 (As-Built)",     desc: "Kondisi akhir sesuai hasil bangunan di lapangan untuk operasional dan maintenance." },
];

const tableConfigs = {
  eir: {
    title: "EIR - Exchange Information Requirement",
    tableId: "eirTable",
    addLabel: "Item EIR",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "category", label: "Kategori", type: "select", options: ["Informasi Proyek", "Tujuan Informasi", "Deliverable", "LOIN", "CDE", "Milestone", "Security", "Handover"], required: true },
      { key: "question", label: "Pertanyaan Kesepakatan", type: "textarea", required: true },
      { key: "answer", label: "Jawaban / Requirement", type: "textarea", required: true },
      { key: "purpose", label: "Untuk Apa?", type: "textarea" },
      { key: "originator", label: "Oleh Siapa?", type: "text", required: true },
      { key: "format", label: "Format", type: "text" },
      { key: "neededAt", label: "Kapan Dibutuhkan?", type: "date" },
      { key: "pic", label: "PIC", type: "text", required: true },
      { key: "agreed", label: "Disepakati", type: "checkbox" },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  },
  bep: {
    title: "BEP - BIM Execution Plan",
    tableId: "bepTable",
    addLabel: "Item BEP",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "topic", label: "Topik Kesepakatan", type: "select", options: ["Software dan Format", "Naming Convention", "Review dan Approval", "PIC Informasi", "QA/QC", "CDE Workflow", "Handover", "Koordinasi"], required: true },
      { key: "agreement", label: "Kesepakatan Kerja", type: "textarea", required: true },
      { key: "software", label: "Software / Platform", type: "text" },
      { key: "format", label: "Format Output", type: "text" },
      { key: "naming", label: "Naming Convention", type: "code-builder-bep" },
      { key: "review", label: "Cara Review & Approval", type: "textarea" },
      { key: "pic", label: "PIC", type: "text", required: true },
      { key: "agreed", label: "Disepakati", type: "checkbox" },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  },
  midp: {
    title: "MIDP - Master Information Delivery Plan",
    tableId: "midpTable",
    addLabel: "MIDP",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "code", label: "Kode Deliverable", type: "code-builder", required: true },
      { key: "name", label: "Nama Deliverable", type: "textarea", required: true },
      { key: "discipline", label: "Disiplin / Appointed Party", type: "select", options: ["Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control"], required: true },
      { key: "infoType", label: "Tipe Informasi", type: "select", options: ["2D Drawing", "3D Model", "2D Drawing & 3D Model", "Dokumen", "Data/Spreadsheet", "Federated Model", "Report"], required: true },
      { key: "format", label: "Format File", type: "text" },
      { key: "loin", label: "Level of Info Need", type: "select-loin" },
      { key: "phase", label: "Fase Proyek", type: "select", options: ["Pre-Design", "SD", "DD", "Construction", "Handover", "Berjalan"], required: true },
      { key: "deadline", label: "Deadline Pengiriman", type: "date", required: true },
      { key: "pic", label: "PIC", type: "text", required: true },
      { key: "receiver", label: "Penerima Informasi", type: "text" },
      { key: "status", label: "Status", type: "select", options: statusOptions, required: true },
      { key: "realization", label: "Tanggal Realisasi", type: "date" },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  },
  tidp: {
    title: "TIDP - Task Information Delivery Plan",
    tableId: "tidpTable",
    addLabel: "TIDP",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "midpCode", label: "Kode MIDP Terkait", type: "select-midp", required: true },
      { key: "code", label: "Kode Deliverable", type: "code-builder-tidp", required: true },
      { key: "name", label: "Nama Deliverable", type: "textarea", required: true },
      { key: "infoType", label: "Tipe Informasi", type: "select", options: ["2D Drawing", "3D Model", "2D Drawing & 3D Model", "Dokumen", "Data/Spreadsheet", "Federated Model", "Report"], required: true },
      { key: "format", label: "Format File", type: "text" },
      { key: "loin", label: "Level of Info Need", type: "select-loin" },
      { key: "phase", label: "Fase Proyek", type: "select", options: ["Pre-Design", "SD", "DD", "Construction", "Handover", "Berjalan"], required: true },
      { key: "deadline", label: "Deadline Pengiriman", type: "date", required: true },
      { key: "pic", label: "PIC Internal", type: "text", required: true },
      { key: "discipline", label: "Disiplin", type: "select", options: ["Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control"], required: true },
      { key: "status", label: "Status", type: "select", options: statusOptions, required: true },
      { key: "notes", label: "Catatan / Dependensi", type: "textarea" }
    ]
  },
  curve: {
    title: "Kurva S - Rencana vs Aktual",
    tableId: "curveTable",
    addLabel: "Titik Kurva S",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "label", label: "Periode", type: "date", required: true },
      { key: "planned", label: "Rencana Kumulatif", type: "number", required: true },
      { key: "actual", label: "Aktual Kumulatif", type: "number", required: true },
      { key: "notes", label: "Keterangan (Item Terkait)", type: "textarea" },
      { key: "locked", label: "Manual Lock", type: "checkbox" }
    ]
  },
  cdeChecklist: {
    title: "Checklist Folderisasi CDE ISO 19650",
    tableId: "cdeChecklistTable",
    addLabel: "Checklist CDE",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "phase", label: "Fase / Ruang Data", type: "select", options: ["01 Pra Perencanaan", "02 Perencanaan Teknis", "03 Pengadaan Lahan", "04 Pelaksanaan Konstruksi", "05 Operasi dan Pemeliharaan", "11 Dashboard / Publikasi", "100 PHO / Handover"], required: true },
      { key: "folder", label: "Folder ISO 19650", type: "select", options: ["WIP", "Shared", "Published", "Archived", "Dashboard", "Handover"], required: true },
      { key: "document", label: "Dokumen / Konten", type: "textarea", required: true },
      { key: "required", label: "Wajib", type: "checkbox" },
      { key: "available", label: "Sudah Ada", type: "checkbox" },
      { key: "pic", label: "PIC", type: "text", required: true },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  },
  cdeRegister: {
    title: "CDE Register Dokumen dan Upload",
    tableId: "cdeRegisterTable",
    addLabel: "Register CDE",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "code", label: "Kode Dokumen", type: "text", required: true },
      { key: "name", label: "Nama File / Dokumen", type: "textarea", required: true },
      { key: "folder", label: "Folder CDE", type: "text" },
      { key: "state", label: "Tahap ISO 19650", type: "select", options: ["WIP", "Shared", "Published", "Archived", "Dashboard", "Handover"], required: true },
      { key: "discipline", label: "Disiplin", type: "select", options: ["Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control", "Agreement"], required: true },
      { key: "status", label: "Status Review", type: "select", options: reviewStatusOptions, required: true },
      { key: "reviewer", label: "Reviewer", type: "text" },
      { key: "date", label: "Tanggal Submit", type: "date" },
      { key: "fileName", label: "File Upload", type: "file-meta" },
      { key: "serverUrl", label: "Server URL", type: "url" },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  },
  agreement: {
    title: "Agreement dan Penawaran",
    tableId: "agreementTable",
    addLabel: "Dokumen Agreement / Penawaran",
    columns: [
      { key: "no", label: "No", type: "readonly", width: 60 },
      { key: "docType", label: "Jenis Dokumen", type: "select", options: ["Penawaran Teknis", "Penawaran Komersial", "Agreement", "MoU", "SPK", "BA Negosiasi", "Klarifikasi Teknis", "Klarifikasi Komersial", "Lampiran Legal"], required: true },
      { key: "code", label: "Kode / Nomor", type: "text", required: true },
      { key: "name", label: "Nama File", type: "textarea", required: true },
      { key: "party", label: "Pihak Terkait", type: "text", required: true },
      { key: "package", label: "Paket / Scope", type: "text" },
      { key: "value", label: "Nilai / No Penawaran", type: "text" },
      { key: "status", label: "Status", type: "select", options: agreementStatusOptions, required: true },
      { key: "date", label: "Tanggal", type: "date", required: true },
      { key: "fileName", label: "File Upload", type: "file-meta" },
      { key: "serverUrl", label: "Server URL", type: "url" },
      { key: "notes", label: "Catatan", type: "textarea" }
    ]
  }
};

const projectInfoFields = [
  { key: "companyName", label: "Nama Perusahaan", type: "text" },
  { key: "projectName", label: "Nama Proyek", type: "text" },
  { key: "period", label: "Periode Dashboard", type: "text" },
  { key: "phase", label: "Fase Proyek", type: "text" },
  { key: "managerName", label: "BIM Manager / Koordinator", type: "text" },
  { key: "managerRole", label: "Jabatan", type: "text" },
  { key: "appointingParty", label: "Appointing Party / Owner", type: "text" },
  { key: "leadAppointedParty", label: "Lead Appointed Party", type: "text" },
  { key: "projectLocation", label: "Lokasi Proyek", type: "text" },
  { key: "contractType", label: "Jenis Kontrak", type: "text" },
  { key: "bimObjective", label: "Tujuan BIM", type: "textarea" },
  { key: "informationStandard", label: "Standar Informasi", type: "text" }
];

function createDefaultProject(id = createId(), name = "Garage Premium") {
  return {
    id,
    projectInfo: {
      companyName: "BIMA (BRM Internasional BIM Academy)",
      projectName: name,
      period: "April - Mei 2026",
      phase: "Berjalan",
      managerName: "Arif Arianto",
      managerRole: "BIM Manager / Koordinator",
      appointingParty: "Owner / Pemberi Tugas",
      leadAppointedParty: "BIMA - BIM Management Team",
      projectLocation: "Jakarta / Editable",
      contractType: "Design Coordination / BIM Management",
      bimObjective: "Mengelola informasi proyek, memastikan model dan gambar sesuai kebutuhan koordinasi, serta menyiapkan struktur CDE, TIDP, MIDP, BEP, dan EIR.",
      informationStandard: "ISO 19650, SOP Implementasi BIM PU 2024"
    },
    activeDiscipline: "Semua",
    autoCurveSync: false,
    uploadEndpoint: "",
    eir: [
      { no: 1, category: "Tujuan Informasi", question: "Model/Gambar ini untuk apa?", answer: "Untuk koordinasi desain Garage Premium, validasi antar disiplin, dan dasar review owner.", purpose: "Koordinasi desain dan pengambilan keputusan", originator: "Task Team AR/ST/MEP", format: "RVT, IFC, DWG, PDF", neededAt: "April - Mei 2026", pic: "Arif Arianto", agreed: true, notes: "Menjadi baseline kebutuhan informasi proyek." },
      { no: 2, category: "Deliverable", question: "Informasi apa saja yang harus dikirim?", answer: "Model arsitektur, struktur, MEP, federated model, gambar koordinasi, clash report, BEP, MIDP, TIDP, dan register CDE.", purpose: "Monitoring pemenuhan output BIM", originator: "BIMA dan masing-masing task team", format: "RVT/IFC/NWD/PDF/XLSX", neededAt: "Sesuai milestone", pic: "Arif Arianto", agreed: true, notes: "Dapat diperbarui sesuai scope kontrak." },
      { no: 3, category: "CDE", question: "Di mana informasi disimpan dan direview?", answer: "Seluruh dokumen, model, dan metadata dikelola di CDE dengan status WIP, Shared, Published, dan Archived.", purpose: "Kontrol dokumen dan audit trail", originator: "Document Controller / BIM Coordinator", format: "Folder CDE + register XLSX", neededAt: "Sejak mobilisasi", pic: "Arif Arianto", agreed: false, notes: "Endpoint server dapat ditambahkan setelah sistem siap." },
      { no: 4, category: "LOIN", question: "Seberapa detail model dan informasi yang dibutuhkan?", answer: "Tahap DD menggunakan LOD 300 dengan LOI dasar aset. Handover memakai LOD 500 / COBie bila dipersyaratkan.", purpose: "Menjamin tingkat informasi sesuai fase", originator: "Task Team dan BIM Manager", format: "RVT/IFC/XLSX/COBie", neededAt: "DD hingga Handover", pic: "Arif Arianto", agreed: false, notes: "Perlu finalisasi dengan owner." }
    ],
    bep: [
      { no: 1, topic: "Software dan Format", agreement: "Authoring memakai Revit/setara, koordinasi memakai Navisworks/IFC viewer, register memakai XLSX/CSV.", software: "Revit, Navisworks, Excel, CDE", format: "RVT, IFC, NWD, DWG, PDF, XLSX", naming: "GP26_DISC_TYPE_ZONE_ORIGINATOR_REV", review: "Internal check sebelum Shared; owner/MK review sebelum Published.", pic: "Arif Arianto", agreed: true, notes: "Format dapat disesuaikan dengan EIR final." },
      { no: 2, topic: "Naming Convention", agreement: "Nama file tidak memakai spasi, memakai kode proyek, disiplin, tipe, zona, originator, dan revisi.", software: "Seluruh tools", format: "Semua file", naming: "GP26-ARS-MOD-Z01-BIMA-R01", review: "Dicek document controller sebelum upload ke Shared.", pic: "Document Controller", agreed: true, notes: "Mencegah duplikasi dan salah versi." },
      { no: 3, topic: "Review dan Approval", agreement: "Alur status: WIP -> Shared -> Reviewed -> Approved -> Published -> Archived.", software: "CDE", format: "Model, drawing, report", naming: "Mengikuti naming convention", review: "BIM Manager melakukan technical review; owner/MK approval final.", pic: "Arif Arianto", agreed: false, notes: "Akan disesuaikan dengan authority proyek." },
      { no: 4, topic: "PIC Informasi", agreement: "Setiap deliverable pada TIDP dan MIDP wajib memiliki PIC, receiver, deadline, dan status selesai.", software: "Dashboard + CDE", format: "XLSX/PDF", naming: "Kode deliverable unik", review: "Diperbarui minimal mingguan atau setiap rapat koordinasi BIM.", pic: "Arif Arianto", agreed: true, notes: "Terhubung ke overview dan Kurva S." }
    ],
    midp: [
      { no: 1, code: "GP26-ARS-MOD-001", name: "Model Arsitektur - Design Development", discipline: "Arsitektur", infoType: "3D Model", format: "RVT/IFC", loin: "LOD 300 / LOI Basic Asset", phase: "DD", deadline: "2026-04-15", pic: "Arif Arianto", receiver: "Owner, Struktur, MEP", status: "Selesai", realization: "2026-04-14", notes: "Model terkoordinasi untuk review awal" },
      { no: 2, code: "GP26-ARS-DRW-001", name: "Gambar Denah, Tampak, Potongan", discipline: "Arsitektur", infoType: "2D Drawing", format: "DWG/PDF", loin: "LOD 300", phase: "DD", deadline: "2026-04-18", pic: "Dewi Lestari", receiver: "Owner, Kontraktor", status: "Selesai", realization: "2026-04-18", notes: "Approved untuk koordinasi lintas disiplin" },
      { no: 3, code: "GP26-STR-MOD-001", name: "Model Struktur Utama", discipline: "Struktur", infoType: "3D Model", format: "RVT/IFC", loin: "LOD 300 / LOI Material", phase: "DD", deadline: "2026-04-22", pic: "Rizal Pratama", receiver: "Arsitektur, MEP", status: "Belum Mulai", realization: "", notes: "Menunggu final grid arsitektur" },
      { no: 4, code: "GP26-MEP-MOD-001", name: "Model MEP Terkoordinasi", discipline: "MEP", infoType: "3D Model", format: "RVT/IFC", loin: "LOD 300 / LOI Sistem", phase: "DD", deadline: "2026-04-25", pic: "Fajar Nugroho", receiver: "Owner, Arsitektur", status: "Belum Mulai", realization: "", notes: "Routing ducting dan pipa sedang disesuaikan" },
      { no: 5, code: "GP26-FED-MOD-001", name: "Federated Model AR-ST-MEP", discipline: "Koordinasi", infoType: "Federated Model", format: "NWD/IFC", loin: "LOD 300", phase: "DD", deadline: "2026-04-30", pic: "Arif Arianto", receiver: "Seluruh Stakeholder", status: "Belum Mulai", realization: "", notes: "Dibuat setelah model disiplin siap" },
      { no: 6, code: "GP26-QC-RPT-001", name: "Laporan Clash Detection Batch 01", discipline: "Koordinasi", infoType: "Report", format: "PDF/BCF", loin: "QA/QC BIM", phase: "DD", deadline: "2026-05-02", pic: "Arif Arianto", receiver: "Owner, MK", status: "Belum Mulai", realization: "", notes: "Akan memakai federated model terbaru" },
      { no: 7, code: "GP26-BEP-DOC-001", name: "Post BIM Execution Plan", discipline: "BIM Management", infoType: "Dokumen", format: "DOCX/PDF", loin: "Management", phase: "Berjalan", deadline: "2026-04-20", pic: "Arif Arianto", receiver: "Owner, Team BIM", status: "Belum Mulai", realization: "", notes: "Draft finalisasi role dan workflow" }
    ],
    tidp: [
      { no: 1, midpCode: "GP26-ARS-MOD-001", code: "ARS-MOD-001", name: "Model Arsitektur Skematik", infoType: "3D Model", format: "RVT", loin: "LOD 200", phase: "SD", deadline: "2026-04-08", pic: "Dewi Lestari", discipline: "Arsitektur", status: "Selesai", notes: "Input untuk review massa bangunan" },
      { no: 2, midpCode: "GP26-ARS-DRW-001", code: "ARS-DRW-001", name: "Denah Semua Lantai", infoType: "2D Drawing", format: "DWG/PDF", loin: "LOD 300", phase: "DD", deadline: "2026-04-15", pic: "Dewi Lestari", discipline: "Arsitektur", status: "Selesai", notes: "Koordinasi awal dengan struktur" },
      { no: 3, midpCode: "GP26-STR-MOD-001", code: "STR-MOD-001", name: "Model Struktur Grid dan Elemen Utama", infoType: "3D Model", format: "RVT/IFC", loin: "LOD 300", phase: "DD", deadline: "2026-04-22", pic: "Rizal Pratama", discipline: "Struktur", status: "On Track", notes: "Menunggu update bukaan shaft" },
      { no: 4, midpCode: "GP26-MEP-MOD-001", code: "MEP-MOD-001", name: "Model HVAC, Plumbing, dan Electrical", infoType: "3D Model", format: "RVT/IFC", loin: "LOD 300", phase: "DD", deadline: "2026-04-25", pic: "Fajar Nugroho", discipline: "MEP", status: "In Progress", notes: "Routing menunggu plafon final" },
      { no: 5, midpCode: "GP26-FED-MOD-001", code: "BIM-FED-001", name: "Federated Model Batch 01", infoType: "Federated Model", format: "NWD", loin: "LOD 300", phase: "DD", deadline: "2026-04-30", pic: "Arif Arianto", discipline: "Koordinasi", status: "Belum Mulai", notes: "Dependensi AR, ST, MEP" },
      { no: 6, midpCode: "GP26-QC-RPT-001", code: "BIM-CLASH-001", name: "Clash Detection Report Batch 01", infoType: "Report", format: "PDF/BCF", loin: "QA/QC BIM", phase: "DD", deadline: "2026-05-02", pic: "Arif Arianto", discipline: "Koordinasi", status: "Belum Mulai", notes: "Dibahas pada rapat koordinasi BIM" }
    ],
    curve: [
      { no: 1, label: "Apr W1", planned: 2, actual: 2, locked: true },
      { no: 2, label: "Apr W2", planned: 4, actual: 4, locked: true },
      { no: 3, label: "Apr W3", planned: 8, actual: 5, locked: true },
      { no: 4, label: "Apr W4", planned: 11, actual: 0, locked: true },
      { no: 5, label: "Mei W1", planned: 13, actual: 0, locked: true },
      { no: 6, label: "Mei W2", planned: 13, actual: 0, locked: true },
      { no: 7, label: "Mei W3", planned: 13, actual: 0, locked: true },
      { no: 8, label: "Mei W4", planned: 13, actual: 0, locked: true }
    ],
    cdeChecklist: [
      { no: 1, phase: "02 Perencanaan Teknis", folder: "WIP", document: "Model kerja AR/ST/MEP dan dokumen internal review", required: true, available: true, pic: "Task Team", notes: "Dikelola sebelum shared" },
      { no: 2, phase: "02 Perencanaan Teknis", folder: "Shared", document: "Model/gambar siap koordinasi lintas pihak", required: true, available: true, pic: "BIM Manager", notes: "Untuk review MK/Owner" },
      { no: 3, phase: "02 Perencanaan Teknis", folder: "Published", document: "Model, drawing, BEP, dan register yang disetujui", required: true, available: false, pic: "Arif Arianto", notes: "Menunggu approval" },
      { no: 4, phase: "04 Pelaksanaan Konstruksi", folder: "Archived", document: "Riwayat dokumen superseded / final archive", required: true, available: false, pic: "Document Controller", notes: "Wajib saat dokumen diganti" },
      { no: 5, phase: "11 Dashboard / Publikasi", folder: "Dashboard", document: "As-built, BIM Design, BIM Progress, Foto, Video, BIM Library", required: true, available: false, pic: "BIMA", notes: "Publikasi internal proyek" },
      { no: 6, phase: "100 PHO / Handover", folder: "Handover", document: "BAST, manual O&M, garansi, testing commissioning, federated AIM", required: true, available: false, pic: "BIM Manager", notes: "Dipenuhi saat PHO/Handover" }
    ],
    cdeRegister: [
      { no: 1, code: "CDE-WIP-ARS-001", name: "GP26_ARS_MODEL_DD_RVT", folder: "02 Perencanaan Teknis / WIP / Model BIM", state: "WIP", discipline: "Arsitektur", status: "Internal Review", reviewer: "Arif Arianto", date: "2026-04-14", fileName: "", serverUrl: "", notes: "Model kerja sebelum shared" },
      { no: 2, code: "CDE-SHR-ARS-001", name: "GP26_ARS_DRAWING_DD_PDF", folder: "02 Perencanaan Teknis / Shared / DED", state: "Shared", discipline: "Arsitektur", status: "Approved", reviewer: "Owner Representative", date: "2026-04-18", fileName: "", serverUrl: "", notes: "Siap untuk koordinasi" },
      { no: 3, code: "CDE-PUB-BEP-001", name: "Post_BEP_Garage_Premium", folder: "11 Dashboard / Published / Dokumen BIM", state: "Published", discipline: "BIM Management", status: "Internal Review", reviewer: "Owner", date: "2026-04-20", fileName: "", serverUrl: "", notes: "Dokumen acuan implementasi" }
    ],
    agreement: [
      { no: 1, docType: "Penawaran Teknis", code: "BIMA-GP26-TEC-001", name: "Penawaran Teknis BIM Management Garage Premium", party: "BIMA - Owner", package: "BIM Management", value: "Rev 0", status: "Draft", date: "2026-04-10", fileName: "", serverUrl: "", notes: "Draft untuk review internal" },
      { no: 2, docType: "Agreement", code: "BIMA-GP26-AGR-001", name: "Kesepakatan Kerja Implementasi BIM", party: "BIMA - Owner", package: "EIR/BEP/CDE", value: "TBC", status: "Draft", date: "2026-04-15", fileName: "", serverUrl: "", notes: "Menunggu final scope" }
    ]
  };
}

// Project kosong — dipakai saat Reset
function createEmptyProject(id, name) {
  return {
    id,
    projectInfo: {
      companyName: "", projectName: name || "",
      period: "", phase: "", managerName: "", managerRole: "",
      appointingParty: "", leadAppointedParty: "",
      projectLocation: "", contractType: "",
      bimObjective: "", informationStandard: "ISO 19650"
    },
    activeDiscipline: "Semua",
    autoCurveSync: false,
    uploadEndpoint: "",
    eir: [], bep: [], midp: [], tidp: [],
    curve: [], cdeChecklist: [], cdeRegister: [], agreement: []
  };
}

let state = loadState();
let activeTab = "overview";
let currentModal = null;
let saveTimer = null;
let activeSaveRequest = null;       // Promise sync yang sedang berjalan (cegah request numpuk)
let pendingResaveAfterActive = false; // ada perubahan baru saat sync sebelumnya masih jalan?

function createId() {
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadState() {
  // localStorage hanya sebagai cache sementara / fallback offline.
  // Sumber kebenaran utama adalah PostgreSQL — dimuat di initFromDB().
  const fallbackProject = createDefaultProject("p_default", "Project Baru");
  const fallback = { activeProjectId: fallbackProject.id, projects: [fallbackProject] };
  try {
    const stored = localStorage.getItem(STORE_KEY) || LEGACY_STORE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (!parsed.projects || !parsed.projects.length) return fallback;
    parsed.projects.forEach(project => migrateProject(project));
    if (!parsed.projects.some(p => p.id === parsed.activeProjectId)) parsed.activeProjectId = parsed.projects[0].id;
    return parsed;
  } catch (error) {
    console.warn("Failed to load state from localStorage", error);
    return fallback;
  }
}

// ── Inisialisasi dari database (DB = sumber kebenaran utama) ──────────────────
async function initFromDB() {
  await checkBackend();
  if (!USE_DB) {
    console.warn("⚠️ DB tidak tersedia — pakai data lokal (offline mode)");
    toast("Mode offline — data dari cache lokal");
    return;
  }

  try {
    // Tampilkan loading indicator
    document.body.dataset.dbLoading = "1";

    // 1. Ambil daftar semua project dari DB
    const dbProjects = await apiGet("/api/projects");

    if (!dbProjects.length) {
      // DB kosong → ini instalasi baru, upload state lokal ke DB
      console.log("DB kosong, upload data lokal ke DB...");
      for (const p of (state.projects || [])) {
        try {
          await apiPost("/api/projects", {
            id: p.id, projectInfo: p.projectInfo,
            activeDiscipline: p.activeDiscipline,
            autoCurveSync: p.autoCurveSync,
            uploadEndpoint: p.uploadEndpoint,
          });
          await apiPost("/api/projects/" + p.id + "/sync", p);
        } catch (e) {
          console.warn("Gagal upload project:", p.id, e.message);
        }
      }
      toast("Data awal berhasil disimpan ke database ✓");
      return;
    }

    // 2. Load SEMUA project lengkap dari DB secara parallel
    const allFull = await Promise.all(
      dbProjects.map(p => apiGet("/api/projects/" + p.id))
    );
    allFull.forEach(p => migrateProject(p));

    // 3. DB menang — overwrite state sepenuhnya dengan data dari DB
    const activeId    = state.activeProjectId;
    const activeMatch = allFull.find(p => p.id === activeId) || allFull[0];
    state.projects        = allFull;
    state.activeProjectId = activeMatch.id;

    // 4. Update localStorage dengan data terbaru dari DB
    localStorage.setItem(STORE_KEY, JSON.stringify(state));

    renderAll();
    console.log(`✅ Loaded ${allFull.length} project(s) dari DB`);

  } catch (err) {
    console.error("Gagal load dari DB:", err.message);
    toast("⚠️ Gagal konek DB — menampilkan data cache lokal");
  } finally {
    delete document.body.dataset.dbLoading;
  }
}

// ── Inisialisasi dari database ──
async function initFromDB() {
  await checkBackend();
  if (!USE_DB) return;

  try {
    toast("Memuat data dari database...");
    const dbProjects = await apiGet("/api/projects");

    if (!dbProjects.length) {
      // Belum ada project di DB → push semua project lokal ke DB
      for (const p of (state.projects || [])) {
        await apiPost("/api/projects", {
          id: p.id, projectInfo: p.projectInfo,
          activeDiscipline: p.activeDiscipline,
          autoCurveSync: p.autoCurveSync,
          uploadEndpoint: p.uploadEndpoint,
        }).catch(() => {});
        await syncToDB(p, false);
      }
      toast("Semua project tersimpan ke database ✓");
      return;
    }

    // Cek project di localStorage yang belum ada di DB → upload dulu
    const dbIds = new Set(dbProjects.map(p => p.id));
    for (const localP of (state.projects || [])) {
      if (!dbIds.has(localP.id)) {
        console.log("Upload project baru ke DB:", localP.projectInfo?.projectName);
        await apiPost("/api/projects", {
          id: localP.id, projectInfo: localP.projectInfo,
          activeDiscipline: localP.activeDiscipline,
          autoCurveSync: localP.autoCurveSync,
          uploadEndpoint: localP.uploadEndpoint,
        }).catch(() => {});
        await syncToDB(localP, false);
        dbIds.add(localP.id);
      }
    }

    // Load SEMUA project lengkap dari DB
    const allDbProjects = await apiGet("/api/projects");
    const allFull = await Promise.all(
      allDbProjects.map(p => apiGet("/api/projects/" + p.id))
    );
    allFull.forEach(p => migrateProject(p));

    const activeId    = state.activeProjectId;
    const activeMatch = allFull.find(p => p.id === activeId) || allFull[0];
    state.projects        = allFull;
    state.activeProjectId = activeMatch.id;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));

    renderAll();
    toast("Data berhasil dimuat dari database ✓");
  } catch (err) {
    console.error("Gagal load dari DB:", err.message);
    toast("Gagal konek DB, pakai data lokal");
  }
}

// Kirim seluruh project ke backend (bulk sync)
async function syncToDB(project, showToast = true) {
  if (!USE_DB) return;
  try {
    await apiPost("/api/projects/" + project.id + "/sync", project);
    if (showToast) toast("Tersimpan ke database ✓");
  } catch (err) {
    console.error("Sync DB gagal:", err.message);
    toast("Gagal simpan ke DB: " + err.message);
  }
}

function migrateProject(project) {
  const defaults = createDefaultProject(project.id || createId(), project?.projectInfo?.projectName || "Project Baru");
  project.id = project.id || defaults.id;
  project.projectInfo = { ...defaults.projectInfo, ...(project.projectInfo || {}) };
  ["eir", "bep", "midp", "tidp", "curve", "cdeChecklist", "cdeRegister", "agreement"].forEach(key => {
    if (!Array.isArray(project[key])) project[key] = clone(defaults[key]);
  });
  project.activeDiscipline = project.activeDiscipline || "Semua";
  project.autoCurveSync = Boolean(project.autoCurveSync);
  project.uploadEndpoint = project.uploadEndpoint || "";
  (project.midp || []).forEach(row => { if (row.status === undefined) row.status = row.done ? "Selesai" : "Belum Mulai"; });
  (project.tidp || []).forEach(row => { if (row.status === undefined) row.status = row.done ? "Selesai" : "Belum Mulai"; });
  (project.cdeRegister || []).forEach(row => { if (row.status === undefined) row.status = row.approved ? "Approved" : "Internal Review"; });
  (project.agreement || []).forEach(row => { if (row.status === undefined) row.status = row.approved ? "Disetujui" : "Draft"; });

  // ── Migrasi format tanggal teks → yyyy-mm-dd ──────────────────────────────
  // Diperlukan untuk data lama yang tersimpan di localStorage/DB dengan format
  // "dd Mmm yyyy" (misal "15 Apr 2026") agar datepicker bisa membacanya
  const DATE_FIELDS = {
    midp:        ["deadline", "realization"],
    tidp:        ["deadline"],
    cdeRegister: ["date"],
    agreement:   ["date"],
    eir:         ["neededAt"],
    curve:       ["label"],
  };
  Object.entries(DATE_FIELDS).forEach(([tbl, fields]) => {
    (project[tbl] || []).forEach(row => {
      fields.forEach(f => {
        if (row[f]) {
          const normalized = normalizeDateValue(row[f]);
          if (normalized) row[f] = normalized;
        }
      });
    });
  });

  renumberAll(project);
}

function getProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];
}

function saveState(showToast = true) {
  // Guest read-only: jangan pernah kirim perubahan ke server (backend juga menolak, ini cuma cegah percobaan sia-sia)
  if (isGuest()) {
    if (showToast) toast("Akun guest tidak bisa mengubah data");
    return;
  }

  // Selalu update localStorage sebagai cache lokal
  localStorage.setItem(STORE_KEY, JSON.stringify(state));

  if (!USE_DB) {
    if (showToast) toast("Data tersimpan (lokal — offline mode)");
    return;
  }

  // Sync HANYA project yang sedang aktif/dibuka ke DB.
  // Sebelumnya kode ini sync SEMUA project setiap kali 1 baris diedit
  // (dipanggil otomatis tiap tutup popup edit) — itu bikin setiap
  // perubahan kecil memicu DELETE+INSERT ulang seluruh tabel di SEMUA
  // project sekaligus, secara berurutan (bukan batch). Kalau ada
  // beberapa project dengan banyak baris, ini bisa jadi ratusan query
  // database berurutan dalam satu klik → terasa hang/freeze, dan kalau
  // beberapa sync numpuk bareng bisa menghabiskan connection pool DB
  // sampai request lain (termasuk logout) ikut antre lama.
  const project = getProject();
  if (!project) return;
  if (activeSaveRequest) {
    // Sync sebelumnya masih berjalan → jangan tumpuk request baru,
    // cukup tandai perlu sync ulang setelah yang berjalan selesai.
    pendingResaveAfterActive = true;
    return;
  }
  activeSaveRequest = apiPost("/api/projects/" + project.id + "/sync", project)
    .then(() => { if (showToast) toast("Tersimpan ke database ✓"); })
    .catch(err => {
      console.error("Gagal sync project", project.id, err.message);
      if (showToast) toast("⚠️ Gagal simpan ke DB: " + err.message);
    })
    .finally(() => {
      activeSaveRequest = null;
      if (pendingResaveAfterActive) {
        pendingResaveAfterActive = false;
        saveState(false);
      }
    });
}

// Sinkronkan SEMUA project ke DB — dipakai untuk aksi eksplisit yang
// memang butuh semua project (mis. tombol "Export Backup", load awal),
// BUKAN dipanggil otomatis tiap kali 1 baris diedit.
function saveAllProjectsState(showToast = true) {
  if (isGuest()) {
    if (showToast) toast("Akun guest tidak bisa mengubah data");
    return;
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (!USE_DB) {
    if (showToast) toast("Data tersimpan (lokal — offline mode)");
    return;
  }
  const allProjects = state.projects || [];
  Promise.all(allProjects.map(p =>
    apiPost("/api/projects/" + p.id + "/sync", p).catch(err => {
      console.error("Gagal sync project", p.id, err.message);
    })
  )).then(() => {
    if (showToast) toast("Data tersimpan ke database ✓");
  }).catch(() => {
    if (showToast) toast("⚠️ Sebagian data gagal disimpan ke DB");
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(false), 600);
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1700);
}

// Alert yang muncul di dalam modal (di atas tombol Simpan)
function modalAlert(message, type = "error") {
  const el = document.getElementById("modalAlert");
  if (!el) return;
  el.textContent = message;
  el.className = `modal-alert modal-alert--${type} modal-alert--show`;
  clearTimeout(el._timer);
  if (type !== "error") {
    el._timer = setTimeout(() => {
      el.className = "modal-alert";
      el.textContent = "";
    }, 3500);
  }
}

function clearModalAlert() {
  const el = document.getElementById("modalAlert");
  if (!el) return;
  el.className = "modal-alert";
  el.textContent = "";
}

// ── Parser angka desimal yang toleran terhadap koma (,) maupun titik (.) ──
// Menangani input seperti: "0,94" | "1.62" | "1.234,56" | "1,234.56" | " 30 "
function parseDecimalInput(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  let s = String(raw).trim();
  if (s === "") return 0;
  s = s.replace(/[^0-9.,-]/g, ""); // buang karakter selain angka, koma, titik, minus
  if (s === "" || s === "-") return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot   = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Ada dua-duanya → simbol yang muncul TERAKHIR dianggap pemisah desimal,
    // simbol lainnya dianggap pemisah ribuan dan dibuang.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Hanya koma → anggap sebagai pemisah desimal
    s = s.replace(",", ".");
  }
  // Hanya titik, atau tidak ada simbol sama sekali → biarkan (sudah format JS valid)

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value) {
  return String(value || "export").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeStatus(value) {
  const raw = String(value ?? "").trim();
  const found = statusOptions.find(item => item.toLowerCase() === raw.toLowerCase());
  if (found) return found;
  if (["done", "selesai", "complete", "completed", "true"].includes(raw.toLowerCase())) return "Selesai";
  if (["progress", "inprogress", "in progress"].includes(raw.toLowerCase())) return "In Progress";
  return "Belum Mulai";
}

function isDone(row) {
  if (!row) return false;
  if (row.status !== undefined) return normalizeStatus(row.status) === "Selesai";
  return row.done === true;
}

function statusBadge(value, options = statusOptions) {
  if (options !== statusOptions) {
    const label = String(value || options?.[0] || "Draft");
    const lower = label.toLowerCase();
    const className = lower.includes("approved") || lower.includes("disetujui") || lower.includes("final") || lower.includes("published") ? "status-selesai" : lower.includes("review") || lower.includes("negosiasi") || lower.includes("terkirim") ? "status-inprogress" : lower.includes("reject") || lower.includes("ditolak") ? "status-terlambat" : "status-belum";
    return `<span class="status-badge ${className}">${escapeHtml(label)}</span>`;
  }
  const status = normalizeStatus(value);
  const meta = statusMeta[status] || statusMeta["Belum Mulai"];
  return `<span class="status-badge ${meta.className}">${escapeHtml(status)}</span>`;
}

function statusCounts(rows) {
  const counts = Object.fromEntries(statusOptions.map(status => [status, 0]));
  rows.forEach(row => {
    const status = normalizeStatus(row.status ?? (row.done ? "Selesai" : "Belum Mulai"));
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function renderProjectControls() {
  const project = getProject();

  try {
    if (tomSelectInstance) {
      tomSelectInstance.clearOptions();
      state.projects.forEach(p => {
        tomSelectInstance.addOption({
          value: p.id,
          text:  p.projectInfo.projectName || "—"
        });
      });
      tomSelectInstance.refreshOptions(false);
      tomSelectInstance.setValue(project.id, true);
    } else {
      const select = document.getElementById("projectSelect");
      if (select) {
        select.innerHTML = state.projects.map(p =>
          `<option value="${p.id}">${escapeHtml(p.projectInfo.projectName)}</option>`
        ).join("");
        select.value = project.id;
      }
    }
  } catch (e) {
    console.warn("renderProjectControls error:", e.message);
  }

  document.getElementById("headerProjectName").textContent = project.projectInfo.projectName;
  document.getElementById("headerCompanyName").textContent = project.projectInfo.companyName;
  document.getElementById("headerPeriod").textContent = project.projectInfo.period;
  document.getElementById("headerPhase").textContent = project.projectInfo.phase;
  document.getElementById("serverEndpoint").value = project.uploadEndpoint || "";
}

function initProjectControls() {
  const selectEl = document.getElementById("projectSelect");

  // ── Init Tom Select (searchable dropdown) ──
  try {
    if (typeof TomSelect !== "undefined" && selectEl) {
      tomSelectInstance = new TomSelect(selectEl, {
        maxOptions: 500,
        placeholder: "Pilih project...",
        searchField: ["text"],
        render: {
          option: (data, escape) =>
            `<div class="ts-option-item">${escape(data.text)}</div>`,
          item: (data, escape) =>
            `<div class="ts-selected-item">${escape(data.text)}</div>`,
          no_results: () =>
            `<div class="ts-no-results">🔍 Project tidak ditemukan</div>`,
        },
        onChange(value) {
          if (!value || value === state.activeProjectId) return;
          state.activeProjectId = value;
          saveState(false);
          renderAll();
          toast("Project diganti: " + (getProject().projectInfo.projectName || ""));
        },
      });
    } else {
      throw new Error("TomSelect tidak tersedia");
    }
  } catch (e) {
    // Fallback: native select (offline atau Tom Select error)
    console.warn("Tom Select fallback ke native select:", e.message);
    tomSelectInstance = null;
    if (selectEl) {
      selectEl.addEventListener("change", (event) => {
        state.activeProjectId = event.target.value;
        saveState(false);
        renderAll();
        toast("Project diganti");
      });
    }
  }

  document.getElementById("newProjectBtn").addEventListener("click", () => openProjectModal("new"));
  document.getElementById("editProjectBtn").addEventListener("click", () => openProjectModal("edit"));
  document.getElementById("editEirInfoBtn").addEventListener("click", () => openProjectModal("edit"));
  document.getElementById("serverEndpoint").addEventListener("input", (event) => {
    getProject().uploadEndpoint = event.target.value.trim();
    scheduleSave();
  });
}


// ── Project Picker Modal ───────────────────────────────────
// Tidak mengubah logic project sama sekali, hanya UI pencarian
function initProjectPicker() {
  const dialog   = document.getElementById("projectPickerModal");
  const openBtn  = document.getElementById("openProjectPickerBtn");
  const closeBtn = document.getElementById("closeProjectPickerBtn");
  const searchEl = document.getElementById("projectPickerSearch");
  if (!dialog || !openBtn) return;

  function openPicker() {
    renderPickerTable("");
    dialog.showModal();
    setTimeout(() => searchEl?.focus(), 80);
  }

  function closePicker() {
    dialog.close();
    if (searchEl) searchEl.value = "";
  }

  function renderPickerTable(query) {
    const tbody   = document.getElementById("projectPickerTbody");
    const empty   = document.getElementById("projectPickerEmpty");
    const counter = document.getElementById("projectPickerCount");
    const q       = query.toLowerCase().trim();

    const filtered = state.projects.filter(p => {
      if (!q) return true;
      const info = p.projectInfo || {};
      return (
        (info.projectName  || "").toLowerCase().includes(q) ||
        (info.companyName  || "").toLowerCase().includes(q) ||
        (info.phase        || "").toLowerCase().includes(q) ||
        (info.period       || "").toLowerCase().includes(q) ||
        (info.managerName  || "").toLowerCase().includes(q)
      );
    });

    counter.textContent = filtered.length + " project";

    if (!filtered.length) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    tbody.innerHTML = filtered.map((p, i) => {
      const info    = p.projectInfo || {};
      const isActive = p.id === state.activeProjectId;
      return `
        <tr class="picker-row ${isActive ? "picker-row-active" : ""}"
            data-id="${p.id}"
            title="Klik untuk pilih project ini">
          <td class="picker-no">${i + 1}</td>
          <td class="picker-name">
            <strong>${escapeHtml(info.projectName || "—")}</strong>
            ${isActive ? '<span class="picker-active-badge">Aktif</span>' : ""}
          </td>
          <td class="picker-company">${escapeHtml(info.companyName || "—")}</td>
          <td class="picker-phase">${escapeHtml(info.phase || "—")}</td>
          <td class="picker-period">${escapeHtml(info.period || "—")}</td>
          <td>
            ${isActive
              ? '<span class="picker-status-on">● Aktif</span>'
              : '<span class="picker-status-off">○ Pilih</span>'}
          </td>
        </tr>`;
    }).join("");

    // Klik baris → pindah project (pakai logic yang sama dengan dropdown)
    tbody.querySelectorAll(".picker-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        if (id && id !== state.activeProjectId) {
          state.activeProjectId = id;
          // Update dropdown juga agar sinkron
          const select = document.getElementById("projectSelect");
          if (select) select.value = id;
          saveState(false);
          renderAll();
          toast("Project diganti: " + (state.projects.find(p => p.id === id)?.projectInfo?.projectName || ""));
        }
        closePicker();
      });
    });
  }

  openBtn.addEventListener("click", openPicker);
  closeBtn.addEventListener("click", closePicker);

  // Tutup saat klik backdrop
  dialog.addEventListener("click", e => { if (e.target === dialog) closePicker(); });

  // Tutup dengan Esc (native dialog sudah handle ini, tapi tambah reset search)
  dialog.addEventListener("cancel", () => { if (searchEl) searchEl.value = ""; });

  // Search realtime
  searchEl.addEventListener("input", e => renderPickerTable(e.target.value));

  // Keyboard: Enter pilih baris pertama yang muncul
  searchEl.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const firstRow = document.querySelector(".picker-row:not(.picker-row-active)") 
                    || document.querySelector(".picker-row");
      if (firstRow) firstRow.click();
    }
  });
}

function initTabs() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active-page");
      activeTab = btn.dataset.target;
      document.body.dataset.section = btn.dataset.target;
      redrawCharts();
    });
  });
}

function renderEirInfo() {
  const info = getProject().projectInfo;
  const important = [
    ["Nama Proyek", info.projectName],
    ["Owner / Appointing Party", info.appointingParty],
    ["Lead Appointed Party", info.leadAppointedParty],
    ["BIM Manager", info.managerName],
    ["Jenis Kontrak", info.contractType],
    ["Lokasi", info.projectLocation],
    ["Periode", info.period],
    ["Standar", info.informationStandard]
  ];
  document.getElementById("eirInfoGrid").innerHTML = important.map(([label, value]) => `
    <div class="info-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>
  `).join("");
}

function initAddButtons() {
  document.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => openRowModal(btn.dataset.add, null));
  });
  document.getElementById("addCurvePointBtn").addEventListener("click", () => openRowModal("curve", null));
}

function defaultRow(key) {
  const config = tableConfigs[key];
  const project = getProject();
  const row = {};
  config.columns.forEach(col => {
    if (col.key === "no") row[col.key] = (project[key].length + 1);
    else if (col.type === "checkbox") row[col.key] = false;
    else if (col.type === "number") row[col.key] = 0;
    else if (col.type === "select") row[col.key] = col.key === "status" ? (col.options?.[0] || "Belum Mulai") : (col.options?.[0] || "");
    else if (col.type === "select-midp") row[col.key] = project.midp[0]?.code || "";
    else if (col.key === "pic" || col.key === "reviewer") row[col.key] = project.projectInfo.managerName;
    else if (col.key === "deadline" || col.key === "date" || col.key === "neededAt") row[col.key] = "TBC";
    else if (col.key === "format") row[col.key] = "RVT/PDF";
    else row[col.key] = "";
  });
  if (key === "curve") {
    row.label   = "";   // kosong — user pilih sendiri via datepicker
    row.planned = 0;
    row.actual  = 0;
    row.locked  = false;
  }
  return row;
}

function openProjectModal(mode) {
  if (isGuest()) { toast("Akun guest tidak bisa mengubah data"); return; }
  const project = getProject();
  const temp = mode === "new" ? createDefaultProject(createId(), "Project Baru") : clone(project);
  currentModal = { type: "project", mode, temp };
  document.getElementById("modalEyebrow").textContent = mode === "new" ? "Tambah Project" : "Edit Project";
  document.getElementById("modalTitle").textContent = mode === "new" ? "Project Baru" : `Edit ${project.projectInfo.projectName}`;
  const fieldsHtml = projectInfoFields.map(field => createInputField(field, temp.projectInfo[field.key], `projectInfo.${field.key}`)).join("");
  const extra = mode === "edit" ? `
    <div class="field full">
      <button type="button" class="danger-btn" id="deleteProjectBtn">Hapus Project Aktif</button>
    </div>
  ` : `
    <div class="checkbox-field full">
      <input type="checkbox" id="copyActiveProject" />
      <label for="copyActiveProject">Salin data dari project aktif sebagai template awal</label>
    </div>
  `;
  document.getElementById("modalFields").innerHTML = fieldsHtml + extra;
  document.getElementById("rowModal").showModal();
  if (mode === "edit") {
    const deleteBtn = document.getElementById("deleteProjectBtn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (state.projects.length <= 1) return toast("Minimal harus ada 1 project");
        const nama = project.projectInfo.projectName || "project ini";
        if (!confirm(`Hapus "${nama}" beserta seluruh data dan file uploadnya?\nTidak bisa dibatalkan!`)) return;

        // Hapus semua file upload yang terkait project ini
        const filesToDelete = [
          ...(project.cdeRegister || []),
          ...(project.agreement   || []),
        ].map(r => r.serverUrl).filter(Boolean);

        if (filesToDelete.length > 0) {
          toast(`Menghapus ${filesToDelete.length} file...`);
          await Promise.allSettled(filesToDelete.map(url => deleteServerFile(url)));
        }

        // Hapus project dari DB jika backend tersedia
        if (USE_DB) {
          try { await apiDelete(`/api/projects/${project.id}`); } catch (e) { console.warn(e); }
        }

        // Hapus dari state lokal
        state.projects = state.projects.filter(p => p.id !== project.id);
        state.activeProjectId = state.projects[0].id;
        saveState(false);
        closeModal();
        renderAll();
        toast(`Project "${nama}" berhasil dihapus`);
      });
    }
  }
}

function openRowModal(key, index) {
  if (isGuest()) { toast("Akun guest tidak bisa mengubah data"); return; }
  const project = getProject();
  const config = tableConfigs[key];
  const isNew = index === null || index === undefined;
  const row = isNew ? defaultRow(key) : clone(project[key][index]);
  currentModal = { type: "row", key, index, row };
  document.getElementById("modalEyebrow").textContent = isNew ? `Tambah ${config.addLabel}` : `Edit ${config.addLabel}`;
  document.getElementById("modalTitle").textContent = isNew ? `Tambah ${config.addLabel}` : `${config.addLabel} #${row.no}`;
  const fields = config.columns.map(col => createInputField(col, row[col.key], col.key, key)).join("");
  const fileField = ["cdeRegister", "agreement"].includes(key) ? `
    <div class="field full">
      <label>Upload File ke Server</label>
      <input type="file" id="rowFileInput" />
      <div class="file-upload-meta">
        <span class="file-size-limit">📎 Maksimal ukuran file <strong>5 MB</strong></span>
        <small class="muted">Jika endpoint upload diisi, file dikirim ke server. Jika kosong, metadata file disimpan lokal.</small>
      </div>
    </div>
  ` : "";
  const hasRequired = config.columns.some(col => col.required);
  const requiredHint = hasRequired
    ? `<div class="req-hint"><span class="req-star">*</span> Kolom bertanda bintang wajib diisi sebelum menyimpan data.</div>`
    : "";
  document.getElementById("modalFields").innerHTML = fields + fileField + requiredHint;

  // Hapus error state saat user mulai mengisi field
  document.getElementById("modalFields").addEventListener("input", (e) => {
    const fieldEl = e.target.closest(".field--error");
    if (fieldEl) {
      fieldEl.classList.remove("field--error");
      fieldEl.querySelector(".field-err-msg")?.remove();
    }
  }, { passive: true });
  document.getElementById("modalFields").addEventListener("change", (e) => {
    const fieldEl = e.target.closest(".field--error");
    if (fieldEl) {
      fieldEl.classList.remove("field--error");
      fieldEl.querySelector(".field-err-msg")?.remove();
    }
  }, { passive: true });

  // Batasi ketikan pada field angka (planned/actual dsb) hanya digit, koma, titik, minus
  document.querySelectorAll('#modalFields input[inputmode="decimal"]').forEach(inp => {
    inp.addEventListener("input", () => {
      const cleaned = inp.value.replace(/[^0-9.,-]/g, "");
      if (cleaned !== inp.value) inp.value = cleaned;
    });
  });

  document.getElementById("rowModal").showModal();
  // Validasi ukuran file maks 5 MB
  document.getElementById("rowFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_MB = 5;
    const MAX_BYTES = MAX_MB * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      e.target.value = ""; // reset input
      modalAlert(`⚠ File terlalu besar (${sizeMB} MB). Maksimal ${MAX_MB} MB.`);
      // Tampilkan error di field
      const fieldEl = e.target.closest(".field");
      fieldEl?.classList.add("field--error");
      let errMsg = fieldEl?.querySelector(".field-err-msg");
      if (!errMsg) {
        errMsg = document.createElement("span");
        errMsg.className = "field-err-msg";
        fieldEl?.appendChild(errMsg);
      }
      errMsg.textContent = `Ukuran file (${sizeMB} MB) melebihi batas maksimal 5 MB.`;
    } else {
      // Hapus error jika ukuran valid
      clearModalAlert();
      const fieldEl = e.target.closest(".field");
      fieldEl?.classList.remove("field--error");
      fieldEl?.querySelector(".field-err-msg")?.remove();
    }
  });

  requestAnimationFrame(() => initCodeBuilderFields());
}


// ── Date helpers ──────────────────────────────────────────
// Tampilkan yyyy-mm-dd jadi "12 Jan 2026" di tabel
function formatDateDisplay(val) {
  if (!val) return "";
  // Jika sudah format yyyy-mm-dd
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(val + "T00:00:00");
    if (!isNaN(d)) {
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  // Fallback: tampilkan apa adanya (data lama format teks)
  return val;
}

// Konversi nilai teks lama ke yyyy-mm-dd untuk input date
function normalizeDateValue(val) {
  if (!val) return "";
  const s = String(val).trim();
  // Sudah format yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Format "dd Mmm yyyy" atau "dd Mmm yy" — misal "08 Apr 2026" / "08 Apr 26"
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12 };
  const m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})\s+(\d{2,4})$/);
  if (m) {
    const dd   = String(m[1]).padStart(2, "0");
    const mo   = MONTHS[m[2]];
    let   yyyy = parseInt(m[3]);
    if (yyyy < 100) yyyy += 2000; // "26" → 2026
    if (mo) return `${yyyy}-${String(mo).padStart(2,"0")}-${dd}`;
  }
  // Fallback: coba parse teks biasa via Date
  const d = new Date(val);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return "";
}

function createInputField(field, value, name, key = null) {
  const reqMark = field.required ? `<span class="req-star" aria-label="wajib diisi" title="Kolom ini wajib diisi">*</span>` : "";
  const reqAttr = field.required ? `data-required="1"` : "";

  if (field.type === "readonly") {
    return `<div class="field"><label>${escapeHtml(field.label)}</label><input name="${name}" value="${escapeHtml(value ?? "")}" readonly /></div>`;
  }
  if (field.type === "checkbox") {
    const checked = value ? "checked" : "";
    const label = checkboxLabel(field.key, field.label);
    return `<div class="checkbox-field"><input type="checkbox" name="${name}" id="field_${name}" ${checked}/><label for="field_${name}">${escapeHtml(label)}</label></div>`;
  }
  if (field.type === "textarea") {
    return `<div class="field full" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><textarea name="${name}">${escapeHtml(value ?? "")}</textarea></div>`;
  }
  if (field.type === "select") {
    const options = (field.options || []).map(opt => `<option value="${escapeHtml(opt)}" ${String(opt) === String(value) ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("");
    return `<div class="field" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><select name="${name}">${options}</select></div>`;
  }
  if (field.type === "select-midp") {
    const codes = getProject().midp.map(row => row.code);
    const options = ["", ...codes].map(opt => `<option value="${escapeHtml(opt)}" ${String(opt) === String(value) ? "selected" : ""}>${escapeHtml(opt || "- Belum dihubungkan -")}</option>`).join("");
    return `<div class="field" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><select name="${name}">${options}</select></div>`;
  }
  if (field.type === "number") {
    // input type="text" + inputmode="decimal": native <input type="number"> menolak
    // karakter koma di banyak browser, sehingga input desimal "0,94" gagal tersimpan.
    // Parsing akhir tetap toleran koma/titik lewat parseDecimalInput() saat disimpan.
    return `<div class="field" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><input type="text" inputmode="decimal" autocomplete="off" name="${name}" value="${escapeHtml(value ?? 0)}" placeholder="cth: 0.94 atau 0,94" /></div>`;
  }
  if (field.type === "url") {
    return `<div class="field full"><label>${escapeHtml(field.label)}</label><input type="url" name="${name}" value="${escapeHtml(value ?? "")}" placeholder="https://..." /></div>`;
  }
  if (field.type === "file-meta") {
    return `<div class="field"><label>${escapeHtml(field.label)}</label><input name="${name}" value="${escapeHtml(value ?? "")}" placeholder="Nama file akan terisi setelah upload" /></div>`;
  }
  if (field.type === "date") {
    const normalized = normalizeDateValue(value ?? "");
    return `<div class="field" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><input type="date" name="${name}" value="${escapeHtml(normalized)}" /></div>`;
  }

  if (field.type === "select-loin") {
    const opts = LOD_OPTIONS.map(o =>
      `<option value="${escapeHtml(o.value)}" ${value === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
    const infoRows = LOD_OPTIONS.map(o =>
      `<tr><td class="lod-info-code">${escapeHtml(o.value)}</td><td>${escapeHtml(o.desc)}</td></tr>`
    ).join("");
    return `
      <div class="field field-loin" ${reqAttr}>
        <label>${escapeHtml(field.label)}${reqMark}</label>
        <select name="${name}">${opts}</select>
        <div class="loin-info-wrap">
          <button type="button" class="loin-info-btn" tabindex="-1" title="Lihat penjelasan LOD">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            Panduan LOD
          </button>
          <div class="loin-info-popup">
            <div class="loin-info-title">Level of Development (LOD)</div>
            <table class="loin-info-table">${infoRows}</table>
          </div>
        </div>
      </div>`;
  }

  if (field.type === "code-builder-bep") {
    const parts = (value || "").split("-");
    const p1 = parts[0] || "";
    const p2 = parts[1] || "";
    const p3 = parts[2] || "";
    const p4 = parts[3] || "";

    const p2Opts = ["ARS","STR","MEP","FED","QC","BEP"].map(o =>
      `<option value="${o}" ${p2===o?"selected":""}>${o}</option>`).join("");
    const p3Opts = ["MOD","DRW","RPT","DOC"].map(o =>
      `<option value="${o}" ${p3===o?"selected":""}>${o}</option>`).join("");

    return `
      <div class="field full field-code-builder" ${reqAttr}>
        <label>${escapeHtml(field.label)}${reqMark}</label>
        <div class="code-builder-wrap">
          <input class="cbb-p1" type="text" placeholder="cth. GP26" value="${escapeHtml(p1)}" maxlength="10" title="Kode Proyek"/>
          <span class="cb-sep">-</span>
          <select class="cbb-p2" title="Disiplin">${p2Opts}</select>
          <span class="cb-sep">-</span>
          <select class="cbb-p3" title="Tipe Informasi">${p3Opts}</select>
          <span class="cb-sep">-</span>
          <div class="cb-p4-wrap">
            <input class="cbb-p4" type="text" placeholder="001" value="${escapeHtml(p4)}" maxlength="5" title="Nomor urut"/>
            <span class="cb-p4-hint">auto</span>
          </div>
          <input type="hidden" name="${name}" class="cbb-hidden" value="${escapeHtml(value||"")}"/>
        </div>
        <div class="cb-preview">Preview: <strong class="cbb-preview-val">${escapeHtml(value||"-")}</strong></div>
      </div>`;
  }

  if (field.type === "code-builder" || field.type === "code-builder-tidp") {
    const parts      = (value || "").split("-");
    const p1 = parts[0] || "";
    const p2 = parts[1] || "";
    const p3 = parts[2] || "";
    const p4 = parts[3] || "";
    const tableKey   = field.type === "code-builder" ? "midp" : "tidp";
    const currentRow = currentModal?.row || {};
    const isNew      = currentModal?.index === null || currentModal?.index === undefined;
    const curModalIdx = isNew ? -1 : Number(currentModal.index);

    const discMap = { "Arsitektur":"ARS","Struktur":"STR","MEP":"MEP","Koordinasi":"FED","BIM Management":"BEP","Document Control":"QC","ARS":"ARS","STR":"STR","MEP":"MEP","FED":"FED","QC":"QC","BEP":"BEP" };
    const infoMap = { "3D Model":"MOD","2D Drawing":"DRW","2D Drawing & 3D Model":"DRW","Dokumen":"DOC","Data/Spreadsheet":"RPT","Report":"RPT","Federated Model":"MOD","MOD":"MOD","DRW":"DRW","RPT":"RPT","DOC":"DOC" };
    const autoP2  = isNew ? (discMap[currentRow.discipline] || p2) : p2;
    const autoP3  = isNew ? (infoMap[currentRow.infoType]   || p3) : p3;

    // Auto-generate nomor berikutnya untuk baris baru
    const allRows    = getProject()[tableKey] || [];
    const usedNums   = allRows
      .filter((_, i) => i !== curModalIdx)
      .map(r => parseInt((r.code || "").split("-")[3] || "0", 10))
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    let autoNum = 1;
    for (const n of usedNums) {
      if (n === autoNum) autoNum++;
      else if (n > autoNum) break;
    }
    const autoP4 = isNew ? String(autoNum).padStart(3, "0") : p4;

    const p2Opts = ["ARS","STR","MEP","FED","QC","BEP"].map(o =>
      `<option value="${o}" ${(autoP2||p2)===o?"selected":""}>${o}</option>`).join("");
    const p3Opts = ["MOD","DRW","RPT","DOC"].map(o =>
      `<option value="${o}" ${(autoP3||p3)===o?"selected":""}>${o}</option>`).join("");

    return `
      <div class="field field-code-builder" ${reqAttr}>
        <label>${escapeHtml(field.label)}${reqMark}</label>
        <div class="code-builder-wrap" data-key="${tableKey}">
          <input class="cb-p1" type="text" placeholder="cth. GP26" value="${escapeHtml(p1)}" maxlength="10" title="Kode Proyek"/>
          <span class="cb-sep">-</span>
          <select class="cb-p2" title="Disiplin">${p2Opts}</select>
          <span class="cb-sep">-</span>
          <select class="cb-p3" title="Tipe Informasi">${p3Opts}</select>
          <span class="cb-sep">-</span>
          <div class="cb-p4-wrap">
            <input class="cb-p4" type="text" placeholder="001" value="${escapeHtml(autoP4)}" maxlength="5" title="Nomor urut (otomatis, bisa diubah)"/>
            <span class="cb-p4-hint">auto</span>
          </div>
          <input type="hidden" name="${name}" class="cb-hidden" value="${escapeHtml(value||"")}"/>
        </div>
        <div class="cb-preview">Preview: <strong class="cb-preview-val">${escapeHtml(value||"-")}</strong></div>
        <div class="cb-error"></div>
      </div>`;
  }

  return `<div class="field" ${reqAttr}><label>${escapeHtml(field.label)}${reqMark}</label><input name="${name}" value="${escapeHtml(value ?? "")}" /></div>`;
}

function checkboxLabel(key, label) {
  if (key === "done") return "Selesai / terpenuhi";
  if (key === "agreed") return "Sudah disepakati";
  if (key === "approved") return "Sudah disetujui";
  if (key === "required") return "Dokumen wajib ada";
  if (key === "available") return "Dokumen sudah tersedia";
  if (key === "locked") return "Titik manual dikunci dari auto-sync";
  return label;
}


// ── Code Builder: live update hidden input & preview ──────
function initCodeBuilderFields() {
  // ── Code Builder BEP (Naming Convention) — 4 bagian, tanpa validasi duplikat ──
  document.querySelectorAll(".code-builder-wrap").forEach(wrap => {
    const p1bep = wrap.querySelector(".cbb-p1");
    if (!p1bep) return; // bukan wrapper BEP, skip (biar tidak konflik dengan MIDP/TIDP)

    const p2     = wrap.querySelector(".cbb-p2");
    const p3     = wrap.querySelector(".cbb-p3");
    const p4     = wrap.querySelector(".cbb-p4");
    const hidden = wrap.querySelector(".cbb-hidden");
    const field  = wrap.closest(".field-code-builder");
    const prev   = field?.querySelector(".cbb-preview-val");

    function updateBep() {
      const rawNum = p4.value.trim();
      const val = [p1bep.value.trim(), p2.value, p3.value, rawNum].filter(Boolean).join("-");
      if (hidden) hidden.value = val;
      if (prev)   prev.textContent = val || "-";
    }

    p4.addEventListener("blur", () => {
      const n = parseInt(p4.value.trim(), 10);
      if (!isNaN(n) && n > 0) p4.value = String(n).padStart(3, "0");
      updateBep();
    });

    [p1bep, p2, p3, p4].forEach(el => {
      el.addEventListener("input",  updateBep);
      el.addEventListener("change", updateBep);
    });
    updateBep();
  });

  document.querySelectorAll(".code-builder-wrap").forEach(wrap => {
    if (wrap.querySelector(".cbb-p1")) return; // skip wrapper BEP, sudah ditangani di atas
    const p1     = wrap.querySelector(".cb-p1");
    const p2     = wrap.querySelector(".cb-p2");
    const p3     = wrap.querySelector(".cb-p3");
    const p4     = wrap.querySelector(".cb-p4");
    const hidden = wrap.querySelector(".cb-hidden");
    const field  = wrap.closest(".field-code-builder");
    const prev   = field?.querySelector(".cb-preview-val");
    const errEl  = field?.querySelector(".cb-error");
    const tbl    = currentModal?.key || wrap.dataset.key || "midp";
    const curIdx = currentModal?.index !== null && currentModal?.index !== undefined
                   ? Number(currentModal.index) : -1;

    // Semua kode yang sudah terpakai (kecuali baris yang sedang diedit)
    const usedCodes = (getProject()[tbl] || [])
      .filter((_, i) => i !== curIdx)
      .map(r => (r.code || "").toLowerCase());

    // Semua nomor urut yang sudah terpakai
    const usedNums = (getProject()[tbl] || [])
      .filter((_, i) => i !== curIdx)
      .map(r => parseInt((r.code || "").split("-")[3] || "0", 10))
      .filter(n => !isNaN(n) && n > 0);

    // ── Auto-isi nomor berikutnya jika field kosong (baris baru) ──
    const isNewRow = curIdx === -1;
    if (isNewRow && !p4.value.trim()) {
      const sortedNums = [...usedNums].sort((a, b) => a - b);
      let nextNum = 1;
      for (const n of sortedNums) {
        if (n === nextNum) nextNum++;
        else if (n > nextNum) break;
      }
      p4.value = String(nextNum).padStart(3, "0");
    }

    function padNum(v) {
      const n = parseInt(v, 10);
      return isNaN(n) ? v : String(n).padStart(3, "0");
    }

    function update() {
      // Hitung fresh setiap kali — pastikan index dan tabel selalu akurat
      const _tbl     = currentModal?.key || tbl;
      const _curIdx  = currentModal?.index !== null && currentModal?.index !== undefined
                       ? Number(currentModal.index) : -1;
      const _usedCodes = (getProject()[_tbl] || [])
        .filter((_, i) => i !== _curIdx)
        .map(r => (r.code || "").toLowerCase());
      const _usedNums = (getProject()[_tbl] || [])
        .filter((_, i) => i !== _curIdx)
        .map(r => parseInt((r.code || "").split("-")[3] || "0", 10))
        .filter(n => !isNaN(n) && n > 0);

      const rawNum = p4.value.trim();
      const val    = [p1.value.trim(), p2.value, p3.value, rawNum]
        .filter(Boolean).join("-");

      if (hidden) hidden.value = val;
      if (prev)   prev.textContent = val || "-";

      if (errEl) {
        const num = parseInt(rawNum, 10);
        if (rawNum && _usedCodes.includes(val.toLowerCase())) {
          errEl.textContent = `⚠️ Kode "${val}" sudah dipakai`;
          errEl.style.color = "#c0392b";
          if (hidden) hidden.dataset.invalid = "1";
        } else if (rawNum && !isNaN(num) && _usedNums.includes(num)) {
          errEl.textContent = `⚠️ Nomor urut ${String(num).padStart(3,"0")} sudah dipakai di ${_tbl.toUpperCase()} lain`;
          errEl.style.color = "#c0392b";
          if (hidden) hidden.dataset.invalid = "1";
        } else {
          errEl.textContent = "";
          if (hidden) delete hidden.dataset.invalid;
        }
      }
    }

    // Auto-format nomor jadi 3 digit saat pindah field
    p4.addEventListener("blur", () => {
      const n = parseInt(p4.value.trim(), 10);
      if (!isNaN(n) && n > 0) p4.value = String(n).padStart(3, "0");
      update();
    });

    [p1, p2, p3, p4].forEach(el => {
      el.addEventListener("input",  update);
      el.addEventListener("change", update);
    });
    update(); // render preview awal
  });
}

function closeModal() {
  const modal = document.getElementById("rowModal");
  if (modal.open) modal.close();
  clearModalAlert();
  currentModal = null;
}

function initModal() {
  // ── Event delegation: LOD info popup toggle ──
  document.addEventListener("click", e => {
    const btn = e.target.closest(".loin-info-btn");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const popup = btn.closest(".loin-info-wrap").querySelector(".loin-info-popup");
      const isOpen = popup.classList.toggle("open");
      if (isOpen) {
        document.querySelectorAll(".loin-info-popup.open").forEach(p => {
          if (p !== popup) p.classList.remove("open");
        });
      }
      return;
    }
    // Klik di luar → tutup semua popup
    if (!e.target.closest(".loin-info-popup")) {
      document.querySelectorAll(".loin-info-popup.open").forEach(p => p.classList.remove("open"));
    }
  });

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
  document.getElementById("modalSaveBtn").addEventListener("click", async () => {
    if (!currentModal) return closeModal();
    const formData = new FormData(document.getElementById("rowForm"));
    if (currentModal.type === "project") {
      saveProjectModal(formData);
      closeModal();
      renderAll();
      toast("Project tersimpan");
      return;
    }
    if (currentModal.type === "row") {
      const saved = await saveRowModal(formData);
      if (saved === false) return;
      closeModal();
      renderAll();
      toast("Data tersimpan");
    }
  });
}

function saveProjectModal(formData) {
  const mode = currentModal.mode;
  const project = mode === "new" ? currentModal.temp : getProject();
  projectInfoFields.forEach(field => {
    project.projectInfo[field.key] = String(formData.get(`projectInfo.${field.key}`) || "").trim();
  });
  if (mode === "new") {
    const copyActive = document.getElementById("copyActiveProject")?.checked;
    let newProject;
    if (copyActive) {
      newProject = clone(getProject());
      newProject.id = createId();
      newProject.projectInfo = { ...newProject.projectInfo, ...project.projectInfo };
    } else {
      newProject = createDefaultProject(createId(), project.projectInfo.projectName || "Project Baru");
      newProject.projectInfo = { ...newProject.projectInfo, ...project.projectInfo };
      newProject.midp = [];
      newProject.tidp = [];
      newProject.cdeRegister = [];
      newProject.agreement = [];
      newProject.curve = [];
    }
    state.projects.push(newProject);
    state.activeProjectId = newProject.id;

    // Buat project di DB jika backend tersedia
    if (USE_DB) {
      apiPost("/api/projects", {
        id: newProject.id,
        projectInfo: newProject.projectInfo,
        activeDiscipline: newProject.activeDiscipline,
        autoCurveSync: newProject.autoCurveSync,
        uploadEndpoint: newProject.uploadEndpoint,
      }).catch(err => console.warn("Gagal buat project di DB:", err.message));
    }
  }
  saveState(false);
}

async function saveRowModal(formData) {
  // Cegah simpan jika kode deliverable duplikat
  const invalidCode = document.querySelector(".cb-hidden[data-invalid='1']");
  if (invalidCode) {
    modalAlert("⚠ Kode deliverable sudah dipakai — gunakan nomor urut berbeda.");
    // Scroll ke field yang error
    invalidCode.closest(".field")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  // ── Validasi field wajib ──────────────────────────────────────────────────
  const { key, index } = currentModal;
  const config = tableConfigs[key];
  const errorFields = [];
  // Hapus semua error lama
  document.querySelectorAll(".field--error").forEach(el => el.classList.remove("field--error"));
  document.querySelectorAll(".field-err-msg").forEach(el => el.remove());

  config.columns.forEach(col => {
    if (!col.required) return;
    if (col.type === "readonly" || col.type === "checkbox") return;
    // code-builder: cek hidden input
    if (col.type === "code-builder" || col.type === "code-builder-tidp") {
      const hiddenInput = document.querySelector(`.cb-hidden[name="${col.key}"]`);
      const val = hiddenInput?.value?.trim() || "";
      if (!val || val === "--") {
        errorFields.push(col.label);
        hiddenInput?.closest(".field")?.classList.add("field--error");
        return;
      }
    }
    const val = String(formData.get(col.key) || "").trim();
    if (!val) {
      errorFields.push(col.label);
      // Temukan elemen field di DOM berdasarkan name
      const input = document.querySelector(`[name="${col.key}"]`);
      const fieldEl = input?.closest(".field, .field-loin, .field-code-builder");
      if (fieldEl) {
        fieldEl.classList.add("field--error");
        const errMsg = document.createElement("span");
        errMsg.className = "field-err-msg";
        errMsg.textContent = "Kolom ini wajib diisi";
        fieldEl.appendChild(errMsg);
      }
    }
  });

  if (errorFields.length > 0) {
    // Scroll ke field error pertama
    const firstErr = document.querySelector(".field--error");
    firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(`⚠ ${errorFields.length} kolom wajib belum diisi: ${errorFields.slice(0, 3).join(", ")}${errorFields.length > 3 ? "…" : ""}`);
    return false;
  }
  // ── End validasi ─────────────────────────────────────────────────────────

  const project = getProject();
  const row = {};
  config.columns.forEach(col => {
    if (col.type === "checkbox") row[col.key] = Boolean(formData.get(col.key));
    else if (col.type === "number") row[col.key] = parseDecimalInput(formData.get(col.key));
    else if (col.type === "readonly") row[col.key] = currentModal.row[col.key] || (index === null ? project[key].length + 1 : index + 1);
    else if (col.type === "date") {
      const raw = String(formData.get(col.key) || "").trim();
      if (raw) {
        // input date selalu yyyy-mm-dd, tapi normalize untuk keamanan
        row[col.key] = normalizeDateValue(raw) || raw;
      } else {
        // Input kosong — kemungkinan browser tidak bisa parse nilai lama
        // Coba normalize dari nilai asli row
        const orig = currentModal.row?.[col.key] || "";
        row[col.key] = normalizeDateValue(orig) || orig;
      }
    }
    else row[col.key] = String(formData.get(col.key) || "").trim();
  });
  const fileInput = document.getElementById("rowFileInput");
  if (fileInput?.files?.[0]) {
    const MAX_BYTES = 5 * 1024 * 1024;
    if (fileInput.files[0].size > MAX_BYTES) {
      const sizeMB = (fileInput.files[0].size / 1024 / 1024).toFixed(1);
      modalAlert(`⚠ File terlalu besar (${sizeMB} MB). Maksimal 5 MB.`);
      return false;
    }
    const uploaded = await uploadFile(fileInput.files[0], key, row);
    row.fileName = uploaded.fileName;
    row.serverUrl = uploaded.serverUrl || row.serverUrl || "";
  }
  if (index === null || index === undefined) project[key].push(row);
  else project[key][index] = row;
  renumberRows(project[key]);
  if (["midp", "tidp"].includes(key) && project.autoCurveSync) syncCurveFromDeliverables(false);
  saveState(false);
  return true;
}

async function uploadFile(file, tableKey, row) {
  const project        = getProject();
  const customEndpoint = (project.uploadEndpoint || "").trim();

  // Urutan prioritas endpoint:
  // 1. Custom endpoint (diisi manual di settings)
  // 2. Cloudinary (jika backend tersedia dan Cloudinary dikonfigurasi)
  // 3. Upload lokal ke server (/api/upload)
  // 4. Tidak ada backend → metadata lokal saja

  let endpoint = customEndpoint;

  if (!endpoint && USE_DB) {
    // Cek apakah Cloudinary tersedia
    try {
      const status = await apiGet("/api/upload/cloud/status");
      if (status?.configured && status?.status === "connected") {
        endpoint = `${API_BASE}/api/upload/cloud`;
      }
    } catch (_) {}

    // Fallback ke upload lokal
    if (!endpoint) endpoint = `${API_BASE}/api/upload`;
  }

  if (!endpoint) {
    return { fileName: `${file.name} (${formatBytes(file.size)})`, serverUrl: "local-metadata-only" };
  }

  const payload = new FormData();
  payload.append("file", file);
  payload.append("projectId", project.id);
  payload.append("projectName", project.projectInfo.projectName);
  payload.append("table", tableKey);
  payload.append("code", row.code || row.name || "");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: payload,
      credentials: "include",
    });
    const text = await response.text();
    let url = text;
    try {
      const json = JSON.parse(text);
      url = json.url || json.location || json.path || text;
    } catch (_) {}
    if (!response.ok) throw new Error(text || "Upload gagal");

    const isCloud = endpoint.includes("/cloud");
    if (isCloud) toast(`File diupload ke Cloudinary ✓`);

    return { fileName: file.name, serverUrl: url || endpoint };
  } catch (error) {
    toast("Upload gagal, metadata disimpan lokal");
    console.warn(error);
    return { fileName: `${file.name} (${formatBytes(file.size)})`, serverUrl: "upload-failed-local-metadata" };
  }
}

// Hapus file dari server — support lokal dan Cloudinary
async function deleteServerFile(serverUrl) {
  if (!serverUrl || !USE_DB) return;
  if (serverUrl === "local-metadata-only" ||
      serverUrl === "upload-failed-local-metadata") return;

  try {
    if (serverUrl.includes("cloudinary.com")) {
      // Hapus dari Cloudinary
      await apiDelete_body("/api/upload/cloud", { url: serverUrl });
    } else {
      // Hapus dari server lokal ATAU MinIO (route yang sama menangani keduanya)
      await apiDelete_body("/api/upload", { url: serverUrl });
    }
  } catch (err) {
    console.warn("Gagal hapus file:", err.message);
  }
}

// Helper: apiDelete dengan body (DELETE + JSON body)
async function apiDelete_body(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (res.status === 401) { window.location.replace("/login.html"); return; }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx ? 1 : 0)} ${units[idx]}`;
}

function renderAll() {
  resetAllPages(); // reset ke halaman 1 saat switch project atau refresh
  renderProjectControls();
  renderEirInfo();
  renderOverview();
  renderTables();
  renderCDE();
  renderExportButtons();
  redrawCharts();
}

function renderTables() {
  renderTable("eir");
  renderTable("bep");
  renderTable("midp");
  renderDisciplineFilter();
  renderTable("tidp", filterTidpRows());
  renderTidpMap();
  renderTable("curve");
  renderTable("cdeChecklist");
  renderTable("cdeRegister");
  renderTable("agreement");
}

function getRowsFor(key) {
  return getProject()[key] || [];
}

function renderTable(key, filteredRows = null) {
  const config  = tableConfigs[key];
  const table   = document.getElementById(config.tableId);
  if (!table) return;

  const rows   = getRowsFor(key);
  let visible  = filteredRows || rows.map((row, index) => ({ row, index }));

  // ── Search filter ──
  const query = getSearch(key).toLowerCase().trim();
  if (query) {
    visible = visible.filter(({ row }) =>
      config.columns.some(col => {
        const val = row[col.key];
        return val !== undefined && val !== null &&
               String(val).toLowerCase().includes(query);
      })
    );
  }

  const total   = visible.length;

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let   page       = getPage(key);
  if (page > totalPages) { page = totalPages; setPage(key, page); }

  const start   = (page - 1) * PAGE_SIZE;
  const end     = Math.min(start + PAGE_SIZE, total);
  const paged   = visible.slice(start, end);

  // ── Render tabel ──
  const head = config.columns.map(col => {
    const star = col.required ? `<span class="th-req-star" title="Kolom wajib diisi">*</span>` : "";
    return `<th style="min-width:${col.width || 160}px">${escapeHtml(col.label)}${star}</th>`;
  }).join("") + (isGuest() ? "" : `<th>Aksi</th>`);

  const body = paged.map(({ row, index }) => {
    const cells = config.columns.map(col => `<td>${renderCell(row, col)}</td>`).join("");
    const rowId = row.id ?? row.no ?? index;
    const actionsCell = isGuest() ? "" : `<td class="actions-cell">
      <button class="row-action" data-edit="${key}" data-index="${index}">Edit</button>
      <button class="row-action delete" data-delete="${key}" data-index="${index}">Hapus</button>
    </td>`;
    return `<tr data-row-id="${escapeHtml(String(rowId))}" data-row-no="${escapeHtml(String(row.no ?? index))}">${cells}${actionsCell}</tr>`;
  }).join("") || `<tr><td colspan="${config.columns.length + (isGuest() ? 0 : 1)}" class="empty-cell">Belum ada data. Klik tombol tambah.</td></tr>`;

  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;

  // ── Event listeners ──
  table.querySelectorAll("[data-edit]").forEach(btn =>
    btn.addEventListener("click", () => openRowModal(btn.dataset.edit, Number(btn.dataset.index)))
  );
  table.querySelectorAll("[data-delete]").forEach(btn =>
    btn.addEventListener("click", () => deleteRow(btn.dataset.delete, Number(btn.dataset.index)))
  );

  // ── Render pagination controls ──
  renderPaginationControls(key, page, totalPages, total, start, end);
}

function renderPaginationControls(key, page, totalPages, total, start, end) {
  const config  = tableConfigs[key];
  const tableEl = document.getElementById(config.tableId);
  if (!tableEl) return;

  const wrap = tableEl.closest(".table-wrap") || tableEl.parentElement;
  if (!wrap) return;

  // Hapus search bar & pagination lama
  const oldSearch = wrap.parentElement.querySelector(`.table-search-bar[data-key="${key}"]`);
  if (oldSearch) oldSearch.remove();
  const oldPag = wrap.parentElement.querySelector(`.pagination-bar[data-key="${key}"]`);
  if (oldPag) oldPag.remove();

  const query     = getSearch(key);
  const totalRows = getRowsFor(key).length;

  // ── Search bar — selalu tampil ──
  const searchBar = document.createElement("div");
  searchBar.className = "table-search-bar";
  searchBar.dataset.key = key;
  searchBar.innerHTML = `
    <div class="table-search-wrap">
      <span class="table-search-icon">🔍</span>
      <input type="search" class="table-search-input"
        placeholder="Cari di tabel..."
        value="${escapeHtml(query)}"
        autocomplete="off" />
      ${query ? `<button class="table-search-clear" title="Hapus">×</button>` : ""}
    </div>
    <span class="table-search-count">
      ${query
        ? `<strong>${total}</strong> dari ${totalRows} baris`
        : `<strong>${totalRows}</strong> baris`}
    </span>
  `;

  wrap.before(searchBar);

  const input = searchBar.querySelector(".table-search-input");

  // Restore focus setelah render ulang (cegah focus hilang saat mengetik)
  if (document.activeElement?.classList.contains("table-search-input") &&
      document.activeElement?.closest(`[data-key="${key}"]`) === null) {
    // input baru saja dibuat ulang, fokus balik ke sini
  }

  input.addEventListener("input", () => {
    const val    = input.value;
    const selEnd = input.selectionEnd; // simpan posisi cursor
    setSearch(key, val);
    renderTable(key, null);
    // Setelah render, cari input baru dan kembalikan focus + cursor
    const newInput = wrap.parentElement
      .querySelector(`.table-search-bar[data-key="${key}"] .table-search-input`);
    if (newInput) {
      newInput.focus();
      try { newInput.setSelectionRange(selEnd, selEnd); } catch(_) {}
    }
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      setSearch(key, "");
      renderTable(key, null);
    }
  });

  const clearBtn = searchBar.querySelector(".table-search-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      setSearch(key, "");
      renderTable(key, null);
      // Focus balik ke input setelah clear
      const newInput = wrap.parentElement
        .querySelector(`.table-search-bar[data-key="${key}"] .table-search-input`);
      if (newInput) newInput.focus();
    });
  }

  // ── Pagination — hanya jika perlu ──
  if (total <= PAGE_SIZE) return;

  let pStart = Math.max(1, page - 2);
  let pEnd   = Math.min(totalPages, pStart + 4);
  if (pEnd - pStart < 4) pStart = Math.max(1, pEnd - 4);

  let pageButtons = "";
  for (let i = pStart; i <= pEnd; i++) {
    pageButtons += `<button class="pag-btn${i === page ? " pag-active" : ""}" data-page="${i}">${i}</button>`;
  }

  const pag = document.createElement("div");
  pag.className = "pagination-bar";
  pag.dataset.key = key;
  pag.innerHTML = `
    <div class="pag-info">
      Menampilkan <strong>${start + 1}–${end}</strong> dari <strong>${total}</strong> baris
    </div>
    <div class="pag-controls">
      <button class="pag-btn pag-nav" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>
      ${pageButtons}
      <button class="pag-btn pag-nav" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>›</button>
    </div>
  `;

  wrap.after(pag);

  pag.querySelectorAll(".pag-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.page);
      if (p < 1 || p > totalPages || p === page) return;
      setPage(key, p);
      renderTable(key, null);
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderCell(row, col) {
  const value = row[col.key];
  // Kolom label pada kurva S — tampilkan sebagai "06 Apr 26"
  if (col.key === "label" && col.type === "date") {
    const display = formatPeriodLabel(value);
    return display
      ? `<span class="date-cell">${escapeHtml(display)}</span>`
      : `<span class="empty-cell">-</span>`;
  }
  if (col.key === "status") {
    return statusBadge(value, col.options);
  }
  if (col.type === "checkbox") {
    let text = value ? "Ya" : "Tidak";
    if (col.key === "done") text = value ? "Selesai" : "Belum selesai";
    if (col.key === "agreed") text = value ? "Disepakati" : "Draft";
    if (col.key === "approved") text = value ? "Approved" : "Belum approved";
    if (col.key === "available") text = value ? "Ada" : "Belum ada";
    if (col.key === "required") text = value ? "Wajib" : "Opsional";
    if (col.key === "locked") text = value ? "Manual" : "Auto";
    return `<span class="checkbox-view disabled"><input type="checkbox" ${value ? "checked" : ""} disabled />${escapeHtml(text)}</span>`;
  }
  if (col.type === "file-meta") {
    return value ? `<span class="file-chip">${escapeHtml(value)}</span>` : `<span class="empty-cell">Belum upload</span>`;
  }
  if (col.type === "url") {
    if (!value) return `<span class="empty-cell">-</span>`;
    if (String(value).startsWith("http")) return `<a class="server-link" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">Buka file</a>`;
    return `<span class="muted-cell">${escapeHtml(value)}</span>`;
  }
  if (col.key === "required") return value ? `<span class="required-yes">Wajib</span>` : `<span class="required-no">Opsional</span>`;
  if (col.type === "date") {
    const display = formatDateDisplay(value);
    if (!display) return `<span class="empty-cell">-</span>`;
    // Apply urgency color if this is a deadline column for a deliverable row
    if (col.key === "deadline" && row.status !== undefined) {
      const urgency = deadlineUrgency(row);
      if (urgency === "overdue") {
        const days = daysUntilDeadline(value);
        return `<span class="date-cell date-cell--overdue" title="Terlambat ${Math.abs(days)} hari">⚠ ${escapeHtml(display)}</span>`;
      }
      if (urgency === "warning") {
        const days = daysUntilDeadline(value);
        return `<span class="date-cell date-cell--warning" title="${days} hari lagi">⏰ ${escapeHtml(display)}</span>`;
      }
    }
    return `<span class="date-cell">${escapeHtml(display)}</span>`;
  }
  // Kolom Keterangan di Kurva S — tampilkan ringkas (jumlah item) dengan tooltip lengkap
  if (col.key === "notes" && col.type === "textarea" && row.planned !== undefined) {
    if (!value) return `<span class="empty-cell">-</span>`;
    const lines = value.split("\n").filter(Boolean);
    const isItemList = lines.every(l => l.trim().startsWith("•"));
    const preview = isItemList
      ? `${lines.length} item — ${lines[0].replace(/^•\s*/, "")}${lines.length > 1 ? ", ..." : ""}`
      : (value.length > 60 ? value.slice(0, 60) + "…" : value);
    return `<span class="notes-cell" title="${escapeHtml(value)}">${escapeHtml(preview)}</span>`;
  }
  return value !== undefined && value !== "" ? escapeHtml(value) : `<span class="empty-cell">-</span>`;
}

async function deleteRow(key, index) {
  if (isGuest()) { toast("Akun guest tidak bisa mengubah data"); return; }
  if (!confirm("Hapus baris ini?")) return;
  const project = getProject();
  const row     = project[key][index];

  // Hapus file upload jika ada (hanya untuk tabel yang punya file)
  if (row && ["cdeRegister", "agreement"].includes(key) && row.serverUrl) {
    await deleteServerFile(row.serverUrl);
  }

  project[key].splice(index, 1);
  renumberRows(project[key]);
  if (["midp", "tidp"].includes(key) && project.autoCurveSync) syncCurveFromDeliverables(false);
  resetPage(key);
  saveState(false);
  renderAll();
  toast("Baris dihapus");
}

function renumberRows(rows) {
  rows.forEach((row, index) => { row.no = index + 1; });
}

function renumberAll(project) {
  ["eir", "bep", "midp", "tidp", "curve", "cdeChecklist", "cdeRegister", "agreement"].forEach(key => renumberRows(project[key] || []));
}

function renderDisciplineFilter() {
  const project = getProject();
  const filters = ["Semua", "Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control"];
  const el = document.getElementById("disciplineFilter");
  if (!el) return;
  el.innerHTML = filters.map(filter => `<button class="filter-btn ${project.activeDiscipline === filter ? "active" : ""}" data-filter="${escapeHtml(filter)}">${escapeHtml(filter)}</button>`).join("");
  el.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    project.activeDiscipline = btn.dataset.filter;
    saveState(false);
    renderTables();
  }));
}

function filterTidpRows() {
  const project = getProject();
  const rows = project.tidp || [];
  if (project.activeDiscipline === "Semua") return rows.map((row, index) => ({ row, index }));
  return rows.map((row, index) => ({ row, index })).filter(({ row }) => row.discipline === project.activeDiscipline);
}

function renderTidpMap() {
  const project = getProject();
  const midpByCode = Object.fromEntries(project.midp.map(row => [row.code, row]));
  const rows = project.tidp.map((tidp, idx) => {
    const midp = midpByCode[tidp.midpCode];
    return {
      no: idx + 1,
      tidpCode: tidp.code,
      tidpName: tidp.name,
      midpCode: tidp.midpCode || "Belum dihubungkan",
      midpName: midp?.name || "Tidak ditemukan di MIDP",
      discipline: tidp.discipline,
      pic: tidp.pic,
      status: tidp.status ?? (tidp.done ? "Selesai" : "Belum Mulai")
    };
  });
  const columns = [
    { key: "no", label: "No" }, { key: "tidpCode", label: "Kode TIDP" }, { key: "tidpName", label: "Nama TIDP" },
    { key: "midpCode", label: "Kode MIDP Terkait" }, { key: "midpName", label: "Nama MIDP" }, { key: "discipline", label: "Disiplin" },
    { key: "pic", label: "PIC" }, { key: "status", label: "Status", type: "select", options: statusOptions }
  ];
  const table = document.getElementById("tidpMapTable");
  table.innerHTML = `<thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${renderCell(row, col)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function renderCDE() {
  const folders = [
    { title: "01. Pra Perencanaan", items: ["Studi Kelayakan", "Kajian Teknis", "Rencana Anggaran", "Dokumen Legalitas"] },
    { title: "02. Perencanaan Teknis", items: ["WIP / Model BIM", "Shared / DED", "Published / Model Disetujui", "Archived / Dokumen Final"] },
    { title: "03. Pengadaan Lahan", items: ["Dokumen Hukum", "Kajian Sosial", "Data Pemilik Lahan", "Laporan Kemajuan"] },
    { title: "04. Pelaksanaan Konstruksi", items: ["Data Survei", "For Construction", "As Built", "BIM 4D Scheduling", "BIM 5D QTO", "QA/QC", "Project Progress", "HSE", "PHO"] },
    { title: "05. Operasi dan Pemeliharaan", items: ["Model As-Built Final", "Manual O&M", "Jadwal Pemeliharaan", "Dokumentasi Perbaikan"] },
    { title: "11. Dashboard / Publikasi", items: ["As-Built", "BIM Design", "BIM Progress", "Foto", "Orthophoto", "Shop Drawing", "Video", "BIM Library"] }
  ];
  const tree = document.getElementById("folderTree");
  if (!tree) return;
  tree.innerHTML = folders.map((folder, index) => `
    <details class="folder-stage" ${index < 2 ? "open" : ""}>
      <summary>${escapeHtml(folder.title)}</summary>
      <ul>${folder.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </details>
  `).join("");
}

function renderOverview() {
  const project = getProject();
  const deliverables = [...project.midp, ...project.tidp];
  const total = deliverables.length;
  const counts = statusCounts(deliverables);
  const done = counts["Selesai"] || 0;
  const progress = (counts["On Track"] || 0) + (counts["In Progress"] || 0);
  const notStarted = counts["Belum Mulai"] || 0;
  const late = counts["Terlambat"] || 0;
  const cdeRequired = project.cdeChecklist.filter(r => r.required).length;
  const cdeAvailable = project.cdeChecklist.filter(r => r.required && r.available).length;
  const eirDone = percent(project.eir.filter(r => r.agreed).length, project.eir.length);
  const bepDone = percent(project.bep.filter(r => r.agreed).length, project.bep.length);

  // Count deliverables approaching deadline (≤7 days, not done, not already "Terlambat")
  const allDeliverables = [...project.midp, ...project.tidp];
  const nearDeadline = allDeliverables.filter(r => !isDone(r) && deadlineUrgency(r) === "warning").length;
  const overdueByDate = allDeliverables.filter(r => !isDone(r) && deadlineUrgency(r) === "overdue").length;
  const totalLate = Math.max(late, overdueByDate); // use whichever is higher

  const kpis = [
    { label: "Total Deliverable", value: total, sub: "MIDP + TIDP", color: colors.green },
    { label: "Selesai", value: done, sub: `${formatPercent(percent(done,total))} dari total`, color: colors.green2 },
    { label: "On Track / In Progress", value: progress, sub: "Dalam pengawalan", color: colors.blue },
    { label: "Belum Mulai", value: notStarted, sub: "Menunggu aktivitas", color: colors.gray },
    { label: "Terlambat", value: totalLate, sub: totalLate ? "Perlu eskalasi segera" : "Tidak ada keterlambatan", color: totalLate ? colors.red : colors.green2, flag: totalLate ? "overdue" : "" },
    { label: "Mendekati Deadline", value: nearDeadline, sub: nearDeadline ? "≤7 hari — segera tindak lanjut" : "Tidak ada peringatan", color: nearDeadline ? colors.yellow : colors.green2, flag: nearDeadline ? "warning" : "" },
    { label: "Checklist CDE Wajib", value: `${cdeAvailable}/${cdeRequired}`, sub: "Dokumen wajib tersedia", color: colors.maroon },
    { label: "EIR / BEP Agreed", value: `${formatPercent((eirDone + bepDone)/2)}`, sub: "Kesepakatan informasi", color: colors.gold }
  ];
  document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi-card${k.flag ? ` kpi-card--${k.flag}` : ""}" style="--accent:${k.color}"><small>${escapeHtml(k.label)}</small><strong>${escapeHtml(String(k.value))}</strong><span>${escapeHtml(k.sub)}</span></div>
  `).join("");
  renderDonut(counts, total);
  renderDisciplineBars();
  renderDocumentProgress();
  renderDeadlines();
  renderCurveSummary();
}

function percent(a, b) { return b ? (a / b) * 100 : 0; }
function formatPercent(value) { return `${Math.round(value || 0)}%`; }

function renderDonut(counts, total) {
  const items = statusOptions.map(name => ({ name, value: counts[name] || 0, color: statusMeta[name].color }));
  drawDonut("statusDonut", items);
  document.getElementById("statusLegend").innerHTML = items.map(item => `<div class="legend-row"><span><i style="background:${item.color}"></i>${item.name}</span><strong>${item.value} · ${formatPercent(percent(item.value,total))}</strong></div>`).join("");
}

function renderDisciplineBars() {
  const project = getProject();
  const disciplines = ["Arsitektur", "Struktur", "MEP", "Koordinasi", "BIM Management", "Document Control"];
  document.getElementById("disciplineBars").innerHTML = disciplines.map(d => {
    const rows = [...project.midp, ...project.tidp].filter(row => row.discipline === d);
    const total = rows.length || 1;
    const counts = statusCounts(rows);
    const segments = statusOptions.map(status => {
      const value = counts[status] || 0;
      return `<span class="segment" title="${escapeHtml(status)}: ${value}" style="width:${percent(value,total)}%;background:${statusMeta[status].color}"></span>`;
    }).join("");
    return `<div class="discipline-row"><strong>${escapeHtml(d)}</strong><div class="stacked-track">${segments}</div><span>${counts["Selesai"] || 0}/${rows.length}</span></div>`;
  }).join("");
}

function renderDocumentProgress() {
  const project = getProject();
  const items = [
    ["EIR", project.eir.filter(r => r.agreed).length, project.eir.length],
    ["BEP", project.bep.filter(r => r.agreed).length, project.bep.length],
    ["CDE", project.cdeChecklist.filter(r => r.available).length, project.cdeChecklist.length],
    ["Agreement", project.agreement.filter(r => ["Disetujui", "Final"].includes(r.status)).length, project.agreement.length]
  ];
  document.getElementById("documentProgress").innerHTML = items.map(([label, a, b]) => {
    const pct = percent(a,b);
    return `<div class="phase-item"><strong>${label}</strong><div class="phase-track"><div class="phase-fill" style="width:${pct}%"></div></div><span>${formatPercent(pct)}</span></div>`;
  }).join("");
}

function renderDeadlines() {
  const urgencyOrder = { overdue: 0, warning: 1, normal: 2 };
  const midp = getProject().midp.map(row => ({ row, src: "midp" }));
  const tidp = getProject().tidp.map(row => ({ row, src: "tidp" }));
  const rows = [...midp, ...tidp]
    .filter(({ row }) => !isDone(row))
    .map(({ row, src }) => ({ row, src, urgency: deadlineUrgency(row), days: daysUntilDeadline(row.deadline) }))
    .sort((a, b) => {
      const ua = urgencyOrder[a.urgency] ?? 3;
      const ub = urgencyOrder[b.urgency] ?? 3;
      if (ua !== ub) return ua - ub;
      if (a.days !== null && b.days !== null) return a.days - b.days;
      return 0;
    })
    .slice(0, 8);

  document.getElementById("deadlineList").innerHTML = rows.map(({ row, src, urgency, days }) => {
    const urgencyClass = urgency === "overdue" ? "mini-item--overdue"
                       : urgency === "warning"  ? "mini-item--warning"
                       : "";
    let dayLabel = "";
    if (days !== null) {
      if (days < 0)        dayLabel = `<span class="day-label day-label--overdue">Terlambat ${Math.abs(days)}h</span>`;
      else if (days === 0) dayLabel = `<span class="day-label day-label--overdue">Hari ini!</span>`;
      else if (days <= 7)  dayLabel = `<span class="day-label day-label--warning">${days} hari lagi</span>`;
    }
    const rowId = row.id ?? row.no;
    return `
      <div class="mini-item ${urgencyClass} mini-item--clickable"
           role="button" tabindex="0"
           title="Klik untuk membuka di tab ${src.toUpperCase()}"
           data-nav-tab="${src}" data-nav-id="${escapeHtml(String(rowId))}"
           onclick="navigateToRow('${src}','${escapeHtml(String(rowId))}')"
           onkeydown="if(event.key==='Enter')navigateToRow('${src}','${escapeHtml(String(rowId))}')">
        <div class="mini-item__main">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.code || row.midpCode || "")} · ${escapeHtml(row.discipline || "-")}</span>
        </div>
        <div class="mini-item__right">
          ${statusBadge(row.status)}
          ${deadlineChip(row)}
          ${dayLabel}
          <span class="mini-item__arrow">→</span>
        </div>
      </div>`;
  }).join("") || `<div class="empty-cell">🎉 Semua deliverable sudah selesai.</div>`;
}

// Navigasi dari overview ke baris spesifik di tab MIDP/TIDP
function navigateToRow(tabKey, rowId) {
  // 1. Pindah ke tab yang sesuai
  const tabBtn = document.querySelector(`.nav-btn[data-target="${tabKey}"]`);
  if (tabBtn) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
    tabBtn.classList.add("active");
    document.getElementById(tabKey)?.classList.add("active-page");
    activeTab = tabKey;
    document.body.dataset.section = tabKey;
    redrawCharts();
  }

  // 2. Scroll + highlight baris setelah render selesai
  requestAnimationFrame(() => {
    setTimeout(() => {
      // Cari baris di tabel berdasarkan data-row-id atau urutan no
      const table = document.getElementById(tableConfigs[tabKey]?.tableId);
      if (!table) return;
      const rows = table.querySelectorAll("tbody tr");
      let targetRow = null;
      rows.forEach(tr => {
        if (tr.dataset.rowId === String(rowId) || tr.dataset.rowNo === String(rowId)) {
          targetRow = tr;
        }
      });
      // Fallback: cari berdasarkan teks kode di sel pertama yang relevan
      if (!targetRow) {
        const proj = getProject();
        const dataRows = proj[tabKey];
        const idx = dataRows.findIndex(r => String(r.id ?? r.no) === String(rowId));
        if (idx >= 0 && rows[idx]) targetRow = rows[idx];
      }
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
        targetRow.classList.add("row--highlight");
        setTimeout(() => targetRow.classList.remove("row--highlight"), 2500);
      }
    }, 120);
  });
}

// ── Helper: format tanggal kurva → "06 Apr 26" ───────────────────────────
function formatPeriodLabel(dateStr) {
  if (!dateStr) return "";
  const normalized = normalizeDateValueSafe(dateStr);
  if (!normalized) return dateStr; // fallback teks lama
  const d = new Date(normalized + "T00:00:00");
  if (isNaN(d)) return dateStr;
  const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const dd  = String(d.getDate()).padStart(2,"0");
  const mmm = MONTHS[d.getMonth()];
  const yy  = String(d.getFullYear()).slice(2);
  return `${dd} ${mmm} ${yy}`;
}

// ── Helper: parse label periode (yyyy-mm-dd atau teks lama "Apr W1") → Date ─
function parsePeriodDate(label) {
  if (!label) return null;
  // Format baru: yyyy-mm-dd
  const normalized = normalizeDateValueSafe(label);
  if (normalized) {
    const d = new Date(normalized + "T00:00:00");
    if (!isNaN(d)) return d;
  }
  // Fallback: format lama "Apr W1" → ambil akhir minggu tersebut
  const monthMap = {
    jan:0,feb:1,mar:2,apr:3,mei:4,may:4,jun:5,
    jul:6,agu:7,aug:7,sep:8,okt:9,oct:9,nov:10,des:11,dec:11
  };
  const m = String(label).toLowerCase().match(/^(\w{3})\s*w(\d)/);
  if (!m) return null;
  const monthIdx = monthMap[m[1]];
  const week = parseInt(m[2]);
  if (monthIdx === undefined || isNaN(week)) return null;
  const year = new Date().getFullYear();
  const firstDay = new Date(year, monthIdx, 1);
  const dayOfWeek = firstDay.getDay();
  const daysToMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  const firstMonday = new Date(year, monthIdx, 1 + daysToMonday);
  const weekEnd = new Date(firstMonday);
  weekEnd.setDate(firstMonday.getDate() + (week - 1) * 7 + 6);
  return weekEnd;
}

// ── Helper: apakah deadline jatuh di atau sebelum tanggal periode ────────────
function deadlineInOrBeforePeriod(deadlineStr, periodEnd) {
  if (!deadlineStr || deadlineStr === "TBC") return false;
  const normalized = normalizeDateValueSafe(deadlineStr);
  if (!normalized) return false;
  const d = new Date(normalized + "T00:00:00");
  return !isNaN(d) && d <= periodEnd;
}

function syncCurveFromDeliverables(showToast = true) {
  const project = getProject();
  const deliverables = [...project.midp, ...project.tidp];
  const total = deliverables.length;
  if (!total) {
    if (showToast) toast("Tidak ada deliverable di MIDP/TIDP");
    return;
  }

  // Ambil daftar periode dari kurva yang ada
  // Jika kurva kosong, buat default 8 titik mingguan mulai hari ini
  let periods;
  if (project.curve.length) {
    periods = project.curve.map(p => p.label);
  } else {
    // Generate 8 titik — setiap 7 hari mulai hari ini
    const today = new Date();
    periods = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i * 7);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    });
  }

  // Parse semua periode → Date object (titik batas atas kumulatif)
  const parsedPeriods = periods.map(label => ({
    label,
    date: parsePeriodDate(label)
  }));

  // Pisahkan deliverable yang punya deadline valid vs tidak
  const withDeadline = deliverables.filter(r => r.deadline && r.deadline !== "TBC" && normalizeDateValueSafe(r.deadline));
  const noDeadline   = deliverables.filter(r => !r.deadline || r.deadline === "TBC" || !normalizeDateValueSafe(r.deadline));
  const noDeadlinePerPeriod = noDeadline.length / periods.length;

  // ── PLANNED: kumulatif deliverable dengan deadline ≤ tanggal periode ────────
  let prevPlanned = 0;
  const finalPlanned = parsedPeriods.map(({ date }, idx) => {
    const fromDeadline = date
      ? withDeadline.filter(r => deadlineInOrBeforePeriod(r.deadline, date)).length
      : prevPlanned;
    const fromNoDeadline = Math.round(noDeadlinePerPeriod * (idx + 1));
    const raw = Math.min(fromDeadline + fromNoDeadline, total);
    const val = Math.max(raw, prevPlanned);
    prevPlanned = val;
    return val;
  });
  if (finalPlanned.length > 0) finalPlanned[finalPlanned.length - 1] = total;

  // ── ACTUAL: kumulatif berdasarkan realization date atau status Selesai ───────
  let prevActual = 0;
  const finalActual = parsedPeriods.map(({ date }) => {
    if (!date) return prevActual;
    const count = deliverables.filter(r => {
      if (r.realization && r.realization !== "TBC" && normalizeDateValueSafe(r.realization)) {
        return deadlineInOrBeforePeriod(r.realization, date);
      }
      if (isDone(r) && r.deadline && deadlineInOrBeforePeriod(r.deadline, date)) return true;
      return false;
    }).length;
    const val = Math.max(count, prevActual);
    prevActual = val;
    return val;
  });

  // ── NOTES: daftar nama item yang sudah masuk hitungan planned per periode ───
  const finalNotes = parsedPeriods.map(({ date }) => {
    if (!date) return "";
    const itemsInPeriod = withDeadline.filter(r => deadlineInOrBeforePeriod(r.deadline, date));
    if (!itemsInPeriod.length) return "Belum ada item dengan deadline ≤ periode ini";
    const names = itemsInPeriod.map(r => {
      const sumber = project.midp.includes(r) ? "MIDP" : "TIDP";
      return `• ${r.name || r.code || "(tanpa nama)"} [${sumber}]`;
    });
    return names.join("\n");
  });

  // ── Terapkan ke project.curve ─────────────────────────────────────────────
  const generated = periods.map((label, idx) => ({
    no: idx + 1,
    label,
    planned: finalPlanned[idx] ?? total,
    actual:  finalActual[idx]  ?? 0,
    notes:   finalNotes[idx] ?? "",
    locked:  false
  }));

  if (!project.curve.length) {
    project.curve = generated;
  } else {
    project.curve = project.curve.map((point, idx) => {
      if (point.locked) return point;
      return { ...generated[idx], label: point.label || generated[idx]?.label };
    });
  }

  renumberRows(project.curve);
  saveState(false);
  renderAll();

  if (showToast) {
    const lockedCount = project.curve.filter(p => p.locked).length;
    const lockNote    = lockedCount ? ` (${lockedCount} titik terkunci dilewati)` : "";
    const noDeadlineNote = noDeadline.length ? `, ${noDeadline.length} tanpa deadline didistribusi merata` : "";
    toast(`Kurva S disinkronkan: ${withDeadline.length} deliverable berdeadline${noDeadlineNote}${lockNote}`);
  }
}

function renderCurveSummary() {
  const project = getProject();
  const current = getCurrentCurvePoint(project.curve);
  const planned = parseDecimalInput(current.planned);
  const actual  = parseDecimalInput(current.actual);
  const deviasi = actual - planned;
  const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const html = `<span>Rencana: ${fmt(planned)}</span><span>Aktual: ${fmt(actual)}</span><span>Deviasi: ${fmt(deviasi)}</span>`;
  ["curveSummary", "curveSummary2"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

// Cari titik kurva yang paling relevan untuk "progres saat ini" —
// yaitu titik dengan nilai Aktual TERTINGGI yang sudah tercatat (kurva kumulatif = naik terus).
// Sebelumnya kode selalu ambil titik paling akhir di array (tanggal target/akhir kurva),
// padahal titik itu wajar actual=0 kalau tanggalnya masih di masa depan/belum direalisasikan —
// bukan bug baca desimal, tapi salah pilih titik.
function getCurrentCurvePoint(curve) {
  if (!curve || !curve.length) return { planned: 0, actual: 0 };
  let current = curve[0];
  let maxActual = parseDecimalInput(curve[0].actual);
  for (const point of curve) {
    const a = parseDecimalInput(point.actual);
    if (a >= maxActual) { maxActual = a; current = point; } // ">=" → pakai kemunculan terakhir kalau ada nilai sama (plateau)
  }
  return current;
}

function drawDonut(canvasId, items) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
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

function drawLineChart(canvasId, points, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const parentBox = parent ? parent.getBoundingClientRect() : { width: 0 };
  const availableWidth = Math.floor(parentBox.width || canvas.clientWidth || 720);
  const cssWidth = Math.max(260, availableWidth);
  const cssHeight = Number(options.height || canvas.getAttribute("height") || 300);

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
  const planned = points.map(p => parseDecimalInput(p.planned));
  const actual = points.map(p => parseDecimalInput(p.actual));
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
  drawSeries("Rencana", planned, colors.maroon, false);
  drawSeries("Aktual", actual, colors.green2, true);

  function drawSeries(name, values, color, hideZeroTail) {
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
  const legends = [{ name: "Rencana", color: colors.maroon }, { name: "Aktual", color: colors.green2 }];
  let offset = 0;
  legends.forEach(item => {
    ctx.fillStyle = item.color; ctx.fillRect(padding.left + offset, 12, 18, 4);
    ctx.fillStyle = "#6b7a74"; ctx.textAlign = "left"; ctx.fillText(item.name, padding.left + offset + 24, 17);
    offset += 96;
  });

  // Simpan koordinat node untuk click detection
  if (!window.__chartNodes) window.__chartNodes = {};
  window.__chartNodes[canvasId] = points.map((p, idx) => ({
    idx,
    x:        xFor(idx),
    yPlanned: yFor(parseDecimalInput(p.planned)),
    yActual:  yFor(parseDecimalInput(p.actual)),
  }));

  // Cursor pointer saat hover node
  canvas.onmousemove = function(e) {
    const r  = canvas.getBoundingClientRect();
    const sx = cssWidth  / r.width;
    const sy = cssHeight / r.height;
    const mx = (e.clientX - r.left) * sx;
    const my = (e.clientY - r.top)  * sy;
    const hit = (window.__chartNodes[canvasId] || []).some(n =>
      Math.abs(mx - n.x) < 16 &&
      (Math.abs(my - n.yPlanned) < 16 || Math.abs(my - n.yActual) < 16)
    );
    canvas.style.cursor = hit ? "pointer" : "default";
  };
}


function initCurveChartClick() {
  ["sCurve","sCurveOverview"].forEach(canvasId => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.addEventListener("click", function(e) {
      const rect = canvas.getBoundingClientRect();
      const sx   = (canvas.width /(window.devicePixelRatio||1)) / rect.width;
      const sy   = (canvas.height/(window.devicePixelRatio||1)) / rect.height;
      const mx   = (e.clientX - rect.left) * sx;
      const my   = (e.clientY - rect.top)  * sy;
      const nodes = window.__chartNodes?.[canvasId]||[];
      let closest=null, minDist=20;
      nodes.forEach(n => {
        const d = Math.min(Math.hypot(mx-n.x,my-n.yPlanned), Math.hypot(mx-n.x,my-n.yActual));
        if (d<minDist){minDist=d;closest=n;}
      });
      if (closest) {
        openRowModal("curve", closest.idx);
      }
    });
  });
}

function redrawCharts() {
  const project = getProject();
  drawLineChart("sCurveOverview", project.curve, { height: 300 });
  drawLineChart("sCurve", project.curve, { height: 340 });
}

function renderExportButtons() {
  document.querySelectorAll(".export-actions[data-export]").forEach(container => {
    const key = container.dataset.export;
    container.innerHTML = `
      <button class="outline-btn" data-export-format="xls" data-key="${key}">Excel</button>
      <button class="outline-btn" data-export-format="doc" data-key="${key}">Word</button>
      <button class="outline-btn" data-export-format="print" data-key="${key}">PDF/Print</button>
    `;
  });
  document.querySelectorAll("[data-export-format]").forEach(btn => btn.addEventListener("click", () => exportTable(btn.dataset.key, btn.dataset.exportFormat)));
}

function getExportData(key) {
  const project = getProject();
  if (key === "tidpMap") {
    const midpByCode = Object.fromEntries(project.midp.map(row => [row.code, row]));
    return {
      title: "Mapping Kode TIDP ke MIDP",
      columns: ["No", "Kode TIDP", "Nama TIDP", "Kode MIDP Terkait", "Nama MIDP", "Disiplin", "PIC", "Status"],
      rows: project.tidp.map((tidp, i) => [i + 1, tidp.code, tidp.name, tidp.midpCode, midpByCode[tidp.midpCode]?.name || "Tidak ditemukan", tidp.discipline, tidp.pic, normalizeStatus(tidp.status ?? (tidp.done ? "Selesai" : "Belum Mulai"))])
    };
  }
  const config = tableConfigs[key];
  const rows = getRowsFor(key).map(row => config.columns.map(col => exportCell(row, col)));
  return { title: config.title, columns: config.columns.map(c => c.label), rows };
}

function exportCell(row, col) {
  const value = row[col.key];
  if (col.key === "status") return col.options === statusOptions ? normalizeStatus(value) : (value ?? "");
  if (col.type === "checkbox") {
    if (col.key === "done") return value ? "Selesai" : "Belum selesai";
    if (col.key === "agreed") return value ? "Disepakati" : "Draft";
    if (col.key === "approved") return value ? "Approved" : "Belum approved";
    if (col.key === "required") return value ? "Wajib" : "Opsional";
    if (col.key === "available") return value ? "Ada" : "Belum ada";
    if (col.key === "locked") return value ? "Manual" : "Auto";
    return value ? "Ya" : "Tidak";
  }
  return value ?? "";
}

function buildExportHtml(data) {
  const project = getProject();
  const metaRows = [
    ["Project", project.projectInfo.projectName],
    ["Perusahaan", project.projectInfo.companyName],
    ["Periode", project.projectInfo.period],
    ["BIM Manager", project.projectInfo.managerName]
  ];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;color:#26313A} h1{color:#0E4AA8;margin-bottom:4px} .meta{margin:10px 0 18px;border-collapse:collapse}.meta td{padding:6px 10px;border:1px solid #D8E6F3}.meta td:first-child{background:#EFF8FF;font-weight:bold;color:#0F8C90}
    table.data{border-collapse:collapse;width:100%;font-size:11px} table.data th{background:#0E4AA8;color:#fff;padding:9px;border:1px solid #ffffff;text-align:left} table.data td{padding:8px;border:1px solid #D8E6F3;vertical-align:top} table.data tr:nth-child(even) td{background:#FAFCFF} table.data tr:nth-child(odd) td{background:#FFFFFF}.footer{margin-top:18px;color:#6F7C87;font-size:10px}
  </style></head><body><h1>${escapeHtml(data.title)}</h1><div>Export otomatis dari Dashboard BIMA MIDP/TIDP</div><table class="meta">${metaRows.map(r => `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`).join("")}</table><table class="data"><thead><tr>${data.columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="footer">Header dan konten sudah diberi style warna dasar BIMA agar rapi saat dibuka di Excel/Word/PDF.</div></body></html>`;
}

// Ambil gambar Kurva S dari canvas sebagai base64 PNG
function getCurveChartImage() {
  const canvas = document.getElementById("sCurve");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch (_) {
    return null;
  }
}

// Buat HTML khusus export Kurva S (dengan grafik + tabel)
function buildCurveExportHtml(includeChart = true) {
  const project   = getProject();
  const data      = getExportData("curve");
  const chartImg  = includeChart ? getCurveChartImage() : null;
  const metaRows  = [
    ["Project",    project.projectInfo.projectName],
    ["Perusahaan", project.projectInfo.companyName],
    ["Periode",    project.projectInfo.period],
    ["BIM Manager",project.projectInfo.managerName],
  ];

  const chartSection = chartImg ? `
    <div style="margin:20px 0 24px;">
      <h2 style="color:#0E4AA8;font-size:15px;margin-bottom:10px;">Grafik Kurva S</h2>
      <img src="${chartImg}"
           style="width:100%;max-width:900px;height:auto;border:1px solid #D8E6F3;border-radius:8px;display:block;" />
    </div>
  ` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;color:#26313A;margin:24px}
    h1{color:#0E4AA8;margin-bottom:4px;font-size:20px}
    .sub{color:#6F7C87;font-size:13px;margin-bottom:16px}
    .meta{margin:10px 0 20px;border-collapse:collapse}
    .meta td{padding:6px 10px;border:1px solid #D8E6F3}
    .meta td:first-child{background:#EFF8FF;font-weight:bold;color:#0F8C90;width:140px}
    table.data{border-collapse:collapse;width:100%;font-size:12px}
    table.data th{background:#0E4AA8;color:#fff;padding:9px;border:1px solid #fff;text-align:left}
    table.data td{padding:8px;border:1px solid #D8E6F3;vertical-align:top}
    table.data tr:nth-child(even) td{background:#FAFCFF}
    .footer{margin-top:20px;color:#6F7C87;font-size:10px}
    @media print {
      body{margin:12px}
      img{page-break-inside:avoid}
    }
  </style></head><body>
  <h1>Kurva S — ${escapeHtml(project.projectInfo.projectName)}</h1>
  <div class="sub">Export dari BIMA Dashboard</div>
  <table class="meta">
    ${metaRows.map(r => `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1] || "—")}</td></tr>`).join("")}
  </table>
  ${chartSection}
  <h2 style="color:#0E4AA8;font-size:15px;margin:0 0 10px;">Data Tabel Kurva S</h2>
  <table class="data">
    <thead><tr>${data.columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
    <tbody>${data.rows.map(row =>
      `<tr>${row.map(cell => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`
    ).join("")}</tbody>
  </table>
  <div class="footer">Dicetak dari BIMA Dashboard • ${new Date().toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}</div>
  </body></html>`;
}

function exportTable(key, format) {
  const filenameBase = `${slug(getProject().projectInfo.projectName)}-${slug(tableConfigs[key]?.title || key)}`;

  // ── Export Kurva S: sertakan grafik ──
  if (key === "curve") {
    if (format === "print") {
      const html = buildCurveExportHtml(true);
      const win  = window.open("", "_blank");
      win.document.write(html);
      win.document.close();
      win.focus();
      // Tunggu gambar render dulu sebelum print
      setTimeout(() => { win.focus(); win.print(); }, 500);
      return;
    }
    if (format === "xls") {
      // Excel: grafik tidak bisa embed via HTML, export tabel saja
      const html = buildCurveExportHtml(false);
      downloadFile(`${filenameBase}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
      return;
    }
    if (format === "doc") {
      // Word: sertakan grafik sebagai gambar
      const html = buildCurveExportHtml(true);
      downloadFile(`${filenameBase}.doc`, html, "application/msword;charset=utf-8");
      return;
    }
  }

  // ── Export tabel lain: seperti biasa ──
  const data = getExportData(key);
  const html = buildExportHtml(data);
  if (format === "print") {
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
    return;
  }
  if (format === "xls") downloadFile(`${filenameBase}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
  if (format === "doc") downloadFile(`${filenameBase}.doc`, html, "application/msword;charset=utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

function initGlobalButtons() {
  document.getElementById("saveBtn").addEventListener("click", () => saveState(true));
  document.getElementById("resetBtn").addEventListener("click", async () => {
    const project = getProject();
    const nama = project.projectInfo.projectName || "Project ini";
    if (!confirm(`Kosongkan semua data "${nama}"?\nInfo project, EIR, BEP, MIDP, TIDP, Kurva S, CDE, dan Agreement akan dihapus.\nTidak bisa dibatalkan.`)) return;
    const emptyProject = createDefaultProject(project.id, project.projectInfo.projectName);
    emptyProject.curve = []; // Kurva S dikosongkan
    state.projects[state.projects.findIndex(p => p.id === project.id)] = emptyProject;
    saveState(false);
    renderAll();
    toast("Project dikosongkan");
  });
  document.getElementById("exportBackupBtn").addEventListener("click", () => {
    downloadFile(`bima-dashboard-backup-${Date.now()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
  });
  document.getElementById("syncCurveBtn").addEventListener("click", () => syncCurveFromDeliverables(true));
  document.getElementById("autoCurveSync").addEventListener("change", (event) => {
    getProject().autoCurveSync = event.target.checked;
    saveState(false);
    renderAll();
  });
}

function updateAutoCurveCheckbox() {
  const checkbox = document.getElementById("autoCurveSync");
  if (checkbox) checkbox.checked = Boolean(getProject().autoCurveSync);
}

function initKeyboard() {
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.getElementById("rowModal").open) closeModal();
  });
}

window.addEventListener("resize", () => {
  clearTimeout(window.__chartTimer);
  window.__chartTimer = setTimeout(redrawCharts, 120);
});

const originalRenderAll = renderAll;
renderAll = function patchedRenderAll() {
  originalRenderAll();
  updateAutoCurveCheckbox();
};



// ── Mobile Drawer (Responsive) ────────────────────────────
// Tidak mengubah logic apapun, hanya mengelola drawer mobile
function initMobileDrawer() {
  const hamburger = document.getElementById("hamburgerBtn");
  const backdrop  = document.getElementById("sidebarBackdrop");
  const sidebar   = document.getElementById("sidebarEl");
  if (!hamburger || !backdrop || !sidebar) return;

  function isMobile() { return window.innerWidth <= 768; }

  function openDrawer() {
    if (!isMobile()) return;
    sidebar.classList.add("drawer-open");
    backdrop.classList.add("visible");
    hamburger.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    sidebar.classList.remove("drawer-open");
    backdrop.classList.remove("visible");
    hamburger.classList.remove("open");
    document.body.style.overflow = "";
  }

  hamburger.addEventListener("click", () => {
    sidebar.classList.contains("drawer-open") ? closeDrawer() : openDrawer();
  });
  backdrop.addEventListener("click", closeDrawer);

  // Tutup drawer saat pilih menu di mobile
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isMobile()) closeDrawer();
    });
  });

  // Reset saat resize ke desktop
  window.addEventListener("resize", () => {
    if (!isMobile()) closeDrawer();
  });
}

// ── Sidebar Mini Toggle ─────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById("sidebarEl");
  const toggleBtn = document.getElementById("sidebarToggle");
  if (!sidebar || !toggleBtn) return;

  const MINI_KEY = "bima_sidebar_mini";

  // Restore state dari localStorage
  if (localStorage.getItem(MINI_KEY) === "1") {
    sidebar.classList.add("mini");
  }

  toggleBtn.addEventListener("click", () => {
    const isMini = sidebar.classList.toggle("mini");
    localStorage.setItem(MINI_KEY, isMini ? "1" : "0");
  });
}
// Sembunyikan app dulu sampai auth selesai
document.body.style.visibility = "hidden";

document.body.dataset.section = activeTab || "overview";
initProjectControls();
initProjectPicker();
initTabs();
initAddButtons();
initSidebar();
initMobileDrawer();

initModal();
initGlobalButtons();
initKeyboard();
initCurveChartClick();

// Cek auth DULU, baru tampilkan dashboard
(async () => {
  try {
    const loggedIn = await checkAuth();
    if (!loggedIn) return;
    renderUserInfo();
    applyRoleRestrictions();
    // Tampilkan loading dulu, tunggu DB selesai baru render
    document.body.style.visibility = "visible";
    await initFromDB();   // DB-first: load dari DB, overwrite localStorage
    renderAll();          // Render setelah data DB sudah di state
    applyRoleRestrictions();
  } catch (err) {
    console.error("Init error:", err);
    // Fallback: tetap tampilkan dengan data lokal
    renderAll();
  } finally {
    document.body.style.visibility = "visible";
  }
})();
