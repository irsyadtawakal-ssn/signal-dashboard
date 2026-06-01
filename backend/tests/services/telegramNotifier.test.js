import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessage, send } from '../../src/services/telegramNotifier.js';

const sampleBuySignal = {
  recommendation: 'BUY',
  confidence: 0.95,
  summary: 'Strong bullish momentum detected',
  components: {
    priceAction: 'Price breaking above resistance',
    sentiment: 'Highly bullish sentiment',
    twitterBuzz: 'Significant social media activity',
    movingAverage: 'Price above all key moving averages',
    fibonacci: 'Approaching 0.618 resistance level',
  },
  generatedAt: '2026-06-01T14:30:00Z',
};

const sampleSellSignal = {
  recommendation: 'SELL',
  confidence: 0.87,
  summary: 'Weakening momentum and deteriorating sentiment',
  components: {
    priceAction: 'Price failing at resistance',
    sentiment: 'Bearish sentiment increasing',
    twitterBuzz: 'Negative social media sentiment',
    movingAverage: 'Price below 50-day moving average',
    fibonacci: 'Rejection at 0.786 level',
  },
  generatedAt: '2026-06-01T15:45:00Z',
};

const signalWithMissingComponents = {
  recommendation: 'HOLD',
  confidence: 0.65,
  summary: 'Mixed signals, wait for clarity',
  components: {
    priceAction: 'Consolidating near key level',
    sentiment: null,
    twitterBuzz: undefined,
    movingAverage: 'Price near 200-day moving average',
    fibonacci: null,
  },
  generatedAt: '2026-06-01T16:00:00Z',
};

describe('formatMessage', () => {
  it('formats BUY signal with all components and emojis', () => {
    const message = formatMessage(sampleBuySignal);

    // Check for emoji and recommendation
    expect(message).toContain('🟢');
    expect(message).toContain('BUY');

    // Check for confidence percentage
    expect(message).toContain('95%');
    expect(message).toMatch(/Confidence:\s*95%/);

    // Check for summary
    expect(message).toContain(sampleBuySignal.summary);

    // Check for all 5 components
    expect(message).toContain('Price breaking above resistance');
    expect(message).toContain('Highly bullish sentiment');
    expect(message).toContain('Significant social media activity');
    expect(message).toContain('Price above all key moving averages');
    expect(message).toContain('Approaching 0.618 resistance level');

    // Check for timestamp
    expect(message).toContain('Generated:');
    expect(message).toMatch(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*UTC/);

    // Check return type
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });

  it('formats SELL signal with red emoji', () => {
    const message = formatMessage(sampleSellSignal);

    // Check for emoji and recommendation
    expect(message).toContain('🔴');
    expect(message).toContain('SELL');

    // Check for confidence percentage
    expect(message).toContain('87%');
    expect(message).toMatch(/Confidence:\s*87%/);

    // Check for summary
    expect(message).toContain(sampleSellSignal.summary);

    // Check for all 5 components
    expect(message).toContain('Price failing at resistance');
    expect(message).toContain('Bearish sentiment increasing');
    expect(message).toContain('Negative social media sentiment');
    expect(message).toContain('Price below 50-day moving average');
    expect(message).toContain('Rejection at 0.786 level');

    // Check for timestamp
    expect(message).toContain('Generated:');
    expect(message).toMatch(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*UTC/);
  });

  it('handles missing components gracefully and skips empty lines', () => {
    const message = formatMessage(signalWithMissingComponents);

    // Should still have basic structure
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);

    // Check for recommendation
    expect(message).toContain('HOLD');

    // Check for summary
    expect(message).toContain(signalWithMissingComponents.summary);

    // Check that non-empty components are included
    expect(message).toContain('Consolidating near key level');
    expect(message).toContain('Price near 200-day moving average');

    // Check that null/undefined components don't create empty lines
    const lines = message.split('\n');
    const emptyLines = lines.filter((line) => line.trim() === '');
    // Should have no excessive empty lines (max 1-2 for formatting)
    expect(emptyLines.length).toBeLessThanOrEqual(2);

    // Verify timestamp still exists
    expect(message).toContain('Generated:');
  });

  it('returns a complete formatted string ready for Telegram', () => {
    const message = formatMessage(sampleBuySignal);

    // Should be multi-line message
    expect(message.includes('\n')).toBe(true);

    // Should not have any null or undefined strings
    expect(message).not.toContain('null');
    expect(message).not.toContain('undefined');

    // Should be reasonable length (not empty, not excessively long)
    expect(message.length).toBeGreaterThan(50);
    expect(message.length).toBeLessThan(2000);

    // Should have proper structure with multiple sections
    const hasRecommendation = message.includes('BUY') || message.includes('SELL') || message.includes('HOLD');
    const hasConfidence = message.match(/\d+%/);
    const hasSummary = message.length > 100;
    expect(hasRecommendation && hasConfidence && hasSummary).toBe(true);
  });

  it('handles null/undefined components object gracefully', () => {
    const signalWithoutComponents = {
      recommendation: 'BUY',
      confidence: 0.75,
      summary: 'Basic signal without analysis components',
      components: null,
      generatedAt: '2026-06-01T12:00:00Z',
    };

    const message = formatMessage(signalWithoutComponents);

    // Should still format successfully
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);

    // Should include basic required fields
    expect(message).toContain('BUY');
    expect(message).toContain('75%');
    expect(message).toContain('Basic signal without analysis components');

    // Should include timestamp even without components
    expect(message).toContain('Generated:');
    expect(message).not.toContain('Analysis:');
  });
});

// Mock the node-telegram-bot-api module
const mockSendMessage = vi.fn();
vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}));

describe('send', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue({ message_id: 12345 });
  });

  it('sends formatted message to Telegram API for valid chatId', async () => {
    const chatId = '123456789';
    const config = { botToken: 'test-bot-token' };

    const result = await send(chatId, sampleBuySignal, config);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(mockSendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('BUY')
    );
  });

  it('skips notification if no chat ID', async () => {
    const config = { botToken: 'test-bot-token' };

    // Test with null chatId
    let result = await send(null, sampleBuySignal, config);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_chat_id');
    expect(mockSendMessage).not.toHaveBeenCalled();

    // Test with undefined chatId
    result = await send(undefined, sampleBuySignal, config);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_chat_id');
  });

  it('returns error if botToken missing in config', async () => {
    const chatId = '123456789';
    const config = {}; // No botToken

    const result = await send(chatId, sampleBuySignal, config);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('botToken');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('handles Telegram API errors gracefully', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const chatId = '123456789';
    const config = { botToken: 'test-bot-token' };

    const result = await send(chatId, sampleBuySignal, config);

    expect(result.success).toBe(false);
    expect(result.error).toBe('API rate limit exceeded');
    expect(result).not.toHaveProperty('skipped');
  });

  it('calls bot.sendMessage with correct parameters', async () => {
    const chatId = '123456789';
    const config = { botToken: 'test-bot-token' };

    await send(chatId, sampleBuySignal, config);

    // Verify sendMessage was called with chatId and formatted message
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [callChatId, callMessage] = mockSendMessage.mock.calls[0];
    expect(callChatId).toBe(chatId);
    expect(typeof callMessage).toBe('string');
    expect(callMessage).toContain('🟢'); // BUY emoji
    expect(callMessage).toContain('Confidence:');
  });
});
