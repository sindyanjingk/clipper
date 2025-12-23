import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash-002'  // Paid API: supports audio/multimodal
});

// Create directories
const uploadDir = path.join(__dirname, '../uploads');
const outputDir = path.join(__dirname, '../output');
const subtitleDir = path.join(__dirname, '../subtitles');
const publicDir = path.join(__dirname, '../public');
const downloadDir = path.join(__dirname, '../downloads');

[uploadDir, outputDir, subtitleDir, downloadDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Setup multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|flv|wmv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file video yang diperbolehkan!'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/output', express.static(outputDir));

// Interface untuk viral segment
interface ViralSegment {
  startTime: number;
  endTime: number;
  duration: number;
  reason: string;
  keywords: string[];
}

// Helper functions
function calculateDuration(startTime: string, endTime: string): number {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  return end - start;
}

function parseTime(time: string): number {
  if (time.includes(':')) {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  return parseFloat(time);
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Route 1: Trim/potong video
app.post('/trim-video', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File video tidak ditemukan' });
    }

    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Parameter startTime dan endTime wajib diisi (format: HH:MM:SS atau detik)' 
      });
    }

    const inputPath = req.file.path;
    const outputFilename = `trimmed-${Date.now()}${path.extname(req.file.originalname)}`;
    const outputPath = path.join(outputDir, outputFilename);

    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(calculateDuration(startTime, endTime))
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(inputPath);
        res.json({
          success: true,
          message: 'Video berhasil dipotong',
          outputFile: outputFilename,
          downloadUrl: `/download/${outputFilename}`
        });
      })
      .on('error', (err) => {
        console.error('Error saat memproses video:', err);
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }
        res.status(500).json({ 
          error: 'Gagal memotong video', 
          details: err.message 
        });
      })
      .run();

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Terjadi kesalahan pada server', 
      details: error.message 
    });
  }
});

// Route 2: Analyze video dengan AI
app.post('/analyze-video', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File video tidak ditemukan' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY tidak ditemukan' });
    }

    const videoPath = req.file.path;
    const videoData = fs.readFileSync(videoPath);
    const base64Video = videoData.toString('base64');

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Video,
        },
      },
      { text: `Analisa video ini dengan fokus pada audio/suara yang terdengar:
1. Identifikasi topik utama yang dibicarakan
2. Rangkum poin-poin penting dari percakapan atau narasi
3. Kategorikan topik (misalnya: edukasi, hiburan, berita, tutorial, dll)
4. Berikan deskripsi singkat tentang konteks visual yang mendukung topik

Berikan analisa dalam format:
**TOPIK UTAMA:** [topik]
**KATEGORI:** [kategori]
**RINGKASAN:** [ringkasan percakapan]
**KONTEKS VISUAL:** [deskripsi visual]` },
    ]);

    const analysis = result.response.text();
    fs.unlinkSync(videoPath);

    res.json({
      success: true,
      analysis: analysis,
      filename: req.file.originalname
    });

  } catch (error: any) {
    console.error('Error analyzing video:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Gagal menganalisa video', 
      details: error.message 
    });
  }
});

