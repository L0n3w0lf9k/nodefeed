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

const STYLE_BY_CATEGORY = {
  'AI Tools':        'glowing neural network interface, blue green neon lights, dark tech background, digital nodes',
  'Productivity':    'clean minimal workspace, soft natural light, modern desk setup, laptop coffee notebook',
  'Gadgets':         'dramatic product photography, dark studio background, cinematic lighting, consumer electronics',
  'Automation':      'robotic arms and circuits, futuristic factory floor, neon blue industrial lighting',
  'AI News':         'abstract artificial intelligence, digital brain concept, glowing data streams, dark background',
  'Future of Work':  'futuristic office space, holographic displays, diverse people collaborating with technology',
  'Developer Tools': 'dark terminal screen with glowing green code, keyboard close up, developer workspace',
  'Tech Reviews':    'clean product shot on dark background, dramatic side lighting, premium feel',
  'Space Tech':      'dramatic nebula and stars, rocket launch, ISS in orbit, NASA mission control',
  'Cybersecurity':   'dark matrix code, red warning alerts, digital lock and shield, hacker silhouette',
  'Crypto & Web3':   'golden bitcoin coins, blockchain network visualization, dark financial background',
};

function buildImagePrompt(title, category) {
  const style = STYLE_BY_CATEGORY[category] || 'technology abstract, cinematic, dark background';
  return `${title}, ${style}, ultra realistic editorial magazine photography, 4k, professional, award winning`;
}

async function generateAndSaveImage(slug, title, category) {
  const prompt = buildImagePrompt(title, category);
  const seed = Math.abs(slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&seed=${seed}&nologo=true&model=flux`;

  console.log(`[Images] Requesting Pollinations image...`);
  console.log(`[Images] Prompt: ${prompt.slice(0, 80)}...`);
  console.log(`[Images] URL: ${url.slice(0, 100)}...`);

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const wait = attempt * 5000;
        console.log(`[Images] Retry ${attempt}/${MAX_RETRIES} in ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }

      const res = await fetch(url, { timeout: 60000 });

      if (!res.ok) {
        throw new Error(`Pollinations returned HTTP ${res.status}`);
      }

    const contentType = res.headers.get('content-type') || '';
    console.log(`[Images] Response content-type: ${contentType}`);

    if (!contentType.includes('image')) {
      throw new Error(`Expected image, got: ${contentType}`);
    }

    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `${slug}.${ext}`;
    const filepath = path.join(IMAGES_DIR, filename);

    const buffer = await res.buffer();

    if (buffer.length < 5000) {
      throw new Error(`Image too small (${buffer.length} bytes) — likely an error response`);
    }

    fs.writeFileSync(filepath, buffer);
    console.log(`[Images] ✓ Saved: ${filename} (${Math.round(buffer.length / 1024)}kb) at ${filepath}`);

    // Verify file was actually written
    const stat = fs.statSync(filepath);
    console.log(`[Images] ✓ Verified on disk: ${stat.size} bytes`);

      return {
        url: `/images/${filename}`,
        thumb: `/images/${filename}`,
        alt: title,
        credit: 'AI-generated image via Pollinations',
        creditUrl: 'https://pollinations.ai',
        source: 'pollinations',
        filename
      };

    } catch (e) {
      console.error(`[Images] ✗ Attempt ${attempt} failed:`, e.message);
      if (attempt === MAX_RETRIES) {
        console.error(`[Images] All ${MAX_RETRIES} attempts failed for: "${title}"`);
        // Try Unsplash fallback
        console.log('[Images] Trying Unsplash fallback...');
        const unsplash = await fetchUnsplashImage(title, category);
        if (unsplash) {
          console.log('[Images] ✓ Unsplash fallback succeeded');
          return unsplash;
        }
        // Final fallback — Picsum, download and save locally
        console.log('[Images] Using Picsum final fallback...');
        const picsum = getPicsumImage(slug, title);
        try {
          const pr = await fetch(picsum.url, { timeout: 15000 });
          if (pr.ok) {
            const filename = `${slug}-fallback.jpg`;
            const filepath = path.join(IMAGES_DIR, filename);
            fs.writeFileSync(filepath, await pr.buffer());
            console.log(`[Images] ✓ Picsum saved: ${filename}`);
            return { ...picsum, url: `/images/${filename}`, thumb: `/images/${filename}`, filename };
          }
        } catch(e) {
          console.error('[Images] Picsum download failed:', e.message);
        }
        return picsum; // return external URL as last resort
      }
    }
  }
  return null;
}

// Fallback 1: Unsplash — real topic-matched photos
async function fetchUnsplashImage(query, category) {
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_KEY) return null;

  const categoryQueries = {
    'AI Tools':        'artificial intelligence technology',
    'Productivity':    'workspace productivity laptop',
    'Gadgets':         'technology gadgets electronics',
    'Automation':      'automation robots technology',
    'AI News':         'artificial intelligence digital',
    'Future of Work':  'modern office technology',
    'Developer Tools': 'coding programming computer',
    'Tech Reviews':    'technology product review',
    'Space Tech':      'space stars galaxy cosmos',
    'Cybersecurity':   'cybersecurity hacking dark',
    'Crypto & Web3':   'cryptocurrency blockchain digital',
  };

  const q = categoryQueries[category] || query;
  try {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      url: data.urls.regular,
      thumb: data.urls.small,
      alt: data.alt_description || query,
      credit: `Photo by ${data.user.name} on Unsplash`,
      creditUrl: data.links.html,
      source: 'unsplash'
    };
  } catch (e) {
    console.error('[Images] Unsplash fallback failed:', e.message);
    return null;
  }
}

// Fallback 2: Picsum — always works, seeded so same article = same image
function getPicsumImage(slug, title) {
  const seed = slug.slice(0, 20);
  return {
    url: `https://picsum.photos/seed/${seed}/1200/630`,
    thumb: `https://picsum.photos/seed/${seed}/600/315`,
    alt: title,
    credit: 'Photo via Picsum',
    creditUrl: 'https://picsum.photos',
    source: 'picsum'
  };
}

// List all saved images on disk
function listSavedImages() {
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    return files.filter(f => f.match(/\.(jpg|jpeg|png)$/i));
  } catch (e) {
    return [];
  }
}

module.exports = { generateAndSaveImage, listSavedImages, IMAGES_DIR };
