# Video Clipper API

API untuk memotong video, analisa video dengan AI, dan generate subtitle menggunakan Express.js, TypeScript, ffmpeg, dan Gemini AI.

## Prerequisites

1. **ffmpeg** - Pastikan sudah terinstall di sistem:
```bash
# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt-get install ffmpeg

# Atau cek instalasi
ffmpeg -version
```

2. **Gemini API Key** - Dapatkan dari [Google AI Studio](https://makersuite.google.com/app/apikey)

## Instalasi

```bash
npm install
```

## Konfigurasi

Buat file `.env` dan isi dengan API key Gemini:
```bash
GEMINI_API_KEY=your_actual_api_key_here
PORT=3000
```

## Menjalankan Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

Server akan berjalan di `http://localhost:3000`

## Web Interface 🌐

Buka browser dan akses `http://localhost:3000` untuk menggunakan web interface dengan fitur:

- **Tab Analisa Video** - Analisa topik dari video YouTube
- **Tab Trim + Subtitle** - Potong video YouTube dengan subtitle tertanam
- **Tab Generate Subtitle** - Buat subtitle dari video YouTube
- **Preview Video** - Lihat hasil video langsung di browser
- **Download Button** - Download video dan subtitle hasil processing

Atau gunakan API endpoints di bawah ini untuk integrasi programmatic.

## API Endpoints

### 1. Health Check
```
GET /
```

### 2. Trim/Potong Video (tanpa subtitle)
```
POST /trim-video
Content-Type: multipart/form-data
```

**Parameters:**
- `video`: File video (mp4, avi, mov, mkv, flv, wmv)
- `startTime`: Waktu mulai (format: HH:MM:SS atau MM:SS atau detik)
- `endTime`: Waktu akhir (format: HH:MM:SS atau MM:SS atau detik)

**Contoh:**
```bash
curl -X POST http://localhost:3000/trim-video \
  -F "video=@/path/to/video.mp4" \
  -F "startTime=00:00:10" \
  -F "endTime=00:00:30"
```

### 3. Trim Video dengan Subtitle Tertanam ⭐ (NEW)
```
POST /trim-video-with-subtitle
Content-Type: multipart/form-data
```

**Parameters:**
- `video`: File video
- `startTime`: Waktu mulai
- `endTime`: Waktu akhir

**Fitur:**
- Otomatis extract audio dari video
- Generate subtitle menggunakan Gemini AI Pro
- Potong video sesuai waktu yang ditentukan
- Subtitle langsung tertanam (burned-in) ke video

**Contoh:**
```bash
curl -X POST http://localhost:3000/trim-video-with-subtitle \
  -F "video=@/path/to/video.mp4" \
  -F "startTime=00:00:10" \
  -F "endTime=00:00:30"
```

**Response:**
```json
{
  "success": true,
  "message": "Video berhasil dipotong dengan subtitle tertanam",
  "outputFile": "trimmed-with-sub-1234567890.mp4",
  "outputPath": "/path/to/output/...",
  "subtitleFile": "subtitle-1234567890.srt",
  "subtitlePath": "/path/to/subtitles/..."
}
```

### 4. Analisa Video - Ekstrak Topik dari Audio
```
POST /analyze-video
Content-Type: multipart/form-data
```

**Parameters:**
- `video`: File video untuk dianalisa

**Fitur:**
- Menggunakan Gemini 1.5 Pro untuk analisa mendalam
- Fokus pada ekstraksi topik dari audio/percakapan
- Mengidentifikasi topik utama, kategori, dan ringkasan

**Contoh:**
```bash
curl -X POST http://localhost:3000/analyze-video \
  -F "video=@/path/to/video.mp4"
```

**Response:**
```json
{
  "success": true,
  "analysis": "**TOPIK UTAMA:** Tutorial Programming\n**KATEGORI:** Edukasi\n**RINGKASAN:** ...\n**KONTEKS VISUAL:** ...",
  "filename": "video.mp4"
}
```

### 5. Generate Subtitle Saja (tanpa trim)
```
POST /generate-subtitle
Content-Type: multipart/form-data
```

**Parameters:**
- `video`: File video yang akan di-extract audio dan di-transcribe

**Contoh:**
```bash
curl -X POST http://localhost:3000/generate-subtitle \
  -F "video=@/path/to/video.mp4"
```

**Response:**
```json
{
  "success": true,
  "message": "Subtitle berhasil di-generate",
  "subtitleFile": "subtitle-1234567890.srt",
  "subtitlePath": "/path/to/subtitles/subtitle-1234567890.srt",
  "preview": "1\n00:00:00,000 --> 00:00:05,000\n..."
}
```

### 5. Download Video
```
GET /download/:filename
```

### 6. Download Subtitle
```
GET /subtitle/:filename
```

---

## YouTube Endpoints 🎬

### 7. Analisa Video YouTube
```
POST /analyze-youtube
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Fitur:**
- Download video dari YouTube otomatis
- Analisa topik dari audio/percakapan
- Tidak perlu upload file manual

**Contoh:**
```bash
curl -X POST http://localhost:3000/analyze-youtube \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### 8. Trim Video YouTube + Subtitle Tertanam
```
POST /trim-youtube-with-subtitle
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "startTime": "00:00:10",
  "endTime": "00:00:30"
}
```

**Fitur:**
- Download video dari YouTube
- Extract audio → Generate subtitle (AI)
- Trim video sesuai waktu
- Embed subtitle ke video

**Contoh:**
```bash
curl -X POST http://localhost:3000/trim-youtube-with-subtitle \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "startTime": "00:00:10",
    "endTime": "00:00:30"
  }'
```

### 9. Generate Subtitle dari Video YouTube
```
POST /youtube-subtitle
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Contoh:**
```bash
curl -X POST http://localhost:3000/youtube-subtitle \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## 🚀 Split Video Auto - AI Metadata Generator

### 10. Split Video Panjang → Banyak Video Pendek + AI Metadata ⭐ NEW!
```
POST /split-video-auto
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "clipDuration": 60
}
```

**Parameters:**
- `url`: YouTube URL
- `clipDuration`: Durasi per clip dalam detik (default: 60)

**Fitur:**
- Split video panjang (misal 30 menit) menjadi banyak clip pendek (30 clip @ 1 menit)
- Setiap clip otomatis dapat:
  - ✅ Subtitle tertanam (burned-in)
  - ✅ Judul catchy (AI-generated)
  - ✅ Deskripsi engaging
  - ✅ Tags & Hashtags optimal
  - ✅ Virality Score (0-100)
  - ✅ Analisa potensi viral
  - ✅ Target audience
  - ✅ Rekomendasi platform (TikTok/Reels/Shorts)

**Contoh:**
```bash
curl -X POST http://localhost:3000/split-video-auto \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "clipDuration": 60
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Video berhasil dipecah menjadi 30 clip dengan subtitle dan metadata AI",
  "youtubeUrl": "https://...",
  "totalClips": 30,
  "clipDuration": 60,
  "clips": [
    {
      "clipNumber": 1,
      "filename": "final-clip-xxx-1.mp4",
      "subtitleFile": "subtitle-clip-xxx-1.srt",
      "startTime": "00:00:00",
      "endTime": "00:01:00",
      "duration": 60,
      "metadata": {
        "title": "Cara Mudah Belajar Programming dalam 1 Menit! 🚀",
        "description": "Tips coding yang wajib kamu tahu! Dijamin langsung paham",
        "tags": ["programming", "coding", "tutorial", "tips", "beginner"],
        "category": "Education",
        "viralityScore": 85,
        "viralityAnalysis": "Video ini memiliki potensi viral tinggi karena...",
        "targetAudience": "Pemula programming usia 18-30 tahun",
        "bestPlatform": ["TikTok", "Instagram Reels", "YouTube Shorts"],
        "suggestedHashtags": ["#programming", "#coding", "#tutorial", "#viral", "#fyp"]
      }
    }
    // ... 29 clips lainnya
  ]
}
```

## Format Waktu

Anda dapat menggunakan format berikut untuk `startTime` dan `endTime`:
- `HH:MM:SS` - Contoh: `00:01:30` (1 menit 30 detik)
- `MM:SS` - Contoh: `01:30` (1 menit 30 detik)
- Detik - Contoh: `90` (90 detik)

## Struktur Folder

```
clipper/
├── src/
│   └── index.ts       # Main application file
├── uploads/           # Temporary uploaded videos
├── output/            # Trimmed video output
├── subtitles/         # Generated subtitle files
├── dist/              # Compiled JavaScript files
├── .env               # Environment variables (API keys)
├── .env.example       # Example environment file
├── package.json
├── tsconfig.json
└── README.md
```

## Fitur

✅ **Trim/Potong Video** - Potong video berdasarkan waktu mulai dan akhir  
✅ **Trim Video + Subtitle Otomatis** - Potong video dengan subtitle tertanam (burned-in) ⭐  
✅ **Analisa Video AI** - Ekstrak topik utama dari audio/percakapan menggunakan Gemini 1.5 Pro  
✅ **Generate Subtitle** - Transcribe audio dari video menjadi subtitle (SRT format)  
✅ **YouTube Support** - Download dan proses video langsung dari YouTube 🎬  
✅ **Split Video Auto** - 1 video panjang → banyak video pendek dengan AI metadata 🚀  
  - Auto-generate judul catchy untuk setiap clip
  - Tags & hashtags otomatis
  - Analisa potensi viral (virality score)
  - Rekomendasi platform terbaik (TikTok, Instagram Reels, YouTube Shorts)
  - Target audience identification
✅ **Download Hasil** - Download video dan subtitle yang sudah diproses  

## Source Video

API mendukung 2 sumber video:
1. **Upload File** - Upload video dari local storage
2. **YouTube URL** - Langsung dari YouTube tanpa perlu download manual  

## Model AI

Menggunakan **Gemini 1.5 Pro** untuk:
- Analisa topik yang lebih akurat dari audio/percakapan
- Transcription subtitle yang lebih detail dan presisi
- Pemahaman konteks yang lebih baik  

## Error Handling

API akan mengembalikan error response jika:
- File video tidak ditemukan
- Format file tidak didukung
- Parameter yang diperlukan tidak ada
- Gemini API key tidak ditemukan atau tidak valid
- Gagal memproses video dengan ffmpeg
- Gagal menganalisa dengan Gemini AI
