require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const slugify = require('slugify');
const db = require('./db');
const { generateAndSaveImage } = require('./images');
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
	  max_tokens: 16000,
	  thinking: {
		type: 'enabled',
		budget_tokens: 10000
	  },
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

Find a fresh, specific angle that hasn't been covered. Then write a complete SEO-optimised magazine article for NodeFeeds.

These are recent articles already on the site — where naturally relevant, you may reference them with markdown links like [article title](/article/slug):
${recentArticles.slice(0,8).map(a => `- [${a.title}](/article/${a.slug})`).join('\n') || '(none yet)'}

Return ONLY a JSON object with exactly these fields (no markdown fences, no preamble):
{
  "title": "SEO-optimised title: specific, keyword-rich, compelling, under 60 chars, no clickbait",
  "category": "${category}",
  "excerpt": "Meta description style: 1-2 sentences, includes primary keyword, under 155 chars, tells reader exactly what they'll learn",
  "content": "Full article in markdown, 900-1200 words structured as follows:\n\n## [Keyword-rich intro heading]\nHook paragraph: start with a surprising fact, stat, or question. State clearly what the article covers and why it matters NOW.\n\n## [Section 2 heading with keyword]\nDetailed section with real data, product names, version numbers, prices where relevant. Cite sources inline like this: [[1]](#ref1)\n\n## [Section 3 heading]\nDetailed section. Include a real quote from a founder, researcher or industry figure if found, with attribution and source citation.\n\n## [Section 4 heading]\nDetailed section. Use bullet points or numbered lists where it aids readability.\n\n## Key Takeaways\n3-5 bullet points summarising the most actionable insights for the reader.\n\n## References\n1. <a id=\'ref1\'></a>[Source title](https://actual-url.com) — Publisher, Date\n2. <a id=\'ref2\'></a>[Source title](https://actual-url.com) — Publisher, Date\n(Include every source used. Only include URLs you actually found during your web search. Never invent URLs.)\n\nWriting rules:\n- Short paragraphs (2-4 sentences max)\n- Use **bold** for key terms on first use\n- Include specific numbers, percentages, dates — always cite the source\n- Write at 8th grade reading level\n- Active voice throughout\n- No filler phrases like \'In conclusion\' or \'It is worth noting\'\n- Each section must add new information, not repeat previous sections\n- Every factual claim, statistic, or quote MUST have an inline citation\n- References section must only contain URLs you actually visited during research"
}`
      }]
    });

	const textContent = response.content
	  .filter(b => b.type === 'text')
	  .map(b => b.text)
	  .join('');

	if (!textContent.trim()) throw new Error('Empty response from Claude');

	const jsonMatch = textContent.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error('No JSON found: ' + textContent.slice(0, 100));

	const article = JSON.parse(jsonMatch[0].trim());

    if (!article.title || !article.content || !article.excerpt) {
      throw new Error('Missing required article fields');
    }

    // Final similarity check on the actual generated title
    if (isTooSimilar(article.title + ' ' + article.excerpt, recentArticles, 0.4)) {
      console.log('[NodeFeeds] Generated article too similar to recent content — aborting.');
      return { success: false, reason: 'too_similar_after_generation' };
    }

    // Build slug first so we can use it as image filename
    const baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;

    // Generate and save image to Volume
    console.log(`[NodeFeeds] Generating image...`);
    const image = await generateAndSaveImage(slug, article.title, article.category, article.excerpt);

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

