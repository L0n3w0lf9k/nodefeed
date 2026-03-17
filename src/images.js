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

  try {
    const res = await fetch(url, { timeout: 45000 });

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
    console.error(`[Images] ✗ Failed:`, e.message);
    return null;
  }
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
