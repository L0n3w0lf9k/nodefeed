require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const slugify = require('slugify');
const db = require('./db');
const { getArticleImage } = require('./images');
const { postArticle } = require('./twitter');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  'AI Tools', 'Productivity', 'Gadgets', 'Automation',
  'AI News', 'Future of Work', 'Developer Tools', 'Tech Reviews',
  'Space Tech', 'Cybersecurity', 'Crypto & Web3'
];

const TOPICS = [
  // AI & Machine Learning
  'latest AI model releases and benchmarks this week',
  'AI assistants and chatbot updates and comparisons',
  'open source AI projects and breakthroughs',
  'machine learning research breakthroughs simplified',
  'AI video and image generation tools news',
  'voice AI and speech technology updates',
  'AI agents and autonomous systems news',
  'AI safety ethics and regulation news',
  'AI in healthcare and biotech news',
  'AI for content creators and marketers',
  'best AI tools for students and educators',

  // Productivity & Tools
  'new productivity tools and apps launched recently',
  'automation tools for small businesses and solopreneurs',
  'new SaaS tools for productivity and collaboration',
  'new features in popular apps powered by AI',
  'how businesses are using AI to save time and money',
  'developer tools and coding AI assistants',
  'AI in everyday workflows and real world use cases',

  // Hardware & Gadgets
  'new gadgets and consumer tech announcements',
  'chipmakers and semiconductor AI news',
  'robotics and hardware AI developments',
  'smart home and IoT AI developments',

  // Industry & Business
  'tech industry news and startup launches this week',
  'tech funding rounds and startup news this week',
  'AI in finance and fintech',

  // Space Tech
  'space exploration missions and rocket launches this week',
  'SpaceX Starship and reusable rocket technology news',
  'NASA and ESA space program updates and discoveries',
  'satellite technology and commercial space industry news',
  'Mars and Moon colonisation plans and developments',
  'space telescopes and astronomical discoveries',
  'private space companies and space tourism updates',

  // Cybersecurity
  'major cybersecurity breaches and hacks this week',
  'new cybersecurity tools and threat detection software',
  'ransomware and malware trends and how to protect yourself',
  'government cybersecurity policy and regulation news',
  'AI being used in cybersecurity and cyber attacks',
  'privacy tools and data protection news',
  'zero day vulnerabilities and software security patches',

  // Crypto & Web3
  'Bitcoin and Ethereum price movements and market analysis',
  'new cryptocurrency projects and altcoin launches',
  'DeFi decentralised finance news and developments',
  'NFT and digital ownership trends in 2026',
  'blockchain technology real world adoption news',
  'crypto regulation and government policy updates',
  'Web3 applications and decentralised app launches',
  'stablecoins and central bank digital currency news',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function estimateReadTime(text) { return Math.max(3, Math.round(text.split(/\s+/).length / 200)); }

// Extract key terms from a string for similarity comparison
function fingerprint(text) {
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for',
    'of','with','by','from','is','are','was','were','be','been','have','has','had',
    'will','would','could','should','may','might','about','how','what','when','where',
    'this','that','these','those','its','it','as','up','do','did','new','latest']);
  return text.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 20)
    .sort()
    .join(' ');
}

// Check overlap between two fingerprints — returns 0.0 to 1.0
function similarity(a, b) {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return intersection / Math.min(setA.size, setB.size);
}

// Returns true if this topic/title is too similar to recent articles
function isTooSimilar(candidateText, recentArticles, threshold = 0.45) {
  const candidateFp = fingerprint(candidateText);
  for (const article of recentArticles) {
    const existingFp = fingerprint(article.title + ' ' + article.excerpt);
    const score = similarity(candidateFp, existingFp);
    if (score >= threshold) {
      console.log(`[NodeFeeds] Too similar to "${article.title}" (score: ${score.toFixed(2)}) — skipping`);
      return true;
    }
  }
  return false;
}

