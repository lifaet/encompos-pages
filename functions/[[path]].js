const ORIGIN = "https://encompos.ddns.net"; // Your real site

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, ORIGIN);

  // Fetch origin
  const originResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    redirect: "manual",
  });

  const respHeaders = new Headers(originResponse.headers);

  // --- Rewrite redirects ---
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    let location = respHeaders.get("Location") || "";
    if (location.startsWith(ORIGIN)) location = location.replace(ORIGIN, url.origin);
    else if (!/^https?:/i.test(location)) location = url.origin + location;
    respHeaders.set("Location", location);
    return new Response(null, { status: originResponse.status, headers: respHeaders });
  }

  // --- Rewrite cookies ---
  if (respHeaders.has("Set-Cookie")) {
    const cookies = respHeaders.get("Set-Cookie")
      .split(/,(?=[^;]+=[^;]+)/)
      .map(c => c.replace(/;\s*Domain=[^;]+/gi, ""));
    respHeaders.delete("Set-Cookie");
    cookies.forEach(c => respHeaders.append("Set-Cookie", c));
  }

  const contentType = respHeaders.get("content-type") || "";

  // --- Rewrite HTML ---
  if (contentType.includes("text/html")) {
    const rewriter = new HTMLRewriter()
      .on("a", new AttrRewriter(url.origin))
      .on("link", new AttrRewriter(url.origin))
      .on("form", new AttrRewriter(url.origin))
      .on("script", new AttrRewriter(url.origin))
      .on("img", new AttrRewriter(url.origin))
      .on("script", new JSRewriter(url.origin))
      .on("style", new CSSRewriter(url.origin));
    return rewriter.transform(originResponse);
  }

  return new Response(originResponse.body, { status: originResponse.status, headers: respHeaders });
}

// --- Rewriter classes ---
class AttrRewriter {
  constructor(newOrigin) { this.newOrigin = newOrigin; }
  element(e) {
    ["href","src","action"].forEach(attr => {
      const val = e.getAttribute(attr);
      if (!val) return;
      if (val.startsWith(ORIGIN)) e.setAttribute(attr, val.replace(ORIGIN, this.newOrigin));
      else if (!/^https?:/i.test(val) && !val.startsWith("/")) e.setAttribute(attr, "/" + val);
    });
  }
}

class JSRewriter {
  constructor(newOrigin) { this.newOrigin = newOrigin; }
  element(e) {
    e.setInnerContent(e.textContent.replaceAll(ORIGIN, newOrigin), { html: false });
  }
}

class CSSRewriter {
  constructor(newOrigin) { this.newOrigin = newOrigin; }
  element(e) {
    e.setInnerContent(e.textContent.replaceAll(ORIGIN, newOrigin), { html: false });
  }
}
