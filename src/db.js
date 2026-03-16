const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'nodefeed.db');

let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
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
  `);
  persist();
  return db;
}

function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
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
    return queryAll(
      'SELECT * FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  },

  getArticle(slug) {
    return queryOne('SELECT * FROM articles WHERE slug = ?', [slug]);
  },

  getArticlesByCategory(category, limit = 10) {
    return queryAll(
      'SELECT * FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT ?',
      [category, limit]
    );
  },

  insertArticle(article) {
    try {
      run(
        `INSERT OR IGNORE INTO articles (slug, title, category, excerpt, content, read_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [article.slug, article.title, article.category, article.excerpt, article.content, article.read_time]
      );
      return { changes: 1 };
    } catch (e) {
      console.error('[DB] insertArticle error:', e.message);
      return { changes: 0 };
    }
  },

  incrementViews(slug) {
    run('UPDATE articles SET views = views + 1 WHERE slug = ?', [slug]);
  },

  getCount() {
    const row = queryOne('SELECT COUNT(*) as count FROM articles');
    return row ? row.count : 0;
  },

  getLatestDate() {
    const row = queryOne('SELECT created_at FROM articles ORDER BY created_at DESC LIMIT 1');
    return row ? row.created_at : null;
  }
};
