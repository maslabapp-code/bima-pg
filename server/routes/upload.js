// server/routes/upload.js
const express = require("express");
const { requireAuth, blockGuestWrite } = require("../middleware/auth");
const { writeLog, ACTION } = require("../logger");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

// Guest: read-only, tidak boleh upload/hapus file sama sekali
router.use(blockGuestWrite);

// ── Konfigurasi storage: local (default) atau minio ──
const MEDIA_DISK = (process.env.MEDIA_DISK || "local").toLowerCase();
const isMinio = MEDIA_DISK === "minio" || MEDIA_DISK === "s3";

const UPLOAD_DIR = path.join(__dirname, "../../", process.env.UPLOAD_DIR || "uploads");

let minioClient = null;
let ensureBucketReady = Promise.resolve();
const MINIO_BUCKET = process.env.MINIO_BUCKET;

if (isMinio) {
  const Minio = require("minio");
  const endpointUrl = new URL(process.env.MINIO_ENDPOINT);

  minioClient = new Minio.Client({
    endPoint: endpointUrl.hostname,
    port: endpointUrl.port ? parseInt(endpointUrl.port, 10) : (endpointUrl.protocol === "https:" ? 443 : 80),
    useSSL: endpointUrl.protocol === "https:",
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    region: process.env.MINIO_REGION || "us-east-1",
  });

  // Pastikan bucket ada & bisa diakses publik (read-only) supaya URL file bisa dibuka langsung
  ensureBucketReady = (async () => {
    try {
      const exists = await minioClient.bucketExists(MINIO_BUCKET);
      if (!exists) {
        await minioClient.makeBucket(MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
        console.log(`✅ Bucket MinIO "${MINIO_BUCKET}" berhasil dibuat`);
      }
      const policy = {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
        }],
      };
      await minioClient.setBucketPolicy(MINIO_BUCKET, JSON.stringify(policy));
      console.log(`✅ MinIO siap. Endpoint: ${process.env.MINIO_ENDPOINT} | Bucket: ${MINIO_BUCKET}`);
    } catch (err) {
      console.error("⚠️  Gagal menyiapkan bucket MinIO:", err.message);
    }
  })();
} else {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// multer: pakai memory storage kalau MinIO (file di-buffer lalu di-push ke bucket),
// pakai disk storage kalau lokal (perilaku lama, tidak berubah).
const storage = isMinio
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const ts   = Date.now();
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${ts}_${safe}`);
      },
    });

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function buildObjectName(originalname) {
  const ts   = Date.now();
  const safe = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ts}_${safe}`;
}

function minioPublicUrl(objectName) {
  const base = process.env.MINIO_ENDPOINT.replace(/\/$/, "");
  return `${base}/${MINIO_BUCKET}/${objectName}`;
}

// POST /api/upload
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Tidak ada file yang dikirim" });

  try {
    if (isMinio) {
      await ensureBucketReady;
      const objectName = buildObjectName(req.file.originalname);

      await minioClient.putObject(
        MINIO_BUCKET,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype || "application/octet-stream" }
      );

      const fileUrl = minioPublicUrl(objectName);
      writeLog(req, ACTION.UPLOAD_FILE, "upload", { detail: `Upload ke MinIO: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)` });
      return res.json({ ok: true, fileName: req.file.originalname, url: fileUrl, size: req.file.size });
    }

    // ── Local storage (perilaku lama) ──
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    writeLog(req, ACTION.UPLOAD_FILE, "upload", { detail: `Upload: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)` });
    res.json({ ok: true, fileName: req.file.originalname, url: fileUrl, size: req.file.size });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: "Gagal upload file: " + err.message });
  }
});

// DELETE /api/upload
// Body: { url: "http://.../uploads/filename.pdf" } atau URL MinIO
router.delete("/", requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL file wajib diisi" });

    if (isMinio) {
      const marker = `/${MINIO_BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx === -1) {
        return res.json({ ok: true, note: "URL bukan file MinIO, dilewati" });
      }
      const objectName = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
      try {
        await minioClient.removeObject(MINIO_BUCKET, objectName);
      } catch (e) {
        console.warn("Gagal hapus objek MinIO (mungkin sudah tidak ada):", e.message);
      }
      return res.json({ ok: true, deleted: objectName });
    }

    // ── Local storage (perilaku lama) ──
    const filename = path.basename(url.split("?")[0]);
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Nama file tidak valid" });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, note: "File tidak ditemukan, mungkin sudah dihapus" });
    }

    fs.unlinkSync(filePath);
    res.json({ ok: true, deleted: filename });
  } catch (err) {
    console.error("Delete file error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
