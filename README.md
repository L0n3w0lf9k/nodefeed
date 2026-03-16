# NodeFeed ⚡

> AI & Tech Intelligence, Delivered Fresh

An autonomous AI-powered tech magazine. Claude searches the web and writes fresh articles every 6 hours — automatically.

## How it works

1. A cron job fires every 6 hours
2. Claude API picks a random tech topic and searches the web for current news
3. Claude writes a full article based on real, live information
4. The article is saved to a SQLite database
5. It appears on the site instantly — no human needed

## Stack

- **Node.js** + Express — web server
- **Claude API** (claude-sonnet) + web search — article generation
- **SQLite** (better-sqlite3) — article database
- **node-cron** — scheduler
- **Railway** — hosting + deployment
- **Google AdSense** — monetisation

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/nodefeed.git
cd nodefeed
npm install
```

### 2. Set environment variables
Copy `.env.example` to `.env` and fill in:
```
ANTHROPIC_API_KEY=your_key_here
ADSENSE_PUBLISHER_ID=pub-xxxxxxxxxxxxxxxx
SITE_URL=https://your-domain.com
```

### 3. Run locally
```bash
npm start
# or for dev with auto-reload:
npm run dev
```

### 4. Deploy to Railway
1. Push to GitHub
2. Connect repo in Railway dashboard
3. Add environment variables in Railway → Variables tab
4. Deploy — Railway auto-detects Node.js

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Claude API key |
| `ADSENSE_PUBLISHER_ID` | ✅ | Your AdSense pub ID |
| `SITE_URL` | ✅ | Your full domain (for RSS) |
| `SITE_NAME` | Optional | Site name (default: NodeFeed) |
| `PORT` | Optional | Server port (default: 3000) |

## Manual article generation
```bash
node src/generator.js
```

## Cost estimate
- Claude API: ~€0.01–0.05 per article
- 4 articles/day = ~€0.04–0.20/day = ~€1–6/month

## Monetisation
- Google AdSense (auto-placed on all pages)
- Add affiliate links manually to high-traffic articles
- Newsletter upsell (future)