// Route 3: Generate subtitle dari audio video
app.post('/generate-subtitle', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File video tidak ditemukan' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY tidak ditemukan' });
    }

    const videoPath = req.file.path;
    const audioPath = path.join(uploadDir, `audio-${Date.now()}.mp3`);
    const subtitleFilename = `subtitle-${Date.now()}.srt`;
    const subtitlePath = path.join(subtitleDir, subtitleFilename);

    // Extract audio from video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Read audio and convert to base64
    const audioData = fs.readFileSync(audioPath);
    const base64Audio = audioData.toString('base64');

    // Generate subtitle with Gemini AI
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mp3',
          data: base64Audio,
        },
      },
      { 
        text: `Transcribe audio ini dengan format SRT (SubRip). Format:
1
00:00:00,000 --> 00:00:05,000
Teks subtitle pertama

2
00:00:05,000 --> 00:00:10,000
Teks subtitle kedua

Berikan hasil transcription lengkap dalam format SRT yang valid.` 
      },
    ]);

    let subtitleContent = result.response.text();
    subtitleContent = subtitleContent.replace(/```srt\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
    
    fs.writeFileSync(subtitlePath, subtitleContent);
    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);

    res.json({
      success: true,
      message: 'Subtitle berhasil di-generate',
      subtitleFile: subtitleFilename,
      downloadUrl: `/subtitle/${subtitleFilename}`,
      preview: subtitleContent.substring(0, 500) + '...'
    });

  } catch (error: any) {
    console.error('Error generating subtitle:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Gagal generate subtitle', 
      details: error.message 
    });
  }
});

// Route 4: Trim video dengan subtitle tertanam
app.post('/trim-video-with-subtitle', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File video tidak ditemukan' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY tidak ditemukan' });
    }

    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Parameter startTime dan endTime wajib diisi' 
      });
    }

    const inputPath = req.file.path;
    const audioPath = path.join(uploadDir, `audio-${Date.now()}.mp3`);
    const subtitleFilename = `subtitle-${Date.now()}.srt`;
    const subtitlePath = path.join(subtitleDir, subtitleFilename);
    const outputFilename = `trimmed-with-sub-${Date.now()}${path.extname(req.file.originalname)}`;
    const outputPath = path.join(outputDir, outputFilename);

    // Extract audio
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Generate subtitle
    const audioData = fs.readFileSync(audioPath);
    const base64Audio = audioData.toString('base64');

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mp3',
          data: base64Audio,
        },
      },
      { 
        text: `Transcribe audio ini dengan format SRT (SubRip). Pastikan timing akurat.` 
      },
    ]);

    let subtitleContent = result.response.text();
    subtitleContent = subtitleContent.replace(/```srt\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
    fs.writeFileSync(subtitlePath, subtitleContent);

    // Trim video and embed subtitle
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(calculateDuration(startTime, endTime))
        .outputOptions([
          `-vf subtitles=${subtitlePath.replace(/\\/g, '/')}`,
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    fs.unlinkSync(inputPath);
    fs.unlinkSync(audioPath);

    res.json({
      success: true,
      message: 'Video berhasil dipotong dengan subtitle tertanam',
      outputFile: outputFilename,
      subtitleFile: subtitleFilename,
      downloadUrl: `/download/${outputFilename}`,
      subtitleDownloadUrl: `/subtitle/${subtitleFilename}`
    });

  } catch (error: any) {
    console.error('Error processing video with subtitle:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Gagal memproses video dengan subtitle', 
      details: error.message 
    });
  }
});

