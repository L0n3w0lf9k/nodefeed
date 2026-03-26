require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('node:path');
const { marked } = require('marked');
const RSS = require('rss');
const db = require('./src/db');
const { generateArticle } = require('./src/generator');
const { generateAndSaveImage, listSavedImages } = require('./src/images');

const RSSParser = require('rss-parser');
const rssParser = new RSSParser({
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
    ]
  }
});

// Change //

// ── NEWS CACHE ────────────────────────────────────────────────────────────────
const NEWS_SOURCES = [
  // Original sources
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', color: '#00c882', logo: 'https://techcrunch.com/wp-content/uploads/2015/02/cropped-cropped-favicon-gradient.png' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', color: '#fb7185', logo: 'https://www.theverge.com/static-assets/icons/favicon.ico' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', color: '#f5a623', logo: 'https://cdn.arstechnica.net/wp-content/uploads/2016/10/cropped-ars-logo-512_480-32x32.png' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', color: '#5b8af5', logo: 'https://www.wired.com/favicon.ico' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', color: '#a78bfa', logo: 'https://www.technologyreview.com/favicon.ico' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', color: '#fbbf24', logo: 'https://venturebeat.com/wp-content/themes/vb-news/img/favicon.ico' },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', color: '#5bf5c0', logo: 'https://static.files.bbci.co.uk/core/website/assets/static/icons/favicon-32x32.png' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', color: '#ff0070', logo: 'https://www.engadget.com/favicon.ico' },
  { name: 'ZDNet', url: 'https://www.zdnet.com/news/rss.xml', color: '#e63946', logo: 'https://www.zdnet.com/favicon.ico' },
  { name: 'CNET', url: 'https://www.cnet.com/rss/news/', color: '#e8c22e', logo: 'https://www.cnet.com/favicon.ico' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/technology/rss', color: '#00b2ff', logo: 'https://assets.guim.co.uk/images/favicons/32x32.ico' },
  { name: 'Hacker News (New)', url: 'https://hnrss.org/newest?points=50', color: '#fb923c', logo: 'https://news.ycombinator.com/favicon.ico' },
  { name: 'MacRumors', url: 'https://feeds.macrumors.com/MacRumors-All', color: '#888888', logo: 'https://www.macrumors.com/favicon.ico' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', color: '#ff3e3e', logo: 'https://thehackernews.com/favicon.ico' },
];

let newsCache = { items: [], fetchedAt: null };

async function fetchNews() {
  console.log('[News] Fetching RSS feeds...');
  const allItems = [];

  for (const source of NEWS_SOURCES) {
    try {
      const feed = await rssParser.parseURL(source.url);
      const items = (feed.items || []).slice(0, 5).map(item => {
        // Try multiple RSS image fields
        let image = null;
        if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) {
          image = item.enclosure.url;
        } else if (item['media:content']?.['$']?.url) {
          image = item['media:content']['$'].url;
        } else if (item['media:thumbnail']?.['$']?.url) {
          image = item['media:thumbnail']['$'].url;
        } else if (item.itunes?.image) {
          image = item.itunes.image;
        }
        return {
          title: item.title || '',
          link: item.link || item.guid || '',
          source: source.name,
          color: source.color,
          logo: source.logo,
          date: item.pubDate || item.isoDate || new Date().toISOString(),
          excerpt: (item.contentSnippet || item.summary || '').slice(0, 160).trim(),
          image,
        };
      });
      allItems.push(...items);
      console.log(`[News] ✓ ${source.name}: ${items.length} items`);
    } catch (e) {
      console.error(`[News] ✗ ${source.name}: ${e.message}`);
    }
  }

  // Sort by date, newest first, take top 20
  allItems.sort((a, b) => new Date(b.date) - new Date(a.date));
  newsCache = { items: allItems.slice(0, 20), fetchedAt: new Date() };
  console.log(`[News] Cache updated: ${newsCache.items.length} items`);
  return newsCache.items;
}

// Refresh news every 15 minutes
cron.schedule('*/15 * * * *', fetchNews);

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_NAME = 'NodeFeeds';
const SITE_URL = process.env.SITE_URL || 'https://nodefeeds.com';
const ADSENSE_ID = process.env.ADSENSE_PUBLISHER_ID || '';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── REACTIONS ENDPOINT ────────────────────────────────────────────────────────
app.post('/api/react', (req, res) => {
  const { slug, emoji, oldEmoji, action } = req.body;
  const allowed = ['👍', '🔥', '🤯', '💡', '😮'];
  if (!slug) return res.json({ ok: false });

  if (action === 'remove' && emoji) {
    db.decrementReaction(slug, emoji);
  } else if (oldEmoji && emoji) {
    db.decrementReaction(slug, oldEmoji);
    db.addReaction(slug, emoji);
  } else if (emoji && allowed.includes(emoji)) {
    db.addReaction(slug, emoji);
  }

  const counts = db.getReactions(slug);
  res.json({ ok: true, counts });
});

app.get('/api/reactions/:slug', (req, res) => {
  res.json(db.getReactions(req.params.slug));
});

// Serve images from Railway Volume
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const IMAGES_DIR = path.join(VOLUME_PATH, 'images');
const fs = require('node:fs');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
app.use('/images', express.static(IMAGES_DIR));

// ── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeAgo(d) {
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function adsenseHead() {
  if (!ADSENSE_ID) return '';
  // crossorigin + onerror prevents ad blocker console errors from breaking the page
  return `
    <meta name="google-adsense-account" content="${ADSENSE_ID}">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}" crossorigin="anonymous" onerror="console.warn('AdSense blocked by client')"></script>
  `;
}

function adUnit() {
  if (!ADSENSE_ID) return '';
  return `<div class="ad-unit"><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_ID}" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function catColor(cat) {
  const m = {
    'AI Tools': '#00c882', 'Productivity': '#5b8af5', 'Gadgets': '#f5a623',
    'Automation': '#c882f5', 'AI News': '#00e0a0', 'Future of Work': '#5bf5c0',
    'Developer Tools': '#f55b5b', 'Tech Reviews': '#f5e05b',
    'Space Tech': '#a78bfa', 'Cybersecurity': '#fb7185', 'Crypto & Web3': '#fbbf24'
  };
  return m[cat] || '#00c882';
}

function thumbHtml(article, cls = 'card-thumb') {
  if (article.image_url) {
    return `<div class="${cls} shimmer-wrap"><img src="${article.image_url}" alt="${article.image_alt || article.title}" loading="lazy" onload="this.parentElement.classList.remove('shimmer-wrap')" onerror="this.style.display='none';this.parentElement.classList.add('thumb-placeholder');this.parentElement.classList.remove('shimmer-wrap')"/></div>`;
  }
  return `<div class="${cls}"><div class="thumb-placeholder"></div></div>`;
}

function metricsHtml(article) {
  const views = article.views || 0;
  const reactions = article.total_reactions || 0;
  return `<span class="article-metrics">
    <span class="metric-item">👁 ${views}</span>
    ${reactions > 0 ? `<span class="metric-item">🔥 ${reactions}</span>` : ''}
  </span>`;
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
  const { description, image } = meta;
  const desc = description || 'AI & Tech Intelligence, Delivered Fresh — updated every 6 hours by Claude AI';
  const cats = db.getCategories();
  const popular = db.getMostViewed(4);
  const latest = db.getArticles(3);

  const currentPath = meta.path || '';
  // Ensure SITE_URL doesn't have a trailing slash for consistent concatenation
  const baseSiteUrl = SITE_URL.endsWith('/') ? SITE_URL.slice(0, -1) : SITE_URL;

  // Resolve absolute image URL
  let fullImgUrl = `${baseSiteUrl}/og-image.png`;
  if (image) {
    if (image.startsWith('http')) {
      fullImgUrl = image;
    } else {
      const slash = image.startsWith('/') ? '' : '/';
      fullImgUrl = `${baseSiteUrl}${slash}${image}`;
    }
  }

  const isArticle = currentPath.startsWith('/article/');
  const canonicalUrl = `${baseSiteUrl}${currentPath}`;
  function navLink(href, label) {
    const isActive = currentPath === href || currentPath.startsWith(href + '/');
    return `<a href="${href}"${isActive ? ' class="active"' : ''}>${label}</a>`;
  }

  const navCats = cats.slice(0, 6).map(c => {
    const href = `/category/${encodeURIComponent(c.category)}`;
    const isActive = currentPath.startsWith(href);
    return `<a href="${href}"${isActive ? ' class="active"' : ''}>${c.category}</a>`;
  }).join('');

  const popularHtml = popular.map(a => `
    <a href="/article/${a.slug}" class="pop-item">
      ${thumbHtml(a, 'pop-thumb')}
      <div class="pop-body">
        <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
        <h4>${a.title}</h4>
        <div class="meta-sm">${timeAgo(a.created_at)} · ${metricsHtml(a)}</div>
      </div>
    </a>`).join('');

  const trending = db.getTrending(24, 3);
  const trendingHtml = trending.length > 0 ? trending.map(a => `
    <a href="/article/${a.slug}" class="latest-side-item">
      <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
      <h4>${a.title}</h4>
      <div class="meta-sm trending-views">🔥 ${a.views} views today · ${metricsHtml(a).replace('👁 ' + a.views, '').replace('🔥', '').trim()}</div>
    </a>`).join('') : '<p style="padding:.75rem 1rem;font-size:12px;color:var(--text3)">Check back later</p>';

  const latestSideHtml = latest.map(a => `
    <a href="/article/${a.slug}" class="latest-side-item">
      <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
      <h4>${a.title}</h4>
      <div class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min · ${metricsHtml(a)}</div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8"/>
<!-- og:type debug: ${isArticle ? 'article' : 'website'} -->
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title} — ${SITE_NAME}</title>
<meta name="description" content="${desc}"/>
<link rel="canonical" href="${canonicalUrl}" />
<link rel="stylesheet" href="/css/style.css"/>
<script src="/js/transitions.js" defer></script>

<!-- Open Graph / Social Media -->
<meta property="og:site_name" content="${SITE_NAME}"/>
<meta property="og:title" content="${title} — ${SITE_NAME}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${canonicalUrl}"/>
<meta property="og:type" content="${isArticle ? 'article' : 'website'}"/>

<meta property="og:image" content="${fullImgUrl}"/>
<meta property="og:image:url" content="${fullImgUrl}"/>
<meta property="og:image:secure_url" content="${fullImgUrl}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:type" content="${fullImgUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'}"/>
<meta property="og:image:alt" content="${title}"/>

<link rel="image_src" href="${fullImgUrl}"/>
<link rel="logo" href="${baseSiteUrl}/og-image.png"/>
<meta itemprop="image" content="${fullImgUrl}"/>
<meta name="image" content="${fullImgUrl}"/>

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:url" content="${canonicalUrl}"/>
<meta name="twitter:title" content="${title} — ${SITE_NAME}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${fullImgUrl}"/>
<meta name="twitter:image:alt" content="${title}"/>
<meta name="twitter:site" content="@nodefeeds"/>
${isArticle && meta.published_time ? `
<meta property="article:published_time" content="${new Date(meta.published_time).toISOString()}"/>
<meta property="article:author" content="NodeFeeds AI"/>
<meta property="article:section" content="${meta.category || 'Tech'}"/>
` : ''}
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<meta name="google-site-verification" content="R3mHQsUmZPkUzQd1W9IdzfwhB9ztK4D9AR9XxeI2WRA" />
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="/feed.xml"/>
<link rel="sitemap" type="application/xml" href="/sitemap.xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
${adsenseHead()}
</head>
<body>
<img src="${fullImgUrl}" style="display:none" alt="Social Preview Image" />
<div class="topbar">
  <span>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
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
    <div class="header-ticker-wrap">
      <div class="header-ticker">
        <div class="header-ticker-inner">
          ${newsCache.items.slice(0, 12).map(item =>
    `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="header-ticker-item">
              <span class="header-ticker-source" style="color:${item.color}">${item.source}</span>
              <span class="header-ticker-title">${item.title}</span>
            </a><span class="header-ticker-sep">·</span>`
  ).join('')}
          ${newsCache.items.slice(0, 12).map(item =>
    `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="header-ticker-item">
              <span class="header-ticker-source" style="color:${item.color}">${item.source}</span>
              <span class="header-ticker-title">${item.title}</span>
            </a><span class="header-ticker-sep">·</span>`
  ).join('')}
        </div>
      </div>
    </div>
    <div class="header-meta">
      <span class="live-badge">● LIVE</span>
      <a href="/feed.xml" class="rss-link">RSS</a>
    </div>
  </div>
  <nav>
    ${navLink('/', 'Home')}
    ${navCats}
    ${navLink('/news', 'News')}
    ${navLink('/digest', 'Weekly Digest')}
    ${navLink('/about', 'About')}
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
    <div class="widget">
      <div class="widget-title">// Trending Today</div>
      ${trendingHtml}
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
      <a href="/about">About</a>
      <a href="/digest">Weekly Digest</a>
      <a href="/contact">Contact</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/feed.xml">RSS</a>
      <a href="/sitemap.xml">Sitemap</a>
      <a href="https://x.com/nodefeeds" target="_blank">@nodefeeds</a>
    </div>
    <p class="footer-copy">© ${new Date().getFullYear()} NodeFeeds · Independent AI & Tech Intelligence · Lisbon, Portugal</p>
  </div>
  <div class="news-ticker-wrap">
    <span class="ticker-label">// LIVE</span>
    <div class="news-ticker">
      <div class="news-ticker-inner">
        ${newsCache.items.slice(0, 15).map(item =>
    `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="ticker-item">
            <span class="ticker-source" style="color:${item.color}">${item.source}</span>
            <span class="ticker-title">${item.title}</span>
          </a>`
  ).join('<span class="ticker-sep">·</span>')}
        ${newsCache.items.slice(0, 15).map(item =>
    `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="ticker-item">
            <span class="ticker-source" style="color:${item.color}">${item.source}</span>
            <span class="ticker-title">${item.title}</span>
          </a>`
  ).join('<span class="ticker-sep">·</span>')}
      </div>
    </div>
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

  let heroImgHtml = '<div class="hero-img hero-placeholder"></div>';
  if (hero?.image_url) {
    heroImgHtml = `<img src="${hero.image_url}" alt="${hero.image_alt || hero.title}" class="hero-img" onload="this.parentElement.classList.remove('shimmer-wrap')" onerror="this.parentElement.classList.remove('shimmer-wrap');this.parentElement.classList.add('hero-placeholder')"/>`;
  }

  const heroHtml = hero ? `
  <section class="hero-section">
    <a href="/article/${hero.slug}" class="hero-link">
      <div class="hero-img-wrap shimmer-wrap">
        ${heroImgHtml}
        <span class="cat-badge" style="--cc:${catColor(hero.category)}">${hero.category}</span>
      </div>
      <div class="hero-body">
        <h1 class="hero-title">${hero.title}</h1>
        <p class="hero-excerpt">${hero.excerpt}</p>
        <div class="article-meta">${timeAgo(hero.created_at)} · ${hero.read_time} min read · ${metricsHtml(hero)}</div>
      </div>
    </a>
    <div class="featured-stack">
      ${featured.map(a => `
      <a href="/article/${a.slug}" class="featured-item">
        ${thumbHtml(a, 'feat-thumb')}
        <div class="feat-body">
          <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
          <h3>${a.title}</h3>
          <div class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min · ${metricsHtml(a)}</div>
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
          <div class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min read · ${metricsHtml(a)}</div>
        </div>
      </a>`).join('')}
    </div>
  </section>` : '';

  const homeJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "NodeFeeds",
    "url": SITE_URL,
    "description": "Independent AI & tech intelligence, published automatically every 6 hours.",
    "image": `${SITE_URL}/og-image.png`,
    "publisher": {
      "@type": "Organization",
      "name": "NodeFeeds",
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_URL}/og-image.png`
      }
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  });
  res.send(layout('AI & Tech Intelligence', heroHtml + gridHtml, { jsonLd: homeJsonLd, path: '/' }));
});

// Article
app.get('/article/:slug', (req, res) => {
  const article = db.getArticle(req.params.slug);
  if (!article) return res.status(404).send(layout('Not Found', '<div class="container"><p>Article not found.</p></div>'));
  db.incrementViews(req.params.slug);

  // Smart related: keyword matching first, category fallback
  const titleWords = article.title.toLowerCase()
    .replaceAll(/[^a-z0-9 ]/g, ' ').split(' ')
    .filter(w => w.length > 4);
  const keywordRelated = titleWords.length > 0
    ? db.searchArticles(titleWords[0], 10).filter(a => a.slug !== article.slug).slice(0, 3)
    : [];
  const related = keywordRelated.length >= 2
    ? keywordRelated
    : db.getArticlesByCategory(article.category, 5).filter(a => a.slug !== article.slug).slice(0, 3);

  let imageCreditHtml = '';
  if (article.image_credit) {
    if (article.image_credit_url) {
      imageCreditHtml = `<span class="img-credit"><a href="${article.image_credit_url}" target="_blank">${article.image_credit}</a></span>`;
    } else {
      imageCreditHtml = `<span class="img-credit">${article.image_credit}</span>`;
    }
  }

  const imgHtml = article.image_url ? `
    <div class="article-hero-img shimmer-wrap">
      <img src="${article.image_url}" alt="${article.image_alt || article.title}" onload="this.parentElement.classList.remove('shimmer-wrap')" onerror="this.parentElement.classList.remove('shimmer-wrap');this.style.display='none'"/>
      ${imageCreditHtml}
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

  const articleUrl = `${SITE_URL}/article/${article.slug}`;
  const encodedUrl = encodeURIComponent(articleUrl);
  const encodedTitle = encodeURIComponent(article.title);
  const rawParsed = typeof marked.parse === 'function' ? marked.parse(article.content) : marked(article.content);
  const safeContent = typeof rawParsed === 'string' ? rawParsed : '';

  const body = `
  <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar"></div></div>
  <article class="article-page">
    <div class="article-header">
      <span class="cat-badge" style="--cc:${catColor(article.category)}">${article.category}</span>
      <h1>${article.title}</h1>
      <div class="article-meta-row">
        <span>${formatDate(article.created_at)}</span>
        <span class="read-time-badge">⏱ ${article.read_time} min read</span>
        <span>${article.views} views</span>
        ${tweetHtml}
      </div>
    </div>

    <div class="engagement-container">
      <div class="share-section">
        <div class="share-label">// Share</div>
        <div class="share-buttons">
          <a href="https://x.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}" target="_blank" rel="noopener" class="share-btn share-x" title="Share on X">𝕏</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener" class="share-btn share-li" title="Share on LinkedIn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
          </a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener" class="share-btn share-fb" title="Share on Facebook">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a href="https://www.instagram.com/" target="_blank" rel="noopener" class="share-btn share-ig" title="Share on Instagram">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.805.249 2.227.412.558.217.957.477 1.376.896.419.419.679.818.896 1.376.163.422.358 1.057.412 2.227.059 1.265.07 1.646.07 4.85s-.011 3.585-.07 4.85c-.054 1.17-.249 1.805-.412 2.227-.217.558-.477.958-.896 1.376-.419.419-.818.679-1.376.896-.422.163-1.057.359-2.227.412-1.266.059-1.646.07-4.85.07s-3.585-.011-4.85-.07c-1.17-.054-1.805-.249-2.227-.412-.558-.217-.958-.477-1.376-.896-.419-.419-.679-.818-.896-1.376-.163-.422-.359-1.057-.412-2.227-.058-1.265-.07-1.646-.07-4.85s.012-3.585.07-4.85c.054-1.17.249-1.805.412-2.227.217-.558.477-.957.896-1.376.419-.419.818-.679 1.376-.896.422-.163 1.057-.358 2.227-.412 1.265-.058 1.646-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-1.277.057-2.148.258-2.911.554-.788.307-1.457.717-2.126 1.386-.669.669-1.079 1.338-1.386 2.126-.296.763-.497 1.634-.554 2.911-.058 1.28-.072 1.688-.072 4.947s.014 3.667.072 4.947c.057 1.277.258 2.148.554 2.911.307.788.717 1.457 1.386 2.126.669.669 1.338 1.079 2.126 1.386.763.296 1.634.497 2.911.554 1.28.058 1.688.072 4.947.072s3.667-.014 4.947-.072c1.277-.057 2.148-.258 2.911-.554.788-.307 1.457-.717 2.126-1.386.669-.669 1.079-1.338 1.386-2.126.296-.763.497-1.634.554-2.911.058-1.28.072-1.688.072-4.947s-.014-3.667-.072-4.947c-.057-1.277-.258-2.148-.554-2.911-.307-.788-.717-1.457-1.386-2.126-.669-.669-1.338-1.079-2.126-1.386-.763-.296-1.634-.497-2.911-.554-1.28-.058-1.688-.072-4.947-.072zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          </a>
          <a href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" target="_blank" rel="noopener" class="share-btn share-wa" title="Share on WhatsApp">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.438 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          </a>
          <button onclick="copyToClipboard('${articleUrl}', this)" class="share-btn share-copy" title="Copy Link"><span>🔗</span></button>
        </div>
      </div>

      <div class="reactions-section" id="reactions">
        <div class="share-label">// React</div>
        <div class="reaction-buttons">
          ${['👍', '🔥', '🤯', '💡', '😮'].map(e => `
          <button class="reaction-btn" data-emoji="${e}" data-slug="${article.slug}" onclick="handleReact(this)">
            <span class="reaction-emoji">${e}</span>
            <span class="reaction-count" id="rc-${e.codePointAt(0)}-${article.slug}">0</span>
          </button>`).join('')}
        </div>
      </div>
    </div>

    ${imgHtml}
    ${adUnit()}
    <div class="article-body">${safeContent}</div>

    <div class="comments-section">
      <div class="share-label">// Discussion</div>
        <script src="https://giscus.app/client.js"
                data-repo="L0n3w0lf9k/nodefeed"
                data-repo-id="R_kgDORo7DOw"
                data-category-id="DIC_kwDORo7DO84C4mk8"
                data-mapping="pathname"
                data-strict="0"
                data-reactions-enabled="1"
                data-emit-metadata="0"
                data-input-position="bottom"
                data-theme="preferred_color_scheme"
                data-lang="en"
                data-loading="lazy"
                crossorigin="anonymous"
                async>
        </script>
    </div>
    <div id="toast-container" class="toast-container"></div>
  </article>
  ${relatedHtml}

  <script>
    // Reading progress bar
    window.addEventListener('scroll', () => {
      const el = document.documentElement;
      const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
      document.getElementById('progress-bar').style.width = Math.min(pct, 100) + '%';
    });

    // Load reaction counts
    fetch('/api/reactions/${article.slug}')
      .then(r => r.json())
      .then(counts => {
        Object.entries(counts).forEach(([emoji, count]) => {
          const cp = emoji.codePointAt(0);
          const el = document.getElementById('rc-' + cp + '-${article.slug}');
          if (el) el.textContent = count;
        });
        // Restore user's previous reactions from localStorage
        const key = 'reacted_${article.slug}';
        const reactedEmoji = localStorage.getItem(key);
        if (reactedEmoji) {
          const btn = document.querySelector('[data-emoji="' + reactedEmoji + '"]');
          if (btn) btn.classList.add('reacted');
        }
      });

    function handleReact(btn) {
      const emoji = btn.dataset.emoji;
      const slug = btn.dataset.slug;
      const key = 'reacted_' + slug;
      const current = localStorage.getItem(key);

      let body = { slug, emoji };
      if (current === emoji) {
        body.action = 'remove';
      } else if (current) {
        body.oldEmoji = current;
      }

      fetch('/api/react', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          if (body.action === 'remove') {
            localStorage.removeItem(key);
            btn.classList.remove('reacted');
          } else {
            localStorage.setItem(key, emoji);
            document.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('reacted'));
            btn.classList.add('reacted');
          }
          // Update all counts
          ['👍', '🔥', '🤯', '💡', '😮'].forEach(e => {
            const count = data.counts[e] || 0;
            const cp = e.codePointAt(0);
            const el = document.getElementById('rc-' + cp + '-' + slug);
            if (el) el.textContent = count;
          });
        }
      });
    }
  </script>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.excerpt,
    "image": article.image_url ? `${SITE_URL}${article.image_url}` : '',
    "datePublished": new Date(article.created_at).toISOString(),
    "dateModified": new Date(article.created_at).toISOString(),
    "author": {
      "@type": "Organization",
      "name": "NodeFeeds Editorial",
      "url": SITE_URL
    },
    "publisher": {
      "@type": "Organization",
      "name": "NodeFeeds",
      "url": SITE_URL,
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_URL}/favicon.svg`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${SITE_URL}/article/${article.slug}`
    },
    "articleSection": article.category,
    "wordCount": article.content.split(/\s+/).length
  });

  res.send(layout(article.title, body, {
    description: article.excerpt,
    image: article.image_url || '',
    jsonLd,
    path: `/article/${article.slug}`,
    published_time: article.created_at,
    category: article.category
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
  res.send(layout(cat, body, { path: `/category/${encodeURIComponent(cat)}` }));
});

function highlight(text, term) {
  if (!term || !text) return text;
  const re = new RegExp('(' + term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`) + ')', 'gi');
  return text.replaceAll(re, '<mark>$1</mark>');
}

