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
const SITE_NAME = process.env.SITE_NAME || 'NodeFeed';
const SITE_URL = process.env.SITE_URL || 'https://nodefeed.com';
const ADSENSE_ID = process.env.ADSENSE_PUBLISHER_ID || '';

app.set('view engine', 'html');
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function adsenseHead() {
  if (!ADSENSE_ID) return '';
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}" crossorigin="anonymous"></script>`;
}

function adsenseBlock() {
  if (!ADSENSE_ID) return '';
  return `
    <div class="ad-unit">
      <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_ID}" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </div>`;
}

function categoryColor(cat) {
  const map = {
    'AI Tools': '#00c882',
    'Productivity': '#5b8af5',
    'Gadgets': '#f5a623',
    'Automation': '#c882f5',
    'AI News': '#00c882',
    'Future of Work': '#5bf5c0',
    'Developer Tools': '#f55b5b',
    'Tech Reviews': '#f5e05b'
  };
  return map[cat] || '#00c882';
}

// ─── HTML LAYOUT ─────────────────────────────────────────────────────────────

function layout(title, body, description = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — ${SITE_NAME}</title>
  <meta name="description" content="${description || 'AI & Tech Intelligence, Delivered Fresh'}"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:type" content="website"/>
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS" href="/feed.xml"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
  ${adsenseHead()}
  <link rel="stylesheet" href="/css/style.css"/>
</head>
<body>
  <div class="topbar">
    <span class="topbar-left">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
    <span class="topbar-right">AI &amp; Tech Intelligence</span>
  </div>
  <header>
    <a href="/" class="masthead-link">
      <div class="masthead">
        <div class="masthead-logo">
          <svg width="36" height="36" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="24" stroke="#1a1a2a" stroke-width="1.5"/>
            <circle cx="26" cy="8" r="3.5" fill="#00c882"/>
            <circle cx="44" cy="18" r="3.5" fill="#00c882" opacity=".7"/>
            <circle cx="44" cy="34" r="3.5" fill="#00c882" opacity=".4"/>
            <circle cx="26" cy="44" r="3.5" fill="#00c882" opacity=".3"/>
            <circle cx="8" cy="34" r="3.5" fill="#00c882" opacity=".4"/>
            <circle cx="8" cy="18" r="3.5" fill="#00c882" opacity=".7"/>
            <line x1="26" y1="8" x2="44" y2="18" stroke="#00c882" stroke-width="1" opacity=".3"/>
            <line x1="44" y1="18" x2="44" y2="34" stroke="#00c882" stroke-width="1" opacity=".2"/>
            <line x1="26" y1="8" x2="8" y2="18" stroke="#00c882" stroke-width="1" opacity=".3"/>
            <line x1="8" y1="18" x2="8" y2="34" stroke="#00c882" stroke-width="1" opacity=".2"/>
            <circle cx="26" cy="26" r="5" fill="#00c882"/>
          </svg>
          <span class="masthead-name">node<span class="accent">feed</span></span>
        </div>
        <div class="masthead-tagline">// ai &amp; tech intelligence</div>
      </div>
    </a>
    <nav>
      <a href="/">Home</a>
      <a href="/category/AI%20Tools">AI Tools</a>
      <a href="/category/Productivity">Productivity</a>
      <a href="/category/Gadgets">Gadgets</a>
      <a href="/category/Automation">Automation</a>
      <a href="/category/Developer%20Tools">Dev Tools</a>
    </nav>
  </header>
  <main>${body}</main>
  <footer>
    <div class="footer-inner">
      <div class="footer-brand">node<span class="accent">feed</span></div>
      <p>AI-powered tech intelligence. Articles generated &amp; published automatically every 6 hours.</p>
      <div class="footer-links">
        <a href="/feed.xml">RSS Feed</a>
        <a href="/about">About</a>
      </div>
      <p class="footer-copy">© ${new Date().getFullYear()} NodeFeed. Built with Claude AI.</p>
    </div>
  </footer>
</body>
</html>`;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Home
app.get('/', (req, res) => {
  const articles = db.getArticles(20);
  const hero = articles[0];
  const featured = articles.slice(1, 4);
  const rest = articles.slice(4);

  const heroHtml = hero ? `
    <section class="hero-section">
      <div class="container">
        <div class="hero-grid">
          <a href="/article/${hero.slug}" class="hero-article">
            <div class="hero-thumb">
              <div class="hero-thumb-inner"></div>
              <span class="cat-badge" style="--cat-color:${categoryColor(hero.category)}">${hero.category}</span>
            </div>
            <h1 class="hero-title">${hero.title}</h1>
            <p class="hero-excerpt">${hero.excerpt}</p>
            <div class="article-meta">${formatDate(hero.created_at)} &nbsp;·&nbsp; ${hero.read_time} min read &nbsp;·&nbsp; ${hero.views} views</div>
          </a>
          <div class="sidebar-stack">
            ${featured.map(a => `
              <a href="/article/${a.slug}" class="sidebar-item">
                <span class="cat-label" style="color:${categoryColor(a.category)}">${a.category}</span>
                <h3>${a.title}</h3>
                <span class="meta-sm">${formatDate(a.created_at)} · ${a.read_time} min</span>
              </a>`).join('')}
          </div>
        </div>
      </div>
    </section>` : `
    <section class="hero-section">
      <div class="container">
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <h2>First article generating now…</h2>
          <p>NodeFeed is warming up. Your first AI-written article will appear within a minute.</p>
        </div>
      </div>
    </section>`;

  const gridHtml = rest.length > 0 ? `
    <section class="grid-section">
      <div class="container">
        <div class="section-head"><h2>Latest</h2></div>
        ${adsenseBlock()}
        <div class="article-grid">
          ${rest.map(a => `
            <a href="/article/${a.slug}" class="article-card">
              <div class="card-thumb"><div class="card-thumb-inner"></div></div>
              <div class="card-body">
                <span class="cat-label" style="color:${categoryColor(a.category)}">${a.category}</span>
                <h3>${a.title}</h3>
                <p>${a.excerpt}</p>
                <span class="meta-sm">${formatDate(a.created_at)} · ${a.read_time} min read</span>
              </div>
            </a>`).join('')}
        </div>
      </div>
    </section>` : '';

  res.send(layout('AI & Tech Intelligence', heroHtml + gridHtml));
});

// Article page
app.get('/article/:slug', (req, res) => {
  const article = db.getArticle(req.params.slug);
  if (!article) return res.status(404).send(layout('Not Found', '<div class="container"><h1>Article not found</h1></div>'));

  db.incrementViews(req.params.slug);
  const htmlContent = marked(article.content);
  const related = db.getArticlesByCategory(article.category, 4).filter(a => a.slug !== article.slug).slice(0, 3);

  const body = `
    <div class="container article-layout">
      <div class="article-main">
        <div class="article-header">
          <span class="cat-badge" style="--cat-color:${categoryColor(article.category)}">${article.category}</span>
          <h1>${article.title}</h1>
          <div class="article-meta">${formatDate(article.created_at)} &nbsp;·&nbsp; ${article.read_time} min read &nbsp;·&nbsp; ${article.views} views</div>
        </div>
        ${adsenseBlock()}
        <div class="article-body">${htmlContent}</div>
        ${adsenseBlock()}
      </div>
      <aside class="article-sidebar">
        <div class="sidebar-widget">
          <div class="widget-title">Related Articles</div>
          ${related.map(a => `
            <a href="/article/${a.slug}" class="sidebar-item">
              <span class="cat-label" style="color:${categoryColor(a.category)}">${a.category}</span>
              <h3>${a.title}</h3>
            </a>`).join('')}
        </div>
        ${adsenseBlock()}
      </aside>
    </div>`;

  res.send(layout(article.title, body, article.excerpt));
});

// Category page
app.get('/category/:cat', (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const articles = db.getArticlesByCategory(cat, 20);

  const body = `
    <div class="container">
      <div class="section-head"><h2>${cat}</h2></div>
      ${adsenseBlock()}
      <div class="article-grid">
        ${articles.map(a => `
          <a href="/article/${a.slug}" class="article-card">
            <div class="card-thumb"><div class="card-thumb-inner"></div></div>
            <div class="card-body">
              <span class="cat-label" style="color:${categoryColor(a.category)}">${a.category}</span>
              <h3>${a.title}</h3>
              <p>${a.excerpt}</p>
              <span class="meta-sm">${formatDate(a.created_at)} · ${a.read_time} min read</span>
            </div>
          </a>`).join('')}
      </div>
    </div>`;

  res.send(layout(cat, body));
});

// About page
app.get('/about', (req, res) => {
  const count = db.getCount();
  const body = `
    <div class="container about-page">
      <h1>About NodeFeed</h1>
      <p>NodeFeed is an independent AI & tech intelligence magazine. Every article you read here was researched and written autonomously by Claude AI — searching the web for real, current information and publishing fresh articles every 6 hours, 24/7.</p>
      <div class="about-stats">
        <div class="stat-box"><div class="stat-num">${count}</div><div class="stat-label">Articles published</div></div>
        <div class="stat-box"><div class="stat-num">6h</div><div class="stat-label">Publishing cadence</div></div>
        <div class="stat-box"><div class="stat-num">4×</div><div class="stat-label">Articles per day</div></div>
      </div>
      <p>Built with Node.js, hosted on Railway, powered by the Claude API.</p>
    </div>`;
  res.send(layout('About', body));
});

// RSS Feed
app.get('/feed.xml', (req, res) => {
  const articles = db.getArticles(20);
  const feed = new RSS({
    title: SITE_NAME,
    description: 'AI & Tech Intelligence, Delivered Fresh',
    feed_url: `${SITE_URL}/feed.xml`,
    site_url: SITE_URL,
    language: 'en'
  });
  articles.forEach(a => {
    feed.item({
      title: a.title,
      description: a.excerpt,
      url: `${SITE_URL}/article/${a.slug}`,
      categories: [a.category],
      date: a.created_at
    });
  });
  res.set('Content-Type', 'application/rss+xml');
  res.send(feed.xml({ indent: true }));
});

// ─── CRON JOB — Every 6 hours ────────────────────────────────────────────────
// Runs at 00:00, 06:00, 12:00, 18:00 every day
cron.schedule('0 */6 * * *', async () => {
  console.log(`[NodeFeed] Cron triggered at ${new Date().toISOString()}`);
  await generateArticle();
});

// ─── STARTUP ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[NodeFeed] Running on port ${PORT}`);

  // Generate first article immediately if DB is empty
  const count = db.getCount();
  if (count === 0) {
    console.log('[NodeFeed] No articles found — generating first article now...');
    await generateArticle();
  } else {
    console.log(`[NodeFeed] ${count} articles in database.`);
  }
});
