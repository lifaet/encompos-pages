export async function onRequest({ request }) {
  const ORIGIN = "https://encompos.ddns.net/";           // 👈 replace with your real site
  const incomingUrl = new URL(request.url);

  // Build target URL on the origin
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN);

  // Clone headers for forwarding
  const headers = new Headers(request.headers);
  headers.set("Host", targetUrl.host);

  // Forward request to origin (manual redirect handling)
  const originResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
    redirect: "manual",
  });

  // Clone headers for editing
  const responseHeaders = new Headers(originResponse.headers);

  // --- Handle redirects ---
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    let location = responseHeaders.get("Location") || "";

    if (location.startsWith(ORIGIN)) {
      location = location.replace(ORIGIN, `https://${incomingUrl.host}`);
    } else if (!/^https?:/i.test(location)) {
      // relative path: ensure starting slash
      if (!location.startsWith("/")) location = "/" + location;
      location = `https://${incomingUrl.host}${location}`;
    }

    responseHeaders.set("Location", location);

    return new Response(null, {
      status: originResponse.status,
      headers: responseHeaders,
    });
  }

  // --- Fix cookies ---
  if (responseHeaders.has("Set-Cookie")) {
    const cookies = responseHeaders
      .get("Set-Cookie")
      .split(/,(?=[^;]+=[^;]+)/)
      .map((c) => c.replace(/;\s*Domain=[^;]+/gi, ""));
    responseHeaders.delete("Set-Cookie");
    cookies.forEach((c) => responseHeaders.append("Set-Cookie", c));
  }

  // --- Rewrite HTML links ---
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

  // --- All other responses (CSS, JS, API JSON, images) ---
  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: responseHeaders,
  });
}

// --- Helper class for rewriting HTML attributes ---
class AttrRewriter {
  constructor(attr, origin, newHost) {
    this.attr = attr;
    this.origin = origin;
    this.newHost = newHost;
  }
  element(e) {
    const val = e.getAttribute(this.attr);
    if (!val) return;

    // Rewrite absolute URLs pointing to origin
    if (val.startsWith(this.origin)) {
      e.setAttribute(
        this.attr,
        val.replace(this.origin, `https://${this.newHost}`)
      );
    } 
    // Rewrite relative URLs to ensure proper slash
    else if (!/^https?:/i.test(val) && !val.startsWith("/")) {
      e.setAttribute(this.attr, "/" + val);
    }
  }
}
