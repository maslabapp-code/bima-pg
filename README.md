# BIMA Dashboard — Backend PostgreSQL

Panduan menghubungkan BIMA Dashboard ke PostgreSQL.

---

## Struktur Folder

```
bima-backend-postgre/
├── frontend/              ← Taruh file frontend di sini
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── favicon.ico
│   └── assets/
├── server/
│   ├── index.js           ← Entry point server
│   ├── db.js              ← Koneksi PostgreSQL
│   ├── db-init.js         ← Buat database & tabel otomatis
│   ├── schema.sql         ← Skema tabel PostgreSQL
│   ├── logger.js          ← Activity log helper
│   ├── middleware/
│   │   └── auth.js        ← JWT middleware
│   └── routes/
│       ├── projects.js
│       ├── auth.js
│       ├── logs.js
│       ├── upload.js
│       └── upload-cloudinary.js
├── uploads/               ← File upload lokal (dibuat otomatis)
├── .env.example
├── .env                   ← Buat dari .env.example
├── package.json
└── README.md
```

---

## Langkah Setup (Lokal / Windows)

### 1. Install Node.js

Download dari https://nodejs.org (pilih LTS).
Cek di PowerShell:
```powershell
node -v   # harus >= 18
npm -v
```

### 2. Install PostgreSQL

Download dari https://www.postgresql.org/download/windows/
- Pilih versi terbaru (16 atau 17)
- Catat **password** yang diset saat instalasi
- Port biarkan default: **5432**

### 3. Masuk ke folder project

```powershell
cd C:\xampp\htdocs\bima-pg
```

### 4. Buat file .env

```powershell
copy .env.example .env
```

Isi `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bima_db
DB_USER=postgres
DB_PASSWORD=password_anda

PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
UPLOAD_DIR=uploads

JWT_SECRET=isi_random_string_panjang_di_sini
JWT_EXPIRES=8h

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@bima.local
```

> ⚠️ `JWT_SECRET` wajib diisi. Generate dengan:
> ```powershell
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### 5. Install dependencies

```powershell
npm install
```

### 6. Buat database dan tabel

```powershell
npm run db:init
```

Output yang diharapkan:
```
✅ Koneksi ke PostgreSQL berhasil
✅ Database "bima_db" berhasil dibuat
✅ Semua tabel berhasil dibuat
✅ Akun admin dibuat: admin / admin123
🎉 Database BIMA siap!
```

### 7. Jalankan server

```powershell
npm run dev
```

### 8. Buka di browser

→ http://localhost:3001/login.html

Login dengan:
- Username: `admin`
- Password: `admin123`

> ⚠️ Segera ganti password setelah login pertama via menu **Kelola User**!

---

## Tabel Database

| Tabel | Fungsi |
|---|---|
| `projects` | Data project utama |
| `eir` | Exchange Information Requirements |
| `bep` | BIM Execution Plan |
| `midp` | Master Information Delivery Plan |
| `tidp` | Task Information Delivery Plan |
| `curve` | Kurva S |
| `cde_checklist` | CDE Checklist |
| `cde_register` | CDE Register |
| `agreement` | Agreement & Penawaran |
| `users` | Akun pengguna |
| `activity_logs` | Log aktivitas user |

---

## Troubleshooting

**`SASL: client password must be a string`**
→ Cek `DB_PASSWORD` di `.env` sudah diisi dengan benar.

**`ECONNREFUSED`**
→ PostgreSQL belum berjalan. Start dari Windows Services atau pgAdmin.

**Port 3001 sudah dipakai**
→ Jalankan `taskkill /PID xxxx /F` atau ganti `PORT=3002` di `.env`.

**Halaman blank setelah login**
→ Hard refresh browser: `Ctrl + Shift + R`

**Frontend tidak konek ke backend**
→ Buka via `http://localhost:3001`, bukan buka `index.html` langsung dari File Explorer.

---

## Deploy ke VPS Hostinger

### Setup server
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Install Nginx & PM2
apt install -y nginx
npm install -g pm2
```

### Setup database
```bash
sudo -u postgres psql
CREATE DATABASE bima_db;
CREATE USER bima_user WITH ENCRYPTED PASSWORD 'password_kuat';
GRANT ALL PRIVILEGES ON DATABASE bima_db TO bima_user;
\q
```

### Clone & konfigurasi
```bash
git clone https://github.com/USERNAME/bima-dashboard.git
cd bima-dashboard
npm install --production
cp .env.example .env
nano .env   # isi sesuai VPS
npm run db:init
```

### Jalankan dengan PM2
```bash
pm2 start server/index.js --name bima
pm2 save
pm2 startup
```

### Update setelah ada perubahan
```bash
git pull
npm install --production
pm2 restart bima
```

---

## Role & Akses

| Fitur | Admin | User |
|---|---|---|
| Lihat semua data | ✅ | ✅ |
| Edit / tambah data | ✅ | ✅ |
| Hapus baris | ✅ | ❌ |
| Reset project | ✅ | ❌ |
| Hapus project | ✅ | ❌ |
| Kelola user | ✅ | ❌ |
| Lihat activity log | ✅ | ❌ |
