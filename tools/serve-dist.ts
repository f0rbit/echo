// Tiny static file server for visual-smoke of subsystem `dist/` builds.
// Usage: `bun ../../tools/serve-dist.ts <dir> [port]` from a subsystem.
// Defaults: dir = "dist", port = 4567.

import { stat, readFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".wasm": "application/wasm",
	".map": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

const dir_arg = process.argv[2] ?? "dist";
const port = Number(process.argv[3] ?? 4567);
const root = resolve(process.cwd(), dir_arg);

async function resolve_path(url_path: string): Promise<string | null> {
	const safe = url_path.replace(/\.\./g, "");
	const candidate = join(root, safe);
	if (!candidate.startsWith(root)) return null;
	const s = await stat(candidate).catch(() => null);
	if (!s) return null;
	if (s.isDirectory()) {
		const idx = join(candidate, "index.html");
		const is = await stat(idx).catch(() => null);
		return is && is.isFile() ? idx : null;
	}
	return s.isFile() ? candidate : null;
}

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		const file = await resolve_path(decodeURIComponent(url.pathname));
		if (!file) return new Response("Not Found", { status: 404 });
		const body = await readFile(file);
		const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
		return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
	},
});

console.log(`serving ${root} at http://localhost:${port}/`);
