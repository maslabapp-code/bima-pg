# 📝 Catatan: GitHub & Deploy BIMA Dashboard

---

## 1. Push Project ke GitHub (Pertama Kali)

### Persiapan
Pastikan `.gitignore` sudah ada di root folder dengan isi:
```
node_modules/
.env
uploads/
*.log
.DS_Store
```

> ⚠️ File `.env` **jangan pernah** di-push — berisi password DB dan JWT secret!

### Push ke GitHub
```powershell
cd D:\0. Node Project\0. bima pg\bima-pg-final

git init
git add .
git commit -m "Initial commit - BIMA Dashboard v1.0"
git remote add origin https://github.com/maslabapp-code/bima-pg.git
git branch -M main
git push -u origin main
```

> Ganti `USERNAME` dan `bima-dashboard` sesuai akun & nama repo GitHub Anda.  
> Saat diminta password → pakai **Personal Access Token** (bukan password akun).

### Cara buat Personal Access Token
1. GitHub → foto profil → **Settings**
2. **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token** → centang **repo** → **Generate**
4. Copy token — simpan baik-baik, hanya tampil sekali!

---

## 2. Update Project (Setelah Ada Perubahan)

```powershell
git add .
git commit -m "Deskripsi perubahan singkat"
git push
```

---

## 2.1 Timpa semua Project (Setelah Ada Perubahan)

```powershell
git merge --abort
git push -u origin main --force
git commit -m "Update V2"
git push
```

---

## 3. Share Repo ke User/Tim

1. Buka repo di GitHub
2. **Settings** → **Collaborators** → **Add people**
3. Masukkan username GitHub user
4. Pilih role: **Read** (hanya bisa clone/pull, tidak bisa ubah kode)
5. Klik **Add** → user dapat email undangan

---

## 4. User Clone & Deploy ke VPS Mereka

### Clone repo
```bash
git clone https://github.com/USERNAME/bima-dashboard.git
cd bima-dashboard
```


### Install & konfigurasi
```bash
# Install dependencies (node_modules didownload otomatis)
npm install --production

# Buat file .env dari template
cp .env.example .env
nano .env
# Isi: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD,
#      JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, dll
```

### Init database & jalankan
```bash
# Buat tabel + akun admin pertama
npm run db:init

# Jalankan dengan PM2
pm2 start server/index.js --name bima
pm2 save
pm2 startup
```

### Buka di browser
```
http://IP_VPS_MEREKA:3001/login.html
```

---

## 5. Update Project di VPS (Setelah Ada Push Baru)

```bash
cd bima-dashboard
git pull
npm install --production
pm2 restart bima
```

---

## 6. Kenapa `node_modules` & `uploads` Tidak Ada di GitHub?

| Folder/File | Alasan tidak di-push |
|---|---|
| `node_modules/` | Bisa 100MB+, user cukup jalankan `npm install` |
| `uploads/` | Berisi file data user, tiap server punya sendiri |
| `.env` | Berisi password — berbahaya kalau publik |

---

## 7. Struktur yang Ada di GitHub

```
bima-dashboard/
├── server/
│   ├── index.js
│   ├── db.js
│   ├── db-init.js
│   ├── schema.sql
│   ├── logger.js
│   ├── middleware/
│   └── routes/
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── users.html
│   ├── logs.html
│   ├── app.js
│   ├── styles.css
│   ├── favicon.ico
│   └── assets/
├── .env.example     ← template konfigurasi
├── .gitignore
├── package.json
└── README.md
```

---

*Catatan ini dibuat untuk project BIMA Dashboard*
*Simpan di root folder project sebagai referensi*
