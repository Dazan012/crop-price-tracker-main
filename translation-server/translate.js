const axios = require('axios');

/* ═══════════════════════════════════════════════════════════════
   Translation providers (optimized for speed)
   ─ Free Google Translate (no key needed, rate-limited)
   ─ Google Cloud Translation API v2 (needs TRANSLATION_API_KEY)
   ─ DeepL API (needs DEEPL_API_KEY)

   Set TRANSLATION_PROVIDER=google|deepl|free in .env
   Default: free (unofficial Google endpoint)
═══════════════════════════════════════════════════════════════ */

const PROVIDER = (process.env.TRANSLATION_PROVIDER || 'free').toLowerCase();
const API_KEY  = process.env.TRANSLATION_API_KEY || '';

/* ── Server-side translation cache ────────────────────────── */
const serverCache = new Map(); // "lang:text" → translated
function serverCacheKey(text, lang) { return `${lang}:${text}`; }

/* ── Provider: Free Google Translate (unofficial, optimized) ─ */
async function freeTranslate(texts, targetLang) {
  const results = [];

  // Process in larger chunks of 50 to minimize round-trips
  const CHUNK = 50;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK);

    // Check server cache first for each item in the chunk
    const uncachedInChunk = [];
    const uncachedIndices = [];
    chunk.forEach((text, j) => {
      const key = serverCacheKey(text, targetLang);
      const cached = serverCache.get(key);
      if (cached !== undefined) {
        results[i + j] = cached;
      } else {
        uncachedInChunk.push(text);
        uncachedIndices.push(j);
      }
    });

    if (uncachedInChunk.length === 0) continue; // all cached in this chunk

    const joined = uncachedInChunk.join('\n\u2764\n'); // unique separator

    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: targetLang,
      dt: 't',
      q: joined,
    });

    try {
      const { data } = await axios.get(
        'https://translate.googleapis.com/translate_a/single',
        { params, timeout: 20000 }
      );

      // Response shape: data[0] is array of [translatedSegment, originalSegment, ...]
      let fullTranslation = '';
      if (data && data[0]) {
        fullTranslation = data[0]
          .filter((seg) => seg[0] != null)
          .map((seg) => seg[0])
          .join('');
      }

      const parts = fullTranslation.split('\n\u2764\n');
      uncachedInChunk.forEach((original, j) => {
        const translated = parts[j] || original;
        const globalIdx = i + uncachedIndices[j];
        results[globalIdx] = translated;
        // Cache on server side for instant repeat lookups
        serverCache.set(serverCacheKey(original, targetLang), translated);
      });
    } catch (err) {
      // On failure, return originals for this chunk
      uncachedInChunk.forEach((original, j) => {
        results[i + uncachedIndices[j]] = original;
      });
      console.error(`[freeTranslate] Chunk ${i}-${i + CHUNK} failed:`, err.message);
    }

    // Minimal delay between chunks (50ms instead of 300ms)
    if (i + CHUNK < texts.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results;
}

/* ── Provider: Google Cloud Translation API v2 ────────────── */
async function googleTranslate(texts, targetLang) {
  const { data } = await axios.post(
    'https://translation.googleapis.com/language/translate/v2',
    {
      q: texts,
      target: targetLang,
      format: 'text',
      key: API_KEY,
    },
    { timeout: 20000 }
  );

  const results = data.data.translations.map((t) => t.translatedText);
  // Cache results
  results.forEach((translated, i) => {
    serverCache.set(serverCacheKey(texts[i], targetLang), translated);
  });
  return results;
}

/* ── Provider: DeepL API ──────────────────────────────────── */
async function deeplTranslate(texts, targetLang) {
  const langMap = { sw: 'SW', en: 'EN', fr: 'FR' };
  const deeplTarget = langMap[targetLang] || targetLang.toUpperCase();

  const params = new URLSearchParams();
  params.append('auth_key', API_KEY);
  params.append('target_lang', deeplTarget);
  texts.forEach((t) => params.append('text', t));

  const { data } = await axios.post(
    'https://api-free.deepl.com/v2/translate',
    params,
    { timeout: 20000 }
  );

  const results = data.translations.map((t) => t.text);
  results.forEach((translated, i) => {
    serverCache.set(serverCacheKey(texts[i], targetLang), translated);
  });
  return results;
}

/* ── Unified batch translator ─────────────────────────────── */
async function translateBatch(texts, targetLang) {
  // Short-circuit: if target is English, return originals
  if (targetLang === 'en') return [...texts];

  // Filter out empty / whitespace-only strings
  const toTranslate = texts.map((t) => (t && t.trim() ? t : ''));
  const nonEmpty = toTranslate.filter(Boolean);

  if (nonEmpty.length === 0) return texts;

  // Check cache for ALL texts first
  const allCached = nonEmpty.every((t) => serverCache.has(serverCacheKey(t, targetLang)));
  if (allCached) {
    let idx = 0;
    return toTranslate.map((t) => {
      if (!t) return t;
      return serverCache.get(serverCacheKey(nonEmpty[idx++], targetLang)) || t;
    });
  }

  let translated;
  switch (PROVIDER) {
    case 'google':
      translated = await googleTranslate(nonEmpty, targetLang);
      break;
    case 'deepl':
      translated = await deeplTranslate(nonEmpty, targetLang);
      break;
    case 'free':
    default:
      translated = await freeTranslate(nonEmpty, targetLang);
      break;
  }

  // Re-insert empty strings at their original positions
  let idx = 0;
  return toTranslate.map((t) => (t ? translated[idx++] : t));
}

module.exports = { translateBatch };
