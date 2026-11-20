# Baby Gift

Telegram Mini App with a Node.js Telegram bot and Crypto Pay invoice endpoints.

## Local start

1. Use Node.js 20+.
2. Copy `.env.example` to `.env` and fill in the bot token, Crypto Pay token, and an HTTPS `WEBAPP_URL`.
3. Run `npm start` and open the app at `http://127.0.0.1:8787`.

## BotHost

Set the environment variables `BOT_TOKEN`, `ADMIN_ID`, `BOT_USERNAME`, `WEBAPP_URL`, `CRYPTO_PAY_API_TOKEN`, `CRYPTOPAY_TESTNET=0`, and `PORT` in the BotHost environment settings. Deploy with `index.mjs` as the entrypoint. Enable a BotHost HTTPS domain; the app server listens on `0.0.0.0:$PORT` and serves `/health`.

Secrets belong in BotHost environment settings, never in Git. Keep `.env` out of the repository.

## Profile storage note

When opened as a Telegram Mini App, the app sends Telegram's signed `initData` to the server. The server verifies it with `BOT_TOKEN` and records the user's Telegram ID, name, username, avatar URL, and last-seen time in `DATA_DIR/telegram-profiles.json`. Only the configured `ADMIN_ID` can retrieve the shared profile list. Set `DATA_DIR` to persistent storage on the host if its app filesystem is temporary.

Raffle state and ticket balances are still browser-local. The shared profile list is for identifying registered users; it does not make raffle participation or ticket balances shared between devices.