// Search
app.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = q ? db.searchArticles(q, 20) : [];

  const body = `
  <div class="section-head"><span>Search: "${q}" — ${results.length} result${results.length === 1 ? '' : 's'}</span></div>
  ${results.length === 0 && q ? `<p class="no-results">No articles found for "<strong>${q}</strong>". Try a different keyword.</p>` : ''}
  <div class="article-grid">
    ${results.map(a => `
    <a href="/article/${a.slug}" class="article-card">
      ${thumbHtml(a, 'card-thumb')}
      <div class="card-body">
        <span class="cat-label" style="color:${catColor(a.category)}">${a.category}</span>
        <h3>${highlight(a.title, q)}</h3>
        <p>${highlight(a.excerpt, q)}</p>
        <span class="meta-sm">${timeAgo(a.created_at)} · ${a.read_time} min</span>
      </div>
    </a>`).join('')}
  </div>`;
  res.send(layout(`Search: ${q}`, body));
});


// Debug route — check image status
app.get('/admin/images', (req, res) => {
  const articles = db.getArticles(100);
  const savedFiles = new Set(listSavedImages());
  const rows = articles.map(a => {
    const isExternal = a.image_url?.startsWith('http') || false;
    const filename = a.image_url && !isExternal ? a.image_url.replace('/images/', '') : null;
    const onDisk = filename ? savedFiles.has(filename) : false;

    let status;
    if (!a.image_url) {
      status = '✗ No image';
    } else if (isExternal) {
      status = '✗ External URL (needs repair)';
    } else if (onDisk) {
      status = '✓ On disk';
    } else {
      status = '✗ File missing';
    }
    return `<tr style="color:${onDisk ? '#00c882' : '#f55b5b'}">
      <td style="padding:4px 8px">${a.title.slice(0, 50)}</td>
      <td style="padding:4px 8px;font-size:10px;word-break:break-all">${(a.image_url || 'NONE').slice(0, 80)}</td>
      <td style="padding:4px 8px">${status}</td>
    </tr>`;
  }).join('');
  res.send(`<html><body style="background:#0a0a0f;color:#f0f0f0;font-family:monospace;padding:2rem">
    <h2>Image Status (${savedFiles.size} files on disk)</h2>
    <p>Images dir: ${IMAGES_DIR}</p>
    <table border="0" cellpadding="0" cellspacing="0">${rows}</table>
  </body></html>`);
});

