// push-llm-proxy — Cloudflare Worker 代理 push-server 调 LLM API
// 真凶: 阿里云服务器国际出口对 minimaxi.com / generativelanguage.googleapis.com 海外 IP 段被墙/限速
//   push-server 在国内云 → ETIMEDOUT
//   修法: push-server 调本 worker (CF 边缘有国际网络), worker 转发到 minimaxi / Google Gemini
//   跟之前 MCP 代理 (mcp.lhualan338.workers.dev) 同架构
//
// v0.1.0 关键设计:
//   1. 透传所有 header (User-Agent / Accept-Encoding / Authorization / Content-Type 全转)
//      缺关键 header 会让某些服务 (mcd.cn) 软拒绝
//   2. 透传 query params (model / key / temperature 全部)
//   3. 透传 body (raw bytes, 不解析, 不修改)
//   4. 透传 response (status + headers + body)
//   5. 不缓存, 实时转发
export default {
    async fetch(request) {
        // 路径透传: /v1/chat/completions -> minimaxi, /v1beta/models/.../generateContent -> Gemini
        // 不修改路径, worker 直接转发到目标 LLM
        const url = new URL(request.url);

        // 目标域名根据 path 前缀决定 (PWA 端 sync 过来什么 URL 就调什么)
        // path 形如 /minimaxi/v1/chat/completions 或 /gemini/v1beta/...
        // 或直接是 minimaxi.com / generativelanguage.googleapis.com
        // 简单做法: 用 path 第一段作为 target 标识
        //   /proxy/minimaxi.com/v1/chat/completions -> https://api.minimaxi.com/v1/chat/completions
        //   /proxy/generativelanguage.googleapis.com/v1beta/... -> https://generativelanguage.googleapis.com/v1beta/...

        const match = url.pathname.match(/^\/proxy\/(.+?)(\/.*)$/);
        if (!match) {
            return new Response('usage: /proxy/<target-host>/<path>', { status: 400 });
        }
        const targetHost = match[1];
        const targetPath = match[2];
        const targetUrl = `https://${targetHost}${targetPath}${url.search}`;

        // 透传所有 header (除了 Host / CF 自己的)
        const headers = new Headers();
        for (const [k, v] of request.headers) {
            if (['host', 'cf-connecting-ip', 'cf-worker', 'cf-ray'].includes(k.toLowerCase())) continue;
            headers.set(k, v);
        }

        // body 透传 (raw bytes)
        const body = request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : undefined;

        try {
            const upstream = await fetch(targetUrl, {
                method: request.method,
                headers,
                body
            });
            // 透传 response (status + headers + body)
            const respHeaders = new Headers();
            for (const [k, v] of upstream.headers) {
                // 跳过 CF 自己的 + hop-by-hop headers
                if (['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) continue;
                respHeaders.set(k, v);
            }
            return new Response(upstream.body, {
                status: upstream.status,
                headers: respHeaders
            });
        } catch (e) {
            return new Response(`[push-llm-proxy] upstream error: ${e.message}`, { status: 502 });
        }
    }
};