// Route 5: Split video panjang menjadi banyak video pendek dengan AI metadata
app.post('/split-video', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File video tidak ditemukan' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY tidak ditemukan' });
    }

    const { clipDuration } = req.body;
    const duration = clipDuration ? parseInt(clipDuration) : 60; // Default 60 detik
    
    const videoPath = req.file.path;
    const audioPath = path.join(uploadDir, `audio-${Date.now()}.mp3`);

    console.log('Processing video...');

    // Get video duration
    const videoDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });

    console.log(`Video duration: ${videoDuration} seconds`);

    // Extract audio
    console.log('Extracting audio...');
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const numClips = Math.ceil(videoDuration / duration);
    console.log(`Will create ${numClips} clips`);

    const clips = [];

    // Process each clip
    for (let i = 0; i < numClips; i++) {
      const startTime = i * duration;
      const endTime = Math.min((i + 1) * duration, videoDuration);
      const clipDurationActual = endTime - startTime;

      console.log(`Processing clip ${i + 1}/${numClips}`);

      const clipFilename = `clip-${Date.now()}-${i + 1}.mp4`;
      const clipPath = path.join(outputDir, clipFilename);
      const clipAudioPath = path.join(uploadDir, `clip-audio-${Date.now()}-${i}.mp3`);
      const clipSubtitleFilename = `subtitle-clip-${Date.now()}-${i + 1}.srt`;
      const clipSubtitlePath = path.join(subtitleDir, clipSubtitleFilename);

      // Trim video
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(startTime)
          .setDuration(clipDurationActual)
          .output(clipPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      // Extract audio from clip
      await new Promise<void>((resolve, reject) => {
        ffmpeg(clipPath)
          .output(clipAudioPath)
          .audioCodec('libmp3lame')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      // Generate subtitle for this clip
      const clipAudioData = fs.readFileSync(clipAudioPath);
      const base64ClipAudio = clipAudioData.toString('base64');

      const clipSubResult = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: base64ClipAudio,
          },
        },
        { 
          text: `Transcribe audio ini dengan format SRT. Mulai dari timestamp 00:00:00.` 
        },
      ]);

      let clipSubtitle = clipSubResult.response.text();
      clipSubtitle = clipSubtitle.replace(/```srt\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
      fs.writeFileSync(clipSubtitlePath, clipSubtitle);

      // Analyze clip and generate metadata
      console.log(`Analyzing clip ${i + 1} with AI...`);
      const metadataResult = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: base64ClipAudio,
          },
        },
        { 
          text: `Berdasarkan audio ini, buatkan metadata untuk video pendek dengan format JSON:
{
  "title": "Judul menarik (maksimal 60 karakter)",
  "description": "Deskripsi singkat (100-150 karakter)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "category": "kategori video",
  "viralityScore": 85,
  "targetAudience": "Target audience",
  "suggestedHashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]
}

Response dalam format JSON valid tanpa markdown.` 
        },
      ]);

      let metadataText = metadataResult.response.text();
      metadataText = metadataText.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
      
      let metadata;
      try {
        metadata = JSON.parse(metadataText);
      } catch (e) {
        metadata = {
          title: `Clip ${i + 1}`,
          description: `Segment ${i + 1}`,
          tags: ['video', 'clip'],
          category: 'General',
          viralityScore: 50,
          targetAudience: 'General',
          suggestedHashtags: ['#shorts']
        };
      }

      // Create final clip with subtitle
      const finalClipFilename = `final-clip-${Date.now()}-${i + 1}.mp4`;
      const finalClipPath = path.join(outputDir, finalClipFilename);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(clipPath)
          .outputOptions([
            `-vf subtitles=${clipSubtitlePath.replace(/\\/g, '/')}`,
          ])
          .output(finalClipPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      fs.unlinkSync(clipPath);
      fs.unlinkSync(clipAudioPath);

      clips.push({
        clipNumber: i + 1,
        filename: finalClipFilename,
        subtitleFile: clipSubtitleFilename,
        startTime: formatTime(startTime),
        endTime: formatTime(endTime),
        duration: Math.round(clipDurationActual),
        metadata: metadata,
        downloadUrl: `/download/${finalClipFilename}`,
        subtitleDownloadUrl: `/subtitle/${clipSubtitleFilename}`
      });

      console.log(`Clip ${i + 1} completed!`);
    }

    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);

    res.json({
      success: true,
      message: `Video berhasil dipecah menjadi ${numClips} clip`,
      totalClips: numClips,
      clipDuration: duration,
      clips: clips
    });

  } catch (error: any) {
    console.error('Error splitting video:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Gagal memecah video', 
      details: error.message 
    });
  }
});

// Route: Download file
app.get('/download/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(outputDir, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File tidak ditemukan' });
  }
});

// Route: Download subtitle
app.get('/subtitle/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(subtitleDir, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File subtitle tidak ditemukan' });
  }
});

// Helper function to sanitize filename
function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")                 // normalize unicode
    .replace(/[^\w\s.-]/g, "")         // hapus karakter ilegal
    .replace(/\s+/g, " ")              // rapikan spasi
    .trim();
}

// YouTube Download Route
app.get('/download-youtube', async (req: Request, res: Response): Promise<any> => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: "YouTube URL is required" });
  }

  // unik per request (hindari bentrok file)
  const jobId = crypto.randomUUID();
  const outputTemplate = path.join(
    downloadDir,
    `${jobId}-%(title)s.%(ext)s`
  );

  const args = [
    "--no-playlist",

    // WAJIB untuk YouTube terbaru
    "--js-runtimes", "node",

    // Hindari blokir
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",

    // Paksa MP4
    "-f", "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4]/b[ext=mp4]/b",
    "--merge-output-format", "mp4",

    "-o", outputTemplate,
    url
  ];

  const ytdlp = spawn("yt-dlp", args);

  ytdlp.stderr.on("data", (data: Buffer) => {
    console.log(`[yt-dlp] ${data}`);
  });

  ytdlp.on("error", (err: Error) => {
    console.error(err);
    return res.status(500).json({ error: "Failed to start yt-dlp" });
  });

  ytdlp.on("close", (code: number | null) => {
    if (code !== 0) {
      return res.status(500).json({
        error: "yt-dlp failed to download video"
      });
    }

    const files = fs
      .readdirSync(downloadDir)
      .filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));

    if (!files.length) {
      return res.status(500).json({
        error: "Download failed, no output file"
      });
    }

    const fileName = files[0];
    const filePath = path.join(downloadDir, fileName);

    const rawName = fileName.replace(jobId + "-", "");
    const safeName = sanitizeFilename(rawName);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}"`
    );
    res.setHeader("Content-Type", "video/mp4");

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    // hapus file setelah selesai dikirim
    stream.on("close", () => {
      fs.unlink(filePath, () => {});
    });
  });
});

