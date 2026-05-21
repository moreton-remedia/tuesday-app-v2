const port = Number(process.env.PORT || 3000);
const serverEntry = './dist/server/server.js';
const { default: handler } = (await import(serverEntry)) as {
  default: { fetch: (request: Request) => Response | Promise<Response> };
};

Bun.serve({
  port,
  async fetch(request) {
    try {
      return await handler.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
});

console.log(`Server listening on http://localhost:${port}`);
