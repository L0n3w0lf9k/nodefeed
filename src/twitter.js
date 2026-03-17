require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';

function getClient() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
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
  'AI Tools':        ['#AITools', '#ArtificialIntelligence', '#AI'],
  'Productivity':    ['#Productivity', '#WorkSmarter', '#AI'],
  'Gadgets':         ['#Tech', '#Gadgets', '#NewTech'],
  'Automation':      ['#Automation', '#NoCode', '#AI'],
  'AI News':         ['#AINews', '#ArtificialIntelligence', '#TechNews'],
  'Future of Work':  ['#FutureOfWork', '#AI', '#WorkTech'],
  'Developer Tools': ['#DevTools', '#Coding', '#AI'],
  'Tech Reviews':    ['#TechReview', '#Tech', '#Gadgets'],
};

function buildTweet(article) {
  const tags = (HASHTAG_MAP[article.category] || ['#AI', '#Tech']).join(' ');
  const url = `${SITE_URL}/article/${article.slug}`;
  // Twitter counts URLs as 23 chars
  const maxText = 280 - 23 - 1 - tags.length - 1;
  let title = article.title;
  if (title.length > maxText) title = title.slice(0, maxText - 3) + '...';
  return `${title}\n\n${url}\n\n${tags}`;
}

async function postArticle(article) {
  const client = getClient();
  if (!client) {
    console.log('[X] No credentials configured — skipping tweet.');
    return null;
  }
  try {
    const tweet = buildTweet(article);
    const rwClient = client.readWrite;
    const result = await rwClient.v2.tweet(tweet);
    console.log(`[X] ✓ Tweeted: ${result.data.id}`);
    return result.data.id;
  } catch (e) {
    console.error('[X] Failed to tweet:', e.message);
    return null;
  }
}

module.exports = { postArticle };
