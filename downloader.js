// downloader.js — يستخدم yt-dlp-wrap مع تنزيل الباينري تلقائياً على Render
const fs = require('fs');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static');

const BIN_DIR = path.join(__dirname, 'bin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const OUT_DIR = path.join(__dirname, 'downloads');

async function ensureBinary() {
  await fs.promises.mkdir(BIN_DIR, { recursive: true });
  if (!fs.existsSync(BIN_PATH)) {
    // ينزّل yt-dlp من GitHub داخل مجلد المشروع (مطلوب على Render)
    await YTDlpWrap.downloadFromGithub(BIN_PATH);
  }
  return new YTDlpWrap(BIN_PATH);
}

async function downloadVideo(url) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const ytdlp = await ensureBinary();
  const outTpl = path.join(OUT_DIR, '%(title)s.%(ext)s');

  return new Promise((resolve, reject) => {
    const args = [
      url,
      '-o', outTpl,
      '--no-playlist',
      '-S', 'res,ext:mp4:m4a'
    ];
    if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);

    const child = ytdlp.exec(args);        // لن تكون undefined
    child.on('error', reject);
    child.on('close', async (code) => {
      if (code !== 0) return reject(new Error('yt-dlp exited with code ' + code));
      try {
        const files = await fs.promises.readdir(OUT_DIR);
        const stats = await Promise.all(files.map(async f => {
          const p = path.join(OUT_DIR, f);
          const s = await fs.promises.stat(p);
          return { p, t: s.mtimeMs };
        }));
        stats.sort((a, b) => b.t - a.t);
        const last = stats[0]?.p;
        if (!last) return reject(new Error('no output file'));
        resolve(last);
      } catch (e) { reject(e); }
    });
  });
}

module.exports = { downloadVideo };
