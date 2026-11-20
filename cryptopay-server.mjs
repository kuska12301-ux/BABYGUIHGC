import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'telegram-giveaway-miniapp.html');
const envPath = path.join(here, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

const port = Number(process.env.PORT || 8787);
const testnet = process.env.CRYPTOPAY_TESTNET === '1';
const apiBase = testnet ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api';
const dataDir = process.env.DATA_DIR || path.join(here, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const invoiceFile = path.join(dataDir, 'cryptopay-invoices.json');
const profilesFile = path.join(dataDir, 'telegram-profiles.json');
let persisted = {};
try { persisted = JSON.parse(fs.readFileSync(invoiceFile, 'utf8')); } catch {}
const invoices = new Map(Object.entries(persisted));
function persistInvoices() { fs.writeFileSync(invoiceFile, JSON.stringify(Object.fromEntries(invoices)), 'utf8'); }
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(profilesFile, 'utf8')); } catch {}
function persistProfiles() { fs.writeFileSync(profilesFile, JSON.stringify(profiles), 'utf8'); }
const token = process.env.CRYPTO_PAY_API_TOKEN || '';

function telegramUserFromInitData(initData) {
  const botToken = process.env.BOT_TOKEN || '';
  if (!botToken || typeof initData !== 'string' || !initData) return null;
  const values = new URLSearchParams(initData);
  const receivedHash = values.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;
  const authDate = Number(values.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 86400) return null;
  values.delete('hash');
  const dataCheckString = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(calculatedHash))) return null;
  try { return JSON.parse(values.get('user') || ''); } catch { return null; }
}
function profileFromTelegramUser(user, existing = {}) {
  const telegramId = String(user.id);
  return {
    ...existing,
    id: telegramId,
    telegramId,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь Telegram',
    tag: user.username ? `@${user.username}` : '',
    avatar: String(user.first_name || 'М').slice(0, 1),
    avatarUrl: user.photo_url || '',
    color: existing.color || 'linear-gradient(145deg,#9d8cff,#4f7be8)',
    tickets: Number(existing.tickets) || 0,
    registeredAt: existing.registeredAt || new Date().toISOString().slice(0, 10),
    lastSeenAt: new Date().toISOString(),
    flag: Boolean(existing.flag)
  };
}

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 8192) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
async function cryptoCall(method, body) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': token }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error?.name || `Crypto Pay API error (${response.status})`);
  return data.result;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/telegram-giveaway-miniapp.html')) {
      const adminId = process.env.ADMIN_ID || '';
      const botUsername = process.env.BOT_USERNAME || 'Baby_Gift_app';
      const bootstrap = '<script>window.BABY_GIFT_ADMIN_ID=' + JSON.stringify(adminId) + ';window.BABY_GIFT_BOT_USERNAME=' + JSON.stringify(botUsername) + ';</script>';
      const html = fs.readFileSync(htmlPath, 'utf8').replace('<script>', bootstrap + '<script>');
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/api/profile') {
      const body = await readBody(req);
      const user = telegramUserFromInitData(body.initData);
      if (!user?.id) return send(res, 401, { error: 'Открой приложение через Telegram, чтобы загрузить профиль.' });
      const profile = profileFromTelegramUser(user, profiles[String(user.id)]);
      profiles[String(user.id)] = profile;
      persistProfiles();
      return send(res, 200, { profile });
    }
    if (req.method === 'POST' && url.pathname === '/api/profiles') {
      const body = await readBody(req);
      const user = telegramUserFromInitData(body.initData);
      const adminId = String(process.env.ADMIN_ID || '');
      if (!user?.id) return send(res, 401, { error: 'Требуется открыть приложение через Telegram.' });
      if (!adminId || String(user.id) !== adminId) return send(res, 403, { error: 'Список пользователей доступен только организатору.' });
      const list = Object.values(profiles).map(p => ({
        id: p.id, telegramId: p.telegramId, name: p.name, tag: p.tag,
        avatar: p.avatar, avatarUrl: p.avatarUrl, registeredAt: p.registeredAt, lastSeenAt: p.lastSeenAt
      })).sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
      return send(res, 200, { profiles: list });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!token) return send(res, 503, { error: 'Укажи CRYPTO_PAY_API_TOKEN в файле .env и перезапусти сервер.' });
      if (req.method === 'POST' && url.pathname === '/api/create-invoice') {
        const body = await readBody(req);
        const tickets = Number(body.tickets);
        if (!Number.isSafeInteger(tickets) || tickets < 1 || tickets > 100000) return send(res, 400, { error: 'Количество билетов должно быть от 1 до 100000.' });
        const userId = String(body.userId || '').slice(0, 80);
        if (!userId) return send(res, 400, { error: 'Не удалось определить пользователя.' });
        const amount = (tickets * 3 / 100).toFixed(2);
        const nonce = crypto.randomUUID();
        const invoice = await cryptoCall('createInvoice', {
          currency_type: 'fiat', fiat: 'USD', amount,
          description: `${tickets} билет(ов) Baby Gift`,
          payload: nonce,
          expires_in: 3600
        });
        invoices.set(String(invoice.invoice_id), { tickets, userId, amount, createdAt: Date.now() });
        persistInvoices();
        const payUrl = invoice.mini_app_invoice_url || invoice.web_app_invoice_url || invoice.bot_invoice_url;
        if (!payUrl) return send(res, 502, { error: 'CryptoBot не вернул ссылку на оплату.' });
        return send(res, 200, { invoiceId: String(invoice.invoice_id), payUrl });
      }
      if (req.method === 'GET' && url.pathname === '/api/invoice-status') {
        const id = url.searchParams.get('id') || '';
        const record = invoices.get(id);
        if (!record) return send(res, 404, { error: 'Счёт не найден. Создай новый счёт и попробуй снова.' });
        if ((url.searchParams.get('userId') || '') !== record.userId) return send(res, 403, { error: 'Этот счёт принадлежит другому профилю.' });
        const result = await cryptoCall('getInvoices', { invoice_ids: id });
        const invoice = result.find(item => String(item.invoice_id) === id);
        if (!invoice) return send(res, 404, { error: 'CryptoBot не нашёл этот счёт.' });
        if (invoice.status === 'paid' && (invoice.fiat !== 'USD' || Number(invoice.amount) !== Number(record.amount))) return send(res, 409, { error: 'Сумма счёта не совпала; билеты не начислены.' });
        return send(res, 200, { status: invoice.status, ...(invoice.status === 'paid' ? { tickets: record.tickets } : {}) });
      }
      return send(res, 404, { error: 'API route not found' });
    }
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error('Request failed:', error.message);
    return send(res, 502, { error: error.message || 'Не удалось связаться с CryptoBot.' });
  }
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Baby Gift app listening on 0.0.0.0:${port}`);
  console.log(`Crypto Pay mode: ${testnet ? 'testnet' : 'mainnet'}`);
  if (!token) console.log('Set CRYPTO_PAY_API_TOKEN in the hosting environment to enable invoices.');
});
