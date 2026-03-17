require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';

function getClient() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    console.log('[X] Missing credentials — skipping.');
    return null;
  }
  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  });
}

const HASHTAG_MAP = {
  'AI Tools':        ['#AITools', '#AI', '#Tech'],
  'Productivity':    ['#Productivity', '#AI', '#WorkSmarter'],
  'Gadgets':         ['#Gadgets', '#Tech', '#Consumer'],
  'Automation':      ['#Automation', '#NoCode', '#AI'],
  'AI News':         ['#AINews', '#AI', '#TechNews'],
  'Future of Work':  ['#FutureOfWork', '#AI', '#Tech'],
  'Developer Tools': ['#DevTools', '#Coding', '#AI'],
  'Tech Reviews':    ['#TechReview', '#Tech', '#Gadgets'],
  'Space Tech':      ['#SpaceTech', '#Space', '#Science'],
  'Cybersecurity':   ['#Cybersecurity', '#InfoSec', '#Tech'],
  'Crypto & Web3':   ['#Crypto', '#Web3', '#Bitcoin'],
};

function buildTweet(article) {
  const tags = (HASHTAG_MAP[article.category] || ['#AI', '#Tech']).join(' ');
  const url = `${SITE_URL}/article/${article.slug}`;
  const hashtagLen = tags.length + 1;
  const urlLen = 24; // Twitter counts all URLs as 23 chars + space
  const maxTitle = 280 - hashtagLen - urlLen - 2; // 2 newlines
  let title = article.title;
  if (title.length > maxTitle) title = title.slice(0, maxTitle - 3) + '...';
  return `${title}\n\n${url}\n\n${tags}`;
}

async function postArticle(article) {
  const client = getClient();
  if (!client) return null;

  try {
    const tweet = buildTweet(article);
    console.log(`[X] Posting tweet (${tweet.length} chars)...`);
    // Use v2 tweet endpoint
    const result = await client.v2.tweet({ text: tweet });
    console.log(`[X] ✓ Posted: https://x.com/nodefeeds/status/${result.data.id}`);
    return result.data.id;
  } catch (e) {
    // Detailed error logging to help diagnose
    console.error('[X] Failed to tweet.');
    console.error('[X] Code:', e.code);
    console.error('[X] Message:', e.message);
    if (e.data) console.error('[X] API response:', JSON.stringify(e.data));
    if (e.code === 403) {
      console.error('[X] 403 = App does not have Write permission, or Access Token was generated before enabling Write access. Regenerate your Access Token & Secret in the X Developer Portal after setting Read+Write permissions.');
    }
    return null;
  }
}

module.exports = { postArticle };
