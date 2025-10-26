export async function onRequest(context) {
  const ORIGIN = "https://example.com";           // 👈 your real website
  const { request } = context;
  const incomingUrl = new URL(request.url);

  // Build target URL for the origin
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN);

  // Forward request to origin
  const headers = new Headers(request.headers);
  headers.set("Host", targetUrl.host);

  const originResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
    redirect: "manual", // important: don't auto-follow redirects
  });

  // Clone headers for editing
  const responseHeaders = new Headers(originResponse.headers);

  // --- 🔁 Handle redirect responses (301/302/307/308) ---
  if ([301, 302, 307, 308].includes(originResponse.status)) {
    let location = responseHeaders.get("Location") || "";
    if (location.startsWith(ORIGIN)) {
      // rewrite origin to current host
      location = location.replace(ORIGIN, `https://${incomingUrl.host}`);
    } else if (location.startsWith("/")) {
      // relative redirect → keep same host
      location = `https://${incomingUrl.host}${location}`;
    }
    responseHeaders.set("Location", location);
    return new Response(null, {
      status: originResponse.status,
      headers: responseHeaders,
    });
  }

  // --- 🧁 Fix cookies ---
  if (responseHeaders.has("Set-Cookie")) {
    const cookies = responseHeaders
      .get("Set-Cookie")
      .split(/,(?=[^;]+=[^;]+)/)
      .map((c) => c.replace(/;\s*Domain=[^;]+/gi, ""));
    responseHeaders.delete("Set-Cookie");
    cookies.forEach((c) => responseHeaders.append("Set-Cookie", c));
  }

  // --- 🧩 Rewrite HTML links ---
  const contentType = responseHeaders.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const rewriter = new HTMLRewriter()
      .on("a", new AttrRewriter("href", ORIGIN, incomingUrl.host))
      .on("img", new AttrRewriter("src", ORIGIN, incomingUrl.host))
      .on("link", new AttrRewriter("href", ORIGIN, incomingUrl.host))
      .on("script", new AttrRewriter("src", ORIGIN, incomingUrl.host))
      .on("form", new AttrRewriter("action", ORIGIN, incomingUrl.host));

    const rewritten = rewriter.transform(originResponse);
    return new Response(rewritten.body, {
      status: originResponse.status,
      headers: responseHeaders,
    });
  }

  // --- Other responses ---
  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: responseHeaders,
  });
}

// HTMLRewriter helper
class AttrRewriter {
  constructor(attr, origin, newHost) {
    this.attr = attr;
    this.origin = origin;
    this.newHost = newHost;
  }
  element(e) {
    const val = e.getAttribute(this.attr);
    if (!val) return;
    if (val.startsWith(this.origin)) {
      e.setAttribute(
        this.attr,
        val.replace(this.origin, `https://${this.newHost}`)
      );
    }
  }
}
