# Baby Gift

Telegram Mini App with a Node.js Telegram bot and Crypto Pay invoice endpoints.

## Local start

1. Use Node.js 20+.
2. Copy `.env.example` to `.env` and fill in the bot token, Crypto Pay token, and an HTTPS `WEBAPP_URL`.
3. Run `npm start` and open the app at `http://127.0.0.1:8787`.

## BotHost

Set the environment variables `BOT_TOKEN`, `ADMIN_ID`, `BOT_USERNAME`, `WEBAPP_URL`, `CRYPTO_PAY_API_TOKEN`, `CRYPTOPAY_TESTNET=0`, and `PORT` in the BotHost environment settings. Deploy with `index.mjs` as the entrypoint. Enable a BotHost HTTPS domain; the app server listens on `0.0.0.0:$PORT` and serves `/health`.

Secrets belong in BotHost environment settings, never in Git. Keep `.env` out of the repository.

## Current app storage note

Raffle and profile data in the current Mini App are still browser-local. A shared production database and server-side authorization are required before different Telegram users can share one raffle state or before the client-side organizer tools can be treated as a security boundary.
