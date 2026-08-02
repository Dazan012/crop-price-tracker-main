/* Uses native fetch() — no axios needed for direct Google Translate calls */

/* ═══════════════════════════════════════════════════════════════
   i18n Translation Engine for Smart Crops  (v2 — auto-detect)
   ─ Walks the entire DOM and translates ALL visible text
   ─ No manual data-translate tagging needed
   ─ Sends ONE batch request per language switch (chunked)
   ─ In-memory translation cache (no repeat API calls)
   ─ MutationObserver auto-reapplies on React re-renders
   ─ Use data-translate="skip" to exclude an element + children
═══════════════════════════════════════════════════════════════ */

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

export const LANGUAGES = {
  en: { label: 'English',   flag: 'EN' },
  sw: { label: 'Kiswahili', flag: 'SW' },
};

/* ── Custom dictionary for domain-specific terms ─────────────
   Overrides Google Translate for app brand names and common UI
   phrases that lose meaning when translated word-by-word.     */
const DICTIONARY = {
  'Smart Crops': { sw: 'Mazao Mahiri' },
  'Smart Crops Market Price Tracker': { sw: 'Kifuatiliaji Bei cha Soko la Mazao Mahiri' },
  'Crop': { sw: 'Zao' },
  'crops': { sw: 'mazao' },
  'crop': { sw: 'zao' },
  'smart': { sw: 'mahiri' },
  'Smart': { sw: 'Mahiri' },
  'smart crops': { sw: 'mazao mahiri' },
  'Sign In': { sw: 'Ingia' },
  'Sign Out': { sw: 'Toka' },
  'Register': { sw: 'Jisajili' },
  'Search': { sw: 'Tafuta' },
  'Prices': { sw: 'Bei' },
  'Markets': { sw: 'Masoko' },
  'Market': { sw: 'Soko' },
  'Regions': { sw: 'Mikoa' },
  'Region': { sw: 'Mkoa' },
  'Crops': { sw: 'Mazao' },
  'Dashboard': { sw: 'Dashibodi' },
  'Settings': { sw: 'Mipangilio' },
  'Reports': { sw: 'Ripoti' },
  'Notifications': { sw: 'Taarifa' },
  'Profile': { sw: 'Wasifu' },
  'Edit Profile': { sw: 'Hariri Wasifu' },
  'Submit Price': { sw: 'Wasilisha Bei' },
  'Price Alerts': { sw: 'Tahadhari za Bei' },
  'Price Alert': { sw: 'Tahadhari ya Bei' },
  'Weather': { sw: 'Hali ya Hewa' },
  'Map': { sw: 'Ramani' },
  'Forecast': { sw: 'Utabiri' },
  'Forecasting': { sw: 'Utabiri' },
  'Recommendations': { sw: 'Mapendekezo' },
  'Reviews': { sw: 'Maoni' },
  'Anomalies': { sw: 'Hitilafu' },
  'Transport': { sw: 'Usafiri' },
  'Overview': { sw: 'Muhtasari' },
  'Logout': { sw: 'Toka' },
  'Continue with Phone': { sw: 'Endelea kwa Simu' },
  'Continue with Email': { sw: 'Endelea kwa Barua Pepe' },
  'Continue with Google': { sw: 'Endelea kwa Google' },
  'Remember me': { sw: 'Nikumbuke' },
  'Forgot Password': { sw: 'Nimesahau Neno la Siri' },
  'Reset Password': { sw: 'Weka Upya Neno la Siri' },
  'Create Account': { sw: 'Unda Akaunti' },
  'Loading': { sw: 'Inapakia' },
  'Loading...': { sw: 'Inapakia...' },
  'No results': { sw: 'Hakuna matokeo' },
  'Clear': { sw: 'Futa' },
  'Apply': { sw: 'Tekeleza' },
  'Cancel': { sw: 'Ghairi' },
  'Save': { sw: 'Hifadhi' },
  'Delete': { sw: 'Futa' },
  'Edit': { sw: 'Hariri' },
  'Back': { sw: 'Nyuma' },
  'Next': { sw: 'Ifuatayo' },
  'Submit': { sw: 'Wasilisha' },
  'Close': { sw: 'Funga' },
  'Home': { sw: 'Nyumbani' },
  'Help': { sw: 'Msaada' },
  'About': { sw: 'Kuhusu' },
  'Contact': { sw: 'Wasiliana' },
  'Phone': { sw: 'Simu' },
  'Email': { sw: 'Barua Pepe' },
  'Password': { sw: 'Neno la Siri' },
  'Username': { sw: 'Jina la Mtumiaji' },
  'Select region': { sw: 'Chagua mkoa' },
  'Select crop': { sw: 'Chagua zao' },
  'Select market': { sw: 'Chagua soko' },
  'Price': { sw: 'Bei' },
  'Quantity': { sw: 'Kiasi' },
  'Date': { sw: 'Tarehe' },
  'Status': { sw: 'Hali' },
  'Type': { sw: 'Aina' },
  'Role': { sw: 'Wajibu' },
  'Farmer': { sw: 'Mkulima' },
  'Trader': { sw: 'Mfanyabiashara' },
  'Agent': { sw: 'Wakala' },
  'Admin': { sw: 'Msimamizi' },
  'Approved': { sw: 'Imekubaliwa' },
  'Pending': { sw: 'Inasubiri' },
  'Rejected': { sw: 'Imekataliwa' },
  'Active': { sw: 'Inatumika' },
  'Inactive': { sw: 'Haifanyi kazi' },
  'All': { sw: 'Zote' },
  'None': { sw: 'Hakuna' },
  'Today': { sw: 'Leo' },
  'Yesterday': { sw: 'Jana' },
  'Tomorrow': { sw: 'Kesho' },
  'Week': { sw: 'Wiki' },
  'Month': { sw: 'Mwezi' },
  'Year': { sw: 'Mwaka' },
  'Download': { sw: 'Pakua' },
  'Upload': { sw: 'Pakia' },
  'Share': { sw: 'Shiriki' },
  'Copy': { sw: 'Nakili' },
  'Paste': { sw: 'Bandika' },
  'View': { sw: 'Tazama' },
  'Show': { sw: 'Onyesha' },
  'Hide': { sw: 'Ficha' },
  'Enable': { sw: 'Washa' },
  'Disable': { sw: 'Zima' },
  'On': { sw: 'Washa' },
  'Off': { sw: 'Zima' },
  'Yes': { sw: 'Ndiyo' },
  'No': { sw: 'Hapana' },
  'OK': { sw: 'Sawa' },
  'Error': { sw: 'Hitilafu' },
  'Success': { sw: 'Imefaulu' },
  'Warning': { sw: 'Tahadhari' },
  'Info': { sw: 'Maelezo' },
  'Total': { sw: 'Jumla' },
  'Average': { sw: 'Wastani' },
  'Minimum': { sw: 'Kiwango cha Chini' },
  'Maximum': { sw: 'Kiwango cha Juu' },
  'Change': { sw: 'Badiliko' },
  'Trend': { sw: 'Mwelekeo' },
  'Volume': { sw: 'Kiasi' },
  'High': { sw: 'Juu' },
  'Low': { sw: 'Chini' },
  'Open': { sw: 'Fungua' },
  'Close': { sw: 'Funga' },
  'Previous': { sw: 'Iliyopita' },
  'Current': { sw: 'Ya Sasa' },
  'New': { sw: 'Mpya' },
  'Old': { sw: 'Ya Zamani' },
  'Update': { sw: 'Sasisha' },
  'Add': { sw: 'Ongeza' },
  'Remove': { sw: 'Ondoa' },
  'Create': { sw: 'Unda' },
  'Manage': { sw: 'Simamia' },
  'Track': { sw: 'Fuatilia' },
  'Monitor': { sw: 'Fuatilia' },
  'Analyze': { sw: 'Chambua' },
  'Compare': { sw: 'Linganisha' },
  'Filter': { sw: 'Chuja' },
  'Sort': { sw: 'Panga' },
  'Order': { sw: 'Agiza' },
  'List': { sw: 'Orodha' },
  'Grid': { sw: 'Gridi' },
  'Table': { sw: 'Jedwali' },
  'Chart': { sw: 'Chati' },
  'Graph': { sw: 'Grafu' },
  'Map': { sw: 'Ramani' },
  'Satellite': { sw: 'Satelaiti' },
  'Language': { sw: 'Lugha' },
  'English': { sw: 'Kiingereza' },
  'Kiswahili': { sw: 'Kiswahili' },
  'Theme': { sw: 'Mandhari' },
  'Dark': { sw: 'Giza' },
  'Light': { sw: 'Mwanga' },
  'System': { sw: 'Mfumo' },
  'Notification': { sw: 'Arifa' },
  'Security': { sw: 'Usalama' },
  'Account': { sw: 'Akaunti' },
  'Help & Support': { sw: 'Msaada na Usaidizi' },
  'About Smart Crops': { sw: 'Kuhusu Mazao Mahiri' },
  'Terms of Service': { sw: 'Masharti ya Huduma' },
  'Privacy Policy': { sw: 'Sera ya Faragha' },
  'Welcome': { sw: 'Karibu' },
  'Hello': { sw: 'Hujambo' },
  'Good morning': { sw: 'Habari za asubuhi' },
  'Good afternoon': { sw: 'Habari za mchana' },
  'Good evening': { sw: 'Habari za jioni' },
  'How are you': { sw: 'Habari yako' },
  'Thank you': { sw: 'Asante' },
  'Please': { sw: 'Tafadhali' },
  'Sorry': { sw: 'Samahani' },
  'Welcome back': { sw: 'Karibu tena' },
  'Try again': { sw: 'Jaribu tena' },
  'Something went wrong': { sw: 'Kuna hitilafu imetokea' },
  'Network error': { sw: 'Hitilafu ya mtandao' },
  'Connection lost': { sw: 'Muunganisho umekatika' },
  'Retry': { sw: 'Jaribu tena' },
  'Reload': { sw: 'Pakia upya' },
  'Refresh': { sw: 'Burudisha' },
  'Select Crop...': { sw: 'Chagua Zao...' },
  'Select Region...': { sw: 'Chagua Mkoa...' },
  // ── Crop names (precise Kiswahili) ──
  'Amaranth': { sw: 'Mchicha' },
  'Avocado': { sw: 'Parachichi' },
  'Bambara Groundnuts': { sw: 'Njugu Mawe' },
  'Bananas': { sw: 'Ndizi' },
  'Beans': { sw: 'Maharagwe' },
  'Bell Peppers': { sw: 'Pilipili Hoho' },
  'Cardamom': { sw: 'Iliki' },
  'Cashew Nuts': { sw: 'Koroshoma' },
  'Cassava': { sw: 'Muhogo' },
  'Cassava Leaves': { sw: 'Kisamvu' },
  'Chili Pepper': { sw: 'Pilipili Kali' },
  'Cloves': { sw: 'Karafuu' },
  'Cocoa': { sw: 'Kakao' },
  'Coconuts': { sw: 'Nazi' },
  'Coffee': { sw: 'Kahawa' },
  'Cotton': { sw: 'Pamba' },
  'Cowpeas': { sw: 'Kunde' },
  'Eggplant': { sw: 'Mbilingani' },
  'Finger Millet': { sw: 'Ulezi' },
  'Garlic': { sw: 'Kitunguu Saumu' },
  'Ginger': { sw: 'Tangawizi' },
  'Green Gram': { sw: 'Choroko' },
  'Green Grams': { sw: 'Choroko' },
  'Groundnuts': { sw: 'Karanga' },
  'Guavas': { sw: 'Mapera' },
  'Irish Potatoes': { sw: 'Viazi Mviringo' },
  'Lemons': { sw: 'Ndimu' },
  'Maize': { sw: 'Mahindi' },
  'Mangoes': { sw: 'Maembe' },
  'Onions': { sw: 'Kitunguu' },
  'Oranges': { sw: 'Machungwa' },
  'Pigeon Peas': { sw: 'Mbaazi' },
  'Pineapples': { sw: 'Mananasi' },
  'Rice': { sw: 'Mpunga' },
  'Sesame': { sw: 'Ufuta' },
  'Sorghum': { sw: 'Mtama' },
  'Soybeans': { sw: 'Soya' },
  'Sunflower': { sw: 'Alizeti' },
  'Sweet Potatoes': { sw: 'Viazi Vitamu' },
  'Tea': { sw: 'Chai' },
  'Tobacco': { sw: 'Tumbaku' },
  'Tomatoes': { sw: 'Nyanya' },
  'Turmeric': { sw: 'Manjano' },
  'Watermelon': { sw: 'Tikiti Maji' },
  'Wheat': { sw: 'Ngano' },
  // ── Region names (proper nouns — prevent Google Translate from garbling) ──
  'Arusha': { sw: 'Arusha' },
  'Dar Es Salaam': { sw: 'Dar Es Salaam' },
  'Dodoma': { sw: 'Dodoma' },
  'Geita': { sw: 'Geita' },
  'Iringa': { sw: 'Iringa' },
  'Kagera': { sw: 'Kagera' },
  'Katavi': { sw: 'Katavi' },
  'Kigoma': { sw: 'Kigoma' },
  'Kilimanjaro': { sw: 'Kilimanjaro' },
  'Lindi': { sw: 'Lindi' },
  'Manyara': { sw: 'Manyara' },
  'Mara': { sw: 'Mara' },
  'Mbeya': { sw: 'Mbeya' },
  'Morogoro': { sw: 'Morogoro' },
  'Mtwara': { sw: 'Mtwara' },
  'Mwanza': { sw: 'Mwanza' },
  'Njombe': { sw: 'Njombe' },
  'Pwani': { sw: 'Pwani' },
  'Rukwa': { sw: 'Rukwa' },
  'Ruvuma': { sw: 'Ruvuma' },
  'Shinyanga': { sw: 'Shinyanga' },
  'Simiyu': { sw: 'Simiyu' },
  'Singida': { sw: 'Singida' },
  'Songwe': { sw: 'Songwe' },
  'Tabora': { sw: 'Tabora' },
  'Tanga': { sw: 'Tanga' },
  // ── Market names (used in ticker) ──
  'Zanzibar': { sw: 'Zanzibar' },
  'Kariakoo': { sw: 'Kariakoo' },
  'Tandale': { sw: 'Tandale' },
  'Buguruni': { sw: 'Buguruni' },
  'Ubungo': { sw: 'Ubungo' },
  'Mwenge': { sw: 'Mwenge' },
  'Manzese': { sw: 'Manzese' },
};

