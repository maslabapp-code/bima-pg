// server/db.js - Koneksi PostgreSQL
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");

let password = process.env.DB_PASSWORD;
if (password === "" || password === undefined) password = undefined;

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "bima_db",
  user:     process.env.DB_USER     || "postgres",
  password,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("connect", () => {
  if (process.env.NODE_ENV !== "production") console.log("✅ Terhubung ke PostgreSQL");
});
pool.on("error", (err) => console.error("❌ PostgreSQL error:", err.message));

async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (err) {
    console.error("DB Query Error:", err.message);
    throw err;
  }
}

async function getClient() {
  const client = await pool.connect();
  await client.query("BEGIN");
  return {
    query:    async (sql, params = []) => client.query(sql, params),
    commit:   () => client.query("COMMIT"),
    rollback: () => client.query("ROLLBACK"),
    release:  () => client.release(),
  };
}

module.exports = { pool, query, getClient };
