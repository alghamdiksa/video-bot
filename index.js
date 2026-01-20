require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { downloadVideoWithRetry } = require('./downloader');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');

const app = express();
const bot = new Telegraf(BOT_TOKEN);

const PORT = process.env.PORT || 10000;
const SECRET = process.env.WEBHOOK_SECRET || 'secret';
const BASE_URL = process.env.APP_BASE_URL;

// Healthcheck لِـ Render
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Webhook endpoint
app.use(bot.webhookCallback(`/tg/${SECRET}`));

// أوامر
bot.start(ctx => ctx.reply(
  'أرسل رابط فيديو من YouTube/Instagram وسأحاول تنزيله.',
  Markup.removeKeyboard()
));
bot.help(ctx => ctx.reply(
  '• أرسل رابط يبدأ بـ http/https.\n• إنستقرام غالباً يحتاج كوكيز.\n• حدّث الكوكيز إذا ظهر Rate Limit.'
));

/**
 * Dedup: منع تنفيذ نفس الرسالة مرتين (حتى لو وصلت من تيليجرام ثانية)
 * هذا ضروري مع webhook لأن نفس update قد يصل أكثر من مرة. :contentReference[oaicite:2]{index=2}
 */
const seen = new Map(); // key => timestamp
const SEEN_TTL_MS = 2 * 60 * 1000;

function seenCleanup() {
  const now = Date.now();
  for (const [k, t] of seen.entries()) {
    if (now - t > SEEN_TTL_MS) seen.delete(k);
  }
}

bot.on('text', async (ctx) => {
  seenCleanup();

  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  const key = `${chatId}:${messageId}`;
  if (seen.has(key)) return;     // ✅ تجاهل التكرار فوراً
  seen.set(key, Date.now());     // ✅ سجّلها

  const url = (ctx.message.text || '').trim();
  if (!/^https?:\/\//i.test(url)) return ctx.reply('أرسل رابط صحيح http/https.');

  const wait = await ctx.reply('⏳ يحاول التنزيل...');

  try {
    // ✅ هنا فقط 3 محاولات ثم توقف
    const filePath = await downloadVideoWithRetry(url, {
      maxRetries: 3,
      delayMs: 5000
    });

    await ctx.replyWithVideo({ source: filePath });

  } catch (e) {
    console.error('Download error:', e?.stderr || e?.message || e);
    await ctx.reply('تعذّر التنزيل بعد 3 محاولات. جرّب رابطاً آخر أو حدّث الكوكيز.');
  } finally {
    try { await ctx.telegram.deleteMessage(chatId, wait.message_id); } catch {}
  }
});

// تشغيل HTTP + ضبط Webhook عند توفر BASE_URL
app.listen(PORT, async () => {
  console.log(`HTTP health server at :${PORT}`);
  if (BASE_URL) {
    const webhookUrl = `${BASE_URL}/tg/${SECRET}`;
    try {
      await bot.telegram.setWebhook(webhookUrl);
      console.log('Webhook set to', webhookUrl);
    } catch (e) {
      console.warn('Failed to set webhook:', e.message);
    }
  } else {
    bot.launch().then(() => console.log('Bot started with long polling'));
  }
});

// إيقاف نظيف (بدون كراش لو البوت مو شغال)
process.on('SIGINT', () => { try { bot.stop('SIGINT'); } catch {} });
process.on('SIGTERM', () => { try { bot.stop('SIGTERM'); } catch {} });
