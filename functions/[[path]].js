const ORIGIN = "https://encompos.ddns.net";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, ORIGIN);

  const response = await fetch(targetUrl.toString());
  const headers = new Headers(response.headers);
  return new Response(response.body, { status: response.status, headers });
}
