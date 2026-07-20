-- ============================================================
-- Migrasi: Tambah role 'guest' + pembatasan 1 project
-- Jalankan SEKALI di database yang SUDAH ADA (sudah pernah db:init).
-- Aman dijalankan ulang (idempotent).
-- ============================================================

-- 1) Longgarkan constraint role supaya 'guest' diizinkan
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','user','guest'));

-- 2) Kolom project yang boleh diakses guest (NULL untuk admin/user biasa)
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_project_id VARCHAR(64);

-- 3) Foreign key ke projects (biar konsisten & auto ke-NULL kalau project dihapus)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_allowed_project_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_allowed_project_id_fkey
      FOREIGN KEY (allowed_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

SELECT 'Migrasi selesai. Role guest siap dipakai.' AS status;
