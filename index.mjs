import './cryptopay-server.mjs';

const token = process.env.BOT_TOKEN || '';
const adminId = String(process.env.ADMIN_ID || '');
const username = String(process.env.BOT_USERNAME || 'Baby_Gift_app').replace(/^@/, '');
const webAppUrl = process.env.WEBAPP_URL || '';
if (!token) throw new Error('BOT_TOKEN environment variable is required');
if (!/^https:\/\//i.test(webAppUrl)) throw new Error('WEBAPP_URL must be an HTTPS URL from BotHost');
if (!adminId) throw new Error('ADMIN_ID environment variable is required');
const api = `https://api.telegram.org/bot${token}`;
let offset = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function telegram(method, body) {
  const response = await fetch(`${api}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram API ${method} failed`);
  return data.result;
}
async function configureMenu() {
  try { await telegram('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Baby Gift', web_app: { url: webAppUrl } } }); }
  catch (error) { console.error('Menu button setup failed:', error.message); }
}
async function handle(update) {
  offset = Math.max(offset, Number(update.update_id) + 1);
  const message = update.message;
  if (!message?.text) return;
  const command = message.text.trim().split(/\s+/, 1)[0].split('@')[0].toLowerCase();
  if (command === '/start' || command === '/app') {
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: 'Добро пожаловать в Baby Gift. Открой приложение, чтобы участвовать в розыгрышах и управлять билетами.',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть Baby Gift', web_app: { url: webAppUrl } }]] }
    });
    return;
  }
  if (command === '/admin') {
    const isAdmin = String(message.from?.id || '') === adminId;
    if (!isAdmin) return telegram('sendMessage', { chat_id: message.chat.id, text: 'Эта команда доступна только организатору.' });
    return telegram('sendMessage', {
      chat_id: message.chat.id,
      text: `Панель организатора Baby Gift (@${username})`,
      reply_markup: { inline_keyboard: [[{ text: 'Открыть админку', web_app: { url: webAppUrl } }]] }
    });
  }
  if (command === '/help') return telegram('sendMessage', { chat_id: message.chat.id, text: 'Команды: /start — открыть приложение, /admin — панель организатора.' });
}
async function poll() {
  while (true) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      for (const update of updates) {
        try { await handle(update); } catch (error) { console.error('Update handling failed:', error.message); }
      }
    } catch (error) {
      console.error('Telegram polling failed:', error.message);
      await sleep(3000);
    }
  }
}
console.log(`Telegram bot @${username} starting; admin ID configured.`);
await configureMenu();
await poll();
