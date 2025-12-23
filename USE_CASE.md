# Use Case: Split Video Auto

## Contoh Penggunaan Fitur Split Video Auto

### Skenario:
Anda punya video tutorial programming 30 menit di YouTube. Anda ingin membuat 30 video pendek (1 menit each) untuk TikTok/Reels/Shorts.

### Langkah Manual (Tanpa Tool Ini):
1. Download video YouTube ⏱️ 5 menit
2. Potong manual 30x di editor ⏱️ 2 jam
3. Generate subtitle 30x ⏱️ 3 jam  
4. Pikirin judul catchy 30x ⏱️ 1 jam
5. Research tags/hashtags 30x ⏱️ 1 jam
6. Export 30 video ⏱️ 1 jam

**Total: ~8 jam** 😫

### Dengan Tool Ini (1 Klik):
```bash
# Via Web UI:
1. Buka http://localhost:3000
2. Tab "Split Video Auto"
3. Paste YouTube URL
4. Set durasi: 60 detik
5. Klik "Split Video + Generate Metadata AI"
6. Tunggu... ☕

# Atau via API:
curl -X POST http://localhost:3000/split-video-auto \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=YOUR_VIDEO",
    "clipDuration": 60
  }'
```

**Total: ~15-30 menit (otomatis)** 🚀

---

## Output yang Anda Dapatkan:

### Untuk Setiap Clip:

#### 📹 Video File
- Format: MP4
- Subtitle sudah tertanam (burned-in)
- Durasi: 60 detik
- Siap upload ke TikTok/Reels/Shorts

#### 📝 Subtitle File (SRT)
- Format standar SRT
- Timing akurat
- Bisa digunakan terpisah jika butuh

#### 🎯 AI-Generated Metadata:

1. **Judul Catchy**
   - Maksimal 60 karakter
   - Optimized untuk engagement
   - Contoh: "Cara Mudah Belajar Python dalam 1 Menit! 🚀"

2. **Deskripsi Engaging**
   - 100-150 karakter
   - Menarik perhatian
   - Contoh: "Tips coding yang wajib kamu tahu! Dijamin langsung paham ✨"

3. **Tags**
   - 5-7 tags relevan
   - Optimized untuk search
   - Contoh: ["python", "programming", "tutorial", "coding", "beginner"]

4. **Kategori**
   - Auto-detect kategori konten
   - Contoh: "Education", "Technology", "Entertainment"

5. **Virality Score (0-100)**
   - AI prediction seberapa viral video bisa jadi
   - 70-100: High potential 🔥
   - 40-69: Medium potential 📈
   - 0-39: Low potential 📊

6. **Virality Analysis**
   - Kenapa video ini bisa viral
   - Elemen menarik yang ada
   - Tips untuk maximize engagement

7. **Target Audience**
   - Demografi yang cocok
   - Contoh: "Pemula programming usia 18-30 tahun"

8. **Best Platform**
   - Rekomendasi platform optimal
   - TikTok, Instagram Reels, atau YouTube Shorts
   - Berdasarkan analisa konten

9. **Suggested Hashtags**
   - 5-10 hashtags siap pakai
   - Mix trending + niche
   - Contoh: ["#programming", "#fyp", "#viral", "#tutorial", "#coding"]

---

## Workflow Otomatis:

```
Input: YouTube URL + Durasi Clip
  ↓
1. Download Video dari YouTube
  ↓
2. Detect Durasi Total
  ↓
3. Calculate Jumlah Clips (30 min ÷ 60s = 30 clips)
  ↓
4. Loop untuk setiap clip:
   ├─ Extract clip segment
   ├─ Extract audio
   ├─ Generate subtitle (Gemini AI)
   ├─ Embed subtitle ke video
   ├─ Analyze content (Gemini AI)
   ├─ Generate metadata:
   │  ├─ Judul
   │  ├─ Deskripsi
   │  ├─ Tags
   │  ├─ Hashtags
   │  ├─ Virality score
   │  ├─ Target audience
   │  └─ Platform recommendation
   └─ Save all files
  ↓
Output: 30 video ready-to-upload + metadata lengkap!
```

---

## Tips Penggunaan:

### 1. Durasi Optimal Per Clip
- **TikTok**: 15-60 detik (ideal: 30-45 detik)
- **Instagram Reels**: 15-90 detik (ideal: 30-60 detik)
- **YouTube Shorts**: max 60 detik

### 2. Pilih Segment Menarik
- Gunakan virality score sebagai panduan
- Clip dengan score 70+ prioritas upload pertama
- Test dulu yang score tinggi

### 3. Customize Metadata
- Metadata AI sudah bagus, tapi bisa di-tweak
- Sesuaikan dengan brand voice Anda
- Tambah CTA di description

### 4. Upload Strategy
- Upload clip dengan score tertinggi dulu
- Space out uploads (jangan sekaligus)
- Monitor performance, double down yang viral

### 5. A/B Testing
- Test judul berbeda untuk clip similar
- Coba hashtag variations
- Analisa mana yang perform terbaik

---

## Contoh Real Output:

### Clip 1:
```json
{
  "clipNumber": 1,
  "filename": "final-clip-1234567890-1.mp4",
  "duration": 60,
  "metadata": {
    "title": "5 Python Tips yang Bikin Kamu Jago Coding! 🐍",
    "description": "Rahasia coding cepat yang jarang dibahas. Wajib tonton sampai habis!",
    "tags": ["python", "programming", "coding", "tips", "tutorial"],
    "category": "Education",
    "viralityScore": 87,
    "viralityAnalysis": "Video ini memiliki potensi viral tinggi karena:\n1. Topic relevan dengan trending programming content\n2. Format tips singkat mudah dicerna\n3. Visual appeal dengan code examples\n4. Target audience luas (beginners)\n5. Shareable content",
    "targetAudience": "Pemula programming dan developers muda usia 18-35",
    "bestPlatform": ["TikTok", "Instagram Reels", "YouTube Shorts"],
    "suggestedHashtags": [
      "#python",
      "#programming",
      "#coding",
      "#tutorial",
      "#learntocode",
      "#fyp",
      "#viral",
      "#techtok"
    ]
  }
}
```

### Clip 15 (Mid-video):
```json
{
  "clipNumber": 15,
  "metadata": {
    "title": "Debugging Hack yang Hemat Waktu 2 Jam! ⚡",
    "viralityScore": 92,
    "viralityAnalysis": "Potensi viral SANGAT TINGGI:\n1. Solve common pain point (debugging)\n2. Quantifiable benefit (hemat 2 jam)\n3. Quick win content\n4. Relatable untuk semua level",
    "bestPlatform": ["TikTok", "LinkedIn", "Twitter"],
    "suggestedHashtags": ["#debugging", "#productivity", "#devlife", "#codingtips"]
  }
}
```

---

## ROI Calculation:

### Manual:
- 8 jam kerja @ $50/jam = **$400**
- Hasil: 30 video basic tanpa metadata

### Dengan Tool:
- 30 menit @ $50/jam = **$25**
- Hasil: 30 video + subtitle + metadata lengkap
- **Hemat: $375 & 7.5 jam**

### Plus:
- Metadata AI lebih data-driven
- Virality prediction = better upload strategy
- Konsisten quality untuk 30 clips

---

## Success Metrics:

Setelah upload 30 clips, track:
- Views per clip
- Engagement rate
- Correlation virality score vs actual views
- Best performing platform
- Best performing hashtags

Use data ini untuk optimize batch berikutnya! 📊