// Ads.txt — required by Google AdSense
app.get('/ads.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`google.com, ${ADSENSE_ID}, DIRECT, f08c47fec0942fa0`);
});

// ── LEGAL & TRUST PAGES ─────────────────────────────────────────────────────

app.get('/privacy', (req, res) => {
  const body = `
  <article class="article-page">
    <div class="article-header">
      <h1>Privacy Policy</h1>
      <div class="article-meta-row"><span>Last updated: March 2026</span></div>
    </div>
    <div class="article-body">
      <p>NodeFeeds ("we", "us", "our") is operated by Luis Matos, based in Lisbon, Portugal. This Privacy Policy explains how we collect, use, and protect your information when you visit nodefeeds.com.</p>

      <h2>Information We Collect</h2>
      <p>We do not require you to create an account or provide personal information to read NodeFeeds. We collect the following data automatically:</p>
      <ul>
        <li><strong>Log data</strong> — IP address, browser type, pages visited, time and date of visits. This is standard web server logging.</li>
        <li><strong>Cookies</strong> — We use cookies served by Google AdSense to display relevant advertisements. See Google's Privacy Policy for details.</li>
        <li><strong>Analytics</strong> — We may use aggregated, anonymised analytics to understand how our content is used.</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To serve and improve the website</li>
        <li>To display relevant advertising via Google AdSense</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>Google AdSense & Advertising</h2>
      <p>NodeFeeds uses Google AdSense to display advertisements. Google may use cookies to serve ads based on your prior visits to this or other websites. You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank">Google's Ad Settings</a>.</p>

      <h2>Your Rights (GDPR)</h2>
      <p>As a resident of the European Economic Area, you have the right to access, correct, or delete your personal data. You also have the right to object to processing and to data portability. To exercise these rights, contact us at the email below.</p>

      <h2>Data Retention</h2>
      <p>Server log data is retained for a maximum of 90 days. We do not sell or share your personal data with third parties except as required by law or as described in this policy.</p>

      <h2>Third Party Links</h2>
      <p>Articles on NodeFeeds may contain links to external websites. We are not responsible for the privacy practices of those sites.</p>

      <h2>Changes to This Policy</h2>
      <p>We may update this policy from time to time. Changes will be posted on this page with an updated date.</p>

      <h2>Contact</h2>
      <p>For privacy-related questions: <a href="mailto:nodefeeds@outlook.com">nodefeeds@outlook.com</a></p>
    </div>
  </article>`;
  res.send(layout('Privacy Policy', body, { description: 'NodeFeeds Privacy Policy — how we collect and use data.' }));
});

