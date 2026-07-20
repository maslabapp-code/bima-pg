// server/logger.js
// Helper untuk mencatat activity log ke database

const { query } = require("./db");

/**
 * Tulis satu baris log
 * @param {object} req        - Express request (untuk ambil user & IP)
 * @param {string} action     - Kode aksi: LOGIN, LOGOUT, SYNC_DATA, dll
 * @param {string} target     - Obyek yang dikenai aksi: nama tabel, "user", dll
 * @param {object} opts       - Opsional: { projectId, projectName, detail }
 */
async function writeLog(req, action, target = "", opts = {}) {
  try {
    const user = req.user || {};
    const ip   = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
               || req.socket?.remoteAddress
               || null;

    await query(
      `INSERT INTO activity_logs
         (user_id, username, role, action, target, project_id, project_name, detail, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        user.id       || null,
        user.username || "system",
        user.role     || "user",
        action,
        target,
        opts.projectId   || null,
        opts.projectName || null,
        opts.detail      || null,
        ip,
      ]
    );
  } catch (err) {
    // Log gagal tidak boleh crash server
    console.error("Logger error:", err.message);
  }
}

// ── Konstanta aksi ────────────────────────────────────────
const ACTION = {
  LOGIN:          "LOGIN",
  LOGOUT:         "LOGOUT",
  PROJECT_CREATE: "PROJECT_CREATE",
  PROJECT_DELETE: "PROJECT_DELETE",
  SYNC_DATA:      "SYNC_DATA",
  UPLOAD_FILE:    "UPLOAD_FILE",
  USER_CREATE:    "USER_CREATE",
  USER_UPDATE:    "USER_UPDATE",
  USER_DELETE:    "USER_DELETE",
  CHANGE_PASSWORD:"CHANGE_PASSWORD",
};

module.exports = { writeLog, ACTION };