// MAIN ENDPOINT: Process YouTube Video (Download → AI Analyze → Trim → Subtitle)
app.post('/process-youtube', express.json(), async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "YouTube URL is required" });
    }

    console.log('🎬 Starting YouTube video processing...');
    const jobId = crypto.randomUUID();
    
    // Step 1: Download video from YouTube
    console.log('⬇️ Step 1: Downloading video...');
    const downloadedVideo = await downloadYouTubeVideo(url, jobId);
    
    if (!downloadedVideo) {
      return res.status(500).json({ error: 'Failed to download video' });
    }

    // Step 2: Extract audio for AI analysis
    console.log('🎵 Step 2: Extracting audio...');
    const audioPath = await extractAudio(downloadedVideo, jobId);

    // Step 3: Get video duration
    const duration = await getVideoDuration(downloadedVideo);
    console.log(`📹 Video duration: ${duration} seconds`);

    // Step 4: AI Analysis - Find viral moments
    console.log('🤖 Step 3: AI analyzing viral moments...');
    const viralSegments = await findViralMoments(audioPath, duration);

    if (!viralSegments || viralSegments.length === 0) {
      // Cleanup
      cleanupFiles([downloadedVideo, audioPath]);
      return res.status(500).json({ error: 'No viral segments found' });
    }

    // Step 5: Process each viral segment (trim + subtitle)
    console.log(`✂️ Step 4: Processing ${viralSegments.length} viral clips...`);
    const processedClips = [];

    for (let i = 0; i < viralSegments.length; i++) {
      const segment = viralSegments[i];
      console.log(`Processing clip ${i + 1}/${viralSegments.length}...`);

      // Trim video
      const clippedVideo = await trimVideo(
        downloadedVideo,
        segment.startTime,
        segment.endTime,
        `${jobId}-clip-${i + 1}`
      );

      // Generate subtitle
      const subtitleText = await generateSubtitleForClip(audioPath, segment);

      // Burn subtitle to video
      const finalVideo = await burnSubtitleToVideo(
        clippedVideo,
        subtitleText,
        `${jobId}-final-${i + 1}`
      );

      // Cleanup temporary clipped video
      if (fs.existsSync(clippedVideo)) {
        fs.unlinkSync(clippedVideo);
      }

      processedClips.push({
        clipNumber: i + 1,
        filename: path.basename(finalVideo),
        startTime: formatTime(segment.startTime),
        endTime: formatTime(segment.endTime),
        duration: segment.duration,
        reason: segment.reason,
        keywords: segment.keywords,
        previewUrl: `/output/${path.basename(finalVideo)}`,
        downloadUrl: `/download/${path.basename(finalVideo)}`
      });
    }

    // Cleanup original files
    cleanupFiles([downloadedVideo, audioPath]);

    console.log('✅ Processing complete!');
    res.json({
      success: true,
      message: 'Video berhasil diproses',
      jobId,
      totalClips: processedClips.length,
      clips: processedClips
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      error: 'Failed to process video',
      details: error.message 
    });
  }
});

