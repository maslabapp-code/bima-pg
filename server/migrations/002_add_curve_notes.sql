-- ============================================================
-- Migrasi: Tambah kolom 'notes' (Keterangan) ke tabel curve
-- Sebelumnya kolom ini tidak ada sama sekali di skema, sehingga
-- input "Keterangan (Item Terkait)" pada popup edit Kurva S
-- selalu gagal tersimpan secara diam-diam (silent data loss).
-- Aman dijalankan ulang (idempotent).
-- ============================================================

ALTER TABLE curve ADD COLUMN IF NOT EXISTS notes TEXT;

SELECT 'Migrasi selesai. Kolom notes pada tabel curve siap dipakai.' AS status;
