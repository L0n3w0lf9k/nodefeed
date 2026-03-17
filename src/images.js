require('dotenv').config();
const fetch = require('node-fetch');

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

// Keywords that suggest a concrete product/item needing real photos
const CONCRETE_KEYWORDS = [
  'iphone', 'samsung', 'galaxy', 'pixel', 'macbook', 'ipad', 'apple watch',
  'nvidia', 'gpu', 'processor', 'chip', 'rtx', 'tesla', 'vision pro',
  'chatgpt', 'gemini', 'copilot', 'midjourney', 'dall-e', 'stable diffusion',
  'robot', 'drone', 'headset', 'keyboard', 'monitor', 'laptop', 'tablet',
  'notion', 'figma', 'slack', 'zoom', 'cursor', 'github', 'vscode',
  'openai', 'anthropic', 'google', 'microsoft', 'meta', 'amazon', 'apple'
];

function isConcrete(title, category) {
  const text = (title + ' ' + category).toLowerCase();
  return CONCRETE_KEYWORDS.some(kw => text.includes(kw));
}

// Fetch a real photo from Unsplash for concrete topics
async function fetchUnsplashImage(query) {
  if (!UNSPLASH_KEY) return null;
  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
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

// Generate AI image via Pollinations (free, no key needed)
async function generatePollinationsImage(prompt) {
  try {
    const enhancedPrompt = `${prompt}, tech magazine editorial photography, professional, high quality, dark moody lighting, cinematic`;
    const url = `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=1200&height=630&nologo=true&model=flux`;
    // Pollinations returns the image directly at the URL — no need to fetch, just return the URL
    return {
      url,
      thumb: `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=600&height=315&nologo=true&model=flux`,
      alt: prompt,
      credit: 'AI-generated image',
      creditUrl: null
    };
  } catch (e) {
    console.error('[Images] Pollinations error:', e.message);
    return null;
  }
}

// Main export — picks strategy based on article content
async function getArticleImage(title, category, excerpt) {
  const concrete = isConcrete(title, category);

  if (concrete) {
    console.log(`[Images] Concrete topic detected — trying Unsplash for: "${title}"`);
    const searchQuery = title.split(' ').slice(0, 4).join(' ');
    const img = await fetchUnsplashImage(searchQuery);
    if (img) return { ...img, source: 'unsplash' };
    // Fallback to Pollinations if Unsplash fails or no key
    console.log('[Images] Unsplash failed — falling back to Pollinations');
  } else {
    console.log(`[Images] Abstract topic — using Pollinations AI for: "${title}"`);
  }

  const prompt = `${title} ${category} technology abstract`;
  const img = await generatePollinationsImage(prompt);
  return img ? { ...img, source: 'pollinations' } : null;
}

module.exports = { getArticleImage };
