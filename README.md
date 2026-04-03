# 🚀 TikTok Ads AI Manager

ระบบจัดการโฆษณา TikTok อัจฉริยะ พร้อม AI วิเคราะห์งบประมาณและประสิทธิภาพ

## Tech Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Realtime)
- **AI**: Claude API (Anthropic) สำหรับวิเคราะห์
- **Deploy**: Vercel
- **Ads API**: TikTok Marketing API v1.3

## Features
- 📊 Dashboard แสดงภาพรวมแคมเปญแบบ Real-time
- 🤖 AI วิเคราะห์งบประมาณ, ROAS, CPA, CTR อัตโนมัติ
- 💰 Budget Optimizer แนะนำการจัดสรรงบที่เหมาะสม
- 📈 Performance Analytics พร้อม trend prediction
- 🎨 Creative Analyzer วิเคราะห์คุณภาพ Ad Creative
- 🔔 Smart Alerts แจ้งเตือนเมื่อประสิทธิภาพผิดปกติ
- 📱 Responsive Design รองรับทุกอุปกรณ์

## Quick Setup

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd tiktok-ads-ai
npm install
```

### 2. Supabase Setup
```bash
# Install Supabase CLI
npm install -g supabase

# Login & init
supabase login
supabase init

# Link to your project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push
```

### 3. Environment Variables
```bash
cp .env.example .env.local
# Fill in your keys
```

### 4. Run Development
```bash
npm run dev
```

### 5. Deploy to Vercel
```bash
vercel
```

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
TIKTOK_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
```

## Claude Code Instructions
ให้ Claude Code เปิดโปรเจกต์นี้แล้วรัน:
```
claude "อ่าน README.md และ CLAUDE_CODE_INSTRUCTIONS.md แล้วเริ่มพัฒนาต่อ"
```

## Architecture
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── ai-analyze/    # AI Analysis endpoints
│   │   ├── campaigns/     # Campaign CRUD
│   │   └── auth/          # Auth callback
│   ├── dashboard/         # Main dashboard
│   ├── campaigns/         # Campaign management
│   ├── analytics/         # Analytics pages
│   ├── budget/            # Budget optimizer
│   ├── creative/          # Creative analyzer
│   └── settings/          # Settings
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── dashboard/        # Dashboard widgets
│   ├── campaigns/        # Campaign components
│   ├── analytics/        # Analytics charts
│   └── charts/           # Chart components
├── lib/                  # Utilities
│   ├── supabase.ts       # Supabase client
│   ├── tiktok-api.ts     # TikTok API wrapper
│   ├── ai-engine.ts      # AI analysis engine
│   └── utils.ts          # Helpers
├── hooks/                # Custom hooks
├── types/                # TypeScript types
└── styles/               # Global styles
```