async function generateArticle() {
  // Load articles from last 30 days for duplicate checking
  const recentArticles = db.getRecentArticles(30);
  console.log(`[NodeFeeds] Loaded ${recentArticles.length} recent articles for duplicate check.`);

  // Shuffle topics and try up to 5 different ones
  const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5);
  let chosenTopic = null;

  for (const topic of shuffledTopics) {
    if (!isTooSimilar(topic, recentArticles)) {
      chosenTopic = topic;
      break;
    }
  }

  if (!chosenTopic) {
    // All predefined topics are too similar — ask Claude to invent a fresh angle
    console.log('[NodeFeeds] All preset topics too similar — generating a novel topic...');
    chosenTopic = 'an emerging or niche AI or tech story that has not been widely covered this month';
  }

  const category = pickRandom(CATEGORIES);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const recentTitles = recentArticles.slice(0, 15).map(a => `- ${a.title}`).join('\n');

  console.log(`[NodeFeeds] Generating: "${chosenTopic}" (${category})`);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a sharp, knowledgeable tech journalist writing for NodeFeeds — an independent AI & tech intelligence magazine.
Your writing is clear, insightful, genuinely useful, and engaging. You avoid hype and fluff.
You MUST use web_search to find real, current information before writing.
Today's date is ${today}.
Write for a smart, busy audience who wants signal not noise.`,
      messages: [{
        role: 'user',
        content: `Search the web for the latest news and developments about: "${chosenTopic}"

IMPORTANT: These topics have been covered recently — do NOT repeat them or write something too similar:
${recentTitles || '(none yet)'}

Find a fresh, specific angle that hasn't been covered. Then write a complete magazine article for NodeFeeds.

Return ONLY a JSON object with exactly these fields (no markdown fences, no preamble):
{
  "title": "compelling, specific article title (max 80 chars)",
  "category": "${category}",
  "excerpt": "2 punchy sentences summarising the article (max 160 chars)",
  "content": "full article in markdown (700-1000 words). Use ## for subheadings. Include real product names, real data, real quotes where found. End with a practical takeaway section."
}`
      }]
    });

    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!textContent.trim()) throw new Error('Empty response from Claude');

    const clean = textContent.replace(/```json|```/g, '').trim();
    const article = JSON.parse(clean);

    if (!article.title || !article.content || !article.excerpt) {
      throw new Error('Missing required article fields');
    }

    // Final similarity check on the actual generated title
    if (isTooSimilar(article.title + ' ' + article.excerpt, recentArticles, 0.4)) {
      console.log('[NodeFeeds] Generated article too similar to recent content — aborting.');
      return { success: false, reason: 'too_similar_after_generation' };
    }

    // Fetch image
    console.log(`[NodeFeeds] Fetching image...`);
    const image = await getArticleImage(article.title, article.category, article.excerpt);

    // Build slug
    const baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;

    const saved = db.insertArticle({
      slug,
      title: article.title,
      category: article.category || category,
      excerpt: article.excerpt,
      content: article.content,
      read_time: estimateReadTime(article.content),
      image_url: image?.url || null,
      image_thumb: image?.thumb || null,
      image_alt: image?.alt || article.title,
      image_credit: image?.credit || null,
      image_credit_url: image?.creditUrl || null,
      image_source: image?.source || null,
    });

    if (saved.changes > 0) {
      console.log(`[NodeFeeds] ✓ Article saved: "${article.title}"`);
      const tweetId = await postArticle({ ...article, slug });
      if (tweetId) db.updateTweetId(slug, tweetId);
      return { success: true, title: article.title, slug };
    } else {
      console.log(`[NodeFeeds] Duplicate slug — skipped.`);
      return { success: false, reason: 'duplicate_slug' };
    }

  } catch (err) {
    console.error(`[NodeFeeds] ✗ Generation failed:`, err.message);
    return { success: false, reason: err.message };
  }
}

if (require.main === module) {
  db.init().then(() => generateArticle()).then(r => {
    console.log('Result:', r);
    process.exit(0);
  });
}

module.exports = { generateArticle };
