// index.js — Telegraf + Express + yt-dlp (Webhook على Render، Polling محلياً)
require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { downloadVideo } = require('./downloader');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');

const bot = new Telegraf(BOT_TOKEN);
const app = express();

const PORT   = process.env.PORT || 10000;
const SECRET = process.env.WEBHOOK_SECRET || 'secret';
const BASE_URL = process.env.APP_BASE_URL;

// لتتبع حالة التشغيل (Polling فقط)
let launchedWithPolling = false;

// صحّة الخدمة لـ Render
app.get('/health', (_req, res) => res.status(200).send('ok'));

// صفحة جذر اختيارية (تشخيص)
app.get('/', (_req, res) => res.status(200).send('video-bot up'));

// Webhook endpoint (Telegraf middleware)
app.use(bot.webhookCallback(`/tg/${SECRET}`));

// أوامر
bot.start((ctx) =>
  ctx.reply('أرسل رابط فيديو (YouTube/Instagram...) وسأحاول تنزيله.', Markup.removeKeyboard())
);
bot.help((ctx) =>
  ctx.reply('أرسل رابط يبدأ بـ http/https. بعض المواقع (مثل إنستقرام) قد تحتاج cookies.txt صالح.')
);

// معالجة الروابط النصية
bot.on('text', async (ctx) => {
  const url = (ctx.message.text || '').trim();
  if (!/^https?:\/\//i.test(url)) return ctx.reply('أرسل رابط صحيح يبدأ بـ http أو https.');

  const note = await ctx.reply('⏳ يحاول التنزيل...');
  try {
    const filePath = await downloadVideo(url);
    await ctx.replyWithVideo({ source: filePath });
  } catch (e) {
    console.error('[download error]', e);
    await ctx.reply('تعذر التنزيل حالياً. جرّب رابطاً آخر أو حدّث الكوكيز ثم أعد المحاولة.');
  } finally {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, note.message_id); } catch {}
  }
});

// تشغيل HTTP + ضبط الويب هوك أو Polling محلياً
app.listen(PORT, async () => {
  console.log(`HTTP health server at :${PORT}`);

  if (BASE_URL) {
    const webhookUrl = `${BASE_URL}/tg/${SECRET}`;
    try {
      await bot.telegram.setWebhook(webhookUrl);
      console.log('Webhook set to', webhookUrl);
    } catch (e) {
      console.warn('Failed to set webhook on boot:', e.message);
    }
  } else {
    // تشغيل محلي (بدون BASE_URL): Polling
    try {
      await bot.launch();
      launchedWithPolling = true;
      console.log('Bot started with long polling');
    } catch (e) {
      console.error('Failed to launch bot (polling):', e);
    }
  }
});

// إنهاء نظيف: أوقف البوت فقط إذا كان يعمل بـ Polling
process.on('SIGINT',  () => { try { if (launchedWithPolling) bot.stop('SIGINT');  } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { if (launchedWithPolling) bot.stop('SIGTERM'); } catch {} process.exit(0); });

// أوامر CLI لاستخدامها من الـ Shell في Render
if (process.argv.includes('--set-webhook')) {
  (async () => {
    if (!BASE_URL) throw new Error('APP_BASE_URL not set');
    const url = `${BASE_URL}/tg/${SECRET}`;
    console.log('Setting webhook to', url);
    await bot.telegram.setWebhook(url);
    console.log('Done');
    process.exit(0);
  })();
}

if (process.argv.includes('--delete-webhook')) {
  (async () => {
    console.log('Deleting webhook');
    await bot.telegram.deleteWebhook();
    console.log('Done');
    process.exit(0);
  })();
}
