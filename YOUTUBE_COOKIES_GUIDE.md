# YouTube Cookies Guide

## Mengapa Perlu Cookies?

YouTube mendeteksi bot dan membutuhkan autentikasi untuk download video. Menggunakan cookies dari browser membantu bypass deteksi ini.

## Metode 1: Auto Extract dari Browser (RECOMMENDED) ✅

yt-dlp akan otomatis extract cookies dari browser yang terinstall di server.

**Default setting sudah menggunakan Chrome:**
```bash
--cookies-from-browser chrome
```

**Jika menggunakan Firefox, edit `src/index.ts` line ~358:**
```typescript
"--cookies-from-browser", "firefox",
```

### Requirements:
- Browser (Chrome/Firefox) harus terinstall di server
- Pernah login ke YouTube di browser tersebut
- Browser harus accessible dari user yang menjalankan aplikasi

### Cara Setup di Server GCP:

1. **Install Chrome di server (jika belum ada):**
```bash
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt-get install -f
```

2. **Login ke YouTube via browser:**
   - Buka Chrome di server (perlu X11 forwarding atau remote desktop)
   - Atau export cookies dari local machine

---

## Metode 2: Export Cookies Manual (Alternative)

Jika tidak bisa install browser di server, export cookies dari local machine:

### A. Menggunakan Browser Extension

1. **Install Extension:**
   - Chrome: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Export Cookies:**
   - Login ke YouTube
   - Navigate ke `https://www.youtube.com/robots.txt`
   - Click extension icon
   - Export cookies untuk `youtube.com`
   - Save as `youtube_cookies.txt`

3. **Upload ke Server:**
```bash
scp youtube_cookies.txt user@server:/home/pptnindonesia/clipper/
```

4. **Update Code di `src/index.ts`:**
```typescript
// Uncomment line ini (line ~359)
"--cookies", cookiesPath,

// Comment line ini
// "--cookies-from-browser", "chrome",
```

### B. Export dari Incognito Window (Recommended untuk longevity)

YouTube rotates cookies frequently. Untuk cookies yang tahan lama:

1. Buka **Incognito/Private Window**
2. Login ke YouTube
3. Navigate ke `https://www.youtube.com/robots.txt` (PENTING!)
4. Export cookies HANYA dari tab ini
5. **Langsung close incognito window** (jangan buka tab lain!)
6. Upload cookies file ke server

---

## Metode 3: Using yt-dlp Built-in Export

```bash
# Export cookies dari browser ke file
yt-dlp --cookies-from-browser chrome --cookies youtube_cookies.txt https://youtube.com

# File youtube_cookies.txt akan berisi cookies dari semua sites
# Letakkan di folder /home/pptnindonesia/clipper/
```

---

## Testing

Test apakah cookies bekerja:

```bash
cd /home/pptnindonesia/clipper
yt-dlp --cookies-from-browser chrome --print filename "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Jika berhasil, akan print filename tanpa error.

---

## Troubleshooting

### Error: "No such browser"
- Browser tidak terinstall di server
- Gunakan metode export manual

### Error: "Cookies file invalid"
- Format file salah (harus Netscape format)
- First line harus: `# Netscape HTTP Cookie File` atau `# HTTP Cookie File`
- Check newline format (LF untuk Linux, bukan CRLF)

### Error: "Sign in to confirm you're not a bot" (masih muncul)
- Cookies expired atau invalid
- Export fresh cookies lagi
- Pastikan login ke YouTube di browser sebelum export

---

## Current Setup

Aplikasi saat ini menggunakan:
- `--cookies-from-browser chrome` (auto extract)
- Fallback ke `android,web` player client

Jika masih error, uncomment opsi cookies file manual.
