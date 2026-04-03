# Claude Code Development Instructions

## สำหรับ Claude Code: คำแนะนำในการพัฒนาต่อ

### Phase 1: Foundation (เสร็จแล้ว ✅)
- [x] Project structure
- [x] Supabase schema & migrations
- [x] Type definitions
- [x] Supabase client setup
- [x] TikTok API wrapper
- [x] AI Analysis Engine
- [x] Base UI components
- [x] Dashboard layout
- [x] Campaign management pages
- [x] Analytics pages
- [x] Budget optimizer
- [x] API routes

### Phase 2: Integration (ให้ Claude Code ทำ)
- [ ] เชื่อม TikTok Marketing API จริง (ต้องมี App ID & Secret)
- [ ] ตั้งค่า Supabase Auth (Google/Email login)
- [ ] เชื่อม Anthropic API key กับ AI engine
- [ ] ทำ Webhook รับข้อมูลจาก TikTok
- [ ] ตั้งค่า Supabase Realtime subscriptions
- [ ] ทำ Cron job sync ข้อมูลจาก TikTok ทุก 15 นาที

### Phase 3: Enhancement
- [ ] เพิ่ม A/B Testing module
- [ ] เพิ่ม Audience Insight AI
- [ ] เพิ่ม Creative AI Generator (ต่อ DALL-E/Midjourney)
- [ ] เพิ่ม Report Export (PDF/Excel)
- [ ] เพิ่ม Team collaboration features
- [ ] เพิ่ม Multi-account management

### Phase 4: Production
- [ ] Error monitoring (Sentry)
- [ ] Performance monitoring
- [ ] Rate limiting
- [ ] Security audit
- [ ] Load testing

## คำสั่งสำหรับ Claude Code

### เริ่มต้น
```bash
# ติดตั้ง dependencies
npm install

# ตั้งค่า environment
cp .env.example .env.local

# รัน Supabase migration
supabase db push

# เริ่ม dev server
npm run dev
```

### เชื่อม TikTok API
```bash
claude "เชื่อม TikTok Marketing API โดยใช้ credentials ใน .env.local 
- ดึงข้อมูล campaigns, ad groups, ads
- sync ข้อมูลลง Supabase ทุก 15 นาที
- ตั้งค่า webhook สำหรับ real-time updates"
```

### เพิ่ม AI Features
```bash
claude "เพิ่ม AI analysis features:
1. Budget optimization - วิเคราะห์งบและแนะนำ reallocation
2. Performance prediction - ทำนาย ROAS, CPA ล่วงหน้า 7 วัน
3. Anomaly detection - แจ้งเตือนเมื่อ metrics ผิดปกติ
4. Creative scoring - ให้คะแนน ad creative"
```

### Deploy
```bash
claude "deploy โปรเจกต์ขึ้น Vercel:
1. ตรวจสอบ build errors
2. ตั้งค่า environment variables
3. ตั้งค่า Supabase connection
4. verify deployment"
```

## Database Schema Notes
- ใช้ Row Level Security (RLS) ทุกตาราง
- user_id เป็น FK ไป auth.users
- ข้อมูล metrics เก็บแบบ time-series ใน daily_metrics
- AI insights เก็บแยกตาราง พร้อม confidence score

## API Design Notes
- ทุก API route ต้อง verify auth token
- Rate limit: 100 req/min per user
- TikTok API มี rate limit 10 req/sec → ใช้ queue
- AI analysis ใช้ streaming response

## Key Files to Modify
- `src/lib/tiktok-api.ts` - เพิ่ม API calls จริง
- `src/lib/ai-engine.ts` - ปรับ prompt engineering
- `src/app/api/` - เพิ่ม error handling
- `supabase/functions/` - เพิ่ม Edge Functions
