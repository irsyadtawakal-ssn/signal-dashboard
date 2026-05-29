const VALID = new Set(['Bullish', 'Bearish', 'Whale']);

const SYSTEM_PROMPT = [
  'You classify crypto tweets about the token Octra (OCT) for an internal trading dashboard.',
  'For each tweet, assign exactly one label:',
  '- "Bullish": optimistic / positive price expectation.',
  '- "Bearish": pessimistic / negative price expectation.',
  '- "Whale": signals large-holder or big-money activity (large buys/sells, wallet moves).',
  'Respond with ONLY a JSON array, no prose, in the form:',
  '[{"id":"<tweetId>","sentiment":"Bullish|Bearish|Whale"}]',
].join('\n');

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  return JSON.parse(text.slice(start, end + 1));
}

async function classifyTweets({ tweets, complete, model }) {
  if (!tweets || tweets.length === 0) return [];

  const labels = {};
  try {
    const user = JSON.stringify(tweets.map((t) => ({ id: t.id, text: t.text })));
    const reply = await complete({ system: SYSTEM_PROMPT, user, model });
    const parsed = extractJsonArray(reply);
    for (const item of parsed) {
      if (item && VALID.has(item.sentiment)) labels[String(item.id)] = item.sentiment;
    }
  } catch (err) {
    console.error('sentiment classification failed:', err.message);
  }

  return tweets.map((t) => ({ ...t, sentiment: labels[t.id] || 'Unrated' }));
}

module.exports = { classifyTweets, SYSTEM_PROMPT };
