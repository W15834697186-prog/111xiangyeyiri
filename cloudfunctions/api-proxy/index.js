const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const AMAP_KEY = process.env.AMAP_API_KEY;
const FRAMEWORK = process.env.TCB_HTTP_FUNCTION;

// 如果通过 @cloudbase/functions-framework 运行，使用 Express 路由
if (FRAMEWORK) {
  const { createApp } = require('@cloudbase/functions-framework');
  const app = createApp();

  app.use(require('cors')());

  app.post('/chat/completions', async (req, res) => {
    if (!DEEPSEEK_KEY) return res.status(503).json({ error: 'AI 服务未配置' });
    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify(req.body)
      });
      res.status(resp.status).json(await resp.json());
    } catch { res.status(502).json({ error: 'AI 连接失败' }); }
  });

  app.get('/amap/*', async (req, res) => {
    if (!AMAP_KEY) return res.status(503).json({ error: '地图服务未配置' });
    try {
      const amapPath = req.params[0];
      const amapUrl = new URL(`https://restapi.amap.com/v3/${amapPath}`);
      amapUrl.searchParams.set('key', AMAP_KEY);
      for (const [k, v] of Object.entries(req.query)) {
        if (k !== 'key' && k !== 'callback' && v !== undefined && v !== '') {
          amapUrl.searchParams.set(k, String(v));
        }
      }
      const resp = await fetch(amapUrl.toString());
      const data = await resp.json();
      if (req.query.callback) {
        res.type('application/javascript');
        res.send(`${req.query.callback}(${JSON.stringify(data)})`);
      } else {
        res.json(data);
      }
    } catch { res.status(502).json({ error: '地图连接失败' }); }
  });

  exports.main = app;
} else {
  // 直接调用模式（用于 tcb fn invoke 测试）
  exports.main = async (event) => {
    const method = event.httpMethod || 'GET';
    const path = (event.path || '/').replace(/^\/api-proxy/, '') || '/';
    let params = event.queryStringParameters || {};
    if (typeof params === 'string') {
      params = {};
      const qs = (event.queryString || '').split('?').pop() || '';
      for (const [k, v] of new URLSearchParams(qs)) { params[k] = v; }
    }
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};

    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    try {
      if (method === 'POST' && path === '/chat/completions') {
        if (!DEEPSEEK_KEY) return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'AI 未配置' }) };
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` }, body: JSON.stringify(body)
        });
        return { statusCode: resp.status, headers: corsHeaders, body: JSON.stringify(await resp.json()) };
      }

      if (path.startsWith('/amap/')) {
        if (!AMAP_KEY) return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: '地图未配置' }) };
        const amapPath = path.replace(/^\/amap\/?/, '');
        const amapUrl = new URL(`https://restapi.amap.com/v3/${amapPath}`);
        amapUrl.searchParams.set('key', AMAP_KEY);
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'key' && k !== 'callback' && v !== undefined && v !== '') amapUrl.searchParams.set(k, String(v));
        }
        const resp = await fetch(amapUrl.toString());
        const data = await resp.json();
        if (params.callback) {
          return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/javascript' }, body: `${params.callback}(${JSON.stringify(data)})` };
        }
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
      }

      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Not Found' }) };
    } catch {
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: '内部错误' }) };
    }
  };
}
