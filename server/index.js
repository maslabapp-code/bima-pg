// server/index.js - BIMA Backend MySQL + Auth
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express      = require("express");
const cors         = require("cors");
const cookieParser = require("cookie-parser");
const path         = require("path");
const fs           = require("fs");

const projectsRouter = require("./routes/projects");
const uploadRouter   = require("./routes/upload");
const authRouter     = require("./routes/auth");
const logsRouter     = require("./routes/logs");
const { requireAuth } = require("./middleware/auth");
const domainLock = require("./domain");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3001",
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true,   // ← wajib untuk cookie
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(domainLock);

// ── Static files ──
const UPLOAD_DIR  = path.join(__dirname, "../", process.env.UPLOAD_DIR || "uploads");
const FRONTEND_DIR = path.join(__dirname, "../frontend");
app.use("/uploads", express.static(UPLOAD_DIR));

// Login page disajikan tanpa auth
app.use(express.static(FRONTEND_DIR));

// ── API Routes ──
app.use("/api/auth",     authRouter);
app.use("/api/projects", requireAuth, projectsRouter);  // ← semua project butuh login
app.use("/api/upload",   requireAuth, uploadRouter);
app.use("/api/logs",     logsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: "postgresql", time: new Date().toISOString() });
});

// ── Fallback: semua route → index.html (SPA) ──
// Login page (login.html) ditangani static, dashboard (index.html) juga
app.get("*", (_req, res) => {
  const indexPath = path.join(FRONTEND_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ error: "Frontend belum dikopi ke folder frontend/" });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: err.message });
});

// Auto hapus log > 90 hari saat server start
(async () => {
  try {
    const { query } = require("./db");
    const r = await query("DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days'");
    const del = r.rows[0]?.affectedRows || 0;
    if (del > 0) console.log(`🧹 Auto-hapus ${del} log lama (>90 hari)`);
  } catch (_) {}
})();

app.listen(PORT, () => {
  console.log(`\n🚀 BIMA berjalan di http://localhost:${PORT}`);
  console.log(`   Login    : http://localhost:${PORT}/login.html`);
  console.log(`   Dashboard: http://localhost:${PORT}/`);
  console.log(`   API Auth : http://localhost:${PORT}/api/auth`);
  console.log(`   phpMyAdmin: http://localhost/phpmyadmin\n`);
});