/* ── State ─────────────────────────────────────────────────── */
const originalTexts = new Map();      // textNode → original text
const originalPlaceholders = new Map(); // element → original placeholder
const translationCache = new Map();   // "sw:text" → translated text
let currentLang = 'en';
let isTranslating = false;
let observer = null;
let observerPaused = false;
let debounceTimer = null;

export function getCurrentLang() {
  return currentLang;
}

/* ── Detect browser language ──────────────────────────────── */
export function detectLanguage() {
  try {
    const nav = navigator.language || navigator.userLanguage || 'en';
    const code = nav.toLowerCase().split('-')[0];
    return LANGUAGES[code] ? code : 'en';
  } catch {
    return 'en';
  }
}

/* ── Tags & selectors to skip ─────────────────────────────── */
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
  'INPUT', 'TEXTAREA', 'CODE', 'PRE', 'KBD',
  'SAMP', 'VAR', 'MARK', 'METER', 'PROGRESS',
]);

const SKIP_CLASSES = [
  'lang-switcher', 'lang-trigger', 'lang-dropdown',
  'stat-value',          // pure numbers
  'ticker-price',        // price values
  'profit-amount',       // percentage values
];

/* ── Check if text is worth translating ───────────────────── */
function isTranslatableText(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  // Skip pure numbers, dates, prices, codes
  if (/^[\d\s,.\-/:%TZS]+$/.test(trimmed)) return false;
  // Skip single-char or emoji-only strings
  if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return false;
  // Skip hashes, hex colors, CSS values
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return false;
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%|ms|s)$/.test(trimmed)) return false;
  return true;
}