app.get('/terms', (req, res) => {
  const body = `
  <article class="article-page">
    <div class="article-header">
      <h1>Terms of Service</h1>
      <div class="article-meta-row"><span>Last updated: March 2026</span></div>
    </div>
    <div class="article-body">
      <p>By accessing and using NodeFeeds (nodefeeds.com), you agree to be bound by these Terms of Service. If you do not agree, please do not use this website.</p>

      <h2>About NodeFeeds</h2>
      <p>NodeFeeds is an AI-powered technology news publication. Articles are researched and written autonomously using Claude AI, with web search to source current information. While we strive for accuracy, all content should be independently verified before being relied upon for decisions.</p>

      <h2>Content & Accuracy</h2>
      <p>NodeFeeds makes reasonable efforts to ensure the accuracy of published content. However, given the automated nature of our publication, we cannot guarantee that all information is current, complete, or error-free. Articles include references to source material — please consult original sources for critical decisions.</p>
      <p>NodeFeeds is not responsible for any errors, omissions, or outcomes resulting from the use of information on this site.</p>

      <h2>Intellectual Property</h2>
      <p>The NodeFeeds name, logo, and original content are the property of Luis Matos. You may share articles with attribution and a link back to the original. Reproduction of full articles without permission is prohibited.</p>

      <h2>Advertising</h2>
      <p>NodeFeeds displays advertisements via Google AdSense. Advertisements are clearly distinguished from editorial content. NodeFeeds does not accept paid placements or sponsored articles.</p>

      <h2>External Links</h2>
      <p>NodeFeeds articles link to external sources as references. We do not endorse and are not responsible for the content of external sites.</p>

      <h2>Limitation of Liability</h2>
      <p>NodeFeeds and its operators shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of this website or reliance on its content.</p>

      <h2>Governing Law</h2>
      <p>These terms are governed by the laws of Portugal and the European Union.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <a href="mailto:nodefeeds@outlook.com">nodefeeds@outlook.com</a></p>
    </div>
  </article>`;
  res.send(layout('Terms of Service', body, { description: 'NodeFeeds Terms of Service.' }));
});

