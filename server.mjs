import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const allowedDownloads = new Set(["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "objects.githubusercontent.com"]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".zip": "application/zip" };

function reply(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff" });
  res.end(body);
}

async function proxy(res, target, cacheControl) {
  const upstream = await fetch(target, { redirect: "follow", headers: { "user-agent": "MineMixer-CN/2.0" } });
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
    "cache-control": upstream.ok ? cacheControl : "no-store",
    "x-content-type-options": "nosniff",
  });
  if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (requestUrl.pathname.startsWith("/api/modrinth/")) {
      const path = requestUrl.pathname.slice("/api/modrinth/".length).split("/").map(encodeURIComponent).join("/");
      return await proxy(res, `https://api.modrinth.com/v2/${path}${requestUrl.search}`, "public, max-age=300");
    }
    if (requestUrl.pathname === "/api/download") {
      const raw = requestUrl.searchParams.get("url");
      if (!raw) return reply(res, 400, JSON.stringify({ error: "缺少下载地址" }));
      let target;
      try { target = new URL(raw); } catch { return reply(res, 400, JSON.stringify({ error: "下载地址无效" })); }
      if (target.protocol !== "https:" || !allowedDownloads.has(target.hostname)) return reply(res, 403, JSON.stringify({ error: "不支持的下载来源" }));
      return await proxy(res, target, "public, max-age=86400");
    }
    const relative = decodeURIComponent(requestUrl.pathname) === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    const file = normalize(join(root, relative));
    if ((relative !== "index.html" && !relative.startsWith("js/")) || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return reply(res, 404, "页面不存在", "text/plain; charset=utf-8");
    // 文件名目前没有内容哈希。HTML 与 JS 必须一起更新，否则浏览器会运行“新页面 + 旧脚本”。
    const cacheControl = /^(?:index\.html|js\/.*\.js)$/i.test(relative) ? "no-cache" : "public, max-age=3600";
    res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": cacheControl, "x-content-type-options": "nosniff" });
    createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    reply(res, 502, JSON.stringify({ error: "上游资源暂时不可用，请稍后重试" }));
  }
}).listen(port, "0.0.0.0", () => console.log(`MineMixer 已启动：http://0.0.0.0:${port}`));
