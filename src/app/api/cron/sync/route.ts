import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isDemoMode } from '@/lib/supabase';

// Vercel Cron: sync TikTok campaigns every 15 minutes
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({ message: 'Demo mode - skipping sync' });
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Fetch all active TikTok accounts
    const { data: accounts, error } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    let synced = 0;

    for (const account of accounts || []) {
      try {
        const { createTikTokClient } = await import('@/lib/tiktok-api');
        const api = createTikTokClient(account.access_token, account.advertiser_id);

        // Sync campaigns
        const response = await api.getCampaigns();
        const campaigns = response?.data?.list || [];

        for (const campaign of campaigns) {
          await supabase.from('campaigns').upsert({
            user_id: account.user_id,
            tiktok_account_id: account.id,
            tiktok_campaign_id: campaign.campaign_id,
            name: campaign.campaign_name,
            objective: campaign.objective_type,
            status: campaign.status === 'CAMPAIGN_STATUS_ENABLE' ? 'ACTIVE' : 'PAUSED',
            budget_mode: campaign.budget_mode,
            budget: campaign.budget,
          }, { onConflict: 'tiktok_campaign_id' });
        }

        // Update last synced
        await supabase
          .from('tiktok_accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', account.id);

        synced++;
      } catch (err) {
        console.error(`Sync failed for account ${account.id}:`, err);
      }
    }

    return NextResponse.json({
      message: `Synced ${synced} accounts`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
