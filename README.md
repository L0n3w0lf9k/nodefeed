# NodeFeed ⚡

> **The World’s First Fully Autonomous AI Tech Intelligence Magazine.**

NodeFeed is an independent tech publication where every article is researched, written, and illustrated by AI. Powered by **Claude (Anthropic)** and **Flux (Pollinations)**, it delivers deep-dive tech news 24/7 without a single human in the loop.

---

## ✨ Features

- **🧠 Autonomous Research**: Uses Claude with Web Search to find real-time, non-clickbait tech news.
- **✍️ High-Signal Journalism**: Writes 900–1,200 word articles with inline citations, data, and expert quotes.
- **🎨 Custom AI Imagery**: Generates thematic cover art for every article using **Pollinations (Flux model)** with smart **Unsplash** fallbacks.
- **⏱️ Smart Ticker**: A live, scrolling news ticker powered by 15+ real-time RSS feeds (TechCrunch, The Verge, Ars Technica, etc.).
- **🐦 Social Sync**: Automatically posts every new article to **Twitter/X** and **LinkedIn**.
- **💬 Community Tools**: Integrated **Giscus** (GitHub Discussions) for comments and a custom **Emoji Reaction** system.
- **📊 SEO & Monetisation**: Fully automated SEO (open graph, sitemaps, RSS) and built-in **Google AdSense** support.

---

## 🛠 Tech Stack

- **Runtime**: Node.js + Express
- **AI Core**: Anthropic Claude 3.5 Sonnet (with Web Search 2025-03-05)
- **Imagery**: Pollinations.ai (Flux) / Unsplash API
- **Database**: SQLite (via `sql.js` for lightweight file-based storage)
- **Scheduler**: `node-cron`
- **Frontend**: Vanilla CSS / JavaScript (Zero frameworks, maximum speed)
- **Deployment**: Optimized for **Railway**

---

## 🚀 Getting Started

### 1. Installation

```bash
git clone https://github.com/YOUR_USERNAME/nodefeed.git
cd nodefeed
npm install
```

### 2. Configuration

Create a `.env` file in the root directory (see `.env.example`):

```env
# Core API
ANTHROPIC_API_KEY=your_key_here

# Site Info
SITE_URL=https://nodefeeds.com
SITE_NAME=NodeFeeds
ADSENSE_PUBLISHER_ID=pub-xxxxxxxxxxxxxxxx

# Socials (Optional)
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...

LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_AUTHOR_URN=...
```

### 3. Usage

**Start the web server:**
```bash
npm start
```

**Generate an article manually (CLI):**
```bash
npm run generate
```

**Repair missing images:**
```bash
npm run repair-images
```

---

## 🏗 Architecture

NodeFeed is designed to be self-healing and low-maintenance:

- **Article Flow**: `topic select` → `web search` → `claude write` → `image gen` → `db save` → `tweet`.
- **Database**: All articles and news items are stored in `data/nodefeeds.db`.
- **Media**: AI-generated images are stored locally in `data/images` (mount this as a volume on Railway).

---

## 📅 Roadmap

- [ ] Email newsletter integration (Substack/Beehiiv)
- [ ] Podcast generation (Text-to-Speech)
- [ ] Multi-language support (ES, PT, FR)
- [ ] Predictive trend analysis using LLM history

---

## 📄 License

MIT © [Your Name/NodeFeeds]
