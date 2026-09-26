const state = { user: null, products: [], filter: "all" };

function money(cents, interval) {
  if (!cents) return interval ? "Request access" : "No charge";
  const n = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return interval ? `${n} / ${interval}` : n;
}

function cart() {
  try { return JSON.parse(localStorage.getItem("jmc_cart") || "[]"); } catch { return []; }
}
function saveCart(items) {
  localStorage.setItem("jmc_cart", JSON.stringify(items));
  renderCartCount();
}
function renderCartCount() {
  const el = document.getElementById("cart-count");
  const n = cart().reduce((a, i) => a + i.qty, 0);
  el.textContent = n ? `(${n})` : "";
}

function addToCart(productId) {
  const items = cart();
  const found = items.find((i) => i.product_id === productId);
  if (found) found.qty += 1;
  else items.push({ product_id: productId, qty: 1 });
  saveCart(items);
}

function path() {
  return location.pathname.replace(/\/$/, "") || "/";
}

async function boot() {
  const [me, catalog] = await Promise.all([
    fetch("/api/me").then((r) => r.json()).catch(() => ({ user: null })),
    fetch("/api/products").then((r) => r.json()).catch(() => ({ products: [] })),
  ]);
  state.user = me.user;
  state.products = catalog.products || [];
  const btn = document.getElementById("auth-btn");
  if (state.user) {
    btn.textContent = state.user.name ? state.user.name.split(" ")[0] : state.user.email;
    btn.href = "/account";
  }
  renderCartCount();
  route();
}

function route() {
  const p = path();
  if (p === "/cart") return renderCart();
  if (p === "/account") return renderAccount();
  if (p.startsWith("/product/")) return renderProduct(p.replace("/product/", ""));
  return renderHome();
}

function renderHome() {
  const list = state.products.filter((p) => state.filter === "all" || p.category === state.filter);
  document.getElementById("app").innerHTML = `
    <p class="kicker">IT · Security · Custom software</p>
    <h1>Consulting packages and <span class="grad">custom apps</span></h1>
    <p class="lede">Same look as jascmartin.com. Create an account with Google to place an order. Retainers and assessments sit next to the apps already running on Cloudflare.</p>
    <div class="hero-actions">
      <a class="btn btn-cyan" href="#catalog">Browse catalog</a>
      <a class="btn btn-ghost" href="/auth/google?next=/account">Sign in with Google</a>
    </div>
    <div id="catalog" class="filters">
      ${"[all,consulting,app]".split(",").length ? ["all","consulting","app"].map((f) => `<button class="chip ${state.filter===f?"on":""}" data-f="${f}">${f}</button>`).join("") : ""}
    </div>
    <div class="grid">
      ${list.map(card).join("") || `<p class="muted">Catalog will appear after D1 is seeded.</p>`}
    </div>
  `;
  document.querySelectorAll("[data-f]").forEach((el) => {
    el.onclick = () => { state.filter = el.dataset.f; renderHome(); };
  });
  bindCards();
}

function card(p) {
  return `
    <article class="card">
      <div class="tag">${p.category} · ${p.kind.replace("_"," ")}</div>
      <h3>${p.name}</h3>
      <p>${p.summary}</p>
      <div class="price">${money(p.price_cents, p.interval)}</div>
      <div class="row">
        <button class="btn btn-cyan" data-add="${p.id}">Add</button>
        <a class="btn btn-ghost" href="/product/${p.slug}">Details</a>
      </div>
    </article>`;
}

function bindCards() {
  document.querySelectorAll("[data-add]").forEach((b) => {
    b.onclick = () => { addToCart(b.dataset.add); b.textContent = "Added"; };
  });
}

