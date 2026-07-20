/**
 * BIMA Domain Lock
 * Pasang di server/index.js project BIMA client
 *
 * Cara pakai:
 *   const domainLock = require("./domain-lock");
 *   app.use(domainLock);
 */

// ── Daftar domain yang diizinkan ──────────────────────────────────────────────
const ALLOWED_DOMAINS = [
  "bima.bumirekayasamandiri.co.id",  // server utama BRM
  // tambah domain client di sini:
  // "bima.clienta.co.id",
  // "bima.clientb.com",
];

// ── HTML halaman block ────────────────────────────────────────────────────────
function blockPage(domain) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BIMA — Akses Ditolak</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#F0F4FB;display:flex;
         align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .card{background:#fff;border-radius:20px;padding:48px 40px;max-width:460px;
          width:100%;text-align:center;box-shadow:0 20px 60px rgba(14,74,168,.12)}
    .icon{font-size:56px;margin-bottom:16px}
    h1{color:#0E4AA8;font-size:22px;margin-bottom:10px}
    p{color:#6F7C87;font-size:14px;line-height:1.6;margin-bottom:8px}
    .domain{background:#FFF0EF;color:#D93025;border-radius:10px;
            padding:10px 16px;font-size:13px;font-weight:700;margin:16px 0;
            font-family:monospace}
    .contact{background:#EAF2FE;border-radius:10px;padding:14px 16px;
             font-size:13px;color:#0E4AA8;margin-top:16px}
    .contact strong{display:block;margin-bottom:4px;font-size:14px}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Akses Tidak Diizinkan</h1>
    <p>Aplikasi BIMA Dashboard tidak berlisensi untuk domain ini.</p>
    <div class="domain">${domain}</div>
    <p>Hubungi BRM untuk mendapatkan lisensi resmi.</p>
    <div class="contact">
      <strong>PT. Bumi Rekayasa Mandiri</strong>
      bima.bumirekayasamandiri.co.id
    </div>
  </div>
</body>
</html>`;
}

// ── Middleware ────────────────────────────────────────────────────────────────
module.exports = function domainLock(req, res, next) {
  const host = (req.headers.host || "").split(":")[0].toLowerCase().trim();

  // Izinkan akses lokal untuk development
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
  if (isLocal) return next();

  // Cek apakah domain terdaftar
  if (ALLOWED_DOMAINS.includes(host)) return next();

  // Domain tidak diizinkan
  if (req.path.startsWith("/api/")) {
    return res.status(403).json({ error: "Domain tidak berlisensi" });
  }
  return res.status(403).send(blockPage(host));
};
