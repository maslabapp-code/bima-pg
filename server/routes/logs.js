// server/routes/logs.js — PostgreSQL version
const express = require("express");
const router  = express.Router();
const { query } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth, requireAdmin);

// ── GET /api/logs ─────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || "1"));
    const limit  = Math.min(100, parseInt(req.query.limit || "50"));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    function addParam(val) {
      params.push(val);
      return `$${params.length}`;
    }

    if (req.query.user_id)   conditions.push(`user_id = ${addParam(req.query.user_id)}`);
    if (req.query.action)    conditions.push(`action = ${addParam(req.query.action)}`);
    if (req.query.date_from) conditions.push(`created_at >= ${addParam(req.query.date_from + " 00:00:00")}`);
    if (req.query.date_to)   conditions.push(`created_at <= ${addParam(req.query.date_to + " 23:59:59")}`);
    if (req.query.search) {
      const like = `%${req.query.search}%`;
      const p1 = addParam(like), p2 = addParam(like), p3 = addParam(like);
      conditions.push(`(username ILIKE ${p1} OR project_name ILIKE ${p2} OR detail ILIKE ${p3})`);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    // Total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM activity_logs ${where}`, params
    );
    const total = parseInt(countResult.rows[0].total);

    // Data dengan limit & offset
    const pLimit  = addParam(limit);
    const pOffset = addParam(offset);
    const dataResult = await query(
      `SELECT * FROM activity_logs ${where}
       ORDER BY created_at DESC
       LIMIT ${pLimit} OFFSET ${pOffset}`,
      params
    );

    res.json({
      data:       dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/logs/actions ─────────────────────────────────
router.get("/actions", async (_req, res) => {
  try {
    const result = await query(
      "SELECT DISTINCT action FROM activity_logs ORDER BY action ASC"
    );
    res.json(result.rows.map(r => r.action));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/logs/users ───────────────────────────────────
router.get("/users", async (_req, res) => {
  try {
    const result = await query(
      "SELECT DISTINCT user_id, username FROM activity_logs WHERE user_id IS NOT NULL ORDER BY username ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/logs/old ──────────────────────────────────
router.delete("/old", async (_req, res) => {
  try {
    const countRes = await query(
      "SELECT COUNT(*) as cnt FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days'"
    );
    const deleted = parseInt(countRes.rows[0].cnt || 0);
    await query("DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days'");
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
