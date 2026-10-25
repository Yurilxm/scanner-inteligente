import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Valores PÚBLICOS (vêm do .env.local / variáveis do EAS). A proteção dos dados é o login,
// as regras de acesso do Supabase e a criptografia ponta a ponta.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return !!url && !!publishableKey;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  if (!url || !publishableKey) throw new Error('Supabase não configurado (EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY).');
  client = createClient(url, publishableKey, {
    auth: {
      storage: localStorage,      // sessão salva no SQLite do app (persiste entre aberturas)
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,  // no celular não há URL de página para ler a sessão
      flowType: 'pkce',           // o token não trafega na URL de retorno do login
    },
  });
  // Renova o token só com o app em primeiro plano
  AppState.addEventListener('change', state => {
    if (state === 'active') client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  });
  return client;
}
