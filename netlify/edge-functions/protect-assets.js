// Hotlink protection for the game's art and audio (Netlify Edge Function).
// Another website cannot embed or stream these files: browsers tell us the request came from a different site
// (Sec-Fetch-Site / Referer) and we answer 403. Your own game, direct visits, and apps that send neither header still work.
// It cannot stop someone who downloads a file by hand: nothing a browser can display can be fully hidden.

export default async (request, context) => {
  const url = new URL(request.url);
  const site = request.headers.get('sec-fetch-site');      // "same-origin" | "same-site" | "cross-site" | "none" (typed URL)
  const referer = request.headers.get('referer');

  let foreign = site === 'cross-site';
  if (!foreign && referer) {
    try { foreign = new URL(referer).host !== url.host; } catch { /* unreadable referer: allow */ }
  }
  if (foreign) {
    return new Response('Forbidden: these assets are protected. (c) dhamo ss', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return context.next();
};

export const config = { path: ['/cards/*', '/story/*', '/ui/*', '/audio/*'] };
