require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { downloadVideoWithRetry } = require('./downloader'); // ✅ التعديل هنا

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

// المعالجة
bot.on('text', async (ctx) => {
  const url = (ctx.message.text || '').trim();
  if (!/^https?:\/\//i.test(url)) return ctx.reply('أرسل رابط صحيح http/https.');

  const wait = await ctx.reply('⏳ يحاول التنزيل...');
  try {
    const filePath = await downloadVideoWithRetry(url, {
      maxRetries: 3,
      delayMs: 5000,
      onRetry: async ({ attempt, maxRetries }) => {
        // attempt = 1 يعني فشلت الأولى والآن سيبدأ المحاولة 2
        const nextAttempt = attempt + 1;
        if (nextAttempt <= maxRetries) {
          try {
            await ctx.reply(`⏳ تعذّر التنزيل. إعادة المحاولة (${nextAttempt}/${maxRetries})...`);
          } catch {}
        }
      }
    });

    // لو الدالة رجعت null/undefined لأي سبب، اعتبرها فشل
    if (!filePath) {
      await ctx.reply('تعذّر التنزيل بعد 3 محاولات. جرّب رابطاً آخر أو حدّث الكوكيز.');
      return;
    }

    await ctx.replyWithVideo({ source: filePath });
  } catch (e) {
    console.error('Download error:', e?.stderr || e?.message || e);
    await ctx.reply('تعذّر التنزيل بعد 3 محاولات. جرّب رابطاً آخر أو حدّث الكوكيز.');
  } finally {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
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

// إيقاف نظيف
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));

// CLI helpers اختيارية
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
