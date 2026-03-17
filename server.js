require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const { marked } = require('marked');
const RSS = require('rss');
const db = require('./src/db');
const { generateArticle } = require('./src/generator');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_NAME = 'NodeFeeds';
const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';
const ADSENSE_ID = process.env.ADSENSE_PUBLISHER_ID || '';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// ── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeAgo(d) {
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function adsenseHead() {
  if (!ADSENSE_ID) return '';
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}" crossorigin="anonymous"></script>`;
}

function adUnit() {
  if (!ADSENSE_ID) return '';
  return `<div class="ad-unit"><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_ID}" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function catColor(cat) {
  const m = {
    'AI Tools':'#00c882','Productivity':'#5b8af5','Gadgets':'#f5a623',
    'Automation':'#c882f5','AI News':'#00e0a0','Future of Work':'#5bf5c0',
    'Developer Tools':'#f55b5b','Tech Reviews':'#f5e05b',
    'Space Tech':'#a78bfa','Cybersecurity':'#fb7185','Crypto & Web3':'#fbbf24'
  };
  return m[cat] || '#00c882';
}

function thumbHtml(article, cls = 'card-thumb') {
  if (article.image_url) {
    return `<div class="${cls}"><img src="${article.image_url}" alt="${article.image_alt || article.title}" loading="lazy"/></div>`;
  }
  return `<div class="${cls}"><div class="thumb-placeholder"></div></div>`;
}

function sitemap(articles) {
  const urls = articles.map(a => `
  <url>
    <loc>${SITE_URL}/article/${a.slug}</loc>
    <lastmod>${new Date(a.created_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  ${urls}
</urlset>`;
}

// ── LAYOUT ───────────────────────────────────────────────────────────────────

function layout(title, body, meta = {}) {
  const desc = meta.description || 'AI & Tech Intelligence, Delivered Fresh — updated every 6 hours by Claude AI';
  const img = meta.image || '';
  const cats = db.getCategories();
  const popular = db.getMostViewed(4);
  const latest = db.getArticles(3);

  const navCats = cats.slice(0, 6).map(c =>
    `<a href="/category/${encodeURIComponent(c.category)}">${c.category}</a>`
  ).join('');

  const popularHtml = popular.map(a => `
    <a href="/article/${a.slug}" class="pop-item">
      ${thumbHtml(a, 'pop-thumb')}
      <div class="pop-body">
        <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
        <h4>${a.title}</h4>
        <span class="meta-sm">${timeAgo(a.created_at)}</span>
      </div>
    </a>`).join('');

  const latestSideHtml = latest.map(a => `
    <a href="/article/${a.slug}" class="latest-side-item">
      <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
      <h4>${a.title}</h4>
      <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title} — ${SITE_NAME}</title>
<meta name="description" content="${desc}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:site" content="@nodefeeds"/>
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="/feed.xml"/>
<link rel="sitemap" type="application/xml" href="/sitemap.xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
${adsenseHead()}
<link rel="stylesheet" href="/css/style.css"/>
</head>
<body>
<div class="topbar">
  <span>${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
  <span class="topbar-right">Updated every 6 hours · Powered by Claude AI</span>
</div>
<header>
  <div class="header-inner">
    <a href="/" class="brand">
      <svg width="32" height="32" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="24" stroke="#1a1a2a" stroke-width="1.5"/>
        <circle cx="26" cy="8" r="3.5" fill="#00c882"/>
        <circle cx="44" cy="18" r="3.5" fill="#00c882" opacity=".7"/>
        <circle cx="44" cy="34" r="3.5" fill="#00c882" opacity=".4"/>
        <circle cx="26" cy="44" r="3.5" fill="#00c882" opacity=".3"/>
        <circle cx="8" cy="34" r="3.5" fill="#00c882" opacity=".4"/>
        <circle cx="8" cy="18" r="3.5" fill="#00c882" opacity=".7"/>
        <line x1="26" y1="8" x2="44" y2="18" stroke="#00c882" stroke-width="1" opacity=".3"/>
        <line x1="26" y1="8" x2="8" y2="18" stroke="#00c882" stroke-width="1" opacity=".3"/>
        <circle cx="26" cy="26" r="5" fill="#00c882"/>
      </svg>
      <span class="brand-name">node<span class="accent">feeds</span></span>
    </a>
    <form class="search-form" action="/search" method="get">
      <input type="search" name="q" placeholder="Search articles..." class="search-input" autocomplete="off"/>
      <button type="submit" class="search-btn">⌕</button>
    </form>
    <div class="header-meta">
      <span class="live-badge">● LIVE</span>
      <a href="/feed.xml" class="rss-link">RSS</a>
    </div>
  </div>
  <nav>
    <a href="/">Home</a>
    ${navCats}
    <a href="/about">About</a>
  </nav>
</header>

<div class="site-wrap">
  <main class="main-col">${body}</main>
  <aside class="side-col">
    <div class="widget">
      <div class="widget-title">// Most Read</div>
      ${popularHtml}
    </div>
    ${adUnit()}
    <div class="widget">
      <div class="widget-title">// Latest</div>
      ${latestSideHtml}
    </div>
    <div class="widget newsletter-widget">
      <div class="widget-title">// Stay Ahead</div>
      <p>NodeFeeds publishes 4 new articles every day — all researched and written by AI.</p>
      <a href="/feed.xml" class="rss-btn">Subscribe via RSS →</a>
    </div>
    ${adUnit()}
  </aside>
</div>

<footer>
  <div class="footer-inner">
    <div class="footer-brand">node<span class="accent">feeds</span></div>
    <p>Independent AI & tech intelligence, published automatically every 6 hours.</p>
    <div class="footer-links">
      <a href="/feed.xml">RSS</a>
      <a href="/sitemap.xml">Sitemap</a>
      <a href="/about">About</a>
      <a href="https://x.com/nodefeeds" target="_blank">@nodefeeds</a>
    </div>
    <p class="footer-copy">© ${new Date().getFullYear()} NodeFeeds · Built with Claude AI</p>
  </div>
</footer>
</body>
</html>`;
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const articles = db.getArticles(24);
  const hero = articles[0];
  const featured = articles.slice(1, 4);
  const grid = articles.slice(4);

  const heroHtml = hero ? `
  <section class="hero-section">
    <a href="/article/${hero.slug}" class="hero-link">
      <div class="hero-img-wrap">
        ${hero.image_url
          ? `<img src="${hero.image_url}" alt="${hero.image_alt||hero.title}" class="hero-img"/>`
          : `<div class="hero-img hero-placeholder"></div>`}
        <span class="cat-badge" style="--cc:${catColor(hero.category)}">${hero.category}</span>
      </div>
      <div class="hero-body">
        <h1 class="hero-title">${hero.title}</h1>
        <p class="hero-excerpt">${hero.excerpt}</p>
        <span class="article-meta">${timeAgo(hero.created_at)} · ${hero.read_time} min read · ${hero.views} views</span>
      </div>
    </a>
    <div class="featured-stack">
      ${featured.map(a => `
      <a href="/article/${a.slug}" class="featured-item">
        ${thumbHtml(a, 'feat-thumb')}
        <div class="feat-body">
          <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
          <h3>${a.title}</h3>
          <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
        </div>
      </a>`).join('')}
    </div>
  </section>` : `
  <div class="empty-state">
    <div class="empty-icon">⚡</div>
    <h2>Warming up…</h2>
    <p>Your first article is being generated right now. Refresh in a minute.</p>
  </div>`;

  const gridHtml = grid.length ? `
  <section class="grid-section">
    <div class="section-head"><span>Latest Articles</span></div>
    ${adUnit()}
    <div class="article-grid">
      ${grid.map(a => `
      <a href="/article/${a.slug}" class="article-card">
        ${thumbHtml(a, 'card-thumb')}
        <div class="card-body">
          <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
          <h3>${a.title}</h3>
          <p>${a.excerpt}</p>
          <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min read</span>
        </div>
      </a>`).join('')}
    </div>
  </section>` : '';

  res.send(layout('AI & Tech Intelligence', heroHtml + gridHtml));
});

// Article
app.get('/article/:slug', (req, res) => {
  const article = db.getArticle(req.params.slug);
  if (!article) return res.status(404).send(layout('Not Found', '<div class="container"><p>Article not found.</p></div>'));
  db.incrementViews(req.params.slug);

  const related = db.getArticlesByCategory(article.category, 5)
    .filter(a => a.slug !== article.slug).slice(0, 3);

  const imgHtml = article.image_url ? `
    <div class="article-hero-img">
      <img src="${article.image_url}" alt="${article.image_alt||article.title}"/>
      ${article.image_credit ? `<span class="img-credit">${article.image_credit_url
        ? `<a href="${article.image_credit_url}" target="_blank">${article.image_credit}</a>`
        : article.image_credit}</span>` : ''}
    </div>` : '';

  const tweetHtml = article.tweet_id
    ? `<a class="tweet-link" href="https://x.com/nodefeeds/status/${article.tweet_id}" target="_blank">View on X →</a>`
    : '';

  const relatedHtml = related.length ? `
    <div class="related-section">
      <div class="section-head"><span>Related Articles</span></div>
      <div class="related-grid">
        ${related.map(a => `
        <a href="/article/${a.slug}" class="article-card">
          ${thumbHtml(a, 'card-thumb')}
          <div class="card-body">
            <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
            <h3>${a.title}</h3>
            <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
          </div>
        </a>`).join('')}
      </div>
    </div>` : '';

  const body = `
  <article class="article-page">
    <div class="article-header">
      <span class="cat-badge" style="--cc:${catColor(article.category)}">${article.category}</span>
      <h1>${article.title}</h1>
      <div class="article-meta-row">
        <span>${formatDate(article.created_at)}</span>
        <span>${article.read_time} min read</span>
        <span>${article.views} views</span>
        ${tweetHtml}
      </div>
    </div>
    ${imgHtml}
    ${adUnit()}
    <div class="article-body">${marked(article.content)}</div>
    ${adUnit()}
  </article>
  ${relatedHtml}`;

  res.send(layout(article.title, body, {
    description: article.excerpt,
    image: article.image_url || ''
  }));
});

// Category
app.get('/category/:cat', (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const articles = db.getArticlesByCategory(cat, 20);
  const body = `
  <div class="section-head"><span>${cat}</span></div>
  ${adUnit()}
  <div class="article-grid">
    ${articles.map(a => `
    <a href="/article/${a.slug}" class="article-card">
      ${thumbHtml(a, 'card-thumb')}
      <div class="card-body">
        <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
        <h3>${a.title}</h3>
        <p>${a.excerpt}</p>
        <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
      </div>
    </a>`).join('')}
  </div>`;
  res.send(layout(cat, body));
});

// Search
app.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = q ? db.searchArticles(q, 20) : [];
  const body = `
  <div class="section-head"><span>Search: "${q}"</span></div>
  ${results.length === 0 ? `<p class="no-results">No articles found for "<strong>${q}</strong>". Try a different keyword.</p>` : ''}
  <div class="article-grid">
    ${results.map(a => `
    <a href="/article/${a.slug}" class="article-card">
      ${thumbHtml(a, 'card-thumb')}
      <div class="card-body">
        <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
        <h3>${a.title}</h3>
        <p>${a.excerpt}</p>
        <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
      </div>
    </a>`).join('')}
  </div>`;
  res.send(layout(`Search: ${q}`, body));
});

// About
app.get('/about', (req, res) => {
  const count = db.getCount();
  const body = `
  <article class="article-page">
    <div class="article-header">
      <h1>About NodeFeeds</h1>
    </div>
    <div class="article-body">
      <p>NodeFeeds is an independent AI & tech intelligence magazine. Every article is researched and written autonomously by Claude AI — searching the live web for real, current information and publishing 4 fresh articles every day, automatically.</p>
      <div class="about-stats">
        <div class="stat-box"><div class="stat-num">${count}</div><div class="stat-label">Articles published</div></div>
        <div class="stat-box"><div class="stat-num">6h</div><div class="stat-label">Publishing cadence</div></div>
        <div class="stat-box"><div class="stat-num">4×</div><div class="stat-label">Articles per day</div></div>
        <div class="stat-box"><div class="stat-num">100%</div><div class="stat-label">AI written</div></div>
      </div>
      <h2>How it works</h2>
      <p>Every 6 hours, our system picks a trending topic in AI, tech, productivity, or gadgets. Claude AI then searches the web for the latest news and writes a full editorial article — complete with images, subheadings, and a practical takeaway. No human editors. No editorial bias.</p>
      <h2>Stack</h2>
      <p>Built with Node.js, hosted on Railway, powered by the Claude API with live web search. Images sourced from Unsplash or generated by Pollinations AI.</p>
    </div>
  </article>`;
  res.send(layout('About NodeFeeds', body));
});

// RSS
app.get('/feed.xml', (req, res) => {
  const articles = db.getArticles(20);
  const feed = new RSS({
    title: SITE_NAME,
    description: 'AI & Tech Intelligence, Delivered Fresh',
    feed_url: `${SITE_URL}/feed.xml`,
    site_url: SITE_URL,
    language: 'en',
    image_url: `${SITE_URL}/images/logo.png`
  });
  articles.forEach(a => {
    feed.item({
      title: a.title,
      description: a.excerpt,
      url: `${SITE_URL}/article/${a.slug}`,
      categories: [a.category],
      date: a.created_at,
      enclosure: a.image_url ? { url: a.image_url } : undefined
    });
  });
  res.set('Content-Type', 'application/rss+xml');
  res.send(feed.xml({ indent: true }));
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  const articles = db.getArticles(1000);
  res.set('Content-Type', 'application/xml');
  res.send(sitemap(articles));
});

// ── CRON — every 6 hours ─────────────────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log(`[NodeFeeds] Cron triggered: ${new Date().toISOString()}`);
  await generateArticle();
});

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  await db.init();
  console.log('[NodeFeeds] Database ready.');
  app.listen(PORT, async () => {
    console.log(`[NodeFeeds] Live on port ${PORT}`);
    const count = db.getCount();
    if (count === 0) {
      console.log('[NodeFeeds] Empty DB — generating first article...');
      await generateArticle();
    } else {
      console.log(`[NodeFeeds] ${count} articles loaded.`);
    }
  });
}

start().catch(err => {
  console.error('[NodeFeeds] Startup error:', err);
  process.exit(1);
});
