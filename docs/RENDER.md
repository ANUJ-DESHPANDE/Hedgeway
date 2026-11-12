# Render hosting

Hedgeway needs a long-running Node server and durable SQLite storage. GitHub Pages cannot run its backend, AI requests, ingestion worker or brokerage connections.

## Cost decision before deployment

Render Free is suitable only for a disposable demonstration of this version. It sleeps after 15 idle minutes and loses local files on restart, redeploy or spin-down. That includes conversations, journal entries and saved integrations. Free services cannot attach persistent disks. Free Render Postgres expires after 30 days and is not a drop-in replacement for SQLite.

A durable Render deployment therefore requires a paid web service and persistent disk. Do not provision either without the owner's explicit cost approval. No service has been provisioned by adding this guide.

Official limits: https://render.com/docs/free
Disk documentation: https://render.com/docs/disks

## Durable deployment configuration (requires paid plan)

Create one web service from ANUJ-DESHPANDE/Hedgeway, branch main:

- Runtime: Node; Node version: 24.
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Instances: one; never scale this SQLite application horizontally.
- Persistent disk mount: `/var/data`.
- Database path: `/var/data/hedgeway.sqlite`.

Configure these environment variables privately in Render:

| Variable | Value |
| --- | --- |
| NODE_VERSION | 24 |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| DATABASE_PATH | /var/data/hedgeway.sqlite |
| APP_ORIGIN | Exact assigned HTTPS Render URL, without trailing slash |
| COOKIE_SECURE | true |
| APP_PASSWORD | Unique random password, at least 20 characters |
| TOKEN_ENCRYPTION_KEY | Stable base64-encoded 32-byte key |
| MARKET_PROVIDER | upstox |
| UPSTOX_ACCESS_TOKEN | Owner's existing token |
| AI_PROVIDER | gemini |
| GEMINI_API_KEY | Owner's existing free-tier Google key |
| GEMINI_MODEL | gemini-3.5-flash-lite |
| ENABLE_SCHEDULER | true |

Let Render supply PORT. Never place credentials in this document, render.yaml, build arguments or GitHub. Keep Google billing disabled; free quotas can interrupt AI conversations, with no paid fallback.

## Existing workspace migration

The GitHub repository intentionally excludes the configured database and secrets. Deploying it alone will not migrate conversations or saved credentials. Use the online SQLite backup command described in DEPLOYMENT.md, transfer the backup privately into the persistent disk with the service stopped, and retain the matching encryption key. Do not copy a running database file directly. If starting fresh, configure provider credentials through server-side secrets.

## Acceptance before sharing the URL

Verify HTTPS and login, rejection of unauthenticated API access, secure cookies, real quotes with timestamps, chart history, research ingestion, a cited Gemini answer, and streaming reconnect. Save a journal entry, restart the service and confirm it persists. Check mobile layout and source failure messages. Test backup and restore before relying on the hosted journal.

## Free alternatives

Running this version on the owner's PC retains data without a hosting subscription. Fully managed free hosting requires an architectural change to a durable external database plus verification of that provider's quotas and retention; it is not accomplished by switching on GitHub Pages. Do not present an ephemeral free deployment as permanent storage.
