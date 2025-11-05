const fs = require('fs');
const path = require('path');
const { default: YTDlpWrap } = require('yt-dlp-wrap');
require('dotenv').config();

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

/**
 * اختيار ملف الكوكيز تلقائياً حسب المنصة.
 * أولوية أعلى لمتغير البيئة COOKIES_FILE إذا تم تعيينه.
 */
function resolveCookiesPath(url) {
  // إن تم تحديده يدوياً في Render نستخدمه كما هو
  if (process.env.COOKIES_FILE) {
    const p = path.resolve(__dirname, process.env.COOKIES_FILE);
    return fs.existsSync(p) ? p : null;
  }

  // اختيار تلقائي
  const instagram = /(^|\/\/)www\.?instagram\.com\//i.test(url);
  const youtube = /(youtube\.com|youtu\.be)/i.test(url);

  const pInstagram = path.join(__dirname, 'cookies', 'instagram_cookies.txt');
  const pYoutube   = path.join(__dirname, 'cookies', 'youtube_cookies.txt');

  if (instagram && fs.existsSync(pInstagram)) return pInstagram;
  if (youtube   && fs.existsSync(pYoutube))   return pYoutube;

  return null; // بدون كوكيز
}

/**
 * تنزيل فيديو وإرجاع المسار النهائي للملف الناتج.
 */
async function downloadVideo(url) {
  const cookiesPath = resolveCookiesPath(url);

  // اسم الملف الناتج
  const outTemplate = path.join(downloadsDir, '%(title).150s.%(ext)s');

  // yt-dlp args
  const args = [
    '-N', '4',                 // multi-thread chunks
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

  // تشغيل yt-dlp
  return new Promise((resolve, reject) => {
    let lastPath = '';
    const ytdlp = new YTDlpWrap();

    // التقاط اسم الملف الحقيقي بعد التنزيل
    ytdlp.exec(args)
      .on('ytDlpEvent', (e) => {
        // محاولة استخراج المسار من السطر
        if (typeof e === 'string') {
          const m = e.match(/Destination:\s(.+)$/i) || e.match(/\[download\]\s(.+\.(mp4|mkv|webm|mov|mp3))/i);
          if (m) lastPath = m[1].trim();
        }
      })
      .on('error', reject)
      .on('close', (code) => {
        if (code === 0) {
          // إن لم نلتقط الاسم، خمن أول ملف أحدث في مجلد التنزيلات
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

module.exports = { downloadVideo };
