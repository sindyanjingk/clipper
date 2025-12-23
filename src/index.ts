import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set timeout to 30 minutes for long video processing
const SERVER_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

// Gemini API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// serve static folder
app.use("/downloads", express.static(path.resolve("downloads")));
app.use("/output", express.static(path.resolve("output")));

// Helper: Call Gemini API
async function callGeminiAPI(prompt: string, audioBase64?: string): Promise<string> {
  const contents: any[] = [];
  
  if (audioBase64) {
    contents.push({
      parts: [
        {
          inlineData: {
            mimeType: 'audio/mpeg',
            data: audioBase64
          }
        },
        { text: prompt }
      ]
    });
  } else {
    contents.push({
      parts: [{ text: prompt }]
    });
  }

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const responseText = await res.text();
    
    if (!res.ok) {
      console.error('Gemini API Error:', responseText);
      throw new Error(`Gemini API returned ${res.status}: ${responseText.substring(0, 200)}`);
    }

    // Parse JSON response
    let json: any;
    try {
      json = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText.substring(0, 500));
      throw new Error('Gemini API returned invalid JSON');
    }

    if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts || !json.candidates[0].content.parts[0]) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(json).substring(0, 500));
      throw new Error('Gemini API returned unexpected response structure');
    }

    return json.candidates[0].content.parts[0].text;
  } catch (error: any) {
    console.error('callGeminiAPI error:', error.message);
    throw error;
  }
}

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

// Interface untuk processed clip
interface ProcessedClip {
  clipNumber: number;
  filename: string;
  startTime: string;
  endTime: string;
  duration: number;
  reason: string;
  keywords: string[];
  previewUrl: string;
  downloadUrl: string;
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

    // if (!viralSegments || viralSegments.length === 0) {
    //   // Cleanup
    //   cleanupFiles([downloadedVideo, audioPath]);
    //   return res.status(500).json({ error: 'No viral segments found' });
    // }

    // Step 5: Process each viral segment (trim + subtitle)
    console.log(`✂️ Step 4: Processing ${viralSegments.length} viral clips...`);
    const processedClips: ProcessedClip[] = [];

    // Process clips with limited concurrency (2 at a time to avoid overload)
    const CONCURRENT_LIMIT = 2;
    
    const processClip = async (segment: ViralSegment, index: number): Promise<ProcessedClip | null> => {
      try {
        const i = index;
        console.log(`\n=== Processing clip ${i + 1}/${viralSegments.length} ===`);
        console.log(`   Time range: ${segment.startTime}s - ${segment.endTime}s (${segment.duration}s)`);

        // Trim video
        console.log(`   📹 Trimming video...`);
        const clippedVideo = await trimVideo(
          downloadedVideo,
          segment.startTime,
          segment.endTime,
          `${jobId}-clip-${i + 1}`
        );
        console.log(`   ✅ Video trimmed: ${path.basename(clippedVideo)}`);

        // Extract audio from this specific clip for transcription
        console.log(`   🎵 Extracting audio from clip...`);
        const clipAudioPath = await extractAudioFromClip(clippedVideo, `${jobId}-clip-${i + 1}`);
        console.log(`   ✅ Audio extracted: ${path.basename(clipAudioPath)}`);

        // Transcribe audio to timestamped subtitles (SRT format)
        console.log(`   🎙️ Generating timestamped subtitles...`);
        const srtPath = await generateTimestampedSubtitles(clipAudioPath, `${jobId}-clip-${i + 1}`);
        console.log(`   ✅ SRT subtitle generated: ${path.basename(srtPath)}`);

        // Cleanup clip audio
        if (fs.existsSync(clipAudioPath)) {
          fs.unlinkSync(clipAudioPath);
          console.log(`   🗑️ Cleaned up temp audio`);
        }

        // Burn subtitle to video
        console.log(`   🔥 Burning subtitle to video...`);
        const finalVideo = await burnSRTSubtitleToVideo(
          clippedVideo,
          srtPath,
          `${jobId}-final-${i + 1}`
        );
        console.log(`   ✅ Final video created: ${path.basename(finalVideo)}`);
        
        // Cleanup SRT file
        if (fs.existsSync(srtPath)) {
          fs.unlinkSync(srtPath);
          console.log(`   🗑️ Cleaned up SRT file`);
        }

        // Cleanup temporary clipped video
        if (fs.existsSync(clippedVideo)) {
          fs.unlinkSync(clippedVideo);
          console.log(`   🗑️ Cleaned up temp video`);
        }

        const result = {
          clipNumber: i + 1,
          filename: path.basename(finalVideo),
          startTime: formatTime(segment.startTime),
          endTime: formatTime(segment.endTime),
          duration: segment.duration,
          reason: segment.reason,
          keywords: segment.keywords,
          previewUrl: `/output/${path.basename(finalVideo)}`,
          downloadUrl: `/download/${path.basename(finalVideo)}`
        };

        console.log(`   ✅ Clip ${i + 1}/${viralSegments.length} completed!\n`);
        return result;

      } catch (clipError: any) {
        console.error(`   ❌ Error processing clip ${index + 1}:`, clipError.message);
        return null;
      }
    };

    // Process in batches of CONCURRENT_LIMIT
    for (let i = 0; i < viralSegments.length; i += CONCURRENT_LIMIT) {
      const batch = viralSegments.slice(i, i + CONCURRENT_LIMIT);
      const batchPromises = batch.map((segment, idx) => processClip(segment, i + idx));
      const results = await Promise.all(batchPromises);
      
      // Add successful results
      results.forEach(result => {
        if (result) processedClips.push(result);
      });
    }

    // Cleanup original files
    cleanupFiles([downloadedVideo, audioPath]);

