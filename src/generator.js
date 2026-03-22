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

async function generateArticle() {
  const recentArticles = db.getRecentArticles(30);
  console.log(`[NodeFeeds] Loaded ${recentArticles.length} recent articles for duplicate check.`);

  const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5);
  let chosenTopic = null;

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

  const category = pickRandom(CATEGORIES);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const recentTitles = recentArticles.slice(0, 15).map(a => `- ${a.title}`).join('\n');

  console.log(`[NodeFeeds] Generating: "${chosenTopic}" (${category})`);

  try {
    let article = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[NodeFeeds] API attempt ${attempt}/3...`);

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
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
Write for a smart, busy audience who wants signal not noise.
CRITICAL: Your final response MUST be a single valid JSON object and nothing else. No prose, no explanation, no markdown fences — just the raw JSON object.`,
          messages: [{
            role: 'user',
            content: `Search the web for the latest news and developments about: "${chosenTopic}"

IMPORTANT: These topics have been covered recently — do NOT repeat them or write something too similar:
${recentTitles || '(none yet)'}

Find a fresh, specific angle that hasn't been covered. Then write a complete SEO-optimised magazine article for NodeFeeds.

These are recent articles already on the site — where naturally relevant, you may reference them with markdown links like [article title](/article/slug):
${recentArticles.slice(0, 8).map(a => `- [${a.title}](/article/${a.slug})`).join('\n') || '(none yet)'}

Return ONLY a valid JSON object — no text before or after it:
{
  "title": "SEO-optimised title: specific, keyword-rich, compelling, under 60 chars, no clickbait",
  "category": "${category}",
  "excerpt": "Meta description style: 1-2 sentences, includes primary keyword, under 155 chars, tells reader exactly what they'll learn",
  "tweet_text": "A high-engagement X (Twitter) hook or thought-provoking question. Do NOT include hashtags or URL. Keep it very short (under 100 chars).",
  "hashtags": "3-5 relevant hashtags separated by spaces.",
  "content": "Full article in markdown, 900-1200 words structured as follows:\n\n## [Keyword-rich intro heading]\nHook paragraph: start with a surprising fact, stat, or question. State clearly what the article covers and why it matters NOW.\n\n## [Section 2 heading with keyword]\nDetailed section with real data, product names, version numbers, prices where relevant. Cite sources inline like this: [[1]](#ref1)\n\n## [Section 3 heading]\nDetailed section. Include a real quote from a founder, researcher or industry figure if found, with attribution and source citation.\n\n## [Section 4 heading]\nDetailed section. Use bullet points or numbered lists where it aids readability.\n\n## Key Takeaways\n3-5 bullet points summarising the most actionable insights for the reader.\n\n## References\n1. <a id='ref1'></a>[Source title](https://actual-url.com) — Publisher, Date\n2. <a id='ref2'></a>[Source title](https://actual-url.com) — Publisher, Date\n(Include every source used. Only include URLs you actually found during your web search. Never invent URLs.)\n\nWriting rules:\n- Short paragraphs (2-4 sentences max)\n- Use **bold** for key terms on first use\n- Include specific numbers, percentages, dates — always cite the source\n- Write at 8th grade reading level\n- Active voice throughout\n- No filler phrases like 'In conclusion' or 'It is worth noting'\n- Each section must add new information, not repeat previous sections\n- Every factual claim, statistic, or quote MUST have an inline citation\n- References section must only contain URLs you actually visited during research"
}`
          }]
        });

        // Filter out thinking blocks — only process text blocks
        const textContent = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');

        if (!textContent.trim()) throw new Error('Empty text response');

        // Extract JSON object even if there is surrounding text
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response: ' + textContent.slice(0, 100));

        const parsed = JSON.parse(jsonMatch[0].trim());

        if (!parsed.title || !parsed.content || !parsed.excerpt) {
          throw new Error('Missing required fields in JSON');
        }

        article = parsed;
        console.log(`[NodeFeeds] ✓ Valid JSON received on attempt ${attempt}`);
        break;

      } catch (parseErr) {
        console.error(`[NodeFeeds] Attempt ${attempt}/3 failed:`, parseErr.message);
        if (attempt === 3) throw new Error('All 3 attempts failed: ' + parseErr.message);
        console.log(`[NodeFeeds] Waiting 3s before retry...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (isTooSimilar(article.title + ' ' + article.excerpt, recentArticles, 0.4)) {
      console.log('[NodeFeeds] Generated article too similar to recent content — aborting.');
      return { success: false, reason: 'too_similar_after_generation' };
    }

    const baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
    const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;

    console.log(`[NodeFeeds] Generating image...`);
    const image = await generateAndSaveImage(slug, article.title, article.category);

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
      const { xId } = await postArticle({ ...article, slug });
      if (xId) db.updateTweetId(slug, xId);
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
