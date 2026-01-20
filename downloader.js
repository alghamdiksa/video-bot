const fs = require('fs');
const path = require('path');
const { default: YTDlpWrap } = require('yt-dlp-wrap');
require('dotenv').config();

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

// اختيار ملف الكوكيز تلقائياً
function resolveCookiesPath(url) {
  if (process.env.COOKIES_FILE) {
    const p = path.resolve(__dirname, process.env.COOKIES_FILE);
    return fs.existsSync(p) ? p : null;
  }

  const instagram = /(^|\/\/)www\.?instagram\.com\//i.test(url);
  const youtube = /(youtube\.com|youtu\.be)/i.test(url);

  const pInstagram = path.join(__dirname, 'cookies', 'instagram_cookies.txt');
  const pYoutube = path.join(__dirname, 'cookies', 'youtube_cookies.txt');

  if (instagram && fs.existsSync(pInstagram)) return pInstagram;
  if (youtube && fs.existsSync(pYoutube)) return pYoutube;

  return null;
}

// تنزيل الفيديو (الكود الأصلي بدون أي تعديل)
async function downloadVideo(url) {
  const cookiesPath = resolveCookiesPath(url);
  const outTemplate = path.join(downloadsDir, '%(title).150s.%(ext)s');
  const args = [
    '-N', '4',
    '--no-playlist',
    '--no-warnings',
    '--force-overwrites',
    '-o', outTemplate,
    url
  ];

  if (cookiesPath) {
    args.unshift(cookiesPath);
    args.unshift('--cookies');
  }

  return new Promise((resolve, reject) => {
    let lastPath = '';
    const YTDLP_PATH = process.env.YTDLP_PATH || path.join(__dirname, 'bin', 'yt-dlp');
    const ytdlp = new YTDlpWrap(YTDLP_PATH);

    ytdlp.exec(args)
      .on('ytDlpEvent', (e) => {
        if (typeof e === 'string') {
          const m =
            e.match(/Destination:\s(.+)$/i) ||
            e.match(/\[download\]\s(.+\.(mp4|mkv|webm|mov|mp3))/i);
          if (m) lastPath = m[1].trim();
        }
      })
      .on('error', reject)
      .on('close', (code) => {
        if (code === 0) {
          if (!lastPath) {
            const files = fs.readdirSync(downloadsDir)
              .map(f => ({ f, t: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
              .sort((a, b) => b.t - a.t);
            if (files[0]) lastPath = path.join(downloadsDir, files[0].f);
          }
          return resolve(lastPath);
        }
        reject(new Error(`yt-dlp exited with code ${code}`));
      });
  });
}

/* =========================================================
   إضافة: تنزيل مع إعادة المحاولة (3 مرات فقط)
   بدون المساس بالكود الأصلي
========================================================= */

async function downloadVideoWithRetry(url, options = {}) {
  const {
    maxRetries = 3,
    delayMs = 5000,
    onRetry = null,
    isFatal = null
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadVideo(url);
    } catch (err) {
      lastError = err;

      const msg = (err && err.message)
        ? String(err.message).toLowerCase()
        : String(err).toLowerCase();

      // أخطاء قاتلة: لا تعيد المحاولة
      const fatalDefault =
        msg.includes('403') ||
        msg.includes('cookie') ||
        msg.includes('cloudflare') ||
        msg.includes('captcha') ||
        msg.includes('sign in') ||
        msg.includes('login') ||
        msg.includes('forbidden');

      const fatal = typeof isFatal === 'function'
        ? !!isFatal(err)
        : fatalDefault;

      if (fatal) throw err;

      if (attempt === maxRetries) throw err;

      if (typeof onRetry === 'function') {
        try {
          onRetry({ attempt, maxRetries, error: err });
        } catch (_) {}
      }

      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  throw lastError || new Error('Download failed');
}

// التصدير (إضافة فقط)
module.exports = {
  downloadVideo,
  downloadVideoWithRetry
};