function renderProduct(slug) {
  const p = state.products.find((x) => x.slug === slug);
  if (!p) {
    document.getElementById("app").innerHTML = `<p class="muted">Product not found.</p>`;
    return;
  }
  document.getElementById("app").innerHTML = `
    <p class="kicker">${p.category}</p>
    <h1>${p.name}</h1>
    <p class="lede">${p.description}</p>
    <p class="price">${money(p.price_cents, p.interval)}</p>
    <div class="hero-actions">
      <button class="btn btn-cyan" data-add="${p.id}">Add to cart</button>
      ${p.href ? `<a class="btn btn-ghost" href="${p.href}" target="_blank" rel="noopener">Open app / page</a>` : ""}
    </div>
  `;
  bindCards();
}

function renderCart() {
  const items = cart().map((i) => ({ ...i, product: state.products.find((p) => p.id === i.product_id) })).filter((i) => i.product);
  const total = items.reduce((a, i) => a + i.product.price_cents * i.qty, 0);
  document.getElementById("app").innerHTML = `
    <p class="kicker">Checkout</p>
    <h1>Cart</h1>
    <div class="panel">
      ${items.length ? `
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>
            ${items.map((i) => `<tr>
              <td>${i.product.name}</td>
              <td>${i.qty}</td>
              <td class="mono">${money(i.product.price_cents * i.qty, null)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        <p class="price">Total ${money(total, null)}</p>
        <div class="hero-actions">
          <button class="btn btn-cyan" id="checkout">Place order</button>
          <button class="btn btn-ghost" id="clear">Clear</button>
        </div>
        <p class="muted" id="checkout-msg">You must be signed in with Google. If Stripe is not configured yet, the order is stored as a request / demo charge.</p>
      ` : `<p class="muted">Cart is empty. <a href="/">Browse the catalog</a>.</p>`}
    </div>
  `;
  const clear = document.getElementById("clear");
  if (clear) clear.onclick = () => { saveCart([]); renderCart(); };
  const go = document.getElementById("checkout");
  if (go) go.onclick = checkout;
}

async function checkout() {
  const msg = document.getElementById("checkout-msg");
  if (!state.user) {
    location.href = "/auth/google?next=/cart";
    return;
  }
  msg.textContent = "Creating order…";
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: cart() }),
  });
  const data = await res.json();
  if (!res.ok) { msg.textContent = data.error || "Checkout failed"; return; }
  saveCart([]);
  location.href = data.redirect;
}

async function renderAccount() {
  if (!state.user) {
    document.getElementById("app").innerHTML = `
      <p class="kicker">Account</p>
      <h1>Sign in to order</h1>
      <p class="lede">Google creates the store account used for checkout and order history. Consulting clients still use the Work portal for delivery.</p>
      <a class="btn btn-cyan" href="/auth/google?next=/account">Continue with Google</a>
    `;
    return;
  }
  const data = await fetch("/api/orders").then((r) => r.json()).catch(() => ({ orders: [] }));
  document.getElementById("app").innerHTML = `
    <p class="kicker">Account</p>
    <h1>${state.user.name || "Your account"}</h1>
    <p class="muted">${state.user.email}</p>
    <div class="hero-actions">
      <button class="btn btn-ghost" id="logout">Sign out</button>
      <a class="btn btn-teal" href="https://work.jascmartin.com/portal">Client portal</a>
    </div>
    <h3 style="margin-top:2rem">Orders</h3>
    <div class="panel">
      ${(data.orders || []).length ? data.orders.map((o) => `
        <div style="padding:.8rem 0;border-bottom:1px solid #1a2332">
          <div class="mono">${o.id} · ${o.status} · ${money(o.total_cents)}</div>
          <div class="muted">${(o.items||[]).map((i)=>i.name).join(", ")}</div>
        </div>`).join("") : `<p class="muted">No orders yet.</p>`}
    </div>
  `;
  document.getElementById("logout").onclick = async () => {
    await fetch("/auth/logout", { method: "POST" });
    location.href = "/";
  };
}

window.addEventListener("popstate", route);
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (href.startsWith("/") && !href.startsWith("/auth")) {
    e.preventDefault();
    history.pushState({}, "", href);
    route();
  }
});

boot();
