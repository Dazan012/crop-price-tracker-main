require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { translateBatch } = require('./translate');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

/* ── Health check ─────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'translation-server' });
});

/* ── Batch translation endpoint ───────────────────────────── */
app.post('/api/translate-batch', async (req, res) => {
  try {
    const { texts, targetLang } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array of strings' });
    }
    if (!targetLang || typeof targetLang !== 'string') {
      return res.status(400).json({ error: 'targetLang is required (e.g. "sw", "en")' });
    }

    const translations = await translateBatch(texts, targetLang);
    res.json({ translations });
  } catch (err) {
    console.error('[translate-batch] Error:', err.message);
    res.status(500).json({
      error: 'Translation failed',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`[translation-server] Running on http://localhost:${PORT}`);
});
