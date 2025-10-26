const ORIGIN = "http://encompos.ddns.net"; // your real site

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Build the full origin URL
  const targetUrl = new URL(url.pathname + url.search, ORIGIN);

  // Fetch the origin site
  const originResponse = await fetch(targetUrl.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== "GET" && context.request.method !== "HEAD" 
          ? context.request.body 
          : undefined,
    redirect: "manual",
  });

  // Clone headers
  const respHeaders = new Headers(originResponse.headers);

  // Rewrite redirects to pages.dev domain
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    let location = respHeaders.get("Location") || "";
    if (location.startsWith(ORIGIN)) {
      location = location.replace(ORIGIN, url.origin);
    } else if (!/^https?:/i.test(location)) {
      location = url.origin + location;
    }
    respHeaders.set("Location", location);
    return new Response(null, { status: originResponse.status, headers: respHeaders });
  }

  // Optional: rewrite cookies so they work on pages.dev
  if (respHeaders.has("Set-Cookie")) {
    const cookies = respHeaders.get("Set-Cookie")
      .split(/,(?=[^;]+=[^;]+)/)
      .map(c => c.replace(/;\s*Domain=[^;]+/gi, ""));
    respHeaders.delete("Set-Cookie");
    cookies.forEach(c => respHeaders.append("Set-Cookie", c));
  }

  // Return response body with headers
  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: respHeaders
  });
}
