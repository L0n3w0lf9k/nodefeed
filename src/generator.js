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
  'new productivity apps and tools launched this week',
  'automation tools for small businesses and freelancers',
  'new SaaS software launches and major updates this week',
  'popular app new features and updates this week',
  'how companies are using AI to cut costs and save time',
  'developer tools coding assistants and IDE updates',
  'no code and low code platform news and launches',
  'remote work hybrid work and future of work trends',
  'new consumer gadgets and electronics announced this week',
  'smartphone news iPhone Android releases leaks and reviews',
  'chipmakers semiconductor news Intel AMD Nvidia TSMC',
  'robotics humanoid robots and hardware AI developments',
  'smart home IoT wearables and connected device news',
  'electric vehicles autonomous driving tech news',
  'AR VR mixed reality headset news and launches',
  'laptop desktop and PC hardware news this week',
  'tech company layoffs hiring and restructuring news',
  'big tech earnings reports revenue and financial results',
  'tech startup venture capital funding and IPO news',
  'antitrust regulation and government action on big tech',
  'AI in banking payments and fintech news',
  'tech mergers acquisitions and major deals this week',
  'cloud computing AWS Azure Google Cloud new features',
  'open source software community news and releases',
  'rocket launches space missions and results this week',
  'SpaceX Starship Falcon launch updates and milestones',
  'NASA ESA JAXA space agency mission and discovery news',
  'Starlink satellite internet and commercial space news',
  'Mars Moon and deep space exploration developments',
  'James Webb Hubble telescope new images and discoveries',
  'space tourism and private spaceflight industry news',
  'asteroid comet and planetary science discoveries',
  'major data breaches and cyberattacks reported this week',
  'new cybersecurity tools and threat detection launches',
  'ransomware phishing and malware attack reports this week',
  'government cybersecurity policy and national security tech',
  'AI powered cyberattacks and AI defence tools news',
  'privacy data protection GDPR and surveillance news',
  'zero day exploits software patches and vulnerability news',
  'VPN password manager and personal security tools news',
  'Bitcoin Ethereum crypto market movements and analysis',
  'new cryptocurrency altcoin and token project launches',
  'DeFi decentralised finance protocol news and updates',
  'crypto exchange news Coinbase Binance and regulations',
  'blockchain real world enterprise adoption case studies',
  'crypto regulation SEC government policy and legal news',
  'Web3 dApp decentralised application launches and news',
  'stablecoin CBDC and digital currency policy news',
];

const TRIPLET_TOPICS = [
  'AI 3D Modeling and Rendering',
  'AI Music and Audio Production',
  'AI Video Generation and Editing',
  'AI Programming and Auto-coding agents',
  'Vibe Coding and Natural Language Development',
  'AI-enhanced Productivity and Knowledge Management',
  'AI for Design and Creative Visuals',
  'AI for Content Creation and Storytelling',
  'AI for Personal Finance and Investment Analysis',
  'AI for Health, Wellness, and Longevity',
  'AI for Science and Research',
  'AI for Automation and No-Code Workflows',
  'AI for Cybersecurity and Privacy',
  'AI for Language Learning and Translation',
  'AI for Social Media Management and Growth'
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function estimateReadTime(text) { return Math.max(3, Math.round(text.split(/\s+/).length / 200)); }

function fingerprint(text) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'will', 'would', 'could', 'should', 'may', 'might', 'about', 'how', 'what', 'when', 'where',
    'this', 'that', 'these', 'those', 'its', 'it', 'as', 'up', 'do', 'did', 'new', 'latest']);
  return text.toLowerCase()
    .replaceAll(/[^a-z0-9 ]/g, ' ')
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

function pickUniqueTopic(topics, recentArticles) {
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    for (const topic of shuffled) {
      if (!isTooSimilar(topic, recentArticles)) return topic;
    }
    return null;
}

function getTopicAndCategory(type, recentArticles) {
  let chosenTopic = null;
  let category = pickRandom(CATEGORIES);

  if (type === 'article') {
    chosenTopic = pickUniqueTopic(TOPICS, recentArticles);
    if (!chosenTopic) {
      console.log('[NodeFeeds] All preset topics too similar — generating a novel topic...');
      chosenTopic = 'an emerging or niche AI or tech story that has not been widely covered this month';
    }
  } else if (type === 'news') {
    chosenTopic = 'the 12 most notorious, relevant, and impactful tech/AI news stories from the last 24 hours';
    category = 'AI News';
  } else if (type === 'triplet') {
    chosenTopic = pickUniqueTopic(TRIPLET_TOPICS, recentArticles) || pickRandom(TRIPLET_TOPICS);
    category = 'AI Tools';
  }
  return { chosenTopic, category };
}