app.get('/contact', (req, res) => {
  const body = `
  <article class="article-page">
    <div class="article-header">
      <h1>Contact</h1>
    </div>
    <div class="article-body">
      <p>NodeFeeds is an independent AI & tech intelligence publication based in Portugal.</p>
      <h2>Get in touch</h2>
      <p>For general enquiries, corrections, or feedback:</p>
      <p><strong>Email:</strong> <a href="mailto:nodefeeds@outlook.com">nodefeeds@outlook.com</a></p>
      <p><strong>X (Twitter):</strong> <a href="https://x.com/nodefeeds" target="_blank">@nodefeeds</a></p>
      <h2>Content corrections</h2>
      <p>If you spot a factual error in an article, please email us with the article URL and the correction. We take accuracy seriously and will update articles promptly.</p>
      <h2>Advertising</h2>
      <p>NodeFeeds is monetised exclusively through Google AdSense. We do not accept sponsored content, paid placements, or affiliate arrangements.</p>
    </div>
  </article>`;
  res.send(layout('Contact', body, { description: 'Contact NodeFeeds — corrections, feedback, and enquiries.' }));
});

app.get('/about', (req, res) => {
  const count = db.getCount();
  const cats = db.getCategories();
  const body = `
  <article class="article-page">
    <div class="article-header">
      <h1>About NodeFeeds</h1>
    </div>
    <div class="article-body">
      <p><strong>NodeFeeds</strong> is an independent AI & tech intelligence magazine publishing fresh articles every 6 hours, 24 hours a day. Every article is researched using live web search and written by Claude AI — one of the most capable large language models available today.</p>

      <h2>Our mission</h2>
      <p>To keep curious people informed about the fast-moving world of artificial intelligence, technology, productivity, space exploration, cybersecurity, and crypto — without the noise, hype, or paywalls that dominate mainstream tech media.</p>
      <p>We believe good journalism should be accessible, accurate, and timely. NodeFeeds publishes ${count} articles and counting, covering ${cats.length} categories across the tech landscape.</p>

      <h2>How it works</h2>
      <p>Every 6 hours, our system selects a topic from a curated pool of tech categories. Claude AI then searches the live web for the latest developments, synthesises information from multiple sources, and writes a structured editorial article complete with citations and references.</p>
      <p>Articles are reviewed against recent publications to prevent repetition, and each one includes a references section linking back to original sources. Images are generated uniquely per article using Pollinations AI.</p>

      <h2>Editorial standards</h2>
      <ul>
        <li>Every factual claim includes a citation to the original source</li>
        <li>Articles are structured for readability — short paragraphs, clear headings, key takeaways</li>
        <li>No sponsored content, no paid placements, no affiliate links</li>
        <li>Corrections are made promptly when errors are identified</li>
        <li>We do not repeat the same topic within 30 days unless the story has substantially developed</li>
      </ul>

      <h2>Publisher</h2>
      <p><strong>Luis Matos</strong><br/>
      Lisbon, Portugal<br/>
      <a href="mailto:nodefeeds@outlook.com">nodefeeds@outlook.com</a><br/>
      <a href="https://x.com/nodefeeds" target="_blank">@nodefeeds on X</a></p>

      <h2>Technology</h2>
      <div class="about-stats">
        <div class="stat-box"><div class="stat-num">${count}</div><div class="stat-label">Articles published</div></div>
        <div class="stat-box"><div class="stat-num">6h</div><div class="stat-label">Publishing cadence</div></div>
        <div class="stat-box"><div class="stat-num">${cats.length}</div><div class="stat-label">Categories covered</div></div>
        <div class="stat-box"><div class="stat-num">100%</div><div class="stat-label">Source-cited</div></div>
      </div>
      <p>Built with Node.js, hosted on Railway, powered by the Claude API with live web search. Source images generated by Pollinations AI.</p>

      <h2>Legal</h2>
      <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/contact">Contact</a></p>
    </div>
  </article>`;
  res.send(layout('About NodeFeeds', body, { description: 'NodeFeeds is an independent AI & tech intelligence magazine publishing fresh articles every 6 hours.', path: '/about' }));
});

