import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './random';
import { randomToken } from './crypto';
import { sha256Hex } from '../utils/sha256';

// Precisa estar cadastrado em Authentication > URL Configuration > Redirect URLs no Supabase
export const AUTH_REDIRECT = 'scannerinteligente://auth-callback';

WebBrowser.maybeCompleteAuthSession();

// Lê ?code=... (PKCE) ou o erro devolvido pelo provedor na URL de retorno
export function parseAuthRedirect(url: string): { code: string | null; error: string | null } {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const params = new Map(query.split('&').filter(Boolean).map(pair => {
    const [k, v = ''] = pair.split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))] as const;
  }));
  return { code: params.get('code') ?? null, error: params.get('error_description') ?? params.get('error') ?? null };
}

export class LoginCancelled extends Error {
  constructor() {
    super('Login cancelado.');
  }
}

// Login nativo: janela do próprio Android ("Continuar no Control"), sem mostrar o endereço do
// servidor. Usa o Credential Manager. O Google recebe o hash do nonce e o Supabase o valor
// original: um token interceptado não serve para outro login.
export async function signInWithGoogleNative(): Promise<Session> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw new Error('Login nativo não configurado (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');

  // Carregada só aqui: num APK sem o módulo nativo, o require falha e quem chamou usa o navegador
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { signUpWithGoogle } = require('react-native-credentials-manager') as typeof import('react-native-credentials-manager');
  const rawNonce = randomToken();
  let idToken: string;
  try {
    const credential = await signUpWithGoogle({
      serverClientId: webClientId,
      nonce: sha256Hex(rawNonce),
      autoSelectEnabled: false,
      filterByAuthorizedAccounts: false,
    });
    idToken = credential.idToken;
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) throw new LoginCancelled();
    throw e;
  }

  const { data, error } = await supabase().auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
  if (error || !data.session) throw new Error(error?.message ?? 'O login não devolveu a sessão.');
  return data.session;
}

// Abre a escolha de conta do Google numa aba segura e volta para o app já logado.
// Retorna null se a pessoa cancelou. Usado quando o login nativo não está disponível.
export async function signInWithGoogle(): Promise<Session | null> {
  const { data, error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) throw new Error(error?.message ?? 'Não foi possível iniciar o login.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== 'success') return null;

  const { code, error: providerError } = parseAuthRedirect(result.url);
  if (providerError) throw new Error(providerError);
  if (!code) throw new Error('O login não devolveu o código de acesso.');
  return completeLogin(code);
}

// No Android, a volta do Google chega por dois caminhos: a aba do navegador (acima) e o link
// scannerinteligente://auth-callback, que reabre o app na tela auth-callback. Os dois trazem o
// mesmo código, que só pode ser trocado uma vez: quem chegar depois reaproveita a mesma troca.
const exchanges = new Map<string, Promise<Session | null>>();

export function completeLogin(code: string): Promise<Session | null> {
  let pending = exchanges.get(code);
  if (!pending) {
    pending = (async () => {
      const existing = await currentSession();
      if (existing) return existing;
      const exchanged = await supabase().auth.exchangeCodeForSession(code);
      if (exchanged.error) {
        // O outro caminho pode ter trocado o código um instante antes
        const after = await currentSession();
        if (after) return after;
        throw new Error(exchanged.error.message);
      }
      return exchanged.data.session;
    })();
    exchanges.set(code, pending);
  }
  return pending;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase().auth.getSession();
  return data.session;
}
