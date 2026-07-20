const { writeLog, ACTION } = require("../logger");
// server/routes/projects.js — MySQL version
const express      = require("express");
const router       = express.Router();
const { query, getClient } = require("../db");
const { blockGuestWrite } = require("../middleware/auth");

// Guest: read-only untuk semua route di bawah ini (POST/PUT/DELETE ditolak)
router.use(blockGuestWrite);

// ── Row mappers: snake_case DB → camelCase frontend ──────
const mapEir = r => ({
  no: r.no, category: r.category, question: r.question, answer: r.answer,
  purpose: r.purpose, originator: r.originator, format: r.format,
  neededAt: r.needed_at, pic: r.pic, agreed: r.agreed === true, notes: r.notes,
});
const mapBep = r => ({
  no: r.no, topic: r.topic, agreement: r.agreement, software: r.software,
  format: r.format, naming: r.naming, review: r.review, pic: r.pic,
  agreed: r.agreed === true, notes: r.notes,
});
const mapMidp = r => ({
  no: r.no, code: r.code, name: r.name, discipline: r.discipline,
  infoType: r.info_type, format: r.format, loin: r.loin, phase: r.phase,
  deadline: r.deadline, pic: r.pic, receiver: r.receiver, status: r.status,
  realization: r.realization, notes: r.notes,
});
const mapTidp = r => ({
  no: r.no, midpCode: r.midp_code, code: r.code, name: r.name,
  infoType: r.info_type, format: r.format, loin: r.loin, phase: r.phase,
  deadline: r.deadline, pic: r.pic, discipline: r.discipline,
  status: r.status, notes: r.notes,
});
const mapCurve = r => ({
  no: r.no, label: r.label,
  planned: Number(r.planned), actual: Number(r.actual), locked: r.locked === true,
});
const mapCdeChecklist = r => ({
  no: r.no, phase: r.phase, folder: r.folder, document: r.document,
  required: !!r.required, available: !!r.available, pic: r.pic, notes: r.notes,
});
const mapCdeRegister = r => ({
  no: r.no, code: r.code, name: r.name, folder: r.folder, state: r.state,
  discipline: r.discipline, status: r.status, reviewer: r.reviewer,
  date: r.date, fileName: r.file_name, serverUrl: r.server_url, notes: r.notes,
});
const mapAgreement = r => ({
  no: r.no, docType: r.doc_type, code: r.code, name: r.name, party: r.party,
  package: r.package, value: r.value, status: r.status, date: r.date,
  fileName: r.file_name, serverUrl: r.server_url, notes: r.notes,
});

function rowToProject(row, tables = {}) {
  // PostgreSQL JSONB otomatis di-parse oleh pg driver
  const info = typeof row.project_info === "string"
    ? row.project_info
    : row.project_info;
  return {
    id:               row.id,
    projectInfo:      info,
    activeDiscipline: row.active_discipline,
    autoCurveSync:    !!row.auto_curve_sync,
    uploadEndpoint:   row.upload_endpoint || "",
    eir:              tables.eir          || [],
    bep:              tables.bep          || [],
    midp:             tables.midp         || [],
    tidp:             tables.tidp         || [],
    curve:            tables.curve        || [],
    cdeChecklist:     tables.cdeChecklist || [],
    cdeRegister:      tables.cdeRegister  || [],
    agreement:        tables.agreement    || [],
  };
}

async function fetchProjectTables(projectId) {
  const [eir, bep, midp, tidp, curve, cdeChecklist, cdeRegister, agreement] =
    await Promise.all([
      query("SELECT * FROM eir           WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM bep           WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM midp          WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM tidp          WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM curve         WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM cde_checklist WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM cde_register  WHERE project_id=$1 ORDER BY no", [projectId]),
      query("SELECT * FROM agreement     WHERE project_id=$1 ORDER BY no", [projectId]),
    ]);
  return {
    eir:          eir.rows.map(mapEir),
    bep:          bep.rows.map(mapBep),
    midp:         midp.rows.map(mapMidp),
    tidp:         tidp.rows.map(mapTidp),
    curve:        curve.rows.map(mapCurve),
    cdeChecklist: cdeChecklist.rows.map(mapCdeChecklist),
    cdeRegister:  cdeRegister.rows.map(mapCdeRegister),
    agreement:    agreement.rows.map(mapAgreement),
  };
}

