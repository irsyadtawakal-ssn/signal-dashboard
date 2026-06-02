class AuthError extends Error {
  constructor(message = 'unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

function createApiClient({ baseUrl, getToken, fetchFn = fetch }) {
  async function call(path, options = {}) {
    const token = await getToken();
    const res = await fetchFn(baseUrl + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) throw new AuthError();
    if (res.status === 503) return { pending: true };
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return res.json();
  }

  return {
    getPrice: () => call('/api/price'),
    getNews: () => call('/api/news'),
    getTweets: () => call('/api/tweets'),
    analyze: ({ force = false } = {}) =>
      call('/api/analyze', { method: 'POST', body: JSON.stringify({ force }) }),
    adminInvite: ({ email, password }) =>
      call('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email, password }) }),
    getTelegramStatus: () => call('/api/telegram/status'),
    saveTelegramChatId: (chatId, name) =>
      call('/api/telegram/chatid', { method: 'PUT', body: JSON.stringify({ chatId, name }) }),
  };
}

export { createApiClient, AuthError };
