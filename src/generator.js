require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const slugify = require('slugify');
const db = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  'AI Tools',
  'Productivity',
  'Gadgets',
  'Automation',
  'AI News',
  'Future of Work',
  'Developer Tools',
  'Tech Reviews'
];

const TOPICS = [
  'latest AI model releases and benchmarks',
  'new productivity tools and apps',
  'automation tools for small businesses',
  'AI assistants and chatbot updates',
  'new gadgets and consumer tech',
  'developer tools and coding AI',
  'AI in everyday workflows',
  'tech industry news this week',
  'open source AI projects',
  'AI for content creators',
  'machine learning breakthroughs',
  'new SaaS tools for productivity',
  'robotics and hardware AI',
  'AI safety and ethics news',
  'tech startup funding and launches'
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function estimateReadTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(3, Math.round(words / 200));
}

async function generateArticle() {
  const topic = pickRandom(TOPICS);
  const category = pickRandom(CATEGORIES);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  console.log(`[NodeFeed] Generating article on: "${topic}" (${category})`);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a sharp, knowledgeable tech journalist writing for NodeFeed — an independent AI & tech intelligence magazine. 
Your writing is clear, insightful, and genuinely useful. You avoid hype and fluff.
You MUST use the web_search tool to find real, current information before writing.
Today's date is ${today}.`,
      messages: [{
        role: 'user',
        content: `Search the web for the latest news and developments about: "${topic}"

Then write a complete, well-researched magazine article for NodeFeed about what you find.

Return your response as a JSON object with exactly these fields:
{
  "title": "compelling article title (max 80 chars)",
  "category": "${category}",
  "excerpt": "2-sentence summary for the article card (max 160 chars)",
  "content": "full article in markdown format (600-900 words, with ## subheadings, based on real current information you found)"
}

Return ONLY the JSON object, no markdown fences, no preamble.`
      }]
    });

    // Extract text from response (may include tool use blocks)
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    if (!textContent.trim()) {
      throw new Error('No text content in response');
    }

    // Clean and parse JSON
    const clean = textContent.replace(/```json|```/g, '').trim();
    const article = JSON.parse(clean);

    // Validate fields
    if (!article.title || !article.content || !article.excerpt) {
      throw new Error('Missing required article fields');
    }

    // Generate unique slug
    let baseSlug = slugify(article.title, { lower: true, strict: true }).slice(0, 60);
    const timestamp = Date.now().toString().slice(-6);
    const slug = `${baseSlug}-${timestamp}`;

    const saved = db.insertArticle({
      slug,
      title: article.title,
      category: article.category || category,
      excerpt: article.excerpt,
      content: article.content,
      read_time: estimateReadTime(article.content)
    });

    if (saved.changes > 0) {
      console.log(`[NodeFeed] ✓ Article saved: "${article.title}"`);
      return { success: true, title: article.title, slug };
    } else {
      console.log(`[NodeFeed] Article already exists, skipping.`);
      return { success: false, reason: 'duplicate' };
    }

  } catch (err) {
    console.error(`[NodeFeed] ✗ Generation failed:`, err.message);
    return { success: false, reason: err.message };
  }
}

// Run directly: node src/generator.js
if (require.main === module) {
  generateArticle().then(result => {
    console.log('Result:', result);
    process.exit(0);
  });
}

module.exports = { generateArticle };
