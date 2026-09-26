CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  href TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (cart_id) REFERENCES carts(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT OR REPLACE INTO products (id, slug, name, category, kind, price_cents, interval, summary, description, href, featured, sort_order) VALUES
('p-discover', 'discovery-call', 'Discovery Call', 'consulting', 'request', 0, NULL,
 'No-obligation 30-minute scoping call.',
 'A focused conversation about your IT and security posture, priorities, and whether a fractional engagement is the right fit. No charge. Book after you create an account so the request lands on your order history.',
 'https://jascmartin.com/contact.html', 1, 10),
('p-assess', 'security-assessment', 'Security Assessment', 'consulting', 'one_time', 350000, NULL,
 'Gap analysis, prioritized findings, and a 90-day plan.',
 'Hands-on review of identity, endpoints, logging, backup/DR, and vendor risk. Deliverable is a board-ready findings brief plus a 90-day remediation roadmap. Price is a starting package — scoped engagements may differ.',
 'https://jascmartin.com/services.html#security', 1, 20),
('p-vciso', 'vciso-retainer', 'vCISO Retainer', 'consulting', 'subscription', 450000, 'month',
 'Fractional CISO: governance, risk, compliance, board reporting.',
 'Monthly security leadership without a full-time hire. Program ownership, policy, risk register, vendor reviews, incident readiness, and executive reporting. Engagement size is confirmed on the discovery call.',
 'https://jascmartin.com/services.html#vciso', 1, 30),
('p-vcio', 'vcio-retainer', 'vCIO Retainer', 'consulting', 'subscription', 400000, 'month',
 'Fractional CIO: roadmap, budget, vendors, operations.',
 'Strategic IT leadership — multi-year roadmap, portfolio prioritization, vendor oversight, and operational maturity. Sized to your environment after discovery.',
 'https://jascmartin.com/services.html#vcio', 0, 40),
('p-tabletop', 'incident-readiness', 'Incident Readiness Workshop', 'consulting', 'one_time', 250000, NULL,
 'Tabletop exercise plus an actionable IR plan refresh.',
 'Half-day tabletop with leadership and operators, followed by an updated incident response runbook and a punch-list of detection gaps.',
 'https://jascmartin.com/services.html#security', 0, 50),
('p-vault', 'family-vault', 'Family Vault', 'app', 'subscription', 900, 'month',
 'Family password manager on Cloudflare Workers.',
 'Zero-knowledge style vault hosted at vault.jascmartin.com. Built for a household: shared collections, invite-only members, edge-hosted. Subscription unlocks the family workspace after checkout.',
 'https://vault.jascmartin.com', 1, 60),
('p-money', 'app-money', 'Money', 'app', 'subscription', 1200, 'month',
 'Personal finance workspace.',
 'Budgeting and account overview app from the app.money project. Signed-in buyers get access provisioned to their Google account email.',
 NULL, 1, 70),
('p-faith', 'knowing-faith', 'Knowing Faith', 'app', 'subscription', 800, 'month',
 'Scripture reading room — compare, look up, memorize.',
 'Study workspace at knowing.faith: passage comparison, original-language lookup, and verse memory. Supporter plan after Google sign-in. ESV access uses your own token.',
 'https://knowing.faith', 1, 80),
('p-mail', 'quickmail', 'QuickMail', 'app', 'subscription', 600, 'month',
 'Fast personal mail helper.',
 'Lightweight mail composition helper from the QuickMail project. Sold as a hosted workspace tied to your Google account.',
 NULL, 0, 90),
('p-fam', 'family-hub', 'Family Hub', 'app', 'request', 0, NULL,
 'Private family calendar, lists, and groceries.',
 'Invite-only household app planned for fam.jascmartin.com. Not a public product — request access and it will be reviewed against the family allowlist.',
 'https://fam.jascmartin.com', 0, 100);