// ── GET /api/projects ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    // Guest: hanya boleh lihat 1 project yang sudah ditetapkan admin
    if (req.user?.role === "guest") {
      if (!req.user.allowedProjectId) return res.json([]);
      const result = await query(
        "SELECT id, project_info, active_discipline, auto_curve_sync, upload_endpoint FROM projects WHERE id=$1",
        [req.user.allowedProjectId]
      );
      return res.json(result.rows.map(r => rowToProject(r)));
    }

    const result = await query(
      "SELECT id, project_info, active_discipline, auto_curve_sync, upload_endpoint FROM projects ORDER BY created_at ASC"
    );
    res.json(result.rows.map(r => rowToProject(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/projects/:id ─────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    // Guest: hanya boleh akses project miliknya sendiri
    if (req.user?.role === "guest" && req.params.id !== req.user.allowedProjectId) {
      return res.status(403).json({ error: "Akun guest tidak punya akses ke project ini", code: "PROJECT_FORBIDDEN" });
    }

    const result = await query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Project tidak ditemukan" });
    const tables = await fetchProjectTables(req.params.id);
    res.json(rowToProject(result.rows[0], tables));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/projects ────────────────────────────────────
router.post("/", async (req, res) => {
  const { id, projectInfo, activeDiscipline, autoCurveSync, uploadEndpoint } = req.body;
  try {
    await query(
      `INSERT INTO projects (id, project_info, active_discipline, auto_curve_sync, upload_endpoint)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, JSON.stringify(projectInfo || {}), activeDiscipline || "Semua", !!autoCurveSync, uploadEndpoint || ""]
    );
    const result = await query("SELECT * FROM projects WHERE id=$1", [id]);
    writeLog(req, ACTION.PROJECT_CREATE, "project", { projectId: id, projectName: (projectInfo||{}).projectName||id, detail: "Buat project baru" });
    res.status(201).json(rowToProject(result.rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Project ID sudah ada" });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/projects/:id ─────────────────────────────────
router.put("/:id", async (req, res) => {
  const { projectInfo, activeDiscipline, autoCurveSync, uploadEndpoint } = req.body;
  try {
    await query(
      `UPDATE projects SET project_info=$1, active_discipline=$2, auto_curve_sync=$3, upload_endpoint=$4
       WHERE id=$5`,
      [JSON.stringify(projectInfo || {}), activeDiscipline || "Semua", !!autoCurveSync, uploadEndpoint || "", req.params.id]
    );
    const result = await query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Project tidak ditemukan" });
    res.json(rowToProject(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/projects/:id ──────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM projects WHERE id=$1", [req.params.id]);
    if (result.rows[0]?.rowCount === 0)
      return res.status(404).json({ error: "Project tidak ditemukan" });
    writeLog(req, ACTION.PROJECT_DELETE, "project", { projectId: req.params.id, detail: "Hapus project" });
    res.json({ deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/projects/:id/sync ───────────────────────────
// Simpan seluruh state project sekaligus (bulk replace)
router.post("/:id/sync", async (req, res) => {
  const projectId = req.params.id;
  const data      = req.body;
  const client    = await getClient();

  try {
    // Update project meta
    await client.query(
      `UPDATE projects SET project_info=$1, active_discipline=$2, auto_curve_sync=$3, upload_endpoint=$4
       WHERE id=$5`,
      [JSON.stringify(data.projectInfo || {}), data.activeDiscipline || "Semua",
       !!data.autoCurveSync, data.uploadEndpoint || "", projectId]
    );

    // Hapus semua child rows lalu insert ulang
    for (const tbl of ["eir","bep","midp","tidp","curve","cde_checklist","cde_register","agreement"]) {
      await client.query(`DELETE FROM ${tbl} WHERE project_id=$1`, [projectId]);
    }

    // ── Insert EIR ──
    for (const r of (data.eir || [])) {
      await client.query(
        `INSERT INTO eir (project_id,no,category,question,answer,purpose,originator,format,needed_at,pic,agreed,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [projectId,r.no,r.category,r.question,r.answer,r.purpose,
         r.originator,r.format,r.neededAt,r.pic,!!r.agreed,r.notes]
      );
    }

    // ── Insert BEP ──
    for (const r of (data.bep || [])) {
      await client.query(
        `INSERT INTO bep (project_id,no,topic,agreement,software,format,naming,review,pic,agreed,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [projectId,r.no,r.topic,r.agreement,r.software,r.format,
         r.naming,r.review,r.pic,!!r.agreed,r.notes]
      );
    }

    // ── Insert MIDP ──
    for (const r of (data.midp || [])) {
      await client.query(
        `INSERT INTO midp (project_id,no,code,name,discipline,info_type,format,loin,phase,deadline,pic,receiver,status,realization,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [projectId,r.no,r.code,r.name,r.discipline,r.infoType,
         r.format,r.loin,r.phase,r.deadline,r.pic,r.receiver,
         r.status,r.realization,r.notes]
      );
    }

    // ── Insert TIDP ──
    for (const r of (data.tidp || [])) {
      await client.query(
        `INSERT INTO tidp (project_id,no,midp_code,code,name,info_type,format,loin,phase,deadline,pic,discipline,status,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [projectId,r.no,r.midpCode,r.code,r.name,r.infoType,
         r.format,r.loin,r.phase,r.deadline,r.pic,r.discipline,
         r.status,r.notes]
      );
    }

    // ── Insert Curve ──
    for (const r of (data.curve || [])) {
      await client.query(
        `INSERT INTO curve (project_id,no,label,planned,actual,locked)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [projectId,r.no,r.label,r.planned||0,r.actual||0,!!r.locked]
      );
    }

    // ── Insert CDE Checklist ──
    for (const r of (data.cdeChecklist || [])) {
      await client.query(
        `INSERT INTO cde_checklist (project_id,no,phase,folder,document,required,available,pic,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [projectId,r.no,r.phase,r.folder,r.document,
         !!r.required,!!r.available,r.pic,r.notes]
      );
    }

    // ── Insert CDE Register ──
    for (const r of (data.cdeRegister || [])) {
      await client.query(
        `INSERT INTO cde_register (project_id,no,code,name,folder,state,discipline,status,reviewer,date,file_name,server_url,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [projectId,r.no,r.code,r.name,r.folder,r.state,
         r.discipline,r.status,r.reviewer,r.date,
         r.fileName,r.serverUrl,r.notes]
      );
    }

    // ── Insert Agreement ──
    for (const r of (data.agreement || [])) {
      await client.query(
        `INSERT INTO agreement (project_id,no,doc_type,code,name,party,package,value,status,date,file_name,server_url,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [projectId,r.no,r.docType,r.code,r.name,r.party,
         r.package,r.value,r.status,r.date,
         r.fileName,r.serverUrl,r.notes]
      );
    }

    await client.commit();
    writeLog(req, ACTION.SYNC_DATA, "project", { projectId, projectName: (data.projectInfo||{}).projectName||projectId, detail: "Simpan data project" });
    res.json({ ok: true, projectId });
  } catch (err) {
    await client.rollback();
    console.error("Sync error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
