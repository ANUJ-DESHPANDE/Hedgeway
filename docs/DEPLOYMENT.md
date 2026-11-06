# Deployment and operation

## Supported deployment shape

One long-running Node 24 process, one persistent SQLite volume, one owner, HTTPS through a trusted reverse proxy. Do not use an ephemeral filesystem, multiple replicas sharing a network-mounted SQLite file, or a static-only host. WebSocket egress and long-lived SSE responses must be supported.

## Local use

Run the README commands. `npm run setup` creates `.env` and a 32-byte encryption key. It preserves existing keys. Default host is `127.0.0.1`; without a workspace password, the API accepts only localhost hostnames and approved local origins.

In Integrations, paste an Upstox Analytics Token into the password field and select Upstox. The server validates market-quote access before saving the encrypted token. Alternatively set `UPSTOX_ACCESS_TOKEN` in the server's secret manager. Removing a UI-saved token does not delete an environment-injected token; remove it from that environment and restart. Revoke compromised credentials at the broker too.

For Kite, save the app API key and secret in Integrations, or set `KITE_API_KEY` and `KITE_API_SECRET` in the deployment secret manager. UI-saved app credentials are encrypted and only verified by completing the broker login. Register the exact displayed callback URL with Zerodha. Keep `TOKEN_ENCRYPTION_KEY` stable. Complete the official broker login in your browser; do not paste broker passwords or OTPs into Hedgeway. A paid market-data entitlement is needed only if Kite is selected for live/history data.

## HTTPS deployment

1. Build the image with `docker build -t hedgeway .` or use `docker compose build`.
2. Configure `.env`: `APP_PASSWORD` with at least 20 random characters, `APP_ORIGIN=https://your-hostname`, `COOKIE_SECURE=true`, a random base64 32-byte `TOKEN_ENCRYPTION_KEY`, and the desired broker credentials. `npm run setup` generates the encryption key for local deployments. Never commit this file.
3. Run `docker compose up -d`. Compose publishes only to the host's loopback interface and mounts a named persistent volume at `/app/data`.
4. Terminate TLS at Caddy or an equivalent reverse proxy. `Caddyfile.example` includes unbuffered streaming. Keep the Node port private. Do not log callback query strings, which carry a one-time broker request token.
5. Verify `/api/health`, unauthenticated rejection on `/api/dashboard`, login cookie flags, live-feed timestamps and a real broker reconnect during market hours.

Production remote startup refuses missing/short passwords, insecure cookie settings or non-HTTPS public origins. The reverse proxy's IP is intentionally not blindly trusted for rate limiting; on this single-owner deployment the limits apply to the proxy address. Do not enable unrestricted Express `trust proxy`.

For managed environments with a TLS-inspecting egress proxy, the Dockerfile accepts an optional BuildKit `proxy_ca` secret. Mount the runtime CA and set `NODE_EXTRA_CA_CERTS` if required by that environment; never disable TLS verification or bake session credentials into the image.

## Data protection and backup

```sh
npm run backup -- ./backups/hedgeway-YYYY-MM-DD.sqlite
```

This uses SQLite's online backup API, not a raw copy of a database with pending WAL writes. Encrypt backups at rest and store the encryption key separately. Losing the key requires reconnecting brokers. Keep `.env`, database files, backups, API tokens and account data out of Git.

To restore, stop the service, retain a copy of the current database, place the verified backup at `DATABASE_PATH`, restore the corresponding encryption key, remove only the stopped database's obsolete WAL/SHM companions, then restart and verify integrity. Do not overwrite an open database.

## Monitoring and retention

`/api/health` checks process/database availability. The authenticated Integrations page shows provider job outcomes and stream status. HTTP health alone does not prove broker data is current. Monitor broker connection state, last heartbeat, last tick, ingestion failures, disk space and backup success.

The scheduler refreshes research and IPO data while the process runs. It does not send messages or trade. Provider failures are recorded independently. Research bodies are capped at short excerpts; query pages and job displays are bounded. Durable article, snapshot and audit history currently grows over time: establish a retention/archival policy appropriate to your disk before long-term unattended operation.

## Release checks

Run `npm ci`, `npm run check`, `npm audit --audit-level=moderate`, a container build and a staging smoke test. Back up before upgrading. Review schema migrations. Keep the lockfile and dependency update PRs under review. CI validates code and the image build but cannot validate a private brokerage login without your account.

## Security scope

The app has session authentication, server-side origin enforcement, rate limits, CSP/security headers, input validation, parameterized SQL, encrypted broker tokens and expiring one-use callback state. It has not undergone an independent penetration test or multi-tenant security assessment. Do not treat a successful build as a certification or expose it as a public financial service without further review.
