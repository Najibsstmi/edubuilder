# EduBuilder App Starter

Ini starter project React + Vite + Supabase untuk sistem **Bina Item Sains SPM KSSM**.

## Apa yang sudah ada
- Login page
- Signup page dengan dropdown `Negeri -> PPD -> Sekolah`
- Logic auto-admin untuk user pertama bagi sesuatu sekolah
- Dashboard asas
- Page master admin untuk lihat semua user dan upgrade akaun free -> full
- Page admin untuk masukkan item soalan
- Butang `Bantuan AI` versi rule-based dulu
- Page bina set soalan ikut paper/section/construct/difficulty

## Apa yang belum penuh
- Guest/free user public flow tanpa login
- Upload media item ke bucket `item-media`
- Upload logo sekolah + signed URL rendering
- Export PDF / DOCX sebenar
- Bulk upload Excel/ZIP
- Semakan item / workflow pending_review penuh
- AI sebenar melalui Edge Functions / external model

## Setup local
1. `npm install`
2. Salin `.env.example` kepada `.env`
3. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
4. `npm run dev`

## Deploy ke Vercel
1. Push repo ke GitHub
2. Import ke Vercel
3. Tambah env yang sama dalam Vercel
4. Deploy

## Penting tentang SQL dan RLS
Project ini anggap awak sudah run SQL schema yang kita bina dalam Supabase.

Jika signup gagal update profile selepas account dibuat, semak RLS pada `profiles` dan pastikan user pertama sudah boleh update row sendiri.
