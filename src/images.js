require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const IMAGES_DIR = path.join(VOLUME_PATH, 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log('[Images] Created images directory:', IMAGES_DIR);
}

// Build a highly specific, relevant prompt for each article
function buildImagePrompt(title) {
  // Use article title directly — gives Pollinations full context
  const prefix = 'Generate cover for tech article: ';
  const suffix = ', technology - futuristic';
  const maxTitle = 250;
  const safeTitle = title.length <= maxTitle ? title : title.slice(0, maxTitle - 3);
  return prefix + safeTitle + suffix;
}

// Download image from Pollinations new API endpoint
async function downloadAndSave(url, slug, title, category, suffix = '') {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const wait = attempt * 6000;
        console.log(`[Images] Retry ${attempt}/${MAX_RETRIES} in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }

      console.log(`[Images] Fetching: ${url.slice(0, 100)}...`);
      const res = await fetch(url, {
        timeout: 60000,
        headers: { 'User-Agent': 'NodeFeeds/1.0' }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('image')) {
        throw new Error(`Expected image, got: ${contentType}`);
      }

      const buffer = await res.buffer();
      if (buffer.length < 5000) {
        throw new Error(`Response too small (${buffer.length} bytes)`);
      }

      const ext = contentType.includes('png') ? 'png' : 'jpg';
      const filename = `${slug}${suffix}.${ext}`;
      const filepath = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      console.log(`[Images] ✓ Saved: ${filename} (${Math.round(buffer.length / 1024)}kb)`);
      return filename;

    } catch (e) {
      console.error(`[Images] Attempt ${attempt} failed:`, e.message);
      if (attempt === MAX_RETRIES) return null;
    }
  }
  return null;
}

async function generateAndSaveImage(slug, title, category) {
  const prompt = buildImagePrompt(title);
  const seed = Math.abs(slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0));

  // New Pollinations API endpoint
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&seed=${seed}&nologo=true&model=flux&enhance=true`;

  console.log(`[Images] Generating for: "${title}"`);
  console.log(`[Images] Prompt: ${prompt.slice(0, 100)}...`);

  const filename = await downloadAndSave(pollinationsUrl, slug, title, category);

  if (filename) {
    return {
      url: `/images/${filename}`,
      thumb: `/images/${filename}`,
      alt: title,
      credit: 'AI-generated image via Pollinations',
      creditUrl: 'https://pollinations.ai',
      source: 'pollinations',
      filename
    };
  }

  // Fallback 1: Unsplash with smart category query
  console.log('[Images] Pollinations failed — trying Unsplash fallback...');
  const unsplash = await fetchUnsplashImage(prompt, category, slug);
  if (unsplash) return unsplash;

  // Fallback 2: Picsum — always works
  console.log('[Images] Trying Picsum fallback...');
  return await fetchPicsumImage(slug, title);
}

async function fetchUnsplashImage(prompt, category, slug) {
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_KEY) return null;

  const categoryQueries = {
    'AI Tools': 'artificial intelligence technology',
    'Productivity': 'workspace productivity modern',
    'Gadgets': 'technology electronics gadgets',
    'Automation': 'automation robots technology',
    'AI News': 'artificial intelligence digital future',
    'Future of Work': 'modern office technology people',
    'Developer Tools': 'coding programming computer',
    'Tech Reviews': 'technology product premium',
    'Space Tech': 'space stars cosmos galaxy',
    'Cybersecurity': 'cybersecurity network dark',
    'Crypto & Web3': 'cryptocurrency blockchain digital',
  };

  const query = prompt || categoryQueries[category] || 'technology';

  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json();

    // Download and save locally
    const imgRes = await fetch(data.urls.regular, { timeout: 15000 });
    if (!imgRes.ok) return null;
    const buffer = await imgRes.buffer();
    const filename = `${slug}-unsplash.jpg`;
    fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
    console.log(`[Images] ✓ Unsplash saved: ${filename}`);

    return {
      url: `/images/${filename}`,
      thumb: `/images/${filename}`,
      alt: data.alt_description || title,
      credit: `Photo by ${data.user.name} on Unsplash`,
      creditUrl: data.links.html,
      source: 'unsplash',
      filename
    };
  } catch (e) {
    console.error('[Images] Unsplash fallback failed:', e.message);
    return null;
  }
}

async function fetchPicsumImage(slug, title) {
  const seed = slug.slice(0, 20);
  const picsumUrl = `https://picsum.photos/seed/${seed}/1200/630`;

  try {
    const res = await fetch(picsumUrl, { timeout: 15000 });
    if (!res.ok) return null;
    const buffer = await res.buffer();
    const filename = `${slug}-picsum.jpg`;
    fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer);
    console.log(`[Images] ✓ Picsum saved: ${filename}`);

    return {
      url: `/images/${filename}`,
      thumb: `/images/${filename}`,
      alt: title,
      credit: 'Photo via Picsum',
      creditUrl: 'https://picsum.photos',
      source: 'picsum',
      filename
    };
  } catch (e) {
    console.error('[Images] Picsum fallback failed:', e.message);
    return null;
  }
}

function listSavedImages() {
  try {
    return fs.readdirSync(IMAGES_DIR).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
  } catch (e) {
    return [];
  }
}

module.exports = { generateAndSaveImage, listSavedImages, IMAGES_DIR, buildImagePrompt };
