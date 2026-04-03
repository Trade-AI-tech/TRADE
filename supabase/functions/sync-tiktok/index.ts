// supabase/functions/sync-tiktok/index.ts
// Deploy: supabase functions deploy sync-tiktok
// Schedule: every 15 minutes via Supabase CRON

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all active TikTok accounts
    const { data: accounts, error: accErr } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('status', 'active');

    if (accErr) throw accErr;

    const results = [];

    for (const account of accounts || []) {
      try {
        // 1. Sync campaigns
        const campaignsRes = await tiktokRequest(
          '/campaign/get/',
          account.access_token,
          { advertiser_id: account.advertiser_id, page_size: 100 }
        );

        if (campaignsRes.code === 0 && campaignsRes.data?.list) {
          for (const camp of campaignsRes.data.list) {
            await supabase.from('campaigns').upsert({
              user_id: account.user_id,
              tiktok_account_id: account.id,
              tiktok_campaign_id: camp.campaign_id,
              name: camp.campaign_name,
              objective: mapObjective(camp.objective_type),
              status: mapStatus(camp.status),
              budget_mode: camp.budget_mode,
              budget: camp.budget,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'tiktok_campaign_id',
              ignoreDuplicates: false,
            });
          }
        }

        // 2. Sync daily metrics (last 7 days)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

        const metricsRes = await tiktokRequest(
          '/report/integrated/get/',
          account.access_token,
          {
            advertiser_id: account.advertiser_id,
            report_type: 'BASIC',
            dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
            data_level: 'AUCTION_CAMPAIGN',
            start_date: startDate,
            end_date: endDate,
            metrics: JSON.stringify([
              'spend', 'impressions', 'clicks', 'reach', 'frequency',
              'ctr', 'cpc', 'cpm',
              'conversion', 'cost_per_conversion', 'conversion_rate',
              'complete_payment', 'total_complete_payment_rate',
              'video_play_actions', 'video_watched_2s', 'video_watched_6s',
              'average_video_play',
              'likes', 'comments', 'shares', 'follows', 'profile_visits_rate',
            ]),
            page_size: 1000,
          }
        );

        if (metricsRes.code === 0 && metricsRes.data?.list) {
          for (const row of metricsRes.data.list) {
            const dims = row.dimensions;
            const m = row.metrics;

            // Find our internal campaign ID
            const { data: camp } = await supabase
              .from('campaigns')
              .select('id')
              .eq('tiktok_campaign_id', dims.campaign_id)
              .eq('user_id', account.user_id)
              .single();

            if (camp) {
              await supabase.from('daily_metrics').upsert({
                user_id: account.user_id,
                campaign_id: camp.id,
                date: dims.stat_time_day,
                impressions: Number(m.impressions) || 0,
                clicks: Number(m.clicks) || 0,
                reach: Number(m.reach) || 0,
                frequency: Number(m.frequency) || 0,
                spend: Number(m.spend) || 0,
                cpm: Number(m.cpm) || 0,
                cpc: Number(m.cpc) || 0,
                ctr: Number(m.ctr) || 0,
                conversions: Number(m.conversion) || 0,
                conversion_rate: Number(m.conversion_rate) || 0,
                cost_per_conversion: Number(m.cost_per_conversion) || 0,
                conversion_value: Number(m.complete_payment) || 0,
                roas: Number(m.spend) > 0
                  ? Number(m.complete_payment) / Number(m.spend)
                  : 0,
                video_views: Number(m.video_play_actions) || 0,
                likes: Number(m.likes) || 0,
                comments: Number(m.comments) || 0,
                shares: Number(m.shares) || 0,
                follows: Number(m.follows) || 0,
              }, {
                onConflict: 'campaign_id,ad_group_id,ad_id,date',
                ignoreDuplicates: false,
              });
            }
          }
        }

        // 3. Update last synced
        await supabase
          .from('tiktok_accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', account.id);

        results.push({ account_id: account.id, status: 'success' });
      } catch (err) {
        results.push({ account_id: account.id, status: 'error', error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ synced: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: TikTok API request
async function tiktokRequest(endpoint: string, accessToken: string, params: Record<string, string>) {
  const url = new URL(`${TIKTOK_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'Access-Token': accessToken },
  });
  return res.json();
}

// Helper: Map TikTok objective to our enum
function mapObjective(obj: string): string {
  const map: Record<string, string> = {
    REACH: 'REACH',
    TRAFFIC: 'TRAFFIC',
    VIDEO_VIEWS: 'VIDEO_VIEWS',
    LEAD_GENERATION: 'LEAD_GENERATION',
    ENGAGEMENT: 'COMMUNITY_INTERACTION',
    APP_INSTALL: 'APP_PROMOTION',
    CONVERSIONS: 'WEBSITE_CONVERSIONS',
    CATALOG_SALES: 'CATALOG_SALES',
    PRODUCT_SALES: 'PRODUCT_SALES',
  };
  return map[obj] || 'REACH';
}

// Helper: Map TikTok status
function mapStatus(status: string): string {
  const map: Record<string, string> = {
    CAMPAIGN_STATUS_ENABLE: 'ACTIVE',
    CAMPAIGN_STATUS_DISABLE: 'PAUSED',
    CAMPAIGN_STATUS_DELETE: 'DELETED',
  };
  return map[status] || 'DRAFT';
}
