function isPlaceholder(v) {
  return !v || v.startsWith('YOUR_');
}

function createAuth({ createClient, supabaseUrl, anonKey }) {
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey)) {
    return {
      isConfigured: false,
      login: async () => { throw new Error('Supabase not configured'); },
      logout: async () => {},
      getToken: async () => null,
      getUser: async () => null,
      onChange: () => {},
    };
  }

  const client = createClient(supabaseUrl, anonKey);

  return {
    isConfigured: true,
    async login(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    logout: () => client.auth.signOut(),
    async getToken() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
    async getUser() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.user : null;
    },
    onChange(cb) {
      client.auth.onAuthStateChange((_event, session) => cb(session));
    },
  };
}

export { createAuth };
