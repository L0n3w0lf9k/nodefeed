require('dotenv').config();
const fetch = require('node-fetch');

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

const CONCRETE_KEYWORDS = [
  'iphone','samsung','galaxy','pixel','macbook','ipad','apple watch',
  'nvidia','gpu','processor','chip','rtx','tesla','vision pro',
  'chatgpt','gemini','copilot','midjourney','dall-e','stable diffusion',
  'robot','drone','headset','keyboard','monitor','laptop','tablet',
  'notion','figma','slack','zoom','cursor','github','vscode',
  'openai','anthropic','google','microsoft','meta','amazon','apple',
  'spacex','starship','nasa','rocket','satellite','telescope',
  'bitcoin','ethereum','coinbase','binance','solana'
];

function isConcrete(title, category) {
  const text = (title + ' ' + category).toLowerCase();
  return CONCRETE_KEYWORDS.some(kw => text.includes(kw));
}

async function fetchUnsplashImage(query) {
  if (!UNSPLASH_KEY) {
    console.log('[Images] No Unsplash key — skipping');
    return null;
  }
  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) {
      console.log('[Images] Unsplash returned:', res.status);
      return null;
    }
    const data = await res.json();
    return {
      url: data.urls.regular,
      thumb: data.urls.small,
      alt: data.alt_description || query,
      credit: `Photo by ${data.user.name} on Unsplash`,
      creditUrl: data.links.html
    };
  } catch (e) {
    console.error('[Images] Unsplash error:', e.message);
    return null;
  }
}

// Pollinations.ai — free, no key, returns image directly at URL
// We just build the URL — no need to fetch it, browser loads it directly
function buildPollinationsUrl(prompt, width = 1200, height = 630) {
  const enhanced = `${prompt}, tech magazine editorial, cinematic lighting, professional photography style, high quality, detailed`;
  const encoded = encodeURIComponent(enhanced);
  // Use a seed based on the prompt for consistency
  const seed = Math.abs(prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
}

async function getArticleImage(title, category, excerpt) {
  const concrete = isConcrete(title, category);

  if (concrete && UNSPLASH_KEY) {
    console.log(`[Images] Concrete topic — trying Unsplash: "${title}"`);
    const query = title.split(' ').slice(0, 5).join(' ');
    const img = await fetchUnsplashImage(query);
    if (img) return { ...img, source: 'unsplash' };
    console.log('[Images] Unsplash failed — falling back to Pollinations');
  }

  // Pollinations — just return the URL directly, no fetch needed
  console.log(`[Images] Using Pollinations AI for: "${title}"`);
  const prompt = `${title} ${category}`;
  const url = buildPollinationsUrl(prompt);
  const thumb = buildPollinationsUrl(prompt, 600, 315);

  return {
    url,
    thumb,
    alt: title,
    credit: 'AI-generated image via Pollinations',
    creditUrl: 'https://pollinations.ai',
    source: 'pollinations'
  };
}

module.exports = { getArticleImage };
