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
  // Breaking AI News
  'latest AI model releases and benchmark results this week',
  'AI company announcements and product launches this week',
  'AI assistants chatbot updates and head to head comparisons',
  'open source AI projects released or updated this week',
  'machine learning research papers explained simply',
  'AI video image and audio generation tools news',
  'voice AI speech technology and text to speech updates',
  'AI agents autonomous systems and agentic AI news',
  'AI safety ethics regulation and policy news',
  'AI in healthcare drug discovery and biotech breakthroughs',
  'AI for content creators writers and marketers',
  'big tech AI strategy news Google Microsoft Apple Meta',
  'AI startup funding rounds and acquisitions this week',
  'controversies and criticism around AI companies this week',
  'AI replacing jobs workforce automation impact news',
  'AI in science research and academic breakthroughs',
  'AI copyright law and intellectual property lawsuits news',

  // Productivity & Tools
  'new productivity apps and tools launched this week',
  'automation tools for small businesses and freelancers',
  'new SaaS software launches and major updates this week',
  'popular app new features and updates this week',
  'how companies are using AI to cut costs and save time',
  'developer tools coding assistants and IDE updates',
  'no code and low code platform news and launches',
  'remote work hybrid work and future of work trends',

  // Hardware & Gadgets
  'new consumer gadgets and electronics announced this week',
  'smartphone news iPhone Android releases leaks and reviews',
  'chipmakers semiconductor news Intel AMD Nvidia TSMC',
  'robotics humanoid robots and hardware AI developments',
  'smart home IoT wearables and connected device news',
  'electric vehicles autonomous driving tech news',
  'AR VR mixed reality headset news and launches',
  'laptop desktop and PC hardware news this week',

  // Industry & Business
  'tech company layoffs hiring and restructuring news',
  'big tech earnings reports revenue and financial results',
  'tech startup venture capital funding and IPO news',
  'antitrust regulation and government action on big tech',
  'AI in banking payments and fintech news',
  'tech mergers acquisitions and major deals this week',
  'cloud computing AWS Azure Google Cloud new features',
  'open source software community news and releases',

  // Space Tech
  'rocket launches space missions and results this week',
  'SpaceX Starship Falcon launch updates and milestones',
  'NASA ESA JAXA space agency mission and discovery news',
  'Starlink satellite internet and commercial space news',
  'Mars Moon and deep space exploration developments',
  'James Webb Hubble telescope new images and discoveries',
  'space tourism and private spaceflight industry news',
  'asteroid comet and planetary science discoveries',

  // Cybersecurity
  'major data breaches and cyberattacks reported this week',
  'new cybersecurity tools and threat detection launches',
  'ransomware phishing and malware attack reports this week',
  'government cybersecurity policy and national security tech',
  'AI powered cyberattacks and AI defence tools news',
  'privacy data protection GDPR and surveillance news',
  'zero day exploits software patches and vulnerability news',
  'VPN password manager and personal security tools news',

  // Crypto & Web3
  'Bitcoin Ethereum crypto market movements and analysis',
  'new cryptocurrency altcoin and token project launches',
  'DeFi decentralised finance protocol news and updates',
  'crypto exchange news Coinbase Binance and regulations',
  'blockchain real world enterprise adoption case studies',
  'crypto regulation SEC government policy and legal news',
  'Web3 dApp decentralised application launches and news',
  'stablecoin CBDC and digital currency policy news',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function estimateReadTime(text) { return Math.max(3, Math.round(text.split(/\s+/).length / 200)); }

function fingerprint(text) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'will', 'would', 'could', 'should', 'may', 'might', 'about', 'how', 'what', 'when', 'where',
    'this', 'that', 'these', 'those', 'its', 'it', 'as', 'up', 'do', 'did', 'new', 'latest']);
  return text.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 20)
    .sort()
    .join(' ');
}

function similarity(a, b) {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return intersection / Math.min(setA.size, setB.size);
}

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

