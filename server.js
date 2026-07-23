import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

// CORS：仅允许本机访问（防止外部网页调用代理）
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/, /^file:\/\//] }));

app.use(express.json());

// ⚠️ 安全拦截 —— 必须在 express.static 之前执行
app.use((req, res, next) => {
  const blocked = ['.env', '.git', 'server.js', 'package.json', 'package-lock.json', 'node_modules', '.gitignore', 'package-lock'];
  const url = req.url.toLowerCase();
  if (blocked.some(b => url.includes(b))) {
    return res.status(404).send('Not Found');
  }
  next();
});

// 只暴露 index.html + images/ + 前端资源
app.use(express.static('.', {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store');
  }
}));

const PORT = process.env.PORT || 3456;

// 验证 .env 是否配置
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const AMAP_KEY = process.env.AMAP_API_KEY;

if (!DEEPSEEK_KEY) console.warn('⚠️  DEEPSEEK_API_KEY 未设置（.env 中缺失），AI 功能不可用');
if (!AMAP_KEY) console.warn('⚠️  AMAP_API_KEY 未设置（.env 中缺失），地图功能不可用');

// ── 代理：DeepSeek Chat Completions ──
app.post('/api/chat/completions', async (req, res) => {
  if (!DEEPSEEK_KEY) return res.status(503).json({ error: 'AI 服务未配置' });
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'AI 服务连接失败' });
  }
});

// ── 代理：高德地图 REST API ──
app.get('/api/amap/*', async (req, res) => {
  if (!AMAP_KEY) return res.status(503).json({ error: '地图服务未配置' });
  try {
    const path = req.params[0];
    const amapUrl = new URL(`https://restapi.amap.com/v3/${path}`);
    amapUrl.searchParams.set('key', AMAP_KEY);
    // 转发查询参数（跳过 key 和 callback，callback 由代理自己处理）
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'key' && k !== 'callback' && v !== undefined) amapUrl.searchParams.set(k, v);
    }
    const response = await fetch(amapUrl.toString());
    const data = await response.json();
    // JSONP callback：高德 REST API 不支持 callback 参数，由代理自行包装
    if (req.query.callback) {
      res.type('application/javascript');
      res.send(`${req.query.callback}(${JSON.stringify(data)})`);
    } else {
      res.json(data);
    }
  } catch (err) {
    res.status(502).json({ error: '地图服务连接失败' });
  }
});

app.listen(PORT, () => {
  console.log(`🔐 乡野一日代理已启动: http://localhost:${PORT}`);
  console.log(`   AI: ${DEEPSEEK_KEY ? '✅ DeepSeek' : '❌ 未配置'}`);
  console.log(`   地图: ${AMAP_KEY ? '✅ 高德' : '❌ 未配置'}`);
});
