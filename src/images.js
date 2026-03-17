require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Images stored in the Railway Volume alongside the database
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const IMAGES_DIR = path.join(VOLUME_PATH, 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Build a Pollinations prompt tailored to the article
function buildImagePrompt(title, category) {
  const styleByCategory = {
    'AI Tools':        'glowing neural network interface, dark tech aesthetic, blue green light rays',
    'Productivity':    'clean minimal workspace, soft light, modern office, top down view',
    'Gadgets':         'product photography, dark background, dramatic lighting, tech device',
    'Automation':      'robotic gears and circuits, futuristic factory, neon blue lights',
    'AI News':         'abstract artificial intelligence, digital brain, dark background, glowing nodes',
    'Future of Work':  'futuristic office, holographic displays, people working with AI',
    'Developer Tools': 'code on dark screen, terminal, matrix style, green text',
    'Tech Reviews':    'clean product shot, dramatic lighting, dark background',
    'Space Tech':      'dramatic space photography, stars nebula planets, NASA style',
    'Cybersecurity':   'dark hacker aesthetic, binary code, red warning lights, shield',
    'Crypto & Web3':   'blockchain nodes, gold bitcoin, dark background, digital finance',
  };

  const style = styleByCategory[category] || 'technology abstract, dark background, cinematic';
  return `${title}, ${style}, editorial magazine photography, ultra realistic, 4k, professional`;
}

// Download image from Pollinations and save to Volume
async function generateAndSaveImage(slug, title, category) {
  const prompt = buildImagePrompt(title, category);
  const seed = Math.abs(slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&seed=${seed}&nologo=true&model=flux`;

  console.log(`[Images] Generating AI image for: "${title}"`);

  try {
    // Pollinations can be slow — give it 30 seconds
    const res = await fetch(pollinationsUrl, { timeout: 30000 });

    if (!res.ok) {
      throw new Error(`Pollinations returned ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `${slug}.${ext}`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Save image buffer to disk
    const buffer = await res.buffer();
    fs.writeFileSync(filepath, buffer);

    console.log(`[Images] ✓ Saved image: ${filename} (${Math.round(buffer.length / 1024)}kb)`);

    return {
      url: `/images/${filename}`,
      thumb: `/images/${filename}`,
      alt: title,
      credit: 'AI-generated image via Pollinations',
      creditUrl: 'https://pollinations.ai',
      source: 'pollinations'
    };

  } catch (e) {
    console.error(`[Images] ✗ Failed to generate image:`, e.message);
    return null;
  }
}

module.exports = { generateAndSaveImage };
