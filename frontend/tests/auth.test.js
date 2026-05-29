import { describe, it, expect, vi } from 'vitest';
import { createAuth } from '../js/auth.js';

function fakeClient({ session = null } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      onAuthStateChange: vi.fn(),
    },
  };
}
const URL = 'https://x.supabase.co';

describe('createAuth', () => {
  it('is not configured with placeholder config; login throws and getToken is null', async () => {
    const auth = createAuth({ createClient: vi.fn(), supabaseUrl: 'YOUR_SUPABASE_URL', anonKey: 'YOUR_ANON_KEY' });
    expect(auth.isConfigured).toBe(false);
    await expect(auth.login('a@b.c', 'pw')).rejects.toThrow('Supabase not configured');
    expect(await auth.getToken()).toBeNull();
  });

  it('builds a client and logs in via signInWithPassword', async () => {
    const client = fakeClient();
    const createClient = vi.fn().mockReturnValue(client);
    const auth = createAuth({ createClient, supabaseUrl: URL, anonKey: 'anon' });
    expect(auth.isConfigured).toBe(true);
    expect(createClient).toHaveBeenCalledWith(URL, 'anon');
    await auth.login('a@b.c', 'pw');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
  });

  it('login throws when supabase returns an error', async () => {
    const client = fakeClient();
    client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('bad creds') });
    const auth = createAuth({ createClient: () => client, supabaseUrl: URL, anonKey: 'anon' });
    await expect(auth.login('a@b.c', 'x')).rejects.toThrow('bad creds');
  });

  it('getToken returns the session access_token, or null when no session', async () => {
    const withSession = createAuth({ createClient: () => fakeClient({ session: { access_token: 'abc' } }), supabaseUrl: URL, anonKey: 'anon' });
    expect(await withSession.getToken()).toBe('abc');
    const noSession = createAuth({ createClient: () => fakeClient({ session: null }), supabaseUrl: URL, anonKey: 'anon' });
    expect(await noSession.getToken()).toBeNull();
  });

  it('logout calls signOut', async () => {
    const client = fakeClient();
    const auth = createAuth({ createClient: () => client, supabaseUrl: URL, anonKey: 'anon' });
    await auth.logout();
    expect(client.auth.signOut).toHaveBeenCalled();
  });
});