/* ── Check if element is inside a skip zone ───────────────── */
function isInSkipZone(el) {
  if (!el || !el.closest) return false;
  // data-translate="skip" explicitly excludes element + descendants
  if (el.closest('[data-translate="skip"]')) return true;
  // Skip our own translation UI
  if (el.closest('.lang-switcher')) return true;
  return false;
}

/* ══════════════════════════════════════════════════════════════
   Collect ALL translatable text nodes from the DOM
   ─ Walks the full document tree
   ─ Skips scripts, styles, inputs, numbers, code blocks
   ─ Returns array of { node, text, parentElement }
══════════════════════════════════════════════════════════════ */
function collectTextNodes() {
  const results = [];
  const seen = new Set();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip non-visible or excluded tags
        const tag = parent.tagName;
        if (SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;

        // Skip elements with 0 size (hidden) — but NOT <option> (always 0 size when dropdown is closed)
        if (tag !== 'OPTION' && parent.offsetWidth === 0 && parent.offsetHeight === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip elements inside exclusion zones
        if (isInSkipZone(parent)) return NodeFilter.FILTER_REJECT;

        // Skip elements with skip class
        for (const cls of SKIP_CLASSES) {
          if (parent.closest(`.${cls}`)) return NodeFilter.FILTER_REJECT;
        }

        // Check text content
        const text = node.textContent.trim();
        if (!isTranslatableText(text)) return NodeFilter.FILTER_SKIP;

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    if (seen.has(node)) continue;
    seen.add(node);
    results.push({
      node,
      text: node.textContent.trim(),
      parentElement: node.parentElement,
    });
  }

  return results;
}

/* ── Translation cache helpers ────────────────────────────── */
function cacheKey(text, targetLang) {
  return `${targetLang}:${text}`;
}

function getCached(text, targetLang) {
  const dictKey = text in DICTIONARY ? DICTIONARY[text][targetLang] : null;
  if (dictKey) return dictKey;
  return translationCache.get(cacheKey(text, targetLang));
}

function setCached(text, translated, targetLang) {
  translationCache.set(cacheKey(text, targetLang), translated);
}

/* ══════════════════════════════════════════════════════════════
   Apply / restore translations on text nodes
══════════════════════════════════════════════════════════════ */
function applyFromCache(entries, targetLang) {
  observerPaused = true;
  for (const entry of entries) {
    const original = originalTexts.get(entry.node);
    if (!original) continue;
    const translated = getCached(original, targetLang);
    if (translated && entry.node.parentNode) {
      entry.node.textContent = translated;
    }
  }
  observerPaused = false;
}

function restoreOriginals(entries) {
  observerPaused = true;
  for (const entry of entries) {
    const original = originalTexts.get(entry.node);
    if (original && entry.node.parentNode) {
      entry.node.textContent = original;
    }
  }
  observerPaused = false;
}

/* ── Store originals for text nodes we haven't seen ───────── */
function ensureOriginals(entries) {
  for (const entry of entries) {
    if (!originalTexts.has(entry.node)) {
      originalTexts.set(entry.node, entry.text);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   Placeholder attribute translation
   ─ Input/textarea values must NOT be translated (user data)
   ─ But placeholder hints SHOULD be translated
═══════════════════════════════════════════════════════════════ */
function collectPlaceholders() {
  const results = [];
  const els = document.querySelectorAll('input[placeholder], textarea[placeholder]');
  for (const el of els) {
    if (isInSkipZone(el)) continue;
    const ph = el.getAttribute('placeholder');
    if (ph && isTranslatableText(ph)) {
      results.push({ el, text: ph });
    }
  }
  return results;
}

function ensurePlaceholderOriginals(entries) {
  for (const entry of entries) {
    if (!originalPlaceholders.has(entry.el)) {
      originalPlaceholders.set(entry.el, entry.text);
    }
  }
}

function applyPlaceholders(entries, targetLang) {
  observerPaused = true;
  for (const entry of entries) {
    const original = originalPlaceholders.get(entry.el);
    if (!original) continue;
    const translated = getCached(original, targetLang);
    if (translated) {
      entry.el.setAttribute('placeholder', translated);
    }
  }
  observerPaused = false;
}

function restorePlaceholders(entries) {
  observerPaused = true;
  for (const entry of entries) {
    const original = originalPlaceholders.get(entry.el);
    if (original) {
      entry.el.setAttribute('placeholder', original);
    }
  }
  observerPaused = false;
}

/* ── Call Google Translate free API directly (no server needed) ── */
async function googleTranslateDirect(texts, targetLang) {
  const results = [];

  // Process in chunks to avoid URL length limits
  const CHUNK_SIZE = 20;
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE);
    const joined = chunk.join('\n\u2764\n'); // unique separator

    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: targetLang,
      dt: 't',
      q: joined,
    });

    try {
      const response = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Response shape: data[0] is array of [translatedSegment, originalSegment, ...]
      let fullTranslation = '';
      if (data && data[0]) {
        fullTranslation = data[0]
          .filter((seg) => seg[0] != null)
          .map((seg) => seg[0])
          .join('');
      }

      const parts = fullTranslation.split('\n\u2764\n');
      chunk.forEach((original, j) => {
        results.push(parts[j] || original);
      });
    } catch (err) {
      console.error(`[i18n] Google Translate chunk ${i}-${i + CHUNK_SIZE} failed:`, err.message);
      // On failure, return originals for this chunk
      chunk.forEach((original) => results.push(original));
    }

    // Small delay between chunks to avoid rate limiting
    if (i + CHUNK_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results;
}

/* ── Fallback: local translation server proxy ─────────────── */
async function localServerFallback(texts, targetLang) {
  try {
    const response = await fetch('http://localhost:3001/api/translate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.translations || null;
  } catch {
    return null; // server not running
  }
}

/* ── Fetch translations (only uncached texts) ────────────── */
async function fetchTranslations(texts, targetLang) {
  // Deduplicate texts and find uncached ones (skip dictionary entries)
  const uniqueTexts = [...new Set(texts.filter(Boolean))];
  const uncached = [];

  for (const text of uniqueTexts) {
    if (text in DICTIONARY) continue; // already handled by dictionary
    if (getCached(text, targetLang) === undefined) {
      uncached.push(text);
    }
  }

  if (uncached.length === 0) return; // all cached

  // Try direct Google Translate first (no server needed)
  let translations = null;
  try {
    translations = await googleTranslateDirect(uncached, targetLang);
  } catch (err) {
    console.warn('[i18n] Direct Google Translate failed, trying local server...', err.message);
  }

  // Fallback to local translation server if direct call failed
  if (!translations || translations.length !== uncached.length) {
    translations = await localServerFallback(uncached, targetLang);
  }

  // Cache all results
  if (translations && Array.isArray(translations)) {
    translations.forEach((translated, j) => {
      if (translated && uncached[j]) {
        setCached(uncached[j], translated, targetLang);
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   Main: translate the entire page automatically
   ─ On first switch: fetches from API + caches results
   ─ On subsequent switches: uses cache (instant, no API call)
   ─ On switch back to English: restores originals instantly
══════════════════════════════════════════════════════════════ */
export async function translatePage(targetLang) {
  if (isTranslating) return;

  currentLang = targetLang;

  const entries = collectTextNodes();
  const phEntries = collectPlaceholders();
  ensureOriginals(entries);
  ensurePlaceholderOriginals(phEntries);

  // Switching back to English — restore originals instantly
  if (targetLang === 'en') {
    restoreOriginals(entries);
    restorePlaceholders(phEntries);
    return;
  }

  isTranslating = true;

  try {
    // Collect unique texts to translate (text nodes + placeholders)
    const texts = [...new Set([
      ...entries.map((e) => e.text),
      ...phEntries.map((e) => e.text),
    ].filter(Boolean))];

    // Fetch any uncached translations (direct Google Translate or fallback)
    await fetchTranslations(texts, targetLang);

    // Apply all translations from cache
    applyFromCache(entries, targetLang);
    applyPlaceholders(phEntries, targetLang);
  } catch (err) {
    console.error('[i18n] translatePage error:', err.message);
  } finally {
    isTranslating = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   MutationObserver — auto-reapplies translations when React
   re-renders inject new text or revert text back to English.
   Debounced to avoid excessive re-processing.
══════════════════════════════════════════════════════════════ */
function handleMutations(mutations) {
  if (observerPaused || currentLang === 'en' || isTranslating) return;

  let hasRelevantChange = false;

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // Skip our own UI elements
        if (node.closest?.('.lang-switcher')) continue;
        if (SKIP_TAGS.has(node.tagName)) {
          // But still check if new inputs/textareas have translatable placeholders
          if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.getAttribute('placeholder')) {
            hasRelevantChange = true;
            break;
          }
          // Also check if the new node contains inputs/textareas with placeholders
          if (node.querySelectorAll && node.querySelectorAll('input[placeholder], textarea[placeholder]').length > 0) {
            hasRelevantChange = true;
            break;
          }
          continue;
        }
        // Any new element with text content might need translation
        if (node.textContent?.trim().length >= 2) {
          hasRelevantChange = true;
          break;
        }
      }
    }

    if (mutation.type === 'characterData') {
      const parent = mutation.target.parentElement;
      if (!parent) continue;
      if (SKIP_TAGS.has(parent.tagName)) continue;
      if (isInSkipZone(parent)) continue;
      const text = mutation.target.textContent.trim();
      if (isTranslatableText(text)) {
        // Check if this text matches an original (reverted to English)
        const orig = originalTexts.get(mutation.target);
        if (orig && text === orig) {
          hasRelevantChange = true;
        }
        // Or it's new text that's not yet cached
        if (!getCached(text, currentLang)) {
          hasRelevantChange = true;
        }
      }
    }

    if (mutation.type === 'attributes' && mutation.attributeName === 'placeholder') {
      const el = mutation.target;
      if (isInSkipZone(el)) continue;
      const ph = el.getAttribute('placeholder');
      if (ph && isTranslatableText(ph)) {
        hasRelevantChange = true;
      }
    }

    if (hasRelevantChange) break;
  }

  if (!hasRelevantChange) return;

  // Debounce: wait 150ms for React to finish all DOM updates
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (currentLang !== 'en' && !isTranslating) {
      const entries = collectTextNodes();
      const phEntries = collectPlaceholders();
      ensureOriginals(entries);
      ensurePlaceholderOriginals(phEntries);

      // Check if any need fetching
      const texts = [...new Set([
        ...entries.map((e) => e.text),
        ...phEntries.map((e) => e.text),
      ].filter(Boolean))];
      const hasUncached = texts.some((t) => getCached(t, currentLang) === undefined);

      if (hasUncached) {
        translatePage(currentLang);
      } else {
        // All cached — apply immediately (fast)
        observerPaused = true;
        applyFromCache(entries, currentLang);
        applyPlaceholders(phEntries, currentLang);
        observerPaused = false;
      }
    }
  }, 150);
}

/* ── Initialize observer ─────────────────────────────────── */
export function initAutoTranslate() {
  if (observer) return;

  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  });
}

/* ── Cleanup ──────────────────────────────────────────────── */
export function destroyAutoTranslate() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/* ── Manual reapply (for useEffect hooks) ─────────────────── */
export function reapplyTranslation() {
  if (currentLang === 'en' || isTranslating) return;
  requestAnimationFrame(async () => {
    const entries = collectTextNodes();
    const phEntries = collectPlaceholders();
    ensureOriginals(entries);
    ensurePlaceholderOriginals(phEntries);

    const texts = [...new Set([
      ...entries.map((e) => e.text),
      ...phEntries.map((e) => e.text),
    ].filter(Boolean))];
    const hasUncached = texts.some((t) => getCached(t, currentLang) === undefined);

    if (hasUncached) {
      await translatePage(currentLang);
    } else {
      applyFromCache(entries, currentLang);
      applyPlaceholders(phEntries, currentLang);
    }
  });
}
