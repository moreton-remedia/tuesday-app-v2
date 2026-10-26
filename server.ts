import { join, extname } from 'path';

const port = Number(process.env.PORT || 3000);
const serverEntry = './dist/server/server.js';
const clientDir = './dist/client';

const { default: handler } = (await import(serverEntry)) as {
  default: { fetch: (request: Request) => Response | Promise<Response> };
};

const mimeTypes: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    // Serve static client assets from dist/client/
    const filePath = join(clientDir, url.pathname);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const isImmutable = url.pathname.startsWith('/assets/');
      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': isImmutable
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate',
        },
      });
    }

    try {
      return await handler.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
});

console.log(`Server listening on http://localhost:${port}`);