// Helper: Download YouTube video
function downloadYouTubeVideo(url: string, jobId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(downloadDir, `${jobId}.%(ext)s`);

    const args = [
      "--no-playlist",
      "--js-runtimes", "node",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "-f", "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4]/b[ext=mp4]/b",
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      url
    ];

    const ytdlp = spawn("yt-dlp", args);
    let errorOutput = '';

    ytdlp.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[yt-dlp] ${output}`);
      errorOutput += output;
    });

    ytdlp.on("error", (err: Error) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    ytdlp.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${errorOutput}`));
        return;
      }

      const files = fs.readdirSync(downloadDir).filter(f => f.startsWith(jobId) && f.endsWith(".mp4"));
      
      if (!files.length) {
        reject(new Error('Download failed, no output file'));
        return;
      }

      resolve(path.join(downloadDir, files[0]));
    });
  });
}

// Helper: Extract audio from video
function extractAudio(videoPath: string, jobId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const audioPath = path.join(downloadDir, `${jobId}-audio.mp3`);

    ffmpeg(videoPath)
      .output(audioPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .on('end', () => resolve(audioPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper: Get video duration
function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
}

// Helper: AI - Find viral moments with audio analysis
async function findViralMoments(audioPath: string, totalDuration: number): Promise<ViralSegment[]> {
  try {
    console.log(`Analyzing ${totalDuration}s of audio for viral moments...`);
    
    // Read audio file as base64
    const audioData = fs.readFileSync(audioPath);
    const audioBase64 = audioData.toString('base64');

    const prompt = `Kamu adalah AI expert yang menganalisis konten video untuk menemukan momen-momen VIRAL.

Analisa audio ini dan temukan 3-5 segmen paling VIRAL (40-60 detik per segmen) yang:
- Memiliki emosi kuat (excitement, surprise, humor, dramatic, inspiring)
- Konten engaging yang menarik perhatian
- Cocok untuk viral di TikTok, Instagram Reels, YouTube Shorts
- Punya hook kuat di awal segmen
- Bisa standalone tanpa perlu konteks keseluruhan video
- Hindari bagian intro/outro yang membosankan

Durasi total video: ${Math.floor(totalDuration)} detik

Berikan response dalam format JSON array (HANYA JSON, tanpa text lain):
[
  {
    "startTime": 30,
    "endTime": 75,
    "duration": 45,
    "reason": "Momen lucu dengan punchline kuat yang bikin ngakak",
    "keywords": ["humor", "viral", "lucu"]
  }
]

PENTING:
- Setiap segmen 40-60 detik
- startTime dan endTime dalam detik (integer)
- duration = endTime - startTime
- Pilih momen PALING MENARIK saja
- Response HARUS valid JSON array`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: audioBase64
        }
      },
      { text: prompt }
    ]);

    const response = result.response.text();
    console.log('AI Response:', response);

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('AI did not return valid JSON, using fallback strategy');
      return generateFallbackSegments(totalDuration);
    }

    const segments: ViralSegment[] = JSON.parse(jsonMatch[0]);
    
    // Validate and filter segments
    const validSegments = segments.filter(s => 
      s.startTime >= 0 && 
      s.endTime <= totalDuration &&
      s.duration >= 40 && 
      s.duration <= 60 &&
      s.endTime > s.startTime
    );

    if (validSegments.length === 0) {
      console.warn('No valid segments from AI, using fallback');
      return generateFallbackSegments(totalDuration);
    }
    
    console.log(`✅ AI found ${validSegments.length} viral segments`);
    return validSegments;

  } catch (error: any) {
    console.error('AI Analysis error:', error);
    console.log('Using fallback segment generation...');
    return generateFallbackSegments(totalDuration);
  }
}