// Topic pages
app.get('/topic/:keyword', (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword);
  const articles = db.searchArticles(keyword, 30);
  const body = `
  <div class="section-head"><span>Topic: ${keyword}</span></div>
  <div class="article-grid">
    ${articles.length === 0
      ? '<p class="no-results">No articles found for this topic yet.</p>'
      : articles.map(a => `
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
  res.send(layout(`Topic: ${keyword}`, body, { description: `All NodeFeeds articles about ${keyword}` }));
});

// Weekly digest
app.get('/digest', (req, res) => {
  const articles = db.getArticles(200).filter(a => {
    const age = (Date.now() - new Date(a.created_at)) / 86400000;
    return age <= 7;
  });
  const byCategory = {};
  articles.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });
  const digestHtml = Object.entries(byCategory).map(([cat, arts]) => `
    <div class="digest-section">
      <h2 class="digest-cat" style="color:${catColor(cat)}">${cat}</h2>
      ${arts.slice(0, 3).map(a => `
      <a href="/article/${a.slug}" class="digest-item">
        ${thumbHtml(a, 'digest-thumb')}
        <div class="digest-body">
          <h3>${a.title}</h3>
          <p>${a.excerpt}</p>
          <span class="meta-sm">${formatDate(a.created_at)} · ${a.read_time} min read</span>
        </div>
      </a>`).join('')}
    </div>`).join('');

  const body = `
  <div class="article-header">
    <h1>Weekly Digest</h1>
    <div class="article-meta-row">
      <span>Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      <span>${articles.length} articles this week</span>
    </div>
  </div>
  ${digestHtml.length ? digestHtml : '<p class="no-results">No articles this week yet — check back soon.</p>'}`;

  res.send(layout('Weekly Digest', body, { description: 'NodeFeeds weekly roundup — the best AI & tech articles from the past 7 days.', path: '/digest' }));
});