    console.log('\n✅ =============================================');
    console.log(`✅ PROCESSING COMPLETE!`);
    console.log(`✅ Successfully processed ${processedClips.length}/${viralSegments.length} clips`);
    console.log('✅ =============================================\n');
    
    res.json({
      success: true,
      message: 'Video berhasil diproses',
      jobId,
      totalClips: processedClips.length,
      clips: processedClips
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    
    // Make sure we always return JSON
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process video',
        details: error.message 
      });
    }
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
      // Limit to 720p max for faster download (can be 480p for even faster)
      "-f", "bv*[height<=720][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4]/b[height<=720][ext=mp4]/b",
      "--merge-output-format", "mp4",
      // Limit download speed is optional, but can help with server stability
      // "--limit-rate", "5M",  // Uncomment to limit speed to 5MB/s
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
      .audioBitrate('64k')  // Lower bitrate for smaller file (64k is enough for speech)
      .audioChannels(1)     // Mono audio for speech analysis
      .on('end', () => resolve(audioPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper: Extract audio from clip (for transcription)
function extractAudioFromClip(videoPath: string, clipId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const audioPath = path.join(outputDir, `${clipId}-audio.mp3`);

    ffmpeg(videoPath)
      .output(audioPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')  // Lower bitrate for smaller file
      .audioChannels(1)     // Mono audio
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

    const response = await callGeminiAPI(prompt, audioBase64);
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
      .outputOptions([
        '-preset', 'ultrafast',  // Fastest encoding (5-10x faster than default)
        '-crf', '28',            // Lower quality but much faster (23=high, 28=medium)
        '-movflags', '+faststart' // Enable web streaming
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper: Generate timestamped subtitles (SRT format)
async function generateTimestampedSubtitles(audioPath: string, clipId: string): Promise<string> {
  try {
    console.log(`🎙️ Transcribing audio with timestamps: ${audioPath}`);
    
    // Read audio file and convert to base64
    const audioBuffer = fs.readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString('base64');

    const prompt = `Transcribe this audio to text with precise timestamps. Return the result in JSON array format like this:
[
  {"start": 0.0, "end": 2.5, "text": "first words"},
  {"start": 2.5, "end": 5.0, "text": "next words"},
  ...
]

Rules:
- Each subtitle should be 1-2 seconds max for readability
- Split long sentences into shorter segments
- Return ONLY the JSON array, no markdown, no explanations
- Be precise with timing based on the actual speech`;

    const response = await callGeminiAPI(prompt, audioBase64);
    
    // Extract JSON from response (might have markdown code blocks)
    let jsonText = response.trim();
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonText = match[1].trim();
    }
    
    const segments = JSON.parse(jsonText);
    console.log(`   Found ${segments.length} subtitle segments`);
    
    // Generate SRT file
    const srtPath = path.join(subtitleDir, `${clipId}.srt`);
    let srtContent = '';
    
    segments.forEach((seg: any, index: number) => {
      const startTime = formatSRTTime(seg.start);
      const endTime = formatSRTTime(seg.end);
      srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n\n`;
    });
    
    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    console.log(`   ✅ SRT file created: ${srtPath}`);
    
    return srtPath;

  } catch (error: any) {
    console.error('Timestamped transcription error:', error);
    
    // Fallback: create simple single subtitle
    const srtPath = path.join(subtitleDir, `${clipId}.srt`);
    const fallbackSRT = `1\n00:00:00,000 --> 00:00:10,000\n[Audio transcription unavailable]\n\n`;
    fs.writeFileSync(srtPath, fallbackSRT, 'utf-8');
    return srtPath;
  }
}

// Helper: Format seconds to SRT timestamp (HH:MM:SS,mmm)
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Helper: Burn SRT subtitle to video (TikTok-friendly style)
function burnSRTSubtitleToVideo(videoPath: string, srtPath: string, outputName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${outputName}.mp4`);
    
    console.log(`🔥 Burning TikTok-style subtitle to video...`);
    console.log(`   Input: ${videoPath}`);
    console.log(`   Subtitle: ${srtPath}`);
    console.log(`   Output: ${outputPath}`);
    
    // Escape path for ffmpeg (Windows compatibility)
    const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    
    // TikTok-friendly subtitle style:
    // - Font: Bold, Impact-style
    // - Size: Large (32-40)
    // - Color: Bright Yellow/White with thick black outline
    // - Background: Semi-transparent black box
    // - Position: Center-bottom with padding
    // - Outline: Thick black border for readability
    // - Shadow: Strong shadow for depth
    const subtitleFilter = `subtitles=${escapedSrtPath}:force_style='FontName=Impact,FontSize=36,Bold=1,PrimaryColour=&H00FFFF,SecondaryColour=&HFFFFFF,OutlineColour=&H000000,BackColour=&H80000000,BorderStyle=4,Outline=3,Shadow=2,Alignment=2,MarginV=40'`;

    ffmpeg(videoPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-vf', subtitleFilter,
        '-preset', 'ultrafast',  // Much faster encoding
        '-crf', '28',            // Lower quality, faster processing
        '-movflags', '+faststart',  // Enable fast web playback
        '-threads', '0'          // Use all CPU cores
      ])
      .on('start', (cmd) => {
        console.log(`   FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`   Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`   ✅ SRT subtitle burned successfully!`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`   ❌ FFmpeg error:`, err.message);
        reject(err);
      })
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

const server = app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

// Set server timeout for long-running video processing
server.timeout = SERVER_TIMEOUT;
server.keepAliveTimeout = SERVER_TIMEOUT;
server.headersTimeout = SERVER_TIMEOUT + 1000;
