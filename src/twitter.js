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
// Auto-discovers your Person URN from the access token — no manual URN needed
// Required env var: LINKEDIN_ACCESS_TOKEN only

let cachedLinkedInUrn = null;

async function getLinkedInUrn(token) {
  // Return cached URN if we already have it
  if (cachedLinkedInUrn) return cachedLinkedInUrn;

  // Try LINKEDIN_AUTHOR_URN env var first (manual override)
  if (process.env.LINKEDIN_AUTHOR_URN) {
    cachedLinkedInUrn = process.env.LINKEDIN_AUTHOR_URN;
    console.log(`[LinkedIn] Using URN from env: ${cachedLinkedInUrn}`);
    return cachedLinkedInUrn;
  }

  // Auto-discover from token — try multiple endpoints
  const endpoints = [
    { url: 'https://api.linkedin.com/v2/userinfo', idField: 'sub', prefix: 'urn:li:person:' },
    { url: 'https://api.linkedin.com/v2/me', idField: 'id', prefix: 'urn:li:person:' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
        },
        timeout: 10000,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const id = data[ep.idField];
      if (id) {
        cachedLinkedInUrn = `${ep.prefix}${id}`;
        console.log(`[LinkedIn] ✓ Auto-discovered URN: ${cachedLinkedInUrn}`);
        return cachedLinkedInUrn;
      }
    } catch (e) {
      console.log(`[LinkedIn] URN discovery failed for ${ep.url}: ${e.message}`);
    }
  }

  // Last resort — try getting it from a token introspection
  try {
    const res = await fetch('https://api.linkedin.com/v2/introspectToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
      timeout: 10000,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.auth_type && data.authorized_at) {
        // Token introspection doesn't return member ID directly
        // but confirms token is valid
        console.log('[LinkedIn] Token is valid but could not auto-discover URN');
      }
    }
  } catch (e) {}

  console.error('[LinkedIn] ✗ Could not auto-discover Person URN. Set LINKEDIN_AUTHOR_URN manually in Railway Variables.');
  return null;
}

async function postToLinkedIn(article) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    console.log('[LinkedIn] No access token — skipping.');
    return null;
  }

  const author = await getLinkedInUrn(token);
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
