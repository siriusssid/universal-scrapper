# Universal Scraper (GitHub Pages)

Scraper manga/manhwa berbasis browser — **tanpa server**.

## Fitur
- Tempel 1 link (project / list / series)
- Discover + pagination
- Pilih series (batch berikutnya yang belum di-scrape)
- Ambil judul, sinopsis, cover, link chapter list
- Download ZIP / CSV / JSON (anti-duplikat)

## Cara deploy ke GitHub Pages

1. Buat repo baru di GitHub
2. Upload semua file di folder ini ke repo (bisa di root atau folder `docs/`)
3. **Settings → Pages → Source**: Deploy from branch `main` (folder `/` atau `/docs`)
4. Buka URL Pages-mu, contoh: `https://username.github.io/repo-name/`

## Cara pakai lokal

Buka `index.html` di browser, **atau**:

```bash
# supaya fetch stabil (hindari file://)
python3 -m http.server 8080
# lalu buka http://127.0.0.1:8080
```

## Catatan penting (CORS)

Browser memblokir request ke situs lain. Tools ini memakai **CORS proxy** (bisa diganti di UI):

- Default: `https://api.allorigins.win/raw?url=`
- Alternatif: `https://corsproxy.io/?`

Kalau suatu situs gagal di-load, ganti proxy atau coba lagi nanti. Proxy publik kadang lambat / down.

## Privasi
Semua proses jalan di browser kamu. Tidak ada backend sendiri.
