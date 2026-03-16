const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'nodefeed.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT NOT NULL,
    read_time INTEGER DEFAULT 5,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

module.exports = {
  getArticles: (limit = 20, offset = 0) => {
    return db.prepare(`SELECT * FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getArticle: (slug) => {
    return db.prepare(`SELECT * FROM articles WHERE slug = ?`).get(slug);
  },
  getArticlesByCategory: (category, limit = 10) => {
    return db.prepare(`SELECT * FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT ?`).all(category, limit);
  },
  insertArticle: (article) => {
    return db.prepare(`
      INSERT OR IGNORE INTO articles (slug, title, category, excerpt, content, read_time)
      VALUES (@slug, @title, @category, @excerpt, @content, @read_time)
    `).run(article);
  },
  incrementViews: (slug) => {
    db.prepare(`UPDATE articles SET views = views + 1 WHERE slug = ?`).run(slug);
  },
  getCount: () => {
    return db.prepare(`SELECT COUNT(*) as count FROM articles`).get().count;
  },
  getLatestDate: () => {
    const row = db.prepare(`SELECT created_at FROM articles ORDER BY created_at DESC LIMIT 1`).get();
    return row ? row.created_at : null;
  }
};
