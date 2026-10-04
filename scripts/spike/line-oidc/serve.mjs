#!/usr/bin/env node
/**
 * Serves spike.html on http://localhost:3999 so the OAuth redirect has an http
 * origin to return to (Supabase will not redirect to file://). Serves that one
 * file and nothing else.
 *
 *   node scripts/spike/line-oidc/serve.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT ?? 3999);
const page = new URL('./spike.html', import.meta.url);

createServer(async (req, res) => {
  if (new URL(req.url, 'http://x').pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(await readFile(page));
}).listen(PORT, '127.0.0.1', () => console.log(`Spike page: http://localhost:${PORT}/`));
