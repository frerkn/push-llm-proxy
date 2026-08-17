// 简单 HTTP 透传代理 — 绕开阿里云 IP 段风控/GFW
// v0.1.0: Netlify Function 版 (跟 CF Worker 版同功能, 走 netlify.app 域名不在 CF 黑名单)
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
    }
    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON: ' + e.message }) };
    }
    const { url, method = 'POST', headers = {}, body } = payload;
    if (!url) {
        return { statusCode: 400, body: JSON.stringify({ error: 'url required' }) };
    }
    try {
        const r = await fetch(url, { method, headers, body });
        const respHeaders = {};
        r.headers.forEach((v, k) => { respHeaders[k] = v; });
        return {
            statusCode: r.status,
            headers: respHeaders,
            body: await r.text()
        };
    } catch (e) {
        return { statusCode: 502, body: JSON.stringify({ error: 'fetch failed: ' + e.message }) };
    }
};
