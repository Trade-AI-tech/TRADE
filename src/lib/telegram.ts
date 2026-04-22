import type { Signal } from '@/types';

/**
 * Telegram notification service
 * ส่งสัญญาณเทรดผ่าน Telegram Bot
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Format a signal as a Telegram message
 */
export function formatSignalMessage(signal: Signal): string {
  const emoji = {
    BUY: '🟢',
    SELL: '🔴',
    HOLD: '🟡',
    CLOSE: '⚪',
  }[signal.action];

  const strengthEmoji = {
    weak: '⭐',
    moderate: '⭐⭐',
    strong: '⭐⭐⭐',
    very_strong: '⭐⭐⭐⭐',
  }[signal.strength];

  const lines = [
    `${emoji} *${signal.action} SIGNAL* ${strengthEmoji}`,
    ``,
    `📊 *${escapeMarkdown(signal.symbol)}* \\- ${escapeMarkdown(signal.name)}`,
    `💹 Market: ${signal.market}`,
    `⏰ Timeframe: ${signal.timeframe}`,
    `🎯 Confidence: *${signal.confidence}%*`,
    ``,
    `💵 *Entry:* ${signal.entry_price}`,
    `🛑 *Stop Loss:* ${signal.stop_loss}`,
    `🎯 *Take Profit:* ${signal.take_profit}`,
    ``,
    `📝 *Reasons:*`,
    ...signal.reasons.slice(0, 4).map(r => `• ${escapeMarkdown(r.label)}: ${escapeMarkdown(r.detail)}`),
  ];

  return lines.join('\n');
}

/**
 * Send message to Telegram
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Missing bot token or chat ID' };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
      }
    );

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || 'Unknown error' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send signal alert
 */
export async function sendSignalAlert(
  config: TelegramConfig,
  signal: Signal
): Promise<{ success: boolean; error?: string }> {
  const message = formatSignalMessage(signal);
  return sendTelegramMessage(config, message);
}

/**
 * Test Telegram connection
 */
export async function testTelegramConnection(
  config: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  const message = '✅ *ทดสอบการเชื่อมต่อ Trading AI Bot*\n\nการแจ้งเตือนพร้อมใช้งานแล้ว';
  return sendTelegramMessage(config, message);
}
