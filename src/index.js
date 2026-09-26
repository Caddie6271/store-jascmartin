import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const app = new Hono();

function jsonError(c, status, message) {
  return c.json({ error: message }, status);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function currentUser(c) {
  const sid = getCookie(c, "sid");
  if (!sid || !c.env.DB) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  )
    .bind(sid)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return null;
  }
  return row;
}

function appUrl(c) {
  return (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "store-jascmartin",
    db: Boolean(c.env.DB),
    google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    stripe: Boolean(c.env.STRIPE_SECRET_KEY),
  })
);

app.get("/api/me", async (c) => {
  const user = await currentUser(c);
  return c.json({ user: user ? { id: user.id, email: user.email, name: user.name, picture: user.picture } : null });
});

app.get("/api/products", async (c) => {
  if (!c.env.DB) return c.json({ products: [] });
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC"
  ).all();
  return c.json({ products: results || [] });
});

app.get("/api/products/:slug", async (c) => {
  const slug = c.req.param("slug");
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE slug = ? AND active = 1")
    .bind(slug)
    .first();
  if (!product) return jsonError(c, 404, "Not found");
  return c.json({ product });
});

app.get("/auth/google", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return jsonError(c, 400, "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  const state = crypto.randomUUID();
  setCookie(c, "oauth_state", state, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
  const next = c.req.query("next") || "/account";
  setCookie(c, "oauth_next", next, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl(c)}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = getCookie(c, "oauth_state");
  const next = getCookie(c, "oauth_next") || "/account";
  deleteCookie(c, "oauth_state", { path: "/" });
  deleteCookie(c, "oauth_next", { path: "/" });
  if (!code || !state || state !== expected) return c.redirect("/?auth=failed");
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.redirect("/?auth=unconfigured");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${appUrl(c)}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) return c.redirect("/?auth=token");

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profile.email) return c.redirect("/?auth=profile");

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE google_sub = ? OR email = ?")
    .bind(profile.sub, profile.email)
    .first();
  const userId = existing?.id || newId("usr");
  if (existing) {
    await c.env.DB.prepare("UPDATE users SET name = ?, picture = ?, google_sub = ? WHERE id = ?")
      .bind(profile.name || existing.name, profile.picture || existing.picture, profile.sub, userId)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, name, picture, google_sub) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(userId, profile.email, profile.name || "", profile.picture || "", profile.sub)
      .run();
  }

  const sid = newId("ses");
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sid, userId, expires)
    .run();
  setCookie(c, "sid", sid, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return c.redirect(next.startsWith("/") ? next : "/account");
});

app.post("/auth/logout", async (c) => {
  const sid = getCookie(c, "sid");
  if (sid && c.env.DB) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  deleteCookie(c, "sid", { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/orders", async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, "Sign in required");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC"
  )
    .bind(user.id)
    .all();
  const orders = [];
  for (const o of results || []) {
    const items = await c.env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(o.id).all();
    orders.push({ ...o, items: items.results || [] });
  }
  return c.json({ orders });
});

app.post("/api/checkout", async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, "Create an account with Google before ordering.");
  const body = await c.req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return jsonError(c, 400, "Cart is empty");

  const lines = [];
  let total = 0;
  for (const item of items) {
    const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND active = 1")
      .bind(item.product_id)
      .first();
    if (!product) return jsonError(c, 400, "Unknown product");
    const qty = Math.max(1, Number(item.qty) || 1);
    lines.push({ product, qty });
    total += product.price_cents * qty;
  }

  const orderId = newId("ord");
  const hasPaidItems = lines.some((l) => l.product.price_cents > 0 && l.product.kind !== "request");

  if (!hasPaidItems || !c.env.STRIPE_SECRET_KEY) {
    await c.env.DB.prepare(
      "INSERT INTO orders (id, user_id, email, status, total_cents, notes) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        orderId,
        user.id,
        user.email,
        hasPaidItems ? "demo" : "pending",
        total,
        hasPaidItems
          ? "Recorded without Stripe (add STRIPE_SECRET_KEY to take live payments)."
          : "Zero-price or request item. Jason will follow up."
      )
      .run();
    for (const line of lines) {
      await c.env.DB.prepare(
        "INSERT INTO order_items (id, order_id, product_id, name, qty, unit_cents) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(newId("oi"), orderId, line.product.id, line.product.name, line.qty, line.product.price_cents)
        .run();
    }
    return c.json({
      mode: hasPaidItems ? "demo" : "request",
      order_id: orderId,
      redirect: `/account?order=${orderId}`,
    });
  }

  const stripeLines = lines.map((line) => ({
    quantity: line.qty,
    price_data: {
      currency: "usd",
      unit_amount: line.product.price_cents,
      recurring: line.product.kind === "subscription" && line.product.interval
        ? { interval: line.product.interval }
        : undefined,
      product_data: { name: line.product.name, description: line.product.summary },
    },
  }));

  const params = new URLSearchParams();
  params.set("mode", lines.every((l) => l.product.kind === "subscription") ? "subscription" : "payment");
  params.set("success_url", `${appUrl(c)}/account?paid=1&order=${orderId}`);
  params.set("cancel_url", `${appUrl(c)}/cart?canceled=1`);
  params.set("customer_email", user.email);
  params.set("client_reference_id", orderId);
  params.set("metadata[order_id]", orderId);
  params.set("metadata[user_id]", user.id);
  stripeLines.forEach((line, i) => {
    params.set(`line_items[${i}][quantity]`, String(line.quantity));
    params.set(`line_items[${i}][price_data][currency]`, line.price_data.currency);
    params.set(`line_items[${i}][price_data][unit_amount]`, String(line.price_data.unit_amount));
    params.set(`line_items[${i}][price_data][product_data][name]`, line.price_data.product_data.name);
    if (line.price_data.recurring) {
      params.set("mode", "subscription");
      params.set(`line_items[${i}][price_data][recurring][interval]`, line.price_data.recurring.interval);
    }
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const session = await stripeRes.json();
  if (!session.url) return jsonError(c, 502, session.error?.message || "Stripe checkout failed");

  await c.env.DB.prepare(
    "INSERT INTO orders (id, user_id, email, status, total_cents, stripe_session_id) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(orderId, user.id, user.email, "pending", total, session.id)
    .run();
  for (const line of lines) {
    await c.env.DB.prepare(
      "INSERT INTO order_items (id, order_id, product_id, name, qty, unit_cents) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(newId("oi"), orderId, line.product.id, line.product.name, line.qty, line.product.price_cents)
      .run();
  }
  return c.json({ mode: "stripe", order_id: orderId, redirect: session.url });
});

app.post("/api/webhooks/stripe", async (c) => {
  const raw = await c.req.text();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonError(c, 400, "Invalid payload");
  }
  if (event.type === "checkout.session.completed") {
    const orderId = event.data?.object?.metadata?.order_id || event.data?.object?.client_reference_id;
    if (orderId) {
      await c.env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind("paid", orderId).run();
    }
  }
  return c.json({ received: true });
});

app.get("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Store frontend missing", 404);
});

export default app;
