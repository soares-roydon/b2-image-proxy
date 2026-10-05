export default {
  async fetch(request, env) {
    const API_KEY_ID = env.B2_APPLICATION_KEY_ID;
    const API_KEY = env.B2_APPLICATION_KEY;
    const BUCKET_NAME = env.BUCKET_NAME;

    const url = new URL(request.url);
    const filePath = url.pathname.slice(1); // Remove leading slash

    if (!filePath) {
      return new Response("File path not provided", { status: 400 });
    }

    // Check Cloudflare cache first
    const cache = caches.default;
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log(`Cache hit for: ${filePath}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${filePath}. Fetching from Backblaze.`);

    // Step 1: Authenticate with Backblaze (native API)
    const authResponse = await fetch(
      "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
      {
        headers: {
          Authorization: `Basic ${btoa(`${API_KEY_ID}:${API_KEY}`)}`,
        },
      }
    );

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      return new Response(`Authorization failed: ${errorText}`, { status: 500 });
    }

    const authData = await authResponse.json();
    const authToken = authData.authorizationToken;
    const downloadUrl = authData.downloadUrl;

    // Step 2: Construct the B2 file URL
    const b2FileUrl = `${downloadUrl}/file/${BUCKET_NAME}/${filePath}`;

    // Step 3: Fetch the file from Backblaze
    const fileResponse = await fetch(b2FileUrl, {
      headers: {
        Authorization: authToken,
      },
    });

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      return new Response(`Failed to fetch file from Backblaze: ${errorText}`, {
        status: 404,
      });
    }

    // Step 4: Cache the response for future requests
    const responseToCache = new Response(fileResponse.body, {
      headers: {
        "Content-Type": fileResponse.headers.get("Content-Type"),
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
      },
    });

    await cache.put(request, responseToCache.clone());

    return responseToCache;
  },
};