function getPrompts(type, chosenTopic, category, recentArticles) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const recentTitles = recentArticles.slice(0, 15).map(a => `- ${a.title}`).join('\n');

  const system = `You are Luís Matos, a sharp, knowledgeable tech journalist from Lisbon, Portugal, writing for NodeFeeds.
Your writing is clear, insightful, genuinely useful, and engaging. You avoid hype and fluff.
You MUST use web_search to find real, current information before writing.
Today's date is ${today}.
Write for a smart, busy audience who wants signal not noise.
CRITICAL: Every factual claim MUST have a source. Use inline citations like [[1]](#ref1).
CRITICAL: Every article MUST end with a "Sources & References" section listing the full URLs.
CRITICAL: Your final response MUST be a single valid JSON (object or array) and nothing else.`;

  let user = '';
  if (type === 'news') {
    user = `Search the web for the 12 most notorious and relevant tech/AI news items right now.
Produce 12 individual, distinct news articles.
For each article:
- Provide a catchy, professional title.
- Provide a concise summary (excerpt).
- In the content: clearly state any contradicting information from different sources if found.
- CRITICAL: Each news item MUST include its own "Sources" section at the end of its content with 1-3 direct URLs used for that specific story.
- Use your professional Lisbon-journalist opinion to add value.

Return ONLY a valid JSON ARRAY of exactly 12 objects:
[
  {
    "title": "Title of article 1",
    "category": "AI News",
    "excerpt": "Short teaser...",
    "content": "Full article in markdown...",
    "tweet_text": "Catchy tweet for this specific story",
    "hashtags": "AINews Tech"
  },
  ...
]`;
  } else if (type === 'triplet') {
    user = `Search the web for new, trending, or widely used AI tools and techniques related to: "${chosenTopic}".
Your goal is to generate a "Triple T" (Tools, Tips & Tricks) article that offers immediate value.

For the chosen topic "${chosenTopic}":
1. Find 3-5 relevant tools (mix of new/emerging and established/popular).
2. For each tool, provide a short analysis of its unique value proposition.
3. Share 2-3 specific "Pro Tips" or "Tricks" for using these tools effectively for specific use cases.
4. Provide 1-2 actionable use cases that a user can try right now.

The article should be insightful and move beyond surface-level descriptions.

Return ONLY valid JSON:
{
  "title": "AI Triple T's: ${chosenTopic} Mastering Tips",
  "category": "AI Tools",
  "excerpt": "Discover new tools and master ${chosenTopic} with these expert tips and tricks.",
  "content": "Full article in markdown with specific tool names, analysis, use cases, and tips...",
  "tweet_text": "Master ${chosenTopic} with today's NodeFeeds Triple T's! #AI #TechTips",
  "hashtags": "AITools TripleT TechTips ${chosenTopic.replaceAll(' ', '')}"
}`;
  } else if (type === 'digest') {
    const newsSummary = chosenTopic; // In this case, chosenTopic is the aggregated news content
    user = `You are preparing the "NodeFeeds 12-Hour Daily News Digest".
Below are the titles and summaries of the 12 most important tech stories from the last 12 hours:
${newsSummary}

Your task:
1. Write a cohesive, high-level narrative article that synthesizes these 12 stories into a "Tech State of the Union".
2. Group related stories together (e.g., all AI model news in one section, all gadget news in another).
3. Provide deep editorial insight into what these combined developments mean for the future.
4. CRITICAL: From the "Sources" section of EACH input story provided above, extract EVERY unique URL.
5. CRITICAL: You MUST include a final section at the very end of your "content" entitled "## Complete Sources & Further Reading".
6. In this section, list all unique URLs in a clean, numbered markdown list. Ensure EVERY study and tool mentioned in the synthesis is backed by a link.

Return ONLY valid JSON:
{
  "title": "Daily Pulse: [Catchy Hook for today's news]",
  "category": "News Digest",
  "excerpt": "The last 12 hours in tech: [Summary of the synthesis]",
  "content": "Full synthesis article in markdown...",
  "tweet_text": "The Daily Pulse is live: [Hook]",
  "hashtags": "TechNews AINews Digest"
}`;
  } else {
    user = `Search the web for the latest news and developments about: "${chosenTopic}"
IMPORTANT: These topics have been covered recently — do NOT repeat them:
${recentTitles || '(none yet)'}

Find a fresh, specific angle. Then write a complete SEO-optimised magazine article for NodeFeeds.
Include real data, quotes, and mandatory inline citations [[1]](#ref1).
You MUST include a "Sources & References" section at the end.

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
  return { system, user };
}

async function fetchAIResponse(system, user) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[NodeFeeds] API attempt ${attempt}/3...`);
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 10000 },
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: system,
        messages: [{ role: 'user', content: user }]
      });

      const textContent = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const jsonMatch = textContent.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      return JSON.parse(jsonMatch[0].trim());
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function processAndSaveArticle(article, index, type, category) {
  const baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
  const slug = `${baseSlug}-${Date.now().toString().slice(-6)}-${index}`;

  // Image handling
  let image = null;
  if (type === 'news') {
    image = { url: '/images/sections/news.png', thumb: '/images/sections/news.png', alt: 'NodeFeeds Daily News' };
  } else if (type === 'triplet') {
    image = { url: '/images/sections/triplet.png', thumb: '/images/sections/triplet.png', alt: 'AI Triple T\'s' };
  } else if (category === 'News Digest') {
    image = { url: '/images/sections/digest.png', thumb: '/images/sections/digest.png', alt: 'NodeFeeds Daily News Digest' };
  } else {
    console.log(`[NodeFeeds] Generating image for ${type} (${index + 1})...`);
    image = await generateAndSaveImage(slug, article.title, article.category);
  }

  // Calculate staggered publish time for news
  let createdAt = null;
  if (type === 'news') {
    const delayMs = index * 3600000; // 1 hour stagger
    const d = new Date(Date.now() + delayMs);
    createdAt = d.toISOString().replace('T', ' ').replace(/\..+/, '');
  }

  const saved = db.insertArticle({
    slug,
    title: article.title,
    category: article.category || category,
    excerpt: article.excerpt,
    content: article.content,
    tweet_text: article.tweet_text,
    hashtags: article.hashtags,
    read_time: estimateReadTime(article.content),
    image_url: image?.url || null,
    image_thumb: image?.thumb || null,
    image_alt: image?.alt || article.title,
    image_credit: image?.credit || null,
    image_credit_url: image?.creditUrl || null,
    image_source: image?.source || null,
    type: type,
    created_at: createdAt
  });

  if (saved.changes > 0) {
    console.log(`[NodeFeeds] ✓ Article saved: "${article.title}" [${type}] (Scheduled: ${createdAt || 'Now'})`);
    if (type !== 'news') {
      const { xId } = await postArticle({ ...article, slug });
      if (xId) db.updateTweetId(slug, xId);
    }
    return { success: true, title: article.title, slug };
  }
  return null;
}

