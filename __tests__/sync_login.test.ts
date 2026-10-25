jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x', getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a) }));

const mockSignUpWithGoogle = jest.fn();
jest.mock('react-native-credentials-manager', () => ({ signUpWithGoogle: (...a: unknown[]) => mockSignUpWithGoogle(...a) }));

const mockSignInWithIdToken = jest.fn();
const mockSignInWithOAuth = jest.fn();
jest.mock('../src/sync/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: () => ({
    auth: {
      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a),
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

import { login } from '../src/sync/account';

const sha256 = (text: string): string => require('crypto').createHash('sha256').update(text).digest('hex');

const session = { user: { id: 'u1' } };

beforeAll(() => { process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com'; });
beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithIdToken.mockResolvedValue({ data: { session }, error: null });
  mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://google/login' }, error: null });
  mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
});

describe('Login nativo do Google', () => {
  it('Google recebe o hash do nonce; Supabase recebe o valor original', async () => {
    mockSignUpWithGoogle.mockResolvedValue({ type: 'google-signin', id: 'x', idToken: 'token-do-google' });
    await expect(login()).resolves.toBe(true);

    const googleArgs = mockSignUpWithGoogle.mock.calls[0][0];
    const supabaseArgs = mockSignInWithIdToken.mock.calls[0][0];
    expect(googleArgs.serverClientId).toBe('web-client.apps.googleusercontent.com');
    expect(supabaseArgs).toMatchObject({ provider: 'google', token: 'token-do-google' });
    expect(googleArgs.nonce).toBe(sha256(supabaseArgs.nonce));
    expect(supabaseArgs.nonce).not.toBe(googleArgs.nonce);
    expect(mockOpenAuthSession).not.toHaveBeenCalled(); // não abriu o navegador
  });

  it('cada login usa um nonce novo', async () => {
    mockSignUpWithGoogle.mockResolvedValue({ idToken: 't' });
    await login();
    await login();
    const [a, b] = mockSignInWithIdToken.mock.calls.map(c => c[0].nonce);
    expect(a).not.toBe(b);
  });

  it('cancelar a janela do Android não abre o navegador', async () => {
    mockSignUpWithGoogle.mockRejectedValue(new Error('activity is cancelled by the user.'));
    await expect(login()).resolves.toBe(false);
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('erro no login nativo cai no login pelo navegador', async () => {
    mockSignUpWithGoogle.mockRejectedValue(new Error('No credentials available'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(login()).resolves.toBe(false); // navegador simulado: pessoa cancelou lá
    warn.mockRestore();
    expect(mockSignInWithOAuth).toHaveBeenCalled();
    expect(mockOpenAuthSession).toHaveBeenCalled();
  });

  it('Supabase recusando o token não passa como login', async () => {
    mockSignUpWithGoogle.mockResolvedValue({ idToken: 't' });
    mockSignInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: 'Nonces mismatch' } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(login()).resolves.toBe(false); // caiu no navegador, que foi cancelado
    warn.mockRestore();
    expect(mockOpenAuthSession).toHaveBeenCalled();
  });
});
