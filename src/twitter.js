require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fetch = require('node-fetch');

const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';

// ── X (TWITTER) ───────────────────────────────────────────────────────────────

function getXClient() {
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
  const urlLen = 24;
  const maxTitle = 280 - hashtagLen - urlLen - 2;
  let title = article.title;
  if (title.length > maxTitle) title = title.slice(0, maxTitle - 3) + '...';
  return `${title}\n\n${url}\n\n${tags}`;
}

async function postToX(article) {
  const client = getXClient();
  if (!client) return null;
  try {
    const tweet = buildTweet(article);
    console.log(`[X] Posting tweet (${tweet.length} chars)...`);
    const result = await client.v2.tweet({ text: tweet });
    console.log(`[X] ✓ Posted: https://x.com/nodefeeds/status/${result.data.id}`);
    return result.data.id;
  } catch (e) {
    console.error('[X] Failed to tweet:', e.message);
    if (e.data) console.error('[X] API response:', JSON.stringify(e.data));
    if (e.code === 403) {
      console.error('[X] 403 = App needs Read+Write permission. Regenerate Access Token after enabling Write access.');
    }
    return null;
  }
}

// ── LINKEDIN ──────────────────────────────────────────────────────────────────
// Uses your Person URN from environment variable LINKEDIN_AUTHOR_URN
// Required env vars: LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN

async function getLinkedInUrn() {
  const urn = process.env.LINKEDIN_AUTHOR_URN;
  if (!urn) {
    console.error('[LinkedIn] ✗ LINKEDIN_AUTHOR_URN is missing. Set it in your environment variables.');
    return null;
  }
  return urn;
}

async function postToLinkedIn(article) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    console.log('[LinkedIn] No access token — skipping.');
    return null;
  }

  const author = await getLinkedInUrn();
  if (!author) return null;

  const url = `${SITE_URL}/article/${article.slug}`;
  const tags = (HASHTAG_MAP[article.category] || ['#AI', '#Tech']).join(' ');
  const postText = `${article.title}\n\n${article.excerpt}\n\nRead more: ${url}\n\n${tags}`;

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: postText },
        shareMediaCategory: 'ARTICLE',
        media: [{
          status: 'READY',
          description: { text: article.excerpt.slice(0, 200) },
          originalUrl: url,
          title: { text: article.title.slice(0, 200) },
        }]
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };

  try {
    console.log(`[LinkedIn] Posting as ${author}...`);
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
      timeout: 15000,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const postId = data.id || 'unknown';
    console.log(`[LinkedIn] ✓ Posted: ${postId}`);
    return postId;
  } catch (e) {
    console.error('[LinkedIn] Failed to post:', e.message);
    return null;
  }
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
async function postArticle(article) {
  const [xId, liId] = await Promise.all([
    postToX(article),
    postToLinkedIn(article),
  ]);
  return { xId, liId };
}

module.exports = { postArticle };
