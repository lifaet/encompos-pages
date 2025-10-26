const ORIGIN = "http://encompos.ddns.net/"; // 👈 replace with your real site

export async function onRequest({ request }) {
  const url = new URL(request.url);

  // Build target URL on origin
  const targetUrl = new URL(url.pathname + url.search, ORIGIN);

  // Clone request headers
  const headers = new Headers(request.headers);
  headers.set("Host", targetUrl.host);

  // Fetch from origin
  const originResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? request.body
        : undefined,
    redirect: "manual",
  });

  const respHeaders = new Headers(originResponse.headers);

  // --- Handle redirects (301/302/307/308) ---
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    let location = respHeaders.get("Location") || "";
    if (location.startsWith(ORIGIN)) {
      location = location.replace(ORIGIN, `https://${url.host}`);
    } else if (!/^https?:/i.test(location)) {
      if (!location.startsWith("/")) location = "/" + location;
      location = `https://${url.host}${location}`;
    }
    respHeaders.set("Location", location);
    return new Response(null, { status: originResponse.status, headers: respHeaders });
  }

  // --- Fix cookies ---
  if (respHeaders.has("Set-Cookie")) {
    const cookies = respHeaders
      .get("Set-Cookie")
      .split(/,(?=[^;]+=[^;]+)/)
      .map((c) => c.replace(/;\s*Domain=[^;]+/gi, ""));
    respHeaders.delete("Set-Cookie");
    cookies.forEach((c) => respHeaders.append("Set-Cookie", c));
  }

  const contentType = respHeaders.get("content-type") || "";

  // --- Rewrite HTML links ---
  if (contentType.includes("text/html")) {
    const rewriter = new HTMLRewriter()
      .on("a", new AttrRewriter("href", ORIGIN, url.host))
      .on("img", new AttrRewriter("src", ORIGIN, url.host))
      .on("link", new AttrRewriter("href", ORIGIN, url.host))
      .on("script", new AttrRewriter("src", ORIGIN, url.host))
      .on("form", new AttrRewriter("action", ORIGIN, url.host))
      .on("script", new JSRewriter(ORIGIN, url.host));

    return rewriter.transform(originResponse);
  }

  // --- Return other content as-is ---
  return new Response(originResponse.body, { status: originResponse.status, headers: respHeaders });
}

// --- HTML attribute rewriter ---
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
      e.setAttribute(this.attr, val.replace(this.origin, `https://${this.newHost}`));
    } else if (!/^https?:/i.test(val) && !val.startsWith("/")) {
      e.setAttribute(this.attr, "/" + val);
    }
  }
}

// --- Rewrite JS inside script tags ---
class JSRewriter {
  constructor(origin, newHost) {
    this.origin = origin;
    this.newHost = newHost;
  }
  element(element) {
    element.setInnerContent(
      element.textContent.replaceAll(this.origin, `https://${this.newHost}`),
      { html: false }
    );
  }
}
