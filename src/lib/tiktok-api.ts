/**
 * TikTok Marketing API v1.3 Wrapper
 * Documentation: https://business-api.tiktok.com/marketing_api/docs
 */

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokApiConfig {
  accessToken: string;
  advertiserId: string;
}

interface TikTokApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  request_id: string;
}

class TikTokApi {
  private config: TikTokApiConfig;

  constructor(config: TikTokApiConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, unknown>
  ): Promise<TikTokApiResponse<T>> {
    const url = `${TIKTOK_API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      'Access-Token': this.config.accessToken,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (method === 'GET' && body) {
      const params = new URLSearchParams();
      Object.entries(body).forEach(([k, v]) => {
        params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      const response = await fetch(`${url}?${params}`, options);
      return response.json();
    }
    if (body) {
      options.body = JSON.stringify({ ...body, advertiser_id: this.config.advertiserId });
    }
    const response = await fetch(url, options);
    return response.json();
  }

  // ============================================
  // Campaign Management
  // ============================================

  async getCampaigns(filters?: {
    status?: string;
    page?: number;
    page_size?: number;
  }) {
    return this.request<{
      list: Array<{
        campaign_id: string;
        campaign_name: string;
        objective_type: string;
        status: string;
        budget: number;
        budget_mode: string;
        create_time: string;
        modify_time: string;
      }>;
      page_info: { total_number: number; page: number; page_size: number };
    }>('/campaign/get/', 'GET', {
      advertiser_id: this.config.advertiserId,
      filtering: filters?.status ? JSON.stringify({ status: filters.status }) : undefined,
      page: filters?.page || 1,
      page_size: filters?.page_size || 100,
    });
  }

  async createCampaign(data: {
    campaign_name: string;
    objective_type: string;
    budget: number;
    budget_mode: string;
  }) {
    return this.request('/campaign/create/', 'POST', data);
  }

  async updateCampaign(campaignId: string, data: Record<string, unknown>) {
    return this.request('/campaign/update/', 'POST', {
      campaign_id: campaignId,
      ...data,
    });
  }

  async updateCampaignStatus(campaignIds: string[], status: string) {
    return this.request('/campaign/status/update/', 'POST', {
      campaign_ids: campaignIds,
      opt_status: status,
    });
  }

  // ============================================
  // Ad Group Management
  // ============================================

  async getAdGroups(campaignIds?: string[]) {
    return this.request('/adgroup/get/', 'GET', {
      advertiser_id: this.config.advertiserId,
      filtering: campaignIds
        ? JSON.stringify({ campaign_ids: campaignIds })
        : undefined,
      page_size: 100,
    });
  }

  // ============================================
  // Ad Management
  // ============================================

  async getAds(adGroupIds?: string[]) {
    return this.request('/ad/get/', 'GET', {
      advertiser_id: this.config.advertiserId,
      filtering: adGroupIds
        ? JSON.stringify({ adgroup_ids: adGroupIds })
        : undefined,
      page_size: 100,
    });
  }

  // ============================================
  // Reporting & Metrics
  // ============================================

  async getReport(params: {
    report_type: 'BASIC' | 'AUDIENCE' | 'PLAYBACK';
    dimensions: string[];
    data_level: 'AUCTION_CAMPAIGN' | 'AUCTION_ADGROUP' | 'AUCTION_AD';
    start_date: string;
    end_date: string;
    metrics: string[];
    filters?: Record<string, unknown>;
    page?: number;
    page_size?: number;
  }) {
    return this.request<{
      list: Array<{
        dimensions: Record<string, string>;
        metrics: Record<string, number | string>;
      }>;
      page_info: { total_number: number; page: number; page_size: number };
    }>('/report/integrated/get/', 'GET', {
      advertiser_id: this.config.advertiserId,
      ...params,
    });
  }

  async getCampaignMetrics(
    campaignIds: string[],
    startDate: string,
    endDate: string
  ) {
    return this.getReport({
      report_type: 'BASIC',
      dimensions: ['campaign_id', 'stat_time_day'],
      data_level: 'AUCTION_CAMPAIGN',
      start_date: startDate,
      end_date: endDate,
      metrics: [
        'spend', 'impressions', 'clicks', 'reach',
        'ctr', 'cpc', 'cpm', 'frequency',
        'conversion', 'cost_per_conversion', 'conversion_rate',
        'total_complete_payment_rate',
        'video_play_actions', 'video_watched_2s', 'video_watched_6s',
        'average_video_play', 'average_video_play_per_user',
        'likes', 'comments', 'shares', 'follows', 'profile_visits_rate',
      ],
      filters: { campaign_ids: campaignIds },
    });
  }

  // ============================================
  // Audience
  // ============================================

  async getAudienceInsights(adGroupId: string) {
    return this.request('/audience/insights/', 'GET', {
      advertiser_id: this.config.advertiserId,
      adgroup_id: adGroupId,
    });
  }
}

// Factory function
export function createTikTokClient(
  accessToken?: string,
  advertiserId?: string
): TikTokApi {
  return new TikTokApi({
    accessToken: accessToken || process.env.TIKTOK_ACCESS_TOKEN!,
    advertiserId: advertiserId || process.env.TIKTOK_ADVERTISER_ID!,
  });
}

export type { TikTokApi, TikTokApiConfig, TikTokApiResponse };
