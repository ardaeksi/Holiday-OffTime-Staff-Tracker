export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store', // never let Cloudflare or the browser cache API responses
      ...extraHeaders
    }
  });
}
