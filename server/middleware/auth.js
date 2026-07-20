// server/middleware/auth.js
// Verifikasi JWT dari cookie atau Authorization header

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "bima_dev_secret_ganti_ini";

// ── Wajib login ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const token =
    req.cookies?.bima_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: "Belum login", code: "UNAUTHORIZED" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role, full_name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sesi expired, silakan login ulang", code: "TOKEN_EXPIRED" });
  }
}

// ── Wajib role admin ──────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Akses ditolak, butuh hak admin", code: "FORBIDDEN" });
  }
  next();
}

// ── Guest: hanya boleh GET (read-only), tidak boleh ubah apapun ──
function blockGuestWrite(req, res, next) {
  if (req.user?.role === "guest" && req.method !== "GET") {
    return res.status(403).json({ error: "Akun guest hanya bisa melihat, tidak bisa mengubah data", code: "GUEST_READ_ONLY" });
  }
  next();
}

// ── Guest: hanya boleh akses project yang ditentukan admin ──
function restrictGuestProject(req, res, next) {
  if (req.user?.role !== "guest") return next();

  if (!req.user.allowedProjectId) {
    return res.status(403).json({ error: "Akun guest belum ditetapkan ke project manapun. Hubungi admin.", code: "NO_PROJECT_ASSIGNED" });
  }

  // Untuk route dengan :id (mis. GET /api/projects/:id), pastikan match
  const targetId = req.params?.id;
  if (targetId && targetId !== req.user.allowedProjectId) {
    return res.status(403).json({ error: "Akun guest tidak punya akses ke project ini", code: "PROJECT_FORBIDDEN" });
  }

  next();
}

module.exports = { requireAuth, requireAdmin, blockGuestWrite, restrictGuestProject, JWT_SECRET };
