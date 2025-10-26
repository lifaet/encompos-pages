export async function onRequest({ request }) {
  const ORIGIN = "https://encompos.ddns.net/";          // 👈 your real site
  const PUBLIC_HOST = "encompos.pages.dev";   // 👈 your Pages domain

  const url = new URL(request.url);
  const originUrl = new URL(url.pathname + url.search, ORIGIN);

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("Host", new URL(ORIGIN).host);

  const originResp = await fetch(originUrl.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    redirect: "manual",
  });

  // Clone headers so we can modify them
  const headers = new Headers(originResp.headers);

  // --- Rewrite redirects ---
  if (headers.has("Location")) {
    const loc = headers.get("Location").replace(ORIGIN, `https://${PUBLIC_HOST}`);
    headers.set("Location", loc);
  }

  // --- Rewrite cookies ---
  if (headers.has("Set-Cookie")) {
    const all = headers.get("Set-Cookie").split(/,(?=[^;]+=[^;]+)/);
    headers.delete("Set-Cookie");
    for (const cookie of all) {
      headers.append("Set-Cookie", cookie.replace(/;\s*Domain=[^;]+/i, ""));
    }
  }

  // --- HTML rewriting (optional but handy) ---
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const rewriter = new HTMLRewriter()
      .on("a", new AttrRewriter("href", ORIGIN, PUBLIC_HOST))
      .on("img", new AttrRewriter("src", ORIGIN, PUBLIC_HOST))
      .on("link", new AttrRewriter("href", ORIGIN, PUBLIC_HOST))
      .on("script", new AttrRewriter("src", ORIGIN, PUBLIC_HOST))
      .on("form", new AttrRewriter("action", ORIGIN, PUBLIC_HOST));
    return rewriter.transform(originResp);
  }

  // Non-HTML responses
  return new Response(originResp.body, {
    status: originResp.status,
    headers,
  });
}

class AttrRewriter {
  constructor(attr, origin, publicHost) {
    this.attr = attr;
    this.origin = origin;
    this.publicHost = publicHost;
  }
  element(e) {
    const val = e.getAttribute(this.attr);
    if (!val) return;
    if (val.startsWith(this.origin)) {
      e.setAttribute(this.attr, val.replace(this.origin, `https://${this.publicHost}`));
    }
  }
}
