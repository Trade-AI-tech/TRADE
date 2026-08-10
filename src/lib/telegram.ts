import type { Signal } from '@/types';

/**
 * Telegram notification service
 * ส่งสัญญาณเทรดผ่าน Telegram Bot
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * MarkdownV2 สงวนอักขระเหล่านี้ไว้ ต้อง escape ทุกตัว
 * รวมถึง "." ในราคา เช่น 2650.50 — ถ้าไม่ escape Telegram จะตอบ 400
 */
const RESERVED = /([_*[\]()~`>#+\-=|{}.!\\])/g;

function esc(value: string | number): string {
  return String(value).replace(RESERVED, '\\$1');
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
    `${emoji} *${esc(signal.action)} SIGNAL* ${strengthEmoji}`,
    ``,
    `📊 *${esc(signal.symbol)}* \\- ${esc(signal.name)}`,
    `💹 Market: ${esc(signal.market)}`,
    `⏰ Timeframe: ${esc(signal.timeframe)}`,
    `🎯 Confidence: *${esc(signal.confidence)}%*`,
    ``,
    `💵 *Entry:* ${esc(signal.entry_price)}`,
    `🛑 *Stop Loss:* ${esc(signal.stop_loss)}`,
    `🎯 *Take Profit:* ${esc(signal.take_profit)}`,
    ``,
    `📝 *Reasons:*`,
    ...signal.reasons.slice(0, 4).map(r => `• ${esc(r.label)}: ${esc(r.detail)}`),
  ];

  return lines.join('\n');
}

/**
 * Send message to Telegram
 * ถ้า MarkdownV2 parse ไม่ผ่าน จะส่งซ้ำเป็นข้อความธรรมดาแทนที่จะเงียบหาย
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Missing bot token or chat ID' };
  }

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return res.json();
  };

  try {
    const base = { chat_id: config.chatId, disable_web_page_preview: true };
    const data = await post({ ...base, text: message, parse_mode: 'MarkdownV2' });
    if (data.ok) return { success: true };

    // fallback: ถอด markdown ออกแล้วส่งเป็น plain text
    const plain = message.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1').replace(/\*/g, '');
    const retry = await post({ ...base, text: plain });
    if (retry.ok) return { success: true };

    return { success: false, error: retry.description || data.description || 'Unknown error' };
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
