// server/db-init.js - PostgreSQL
const path    = require("path");
const envPath = path.join(__dirname, "../.env");
require("dotenv").config({ path: envPath });
const { Pool } = require("pg");
const fs      = require("fs");

function getConfig() {
  let password = process.env.DB_PASSWORD;
  if (password === "" || password === undefined) password = undefined;
  return {
    host:   process.env.DB_HOST || "localhost",
    port:   parseInt(process.env.DB_PORT || "5432"),
    user:   process.env.DB_USER || "postgres",
    password,
    dbName: process.env.DB_NAME || "bima_db",
  };
}

async function init() {
  const cfg = getConfig();
  console.log("🔧 Inisialisasi database BIMA (PostgreSQL)...\n");
  console.log(`   Host     : ${cfg.host}:${cfg.port}`);
  console.log(`   User     : ${cfg.user}`);
  console.log(`   Password : ${cfg.password ? "***" : "(kosong)"}`);
  console.log(`   Database : ${cfg.dbName}\n`);

  // Koneksi ke database 'postgres' dulu untuk buat database baru
  const adminPool = new Pool({ ...cfg, database: "postgres" });
  try {
    await adminPool.query("SELECT 1");
    console.log("✅ Koneksi ke PostgreSQL berhasil");

    const check = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname=$1", [cfg.dbName]
    );
    if (check.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${cfg.dbName}"`);
      console.log(`✅ Database "${cfg.dbName}" dibuat`);
    } else {
      console.log(`ℹ️  Database "${cfg.dbName}" sudah ada`);
    }
  } catch (err) {
    console.error("❌ Gagal konek PostgreSQL:", err.message);
    if (err.message.includes("password") || err.message.includes("SASL")) {
      console.error("   → Cek DB_PASSWORD di file .env");
    } else if (err.message.includes("ECONNREFUSED")) {
      console.error("   → PostgreSQL tidak berjalan. Jalankan: sudo systemctl start postgresql");
    }
    process.exit(1);
  } finally {
    await adminPool.end();
  }

  // Jalankan schema di database target
  const dbPool = new Pool({ ...cfg, database: cfg.dbName });
  try {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await dbPool.query(sql);
    console.log("✅ Semua tabel berhasil dibuat");

    // Seed admin
    const bcrypt     = require("bcryptjs");
    const adminUser  = process.env.ADMIN_USERNAME || "admin";
    const adminPass  = process.env.ADMIN_PASSWORD || "admin123";
    const adminEmail = process.env.ADMIN_EMAIL    || "admin@bima.local";

    const exists = await dbPool.query("SELECT id FROM users WHERE username=$1", [adminUser]);
    if (exists.rowCount === 0) {
      const hash = await bcrypt.hash(adminPass, 12);
      await dbPool.query(
        "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5)",
        [adminUser, adminEmail, hash, "Administrator", "admin"]
      );
      console.log(`\n✅ Akun admin dibuat: ${adminUser} / ${adminPass}`);
      console.log("   ⚠️  Ganti password setelah login pertama!\n");
    } else {
      console.log(`\nℹ️  Akun admin "${adminUser}" sudah ada`);
    }

    console.log("🎉 Database BIMA siap!");
    console.log("   Jalankan : npm run dev");
    console.log("   Login    : http://localhost:3001/login.html\n");
  } catch (err) {
    console.error("❌ Gagal jalankan schema:", err.message);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

init();
