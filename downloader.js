const path = require('path');
const fs = require('fs/promises');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); // مسار ffmpeg الثابت

const ytdlp = new YTDlpWrap(); // يجلب الثنائي إذا لزم

const OUT_DIR = path.join(process.cwd(), 'downloads');
async function ensureOutDir() {
  try { await fs.mkdir(OUT_DIR, { recursive: true }); } catch {}
}

function buildArgs(url) {
  const args = [
    '--no-warnings',
    '--ffmpeg-location', ffmpegPath,
    '-f', 'bv*+ba/b',                 // أفضل توليفة
    '--merge-output-format', 'mp4',
    '-N', '4',                        // concurrent fragments
    '-R', '10',                       // retries
    '--fragment-retries', '10',
    '--retry-sleep', 'linear=1:10',
    '--socket-timeout', '30',
    '--no-part',
    '--newline',
    url,
    '-o', path.join(OUT_DIR, '%(title).80s.%(ext)s')
  ];

  const cookies = process.env.COOKIES_FILE;
  if (cookies) args.unshift('--cookies', cookies);
  return args;
}

async function downloadVideo(url) {
  await ensureOutDir();
  const args = buildArgs(url);

  return new Promise((resolve, reject) => {
    let lastOut = '';
    const proc = ytdlp.exec(args);

    proc.stdout.on('data', d => {
      lastOut = d.toString(); // للتشخيص
      if (process.env.NODE_ENV !== 'production') process.stdout.write(d);
    });
    proc.stderr.on('data', e => {
      if (process.env.NODE_ENV !== 'production') process.stderr.write(e);
    });
    proc.on('error', reject);
    proc.on('close', async (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exit ${code}: ${lastOut}`));
      // ابحث عن اسم الملف من السطر الأخير أو التقط آخر ملف تم إنشاؤه
      const files = await fs.readdir(OUT_DIR);
      const stats = await Promise.all(files.map(async f => ({ f, t: (await fs.stat(path.join(OUT_DIR, f))).mtimeMs })));
      stats.sort((a, b) => b.t - a.t);
      resolve(path.join(OUT_DIR, stats[0].f));
    });
  });
}

module.exports = { downloadVideo };
