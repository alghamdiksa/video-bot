// downloader.js — yt-dlp-wrap مع تنزيل الباينري مباشرة + دعم الكوكيز
const fs = require('fs');
const path = require('path');
const https = require('https');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static');

const BIN_DIR  = path.join(__dirname, 'bin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const OUT_DIR  = path.join(__dirname, 'downloads');

// تنزيل مباشر بدون استدعاء API (نتجاوز Rate-Limit)
async function downloadDirect(url, dest) {
  await new Promise((resolve, reject) => {
    const ua = { headers: { 'User-Agent': 'curl/8' }, timeout: 15000 };
    const handle = res => {
      // اتّبع التحويل 302 إلى ملف الإصدار
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('No redirect location'));
        https.get(loc, ua, handle).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} when downloading yt-dlp`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    };
    https.get(url, ua, handle).on('error', reject);
  });
}

async function ensureBinary() {
  await fs.promises.mkdir(BIN_DIR, { recursive: true });
  if (!fs.existsSync(BIN_PATH)) {
    const fallbackUrl =
      process.env.YTDLP_URL ||
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    await downloadDirect(fallbackUrl, BIN_PATH);
    await fs.promises.chmod(BIN_PATH, 0o755);
  }
  return new YTDlpWrap(BIN_PATH);
}

async function downloadVideo(url) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const ytdlp = await ensureBinary();

  const outTpl = path.join(OUT_DIR, '%(title)s.%(ext)s');
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

  const args = [
    url,
    '-o', outTpl,
    '--no-playlist',
    '--restrict-filenames',
    '-S', 'res,ext:mp4:m4a',
    '--add-header', `User-Agent:${ua}`,
    '--force-ipv4',
    '--concurrent-fragments', '1'
  ];

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  // دعم الكوكيز (يوتيوب/إنستقرام)
  const cookiesFile = process.env.COOKIES_FILE;
  if (cookiesFile) {
    args.push('--cookies', cookiesFile);
  }

  return new Promise((resolve, reject) => {
    const child = ytdlp.exec(args);
    child.on('error', reject);
    child.on('close', async code => {
      if (code !== 0) return reject(new Error('yt-dlp exited with code ' + code));
      try {
        const files = await fs.promises.readdir(OUT_DIR);
        if (!files.length) return reject(new Error('no output file'));
        // اختر أحدث ملف
        const withTime = await Promise.all(files.map(async f => {
          const p = path.join(OUT_DIR, f);
          const s = await fs.promises.stat(p);
          return { p, t: s.mtimeMs };
        }));
        withTime.sort((a, b) => b.t - a.t);
        resolve(withTime[0].p);
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { downloadVideo };
