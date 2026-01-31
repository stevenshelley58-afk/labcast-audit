# Labcast Audit

A Gemini-powered website auditor for the Labcast marketing agency. Analyzes websites across SEO, performance, security, and visual UX dimensions.

## Features

- **5-Stage Audit Pipeline** - Comprehensive analysis from data collection to AI synthesis
- **13 Data Collectors** - robots.txt, sitemaps, screenshots, Lighthouse, DNS, TLS, and more
- **AI-Powered Analysis** - Gemini 2.5 Flash for visual and SERP audits
- **Executive Reports** - Actionable findings ranked by business impact
- **Debug Mode** - Full LLM trace visibility for transparency

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run development server
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `OPENAI_API_KEY` | No | OpenAI API key (optional fallback) |
| `SCREENSHOTONE_API_KEY` | No | Screenshot capture in production |

## Architecture

```
POST /api/audit { url: string }
         │
         ▼
┌─────────────────────────────────────────────────┐
│              5-Stage Pipeline                    │
├──────────────────────────────────────────────────┤
│ 0. Identity    → Normalize URL, generate run ID │
│ 1. Collect     → 13 parallel data collectors    │
│ 2. Extract     → Signal extraction from HTML    │
│ 3. Audit       → 4 deterministic + 2 LLM audits │
│ 4. Synthesize  → AI-generated executive report  │
└──────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Vercel Serverless Functions
- **AI**: Google Gemini 2.5 Flash, OpenAI GPT-4o
- **Screenshots**: ScreenshotOne API

## Development

```bash
# Build for production
npm run build

# Type check
npx tsc --noEmit
```

## Deployment

Push to `main` branch triggers automatic deployment to Vercel.

## License

Proprietary - Labcast Marketing Agency
