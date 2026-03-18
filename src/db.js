const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// Railway Volume mounts at /data by default — use that if available,
// otherwise fall back to local ./data for local dev
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'nodefeeds.db');
console.log('[DB] Using database at:', DB_PATH);

let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      emoji TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(slug, emoji)
    );
  CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      image_thumb TEXT,
      image_alt TEXT,
      image_credit TEXT,
      image_credit_url TEXT,
      image_source TEXT,
      read_time INTEGER DEFAULT 5,
      views INTEGER DEFAULT 0,
      tweet_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  persist();
  return db;
}

function persist() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

module.exports = {
  init: getDb,

  getArticles(limit = 20, offset = 0) {
    return queryAll('SELECT *, (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE slug = articles.slug) as total_reactions FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  },
  getArticle(slug) {
    return queryOne('SELECT * FROM articles WHERE slug = ?', [slug]);
  },
  getArticlesByCategory(category, limit = 10) {
    return queryAll('SELECT *, (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE slug = articles.slug) as total_reactions FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT ?', [category, limit]);
  },
  searchArticles(query, limit = 20) {
    const q = `%${query}%`;
    return queryAll('SELECT *, (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE slug = articles.slug) as total_reactions FROM articles WHERE title LIKE ? OR excerpt LIKE ? ORDER BY created_at DESC LIMIT ?', [q, q, limit]);
  },
  insertArticle(article) {
    try {
      run(`INSERT OR IGNORE INTO articles
        (slug, title, category, excerpt, content, image_url, image_thumb, image_alt, image_credit, image_credit_url, image_source, read_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [article.slug, article.title, article.category, article.excerpt, article.content,
         article.image_url||null, article.image_thumb||null, article.image_alt||null,
         article.image_credit||null, article.image_credit_url||null, article.image_source||null,
         article.read_time]);
      return { changes: 1 };
    } catch (e) {
      console.error('[DB] insertArticle error:', e.message);
      return { changes: 0 };
    }
  },
  updateTweetId(slug, tweetId) {
    run('UPDATE articles SET tweet_id = ? WHERE slug = ?', [tweetId, slug]);
  },
  incrementViews(slug) {
    run('UPDATE articles SET views = views + 1 WHERE slug = ?', [slug]);
  },
  getCount() {
    return queryOne('SELECT COUNT(*) as count FROM articles')?.count || 0;
  },
  getCategories() {
    return queryAll('SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC');
  },
  getMostViewed(limit = 5) {
    return queryAll('SELECT *, (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE slug = articles.slug) as total_reactions FROM articles ORDER BY views DESC LIMIT ?', [limit]);
  },
  updateArticleImage(slug, image) {
    run(
      'UPDATE articles SET image_url=?, image_thumb=?, image_alt=?, image_credit=?, image_credit_url=?, image_source=? WHERE slug=?',
      [image.url, image.thumb, image.alt, image.credit, image.creditUrl, image.source, slug]
    );
  },

  getArticlesWithoutImages(limit = 50) {
    return queryAll(
      "SELECT slug, title, category, excerpt FROM articles WHERE image_url IS NULL OR image_url = '' ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
  },

  getRecentArticles(days = 30) {
    return queryAll(
      "SELECT slug, title, excerpt, category FROM articles WHERE created_at >= datetime('now', ? || ' days') ORDER BY created_at DESC",
      [`-${days}`]
    );
  },

  addReaction(slug, emoji) {
    run(
      'INSERT INTO reactions (slug, emoji, count) VALUES (?,?,1) ON CONFLICT(slug,emoji) DO UPDATE SET count=count+1',
      [slug, emoji]
    );
  },

  getReactions(slug) {
    const rows = queryAll('SELECT emoji, count FROM reactions WHERE slug=?', [slug]);
    const result = {};
    rows.forEach(r => { result[r.emoji] = r.count; });
    return result;
  },

  getTrending(hours = 24, limit = 5) {
    // Gets most viewed articles updated in the last N hours
    // Since we don't track per-hour views, we use recently created + high views as proxy
    return queryAll(
      "SELECT *, (SELECT COALESCE(SUM(count), 0) FROM reactions WHERE slug = articles.slug) as total_reactions FROM articles WHERE created_at >= datetime('now', ? || ' hours') ORDER BY views DESC LIMIT ?",
      [`-${hours}`, limit]
    );
  },

  getLatestDate() {
    return queryOne('SELECT created_at FROM articles ORDER BY created_at DESC LIMIT 1')?.created_at || null;
  }
};