async function generateArticle(type = 'article') {
  const recentArticles = db.getRecentArticles(30);
  const { chosenTopic, category } = getTopicAndCategory(type, recentArticles);
  console.log(`[NodeFeeds] Generating ${type}: "${chosenTopic}" (${category})`);

  const { system, user } = getPrompts(type, chosenTopic, category, recentArticles);

  try {
    const rawResult = await fetchAIResponse(system, user);
    const sourceArticles = Array.isArray(rawResult) ? rawResult : [rawResult];
    const finalResults = [];

    for (let i = 0; i < sourceArticles.length; i++) {
        const result = await processAndSaveArticle(sourceArticles[i], i, type, category);
        if (result) finalResults.push(result);
    }

    // NEW: If news, generate the Digest (13th item)
    if (type === 'news' && sourceArticles.length >= 10) {
      console.log(`[NodeFeeds] Generating 12-hour News Digest...`);
      const newsContext = sourceArticles.map((a, idx) => `${idx + 1}. ${a.title}\n${a.excerpt}\n${a.content}\n`).join('\n---\n');
      
      const digestPrompts = getPrompts('digest', newsContext, 'News Digest', recentArticles);
      const digestResult = await fetchAIResponse(digestPrompts.system, digestPrompts.user);
      
      // Schedule for the 12th hour (11h offset)
      await processAndSaveArticle(digestResult, 11, 'article', 'News Digest');
      finalResults.push({ success: true, title: digestResult.title, slug: 'digest' });
    }

    return finalResults.length > 0
      ? { success: true, count: finalResults.length }
      : { success: false, reason: 'no_articles_saved' };
  } catch (err) {
    console.error(`[NodeFeeds] ✗ Generation failed:`, err.message);
    return { success: false, reason: err.message };
  }
}

if (require.main === module) {
  (async () => {
    await db.init();
    const r = await generateArticle();
    console.log('Result:', r);
    process.exit(0);
  })();
}

module.exports = { generateArticle };
