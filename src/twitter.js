require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fetch = require('node-fetch');

const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';
const MAX_TWEET_LENGTH = 280; // Standard Twitter limit
const URL_LENGTH_BUFFER = 25; // User requested 25 chars for link

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
  const url = `${SITE_URL}/article/${article.slug}`;
  let hashtags = article?.hashtags || '';
  let text = article.tweet_text || article.tweet || '';

  // If we have legacy 'tweet' field that contains hashtags, try to separate them
  if (!article.tweet_text && article.tweet && article.tweet.includes('#')) {
    const parts = article.tweet.split('#');
    text = parts[0].trim();
    hashtags = '#' + parts.slice(1).join('#').trim();
  }

  // Fallback if no text but we have title
  if (!text && article.title) {
    text = article.title;
  }

  // If no hashtags provided in article object, use category defaults
  if (!hashtags) {
    hashtags = (HASHTAG_MAP[article.category] || ['#AI', '#Tech']).join(' ');
  }

  let tweetContent = `${text}\n\n${url}\n\n${hashtags}`;

  // User requested 280 total, with link taking 25. 
  // Custom logic: maxHookLength = 280 - 25 - length of hashtags - overhead (newlines)
  if (tweetContent.length > MAX_TWEET_LENGTH) {
    console.log(`[X] Tweet exceeds ${MAX_TWEET_LENGTH} chars (${tweetContent.length}). Truncating hook...`);
    
    // Overhead: 4 newlines + URL buffer (25) + hashtags
    const overhead = 4 + URL_LENGTH_BUFFER + hashtags.length; 
    const maxText = MAX_TWEET_LENGTH - overhead;
    
    if (maxText > 10) {
      tweetContent = `${text.slice(0, maxText - 3)}...\n\n${url}\n\n${hashtags}`;
    } else {
      // If hashtags are too long, we must truncate them too
      const minimalOverhead = 4 + URL_LENGTH_BUFFER;
      const remaining = MAX_TWEET_LENGTH - minimalOverhead;
      const textLimit = Math.max(20, Math.floor(remaining * 0.6));
      const truncatedText = text.slice(0, textLimit - 3) + '...';
      const tagLimit = MAX_TWEET_LENGTH - minimalOverhead - truncatedText.length;
      const truncatedTags = hashtags.slice(0, Math.max(0, tagLimit)).trim();
      tweetContent = `${truncatedText}\n\n${url}${truncatedTags ? '\n\n' + truncatedTags : ''}`;
    }
  }

  return tweetContent;
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
  let urn = (process.env.LINKEDIN_AUTHOR_URN || '').trim();
  if (!urn) return null;

  // Strip leading/trailing quotes (helps with copy-paste from some UIs)
  urn = urn.replace(/^["']|["']$/g, '');

  if (!urn.startsWith('urn:li:')) {
    if (/^\d+$/.test(urn)) {
      urn = `urn:li:organization:${urn}`;
    } else {
      urn = `urn:li:person:${urn}`;
    }
  }

  // UGC API (v2) requires 'organization', 'company' often fails with 403 Data Processing Exception
  if (urn.startsWith('urn:li:company:')) {
    urn = urn.replace('urn:li:company:', 'urn:li:organization:');
  }

  // Normalise member -> person (UGC API preference)
  if (urn.startsWith('urn:li:member:')) {
    urn = urn.replace('urn:li:member:', 'urn:li:person:');
  }

  return urn;
}

async function postToLinkedIn(article) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return null;

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
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    return null;
  }
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
async function postArticle(article) {
  // LinkedIn is currently disabled per user request. 
  // To re-enable, add postToLinkedIn(article) to the Promise.all array below.
  const [xId] = await Promise.all([
    postToX(article),
    // postToLinkedIn(article),
  ]);
  return { xId };
}

module.exports = { postArticle, getLinkedInUrn, buildTweet };
