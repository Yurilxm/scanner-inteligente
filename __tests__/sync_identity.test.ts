// Chaveiro do Android em memória
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
    __store: store,
  };
});

// Gerador seguro do Node no lugar do expo-crypto
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)),
}));

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));

// Tabela user_keys do servidor em memória
jest.mock('../src/sync/supabase', () => {
  const userKeys = new Map<string, string>();
  const api = {
    from: () => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({
          maybeSingle: async () => ({ data: userKeys.has(userId) ? { public_key: userKeys.get(userId) } : null, error: null }),
        }),
      }),
      insert: async (row: { user_id: string; public_key: string }) => {
        if (userKeys.has(row.user_id)) return { error: { message: 'duplicate key' } };
        userKeys.set(row.user_id, row.public_key);
        return { error: null };
      },
    }),
  };
  return { supabase: () => api, __userKeys: userKeys };
});

import { createRecoveryPhrase } from '../src/sync/crypto';
import {
  forgetLocalIdentity, getIdentityState, getStoredPhrase, loadIdentity, registerIdentity, restoreIdentity,
} from '../src/sync/identity';
import { parseAuthRedirect } from '../src/sync/auth';

const secureStore = (require('expo-secure-store') as any).__store as Map<string, string>;

describe('Identidade ligada à conta', () => {
  const user = 'user-1';
  let phrase = '';

  it('conta nova pede para criar a frase', async () => {
    expect(await getIdentityState(user)).toBe('needs-setup');
  });

  it('registrar envia só a chave pública e guarda a frase no chaveiro', async () => {
    require('../src/sync/random'); // como o app faz
    phrase = createRecoveryPhrase();
    await registerIdentity(user, phrase);
    const userKeys = (require('../src/sync/supabase') as any).__userKeys as Map<string, string>;
    expect(userKeys.get(user)).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(userKeys.get(user)).not.toContain(phrase.split(' ')[0]);
    expect(await getStoredPhrase(user)).toBe(phrase);
    expect(await getIdentityState(user)).toBe('ready');
    expect((await loadIdentity(user))!.publicKey).toHaveLength(32);
  });

  it('celular novo (sem a frase) pede para restaurar', async () => {
    secureStore.clear();
    expect(await getIdentityState(user)).toBe('needs-restore');
  });

  it('frase de outra pessoa ou inválida não é aceita', async () => {
    await expect(restoreIdentity(user, createRecoveryPhrase())).rejects.toThrow('não pertence a esta conta');
    await expect(restoreIdentity(user, 'palavras aleatorias que nao formam frase')).rejects.toThrow('Frase inválida');
    expect(await getIdentityState(user)).toBe('needs-restore');
  });

  it('a frase certa, mesmo digitada com maiúsculas e espaços, restaura', async () => {
    await restoreIdentity(user, `  ${phrase.toUpperCase().replace(/ /g, '  ')} `);
    expect(await getIdentityState(user)).toBe('ready');
  });

  it('sair remove a frase deste aparelho', async () => {
    await forgetLocalIdentity(user);
    expect(await getStoredPhrase(user)).toBeNull();
    expect(await getIdentityState(user)).toBe('needs-restore');
  });

  it('não registra duas vezes a mesma conta', async () => {
    await expect(registerIdentity(user, createRecoveryPhrase())).rejects.toThrow('Não foi possível registrar');
  });
});

describe('Retorno do login', () => {
  it('lê o código do PKCE', () => {
    expect(parseAuthRedirect('scannerinteligente://auth-callback?code=abc-123')).toEqual({ code: 'abc-123', error: null });
  });

  it('lê o erro devolvido pelo Google/Supabase', () => {
    expect(parseAuthRedirect('scannerinteligente://auth-callback?error=access_denied&error_description=Usu%C3%A1rio+cancelou'))
      .toEqual({ code: null, error: 'Usuário cancelou' });
  });

  it('URL sem parâmetros', () => {
    expect(parseAuthRedirect('scannerinteligente://auth-callback')).toEqual({ code: null, error: null });
  });
});

describe('Conclusão do login pelos dois caminhos de volta', () => {
  it('o mesmo código é trocado uma vez só, mesmo chegando duas vezes ao mesmo tempo', async () => {
    jest.resetModules();
    const exchange = jest.fn(async (_code: string) => ({ data: { session: { user: { id: 'u' } } }, error: null }));
    let session: unknown = null;
    jest.doMock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
    jest.doMock('../src/sync/supabase', () => ({
      supabase: () => ({
        auth: {
          exchangeCodeForSession: async (code: string) => { const r = await exchange(code); session = r.data.session; return r; },
          getSession: async () => ({ data: { session } }),
        },
      }),
    }));
    const { completeLogin } = require('../src/sync/auth');
    const [a, b] = await Promise.all([completeLogin('codigo-1'), completeLogin('codigo-1')]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('se o outro caminho já trocou o código, devolve a sessão em vez de dar erro', async () => {
    jest.resetModules();
    let calls = 0;
    jest.doMock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
    jest.doMock('../src/sync/supabase', () => ({
      supabase: () => ({
        auth: {
          exchangeCodeForSession: async () => ({ data: { session: null }, error: { message: 'code already used' } }),
          getSession: async () => ({ data: { session: calls++ === 0 ? null : { user: { id: 'u' } } } }),
        },
      }),
    }));
    const { completeLogin } = require('../src/sync/auth');
    await expect(completeLogin('codigo-2')).resolves.toEqual({ user: { id: 'u' } });
  });
});
