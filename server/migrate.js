// server/migrate.js — jalankan file SQL di server/migrations/ secara berurutan
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const fs = require("fs");
const { Pool } = require("pg");

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || undefined,
    database: process.env.DB_NAME || "bima_db",
  });

  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

  console.log(`🔧 Menjalankan ${files.length} file migrasi...\n`);
  for (const file of files) {
    console.log(`→ ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await pool.query(sql);
      console.log(`  ✅ Berhasil\n`);
    } catch (err) {
      console.error(`  ❌ Gagal: ${err.message}\n`);
      process.exit(1);
    }
  }

  console.log("🎉 Semua migrasi selesai.");
  await pool.end();
}

run();
