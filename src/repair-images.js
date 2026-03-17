// Run manually: node src/repair-images.js
// Or triggered automatically on startup if articles are missing images
require('dotenv').config();
const db = require('./db');
const { generateAndSaveImage, listSavedImages } = require('./images');

async function repairImages() {
  await db.init();

  const articles = db.getArticles(1000);
  const savedFiles = new Set(listSavedImages());

  console.log(`[Repair] Checking ${articles.length} articles for missing images...`);
  console.log(`[Repair] Found ${savedFiles.size} images on disk`);

  const missing = articles.filter(a => {
    // Missing if: no image_url at all
    if (!a.image_url) return true;
    // Missing if: image_url is an external URL (not a local /images/ path)
    if (a.image_url.startsWith('http')) return true;
    
    // We no longer check for the file on disk during automatic repairs
    // to avoid false positives if the volume isn't ready or during deployments
    return false;
  });

  console.log(`[Repair] ${missing.length} articles need images`);

  if (missing.length === 0) {
    console.log('[Repair] All articles have images ✓');
    return;
  }

  let fixed = 0;
  let failed = 0;

  for (const article of missing) {
    console.log(`\n[Repair] Processing: "${article.title}"`);
    const image = await generateAndSaveImage(article.slug, article.title, article.category, article.excerpt);

    if (image) {
      db.updateArticleImage(article.slug, image);
      console.log(`[Repair] ✓ Fixed: ${article.slug}`);
      fixed++;
    } else {
      console.log(`[Repair] ✗ Failed: ${article.slug}`);
      failed++;
    }

    // Small delay between requests to be nice to Pollinations
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n[Repair] Complete: ${fixed} fixed, ${failed} failed`);
}

repairImages().then(() => process.exit(0)).catch(e => {
  console.error('[Repair] Fatal error:', e);
  process.exit(1);
});
