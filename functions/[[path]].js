export async function onRequest(context) {
  // Replace with the URL you want to redirect to
  const destination = "https://encompos.ddns.net/";

  return Response.redirect(destination, 302); // 302 = temporary redirect
}