// News
app.get('/news', async (req, res) => {
  // Use cache if fresh (under 1 hour), otherwise fetch
  if (!newsCache.fetchedAt || (Date.now() - newsCache.fetchedAt) > 900000) {
    await fetchNews();
  }

  const items = newsCache.items;
  const fetchedAgo = newsCache.fetchedAt ? timeAgo(newsCache.fetchedAt) : 'never';

  const newsHtml = items.length === 0
    ? '<p class="no-results">News is loading — check back in a moment.</p>'
    : items.map(item => `
      <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-card">
        <div class="news-card-thumb ${item.image ? 'shimmer-wrap' : 'news-card-logo-thumb'}">
          ${item.image
        ? `<img src="${item.image}" alt="${item.title}" loading="lazy" onload="this.parentElement.classList.remove('shimmer-wrap')" onerror="this.parentElement.classList.remove('shimmer-wrap');this.style.display='none';this.nextElementSibling.style.display='flex'"/>
               <div class="news-logo-fallback" style="display:none">
                 <img src="${item.logo}" alt="${item.source}" class="news-source-logo"/>
                 <span class="news-logo-name" style="color:${item.color}">${item.source}</span>
               </div>`
        : `<div class="news-logo-fallback">
                 <img src="${item.logo}" alt="${item.source}" class="news-source-logo"/>
                 <span class="news-logo-name" style="color:${item.color}">${item.source}</span>
               </div>`}
        </div>
        <div class="news-card-body">
          <div class="news-source" style="color:${item.color}">${item.source}</div>
          <h3 class="news-title">${item.title}</h3>
          ${item.excerpt ? `<p class="news-excerpt">${item.excerpt}</p>` : ''}
          <span class="meta-sm">${timeAgo(item.date)}</span>
        </div>
      </a>`).join('');

  const body = `
  <div class="news-header">
    <div class="section-head"><span>Live Tech News</span></div>
    <span class="news-refresh">Updated ${fetchedAgo} · <a href="/news">Refresh</a></span>
  </div>
  <div class="news-sources-bar">
    ${NEWS_SOURCES.map(s => `<span class="news-source-tag" style="--sc:${s.color}">${s.name}</span>`).join('')}
  </div>
  <div class="news-card-grid">
    ${newsHtml}
  </div>`;

  res.send(layout('Live Tech News', body, {
    description: 'Latest tech news from TechCrunch, The Verge, Ars Technica, Wired, MIT Tech Review, VentureBeat and Reuters — updated hourly.',
    path: '/news'
  }));
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
    image_url: `${SITE_URL}/images/logo.png`,
    custom_namespaces: {
      'content': 'http://purl.org/rss/1.0/modules/content/'
    }
  });
  articles.forEach(a => {
    feed.item({
      title: a.title,
      description: a.excerpt,
      url: `${SITE_URL}/article/${a.slug}`,
      guid: a.slug,
      categories: [a.category],
      date: new Date(a.created_at),
      enclosure: a.image_url ? { url: `${SITE_URL}${a.image_url}`, type: 'image/jpeg' } : undefined,
      custom_elements: [
        { 'content:encoded': { _cdata: a.content } }
      ]
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

  // Start server FIRST — Railway health check needs port open immediately
  await new Promise(resolve => app.listen(PORT, resolve));
  console.log(`[NodeFeeds] Live on port ${PORT}`);

  // Everything else runs in background — never blocks the server
  setTimeout(async () => {
    try {
      const count = db.getCount();
      console.log(`[NodeFeeds] ${count} articles in database.`);

      // Generate first article if DB empty
      if (count === 0) {
        console.log('[NodeFeeds] Empty DB — generating first article...');
        await generateArticle();
      }

      // Fetch initial news cache
      fetchNews().catch(e => console.error('[News] Initial fetch failed:', e.message));

      // Repair articles missing images or with external URLs
      const allArts = db.getArticles(200);
      const missing = allArts.filter(a => {
        if (!a.image_url) return true;
        if (a.image_url.startsWith('http')) return true;
        return false;
      });

      if (missing.length > 0) {
        console.log(`[NodeFeeds] Repairing ${missing.length} articles without images...`);
        for (const article of missing) {
          const image = await generateAndSaveImage(article.slug, article.title, article.category);
          if (image) {
            db.updateArticleImage(article.slug, image);
            console.log(`[NodeFeeds] ✓ Repaired: "${article.title}"`);
          }
          await new Promise(r => setTimeout(r, 4000));
        }
        console.log('[NodeFeeds] Image repair complete.');
      } else {
        console.log('[NodeFeeds] All articles have images ✓');
      }
    } catch (e) {
      console.error('[NodeFeeds] Background task error:', e.message);
    }
  }, 2000); // 2 second delay after server is up
}

function bootstrap() {
  start().catch(err => {
    console.error('[NodeFeeds] Startup error:', err);
    process.exit(1);
  });
}
bootstrap();
