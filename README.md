# store.jascmartin.com

Ecommerce storefront for **Jason Martin Consulting**. Theme matches [jascmartin.com](https://jascmartin.com): dark navy, Inter + JetBrains Mono, cyan `#00d4ff` / teal `#14b8a6`.

Sells two catalogs from one cart:

- Consulting packages (discovery call, assessment, vCISO / vCIO retainers, incident workshop)
- Custom apps already in this GitHub account (Family Vault, Money, Knowing Faith, QuickMail, Family Hub request)

Accounts are **Google OAuth**. Checkout is **Stripe** when keys exist; otherwise orders are stored in D1 as demo / request so you can take the first orders without payment wiring.

## Stack

| Piece | Choice |
| --- | --- |
| Runtime | Cloudflare Workers + static assets |
| API | Hono |
| Data | Cloudflare D1 (`store-db`) |
| Auth | Google OAuth (openid email profile) |
| Payments | Stripe Checkout (optional until secrets are set) |
| Domain | `store.jascmartin.com` (already linked from the marketing site) |

## Deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create store-db
```

Paste the printed `database_id` into `wrangler.toml`. Then:

```bash
npm run db:remote
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
# optional until you are ready to charge
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Set `[vars]` in `wrangler.toml`:

- `APP_URL = "https://store.jascmartin.com"`
- `GOOGLE_CLIENT_ID = "<your web client id>"`

Google Cloud OAuth client (Web application):

- Authorized JavaScript origin: `https://store.jascmartin.com`
- Authorized redirect URI: `https://store.jascmartin.com/auth/google/callback`

Deploy and attach the hostname:

```bash
npm run deploy
```

In the worker: **Settings → Domains & Routes → Add** `store.jascmartin.com`.

Stripe webhook (when live): `https://store.jascmartin.com/api/webhooks/stripe` for `checkout.session.completed`.

## Local

```bash
npm install
npx wrangler d1 create store-db   # once
# put the id in wrangler.toml
npm run db:local
printf "GOOGLE_CLIENT_ID=...\nGOOGLE_CLIENT_SECRET=...\nSESSION_SECRET=dev\n" > .dev.vars
npm run dev
```

Use `http://localhost:8787/auth/google/callback` as a second Google redirect URI for local tests.

## Pricing

Package prices in `migrations/0001_init.sql` are **starting list prices**, not a signed SOW. Change them before you take paid orders. Family Hub is request-only (private household app).

## Related repos

- Marketing site: `Caddie6271/consultantwebsite`
- Work / consultant app: `Caddie6271/consultantapp`
- Apps listed in the store: `familyvault`, `app.money`, `knowingfaith`, `quickmail`, `familyapp`
