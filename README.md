# video-bot

بوت تيليجرام لتنزيل الفيديوهات عبر yt-dlp.

## التشغيل المحلي
1) انسخ `.env.example` إلى `.env` واملأ القيم.
2) `npm ci`
3) `npm run dev` (يستخدم polling محلياً)

## النشر على Render
- Web Service (Node)
- Build Command: `npm ci`
- Start Command: `node index.js`
- Health Check Path: `/health`
- Environment:
  - BOT_TOKEN
  - APP_BASE_URL = https://YOUR-RENDER-URL.onrender.com
  - WEBHOOK_SECRET = سلسلة طويلة
  - (اختياري) COOKIES_FILE=./cookies/cookies.txt
- عيّن الويب هوك بعد أول تشغيل: `npm run set:webhook`

## ملاحظات
- إنستقرام قد يتطلب كوكيز صالحة.
- استخدم Persistent Disk لو أردت الاحتفاظ بالملفات عبر إعادة التشغيل.
