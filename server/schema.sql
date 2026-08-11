-- ============================================================
-- BIMA Dashboard - PostgreSQL Schema
-- ============================================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id                VARCHAR(64)  PRIMARY KEY,
  project_info      JSONB        NOT NULL DEFAULT '{}',
  active_discipline VARCHAR(100) NOT NULL DEFAULT 'Semua',
  auto_curve_sync   BOOLEAN      NOT NULL DEFAULT FALSE,
  upload_endpoint   TEXT         NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  username           VARCHAR(80)  NOT NULL UNIQUE,
  email              VARCHAR(160) NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  full_name          VARCHAR(160) NOT NULL DEFAULT '',
  role               VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','guest')),
  allowed_project_id VARCHAR(64)  REFERENCES projects(id) ON DELETE SET NULL,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- EIR
CREATE TABLE IF NOT EXISTS eir (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  category   TEXT, question TEXT, answer TEXT, purpose TEXT,
  originator TEXT, format TEXT, needed_at TEXT, pic TEXT,
  agreed     BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BEP
CREATE TABLE IF NOT EXISTS bep (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  topic TEXT, agreement TEXT, software TEXT, format TEXT,
  naming TEXT, review TEXT, pic TEXT,
  agreed     BOOLEAN NOT NULL DEFAULT FALSE, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MIDP
CREATE TABLE IF NOT EXISTS midp (
  id          SERIAL PRIMARY KEY,
  project_id  VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no          INTEGER NOT NULL,
  code TEXT, name TEXT, discipline TEXT, info_type TEXT,
  format TEXT, loin TEXT, phase TEXT, deadline TEXT,
  pic TEXT, receiver TEXT,
  status      TEXT NOT NULL DEFAULT 'Belum Mulai',
  realization TEXT, notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TIDP
CREATE TABLE IF NOT EXISTS tidp (
  id          SERIAL PRIMARY KEY,
  project_id  VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no          INTEGER NOT NULL,
  midp_code TEXT, code TEXT, name TEXT, info_type TEXT,
  format TEXT, loin TEXT, phase TEXT, deadline TEXT,
  pic TEXT, discipline TEXT,
  status      TEXT NOT NULL DEFAULT 'Belum Mulai',
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Curve
CREATE TABLE IF NOT EXISTS curve (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  label TEXT,
  planned    NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual     NUMERIC(10,2) NOT NULL DEFAULT 0,
  locked     BOOLEAN NOT NULL DEFAULT FALSE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CDE Checklist
CREATE TABLE IF NOT EXISTS cde_checklist (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  phase TEXT, folder TEXT, document TEXT,
  required   BOOLEAN NOT NULL DEFAULT FALSE,
  available  BOOLEAN NOT NULL DEFAULT FALSE,
  pic TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CDE Register
CREATE TABLE IF NOT EXISTS cde_register (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  code TEXT, name TEXT, folder TEXT, state TEXT,
  discipline TEXT,
  status     TEXT NOT NULL DEFAULT 'Internal Review',
  reviewer TEXT, date TEXT, file_name TEXT, server_url TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agreement
CREATE TABLE IF NOT EXISTS agreement (
  id         SERIAL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,
  doc_type TEXT, code TEXT, name TEXT, party TEXT,
  package TEXT, value TEXT,
  status     TEXT NOT NULL DEFAULT 'Draft',
  date TEXT, file_name TEXT, server_url TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER,
  username     VARCHAR(80)  NOT NULL DEFAULT 'system',
  role         VARCHAR(20)  NOT NULL DEFAULT 'user',
  action       VARCHAR(50)  NOT NULL,
  target       VARCHAR(100) NOT NULL DEFAULT '',
  project_id   VARCHAR(64),
  project_name VARCHAR(200),
  detail       TEXT,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eir_project          ON eir(project_id);
CREATE INDEX IF NOT EXISTS idx_bep_project          ON bep(project_id);
CREATE INDEX IF NOT EXISTS idx_midp_project         ON midp(project_id);
CREATE INDEX IF NOT EXISTS idx_tidp_project         ON tidp(project_id);
CREATE INDEX IF NOT EXISTS idx_curve_project        ON curve(project_id);
CREATE INDEX IF NOT EXISTS idx_cde_checklist_proj   ON cde_checklist(project_id);
CREATE INDEX IF NOT EXISTS idx_cde_register_proj    ON cde_register(project_id);
CREATE INDEX IF NOT EXISTS idx_agreement_project    ON agreement(project_id);
CREATE INDEX IF NOT EXISTS idx_users_username       ON users(username);
CREATE INDEX IF NOT EXISTS idx_log_user             ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_log_action           ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_log_created          ON activity_logs(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
