const ORIGIN = "https://encompos.ddns.net/"; // 👈 your real site
const WORKER_HOST = "encompos.workers.dev"; // 👈 your worker domain

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // Build target URL on origin
  const targetUrl = new URL(url.pathname + url.search, ORIGIN);

  // Clone headers
  const headers = new Headers(request.headers);
  headers.set("Host", targetUrl.host);

  // Forward request to origin
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

  // --- Handle redirects ---
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    let location = respHeaders.get("Location") || "";
    if (location.startsWith(ORIGIN)) {
      location = location.replace(ORIGIN, `https://${WORKER_HOST}`);
    } else if (!/^https?:/i.test(location)) {
      if (!location.startsWith("/")) location = "/" + location;
      location = `https://${WORKER_HOST}${location}`;
    }
    respHeaders.set("Location", location);
    return new Response(null, {
      status: originResponse.status,
      headers: respHeaders,
    });
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

  // --- Rewrite HTML content ---
  if (contentType.includes("text/html")) {
    const rewriter = new HTMLRewriter()
      .on("a", new AttrRewriter("href"))
      .on("img", new AttrRewriter("src"))
      .on("link", new AttrRewriter("href"))
      .on("script", new AttrRewriter("src"))
      .on("form", new AttrRewriter("action"))
      .on("script", new JSRewriter());

    return rewriter.transform(originResponse);
  }

  // --- Return all other resources as-is ---
  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: respHeaders,
  });
}

// --- HTML attribute rewriter ---
class AttrRewriter {
  constructor(attr) {
    this.attr = attr;
  }
  element(element) {
    const val = element.getAttribute(this.attr);
    if (!val) return;

    if (val.startsWith(ORIGIN)) {
      element.setAttribute(this.attr, val.replace(ORIGIN, `https://${WORKER_HOST}`));
    } else if (!/^https?:/i.test(val) && !val.startsWith("/")) {
      element.setAttribute(this.attr, "/" + val);
    }
  }
}

// --- JS content rewriter for inline scripts ---
class JSRewriter {
  element(element) {
    element.setInnerContent(
      element.textContent.replaceAll(ORIGIN, `https://${WORKER_HOST}`),
      { html: false }
    );
  }
}
