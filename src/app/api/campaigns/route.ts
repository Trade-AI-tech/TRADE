import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isDemoMode } from '@/lib/supabase';
import { DEMO_CAMPAIGNS } from '@/lib/demo-data';

export async function GET(request: NextRequest) {
  try {
    if (isDemoMode()) {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      let campaigns = DEMO_CAMPAIGNS;
      if (status) campaigns = campaigns.filter(c => c.status === status);
      return NextResponse.json({ campaigns });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ campaigns: DEMO_CAMPAIGNS });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('user_id');

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ campaigns: data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch campaigns', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isDemoMode()) {
      const body = await request.json();
      const newCampaign = {
        id: `demo-${Date.now()}`,
        user_id: 'demo',
        tiktok_account_id: null,
        tiktok_campaign_id: null,
        status: 'DRAFT' as const,
        spent: 0,
        tags: [],
        meta: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body,
      };
      return NextResponse.json({ campaign: newCampaign }, { status: 201 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();

    const { data, error } = await supabase
      .from('campaigns')
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create campaign', details: String(error) },
      { status: 500 }
    );
  }
}
