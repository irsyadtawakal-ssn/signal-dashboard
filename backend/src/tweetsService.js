async function buildTweets({ fetchFn, classifyFn }) {
  const tweets = await fetchFn();
  return classifyFn(tweets);
}

module.exports = { buildTweets };
