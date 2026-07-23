import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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
      return res.status(response.status).json({ error: `DeepSeek ${response.status}`, detail: data });
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'AI 服务连接失败', detail: err.message });
  }
});

// ── 代理：高德地图 REST API ──
app.get('/api/amap/*', async (req, res) => {
  if (!AMAP_KEY) return res.status(503).json({ error: '地图服务未配置' });
  try {
    const path = req.params[0];
    const amapUrl = new URL(`https://restapi.amap.com/v3/${path}`);
    amapUrl.searchParams.set('key', AMAP_KEY);
    // 转发所有查询参数
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'key' && v !== undefined) amapUrl.searchParams.set(k, v);
    }
    const response = await fetch(amapUrl.toString());
    const data = await response.json();
    // 支持 JSONP callback
    if (req.query.callback) {
      res.type('application/javascript');
      res.send(`${req.query.callback}(${JSON.stringify(data)})`);
    } else {
      res.json(data);
    }
  } catch (err) {
    res.status(502).json({ error: '地图服务连接失败', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔐 乡野一日代理已启动: http://localhost:${PORT}`);
  console.log(`   AI: ${DEEPSEEK_KEY ? '✅ DeepSeek' : '❌ 未配置'}`);
  console.log(`   地图: ${AMAP_KEY ? '✅ 高德' : '❌ 未配置'}`);
});
