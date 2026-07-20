// server/routes/auth.js
const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { query } = require("../db");
const { requireAuth, requireAdmin, JWT_SECRET } = require("../middleware/auth");
const { writeLog, ACTION } = require("../logger");

const JWT_EXPIRES  = process.env.JWT_EXPIRES || "8h";
if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET tidak diset di .env!');
const COOKIE_OPTS  = {
  httpOnly: true,
  sameSite: "lax",
  secure:   process.env.NODE_ENV === "production",
  maxAge:   8 * 60 * 60 * 1000, // 8 jam ms
};

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, allowedProjectId: user.allowed_project_id || null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// ── POST /api/auth/login ──────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username dan password wajib diisi" });

  try {
    const result = await query(
      "SELECT * FROM users WHERE (username=$1 OR email=$2) AND is_active=TRUE LIMIT 1",
      [username, username]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Username atau password salah" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Username atau password salah" });

    // Update last_login
    await query("UPDATE users SET last_login=NOW() WHERE id=$1", [user.id]);

    const token = makeToken(user);
    res.cookie("bima_token", token, COOKIE_OPTS);
    writeLog(req, ACTION.LOGIN, "auth", { detail: `Login berhasil` });
    res.json({
      ok: true,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, allowedProjectId: user.allowed_project_id || null }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────
router.post("/logout", (req, res) => {
  writeLog(req, ACTION.LOGOUT, "auth", { detail: "Logout" });
  res.clearCookie("bima_token");
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, username, email, full_name, role, allowed_project_id, last_login FROM users WHERE id=$1",
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User tidak ditemukan" });
    const u = result.rows[0];
    res.json({ id: u.id, username: u.username, email: u.email, fullName: u.full_name, role: u.role, allowedProjectId: u.allowed_project_id || null, lastLogin: u.last_login });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/users  (admin only) ────────────────────
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, username, email, full_name, role, allowed_project_id, is_active, last_login, created_at FROM users ORDER BY created_at ASC"
    );
    res.json(result.rows.map(u => ({
      id: u.id, username: u.username, email: u.email,
      fullName: u.full_name, role: u.role, allowedProjectId: u.allowed_project_id || null,
      isActive: u.is_active === true || u.is_active === 't', lastLogin: u.last_login, createdAt: u.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/users  (admin: buat user baru) ────────
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, email, password, fullName, role, allowedProjectId } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "Username, email, dan password wajib diisi" });
  if (!["admin","user","guest"].includes(role))
    return res.status(400).json({ error: "Role harus 'admin', 'user', atau 'guest'" });
  if (role === "guest" && !allowedProjectId)
    return res.status(400).json({ error: "Akun guest wajib ditetapkan ke 1 project" });

  try {
    const hash = await bcrypt.hash(password, 12);
    await query(
      "INSERT INTO users (username, email, password_hash, full_name, role, allowed_project_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [username.trim(), email.trim().toLowerCase(), hash, fullName || username, role, role === "guest" ? allowedProjectId : null]
    );
    const result = await query("SELECT id, username, email, full_name, role, allowed_project_id FROM users WHERE username=$1", [username]);
    const u = result.rows[0];
    writeLog(req, ACTION.USER_CREATE, "user", { detail: `Membuat user: ${username} (${role})` });
    res.status(201).json({ id: u.id, username: u.username, email: u.email, fullName: u.full_name, role: u.role, allowedProjectId: u.allowed_project_id || null });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username atau email sudah dipakai" });
    if (err.code === "23503") return res.status(400).json({ error: "Project yang dipilih tidak ditemukan" });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/users/:id  (admin: edit user) ──────────
router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { fullName, email, role, isActive, password, allowedProjectId } = req.body;
  if (role && !["admin","user","guest"].includes(role))
    return res.status(400).json({ error: "Role harus 'admin', 'user', atau 'guest'" });
  if (role === "guest" && !allowedProjectId)
    return res.status(400).json({ error: "Akun guest wajib ditetapkan ke 1 project" });
  const projectId = role === "guest" ? allowedProjectId : null;

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await query(
        "UPDATE users SET full_name=$1, email=$2, role=$3, is_active=$4, password_hash=$5, allowed_project_id=$6, updated_at=NOW() WHERE id=$7",
        [fullName, email?.toLowerCase(), role, !!isActive, hash, projectId, req.params.id]
      );
    } else {
      await query(
        "UPDATE users SET full_name=$1, email=$2, role=$3, is_active=$4, allowed_project_id=$5, updated_at=NOW() WHERE id=$6",
        [fullName, email?.toLowerCase(), role, !!isActive, projectId, req.params.id]
      );
    }
    writeLog(req, ACTION.USER_UPDATE, "user", { detail: `Update user ID: ${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email sudah dipakai" });
    if (err.code === "23503") return res.status(400).json({ error: "Project yang dipilih tidak ditemukan" });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/users/:id  (admin: hapus user) ──────
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  // Cegah hapus diri sendiri
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });
  try {
    await query("DELETE FROM users WHERE id=$1", [req.params.id]);
    writeLog(req, ACTION.USER_DELETE, "user", { detail: `Hapus user ID: ${req.params.id}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/change-password  (user sendiri) ────────
router.put("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "Password lama dan baru wajib diisi" });
  if (newPassword.length < 6)
    return res.status(400).json({ error: "Password baru minimal 6 karakter" });
  try {
    const result = await query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: "Password lama salah" });
    const hash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2", [hash, req.user.id]);
    writeLog(req, ACTION.CHANGE_PASSWORD, "user", { detail: "Ganti password" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