async function generateArticle(type = 'article') {
  const recentArticles = db.getRecentArticles(30);
  console.log(`[NodeFeeds] [${type}] Loaded ${recentArticles.length} recent articles for duplicate check.`);

  let chosenTopic = null;
  let category = pickRandom(CATEGORIES);

  if (type === 'article') {
    const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5);
    for (const topic of shuffledTopics) {
      if (!isTooSimilar(topic, recentArticles)) {
        chosenTopic = topic;
        break;
      }
    }
    if (!chosenTopic) {
      console.log('[NodeFeeds] All preset topics too similar — generating a novel topic...');
      chosenTopic = 'an emerging or niche AI or tech story that has not been widely covered this month';
    }
  } else if (type === 'news') {
    chosenTopic = 'the 12 most notorious, relevant, and impactful tech/AI news stories from the last 24 hours';
    category = 'AI News';
  } else if (type === 'triplet') {
    chosenTopic = 'highly useful AI tools, tips, and tricks for productivity, creativity, or development';
    category = 'AI Tools';
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const recentTitles = recentArticles.slice(0, 15).map(a => `- ${a.title}`).join('\n');

  console.log(`[NodeFeeds] Generating ${type}: "${chosenTopic}" (${category})`);

  let systemPrompt = `You are Luís Matos, a sharp, knowledgeable tech journalist from Lisbon, Portugal, writing for NodeFeeds.
Your writing is clear, insightful, genuinely useful, and engaging. You avoid hype and fluff.
You MUST use web_search to find real, current information before writing.
Today's date is ${today}.
Write for a smart, busy audience who wants signal not noise.
CRITICAL: Your final response MUST be a single valid JSON object and nothing else.`;

  let userPrompt = '';

  if (type === 'news') {
    userPrompt = `Search the web for the 12 most notorious and relevant tech/AI news items right now.
Produce a single comprehensive news digest article.
For each of the 12 items:
- Provide a concise summary.
- CLEARLY state any contradicting information from different sources if found.
- Display the sources clearly.
- Give your professional opinion on the effects or possible effects of this subject.

Structure carefully with headings for each news item.
Return ONLY valid JSON:
{
  "title": "Daily Tech Digest: 12 Essential Stories [Date]",
  "category": "AI News",
  "excerpt": "A deep dive into today's 12 most important tech and AI developments, with analysis and source verification.",
  "content": "Full article in markdown...",
  "tweet_text": "Today's top 12 tech stories analyzed. [Summary hook]",
  "hashtags": "TechNews AINews Digest"
}`;
  } else if (type === 'triplet') {
    userPrompt = `Search for the most widely used or trending AI tools and generate a "Triple T" (Tools, Tips & Tricks) article.
Focus on how to use them better or for specific uses (e.g., "10 best use cases for X", "5 best tools to generate Y").
Provide actionable, high-value advice that users can apply immediately.

Return ONLY valid JSON:
{
  "title": "AI Triple T's: [Specific Tool/Topic] Tips & Tricks",
  "category": "AI Tools",
  "excerpt": "Maximize your AI output with these expert tips and tricks for [Topic].",
  "content": "Full article in markdown...",
  "tweet_text": "Master AI with today's Triple T's: [Hook]",
  "hashtags": "AITools Productivity Tips"
}`;
  } else {
    // Regular article logic
    userPrompt = `Search the web for the latest news and developments about: "${chosenTopic}"
IMPORTANT: These topics have been covered recently — do NOT repeat them:
${recentTitles || '(none yet)'}

Find a fresh, specific angle. Then write a complete SEO-optimised magazine article for NodeFeeds.
Include real data, quotes, and inline citations [[1]](#ref1).

Return ONLY valid JSON:
{
  "title": "...",
  "category": "${category}",
  "excerpt": "...",
  "content": "...",
  "tweet_text": "...",
  "hashtags": "..."
}`;
  }

  try {
    let article = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[NodeFeeds] API attempt ${attempt}/3...`);
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 16000,
          thinking: { type: 'enabled', budget_tokens: 10000 },
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });

        const textContent = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        article = JSON.parse(jsonMatch[0].trim());
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;

    // Image handling: Use static thumbnails for News and Triplet, generate for regular articles
    let image = null;
    if (type === 'news') {
      image = { url: '/images/sections/news.png', thumb: '/images/sections/news.png', alt: 'NodeFeeds Daily News Digest' };
    } else if (type === 'triplet') {
      image = { url: '/images/sections/triplet.png', thumb: '/images/sections/triplet.png', alt: 'AI Triple T\'s: Tools, Tips & Tricks' };
    } else {
      console.log(`[NodeFeeds] Generating image for ${type}...`);
      image = await generateAndSaveImage(slug, article.title, article.category);
    }

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
      type: type // Save the type to the DB
    });

    if (saved.changes > 0) {
      console.log(`[NodeFeeds] ✓ Article saved: "${article.title}" [${type}]`);
      const { xId } = await postArticle({ ...article, slug });
      if (xId) db.updateTweetId(slug, xId);
      return { success: true, title: article.title, slug };
    }
    return { success: false, reason: 'duplicate_slug' };
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