// Fallback: Generate segments if AI fails
function generateFallbackSegments(totalDuration: number): ViralSegment[] {
  const segments: ViralSegment[] = [];
  const clipDuration = 50;
  const maxClips = 5;
  
  const possibleClips = Math.floor(totalDuration / clipDuration);
  const numClips = Math.min(possibleClips, maxClips);
  
  if (numClips === 0 && totalDuration >= 40) {
    segments.push({
      startTime: 0,
      endTime: Math.min(60, totalDuration),
      duration: Math.min(60, totalDuration),
      reason: "Full video clip",
      keywords: ["viral", "content"]
    });
  } else {
    const interval = totalDuration / numClips;
    for (let i = 0; i < numClips; i++) {
      const startTime = Math.floor(i * interval);
      const endTime = Math.min(startTime + clipDuration, totalDuration);
      const duration = endTime - startTime;
      
      if (duration >= 40) {
        segments.push({
          startTime,
          endTime,
          duration,
          reason: `Segmen ${i + 1} - Viral content`,
          keywords: ["viral", "trending"]
        });
      }
    }
  }
  
  return segments;
}

// Helper: Trim video
function trimVideo(inputPath: string, startTime: number, endTime: number, outputName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${outputName}-temp.mp4`);
    const duration = endTime - startTime;

    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper: Generate subtitle for clip with audio context
async function generateSubtitleForClip(audioPath: string, segment: ViralSegment): Promise<string> {
  try {
    // Use text-based prompt with context for efficiency
    const prompt = `Buatkan subtitle/caption yang VIRAL untuk video clip ${segment.duration} detik.

Konten: ${segment.reason}
Keywords: ${segment.keywords.join(', ')}

Requirements:
- Maksimal 2 baris
- SUPER engaging dan eye-catching
- Perfect untuk TikTok/Reels/Shorts
- Bikin orang penasaran dan tertarik nonton
- Pakai bahasa yang catchy, bisa campuran indo-english

Return HANYA text subtitle, tanpa quote atau format lain.`;

    const result = await model.generateContent(prompt);
    const subtitle = result.response.text()
      .trim()
      .replace(/^["']|["']$/g, ''); // Remove quotes
    
    // Limit to 80 characters for readability on video
    return subtitle.length > 80 ? subtitle.substring(0, 77) + '...' : subtitle;

  } catch (error: any) {
    console.error('Subtitle generation error:', error);
    return segment.reason.substring(0, 77); // Fallback to reason
  }
}

// Helper: Burn subtitle to video
function burnSubtitleToVideo(videoPath: string, subtitleText: string, outputName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${outputName}.mp4`);
    
    // Escape subtitle text for ffmpeg
    const escapedText = subtitleText
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:');

    ffmpeg(videoPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .videoFilters([
        {
          filter: 'drawtext',
          options: {
            text: escapedText,
            fontsize: 40,
            fontcolor: 'white',
            x: '(w-text_w)/2',
            y: 'h-th-50',
            borderw: 3,
            bordercolor: 'black',
            box: 1,
            boxcolor: 'black@0.5',
            boxborderw: 10
          }
        }
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper: Cleanup files
function cleanupFiles(filePaths: string[]) {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up: ${filePath}`);
      } catch (err) {
        console.error(`Failed to delete ${filePath}:`, err);
      }
    }
  });
}

// Health check
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Video Clipper API with AI Analysis',
    model: 'gemini-1.5-flash',
    endpoints: {
      processYoutube: 'POST /process-youtube - Download YouTube → AI analyze → Trim viral clips → Burn subtitle (body: { url: "youtube_url" })',
      trimVideo: 'POST /trim-video - Potong video (multipart/form-data: video, startTime, endTime)',
      analyzeVideo: 'POST /analyze-video - Analisa topik dari audio (multipart/form-data: video)',
      generateSubtitle: 'POST /generate-subtitle - Generate subtitle (multipart/form-data: video)',
      trimVideoWithSubtitle: 'POST /trim-video-with-subtitle - Potong video + subtitle (multipart/form-data: video, startTime, endTime)',
      splitVideo: 'POST /split-video - Split video jadi banyak clip dengan AI metadata (multipart/form-data: video, clipDuration)',
      download: 'GET /download/:filename - Download video hasil',
      downloadSubtitle: 'GET /subtitle/:filename - Download subtitle',
      downloadYoutube: 'GET /download-youtube?url=<youtube_url> - Download video dari YouTube'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
