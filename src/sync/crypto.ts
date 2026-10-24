// Criptografia ponta a ponta da sincronização.
// Só primitivas auditadas (@noble / @scure); nada de criptografia própria aqui.
//
// Chaves:
// - Identidade do usuário: par X25519 derivado da frase de recuperação (12 palavras).
//   Mesmo frase => mesmas chaves, então um celular novo recupera tudo só com a frase.
// - Cofre (perfil/lista): chave simétrica aleatória de 32 bytes.
//   Ela é "embrulhada" para cada membro com a chave pública dele (X25519 + HKDF + XChaCha20-Poly1305).
// - Dados: XChaCha20-Poly1305 com a chave do cofre e um contexto (AAD) que amarra o
//   texto cifrado ao registro dele, para o servidor não conseguir trocar registros de lugar.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/portuguese.js';
import { base64, base64urlnopad } from '@scure/base';

const VERSION = 1;
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---- Fonte de aleatoriedade ----
// O Hermes não tem crypto.getRandomValues; o app injeta o gerador seguro do sistema (expo-crypto).
export type RandomSource = (byteCount: number) => Uint8Array;

let randomSource: RandomSource | null = null;

export function setRandomSource(source: RandomSource): void {
  randomSource = source;
}

function randomBytes(count: number): Uint8Array {
  if (!randomSource) throw new Error('Fonte de aleatoriedade segura não configurada.');
  const bytes = randomSource(count);
  if (bytes.length !== count) throw new Error('Fonte de aleatoriedade devolveu tamanho errado.');
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---- Frase de recuperação e identidade ----

export function normalizePhrase(phrase: string): string {
  return phrase.normalize('NFKD').toLowerCase().trim().split(/\s+/).join(' ');
}

export function createRecoveryPhrase(): string {
  return entropyToMnemonic(randomBytes(16), wordlist); // 128 bits => 12 palavras
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

export type Identity = { publicKey: Uint8Array; privateKey: Uint8Array };

export function identityFromPhrase(phrase: string): Identity {
  const normalized = normalizePhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) throw new Error('Frase de recuperação inválida.');
  const entropy = mnemonicToEntropy(normalized, wordlist);
  const privateKey = hkdf(sha256, entropy, encoder.encode('control.identity'), encoder.encode('x25519-v1'), KEY_BYTES);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

// ---- Cifra simétrica (dados do cofre) ----

// Valor aleatório de uso único (ex.: nonce do login com Google), seguro para URL
export function randomToken(): string {
  return base64urlnopad.encode(randomBytes(KEY_BYTES));
}

export function newVaultKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

// Formato: [versão 1 byte][nonce 24 bytes][texto cifrado + tag 16 bytes]
export function seal(key: Uint8Array, plaintext: Uint8Array, context: string): Uint8Array {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce, encoder.encode(context)).encrypt(plaintext);
  return concat(Uint8Array.of(VERSION), nonce, ciphertext);
}

// Lança erro se a chave, o contexto ou qualquer byte estiverem errados
export function open(key: Uint8Array, sealed: Uint8Array, context: string): Uint8Array {
  if (sealed.length < 1 + NONCE_BYTES + 16 || sealed[0] !== VERSION) throw new Error('Dado cifrado em formato desconhecido.');
  const nonce = sealed.subarray(1, 1 + NONCE_BYTES);
  return xchacha20poly1305(key, nonce, encoder.encode(context)).decrypt(sealed.subarray(1 + NONCE_BYTES));
}

export function sealJson(key: Uint8Array, value: unknown, context: string): string {
  return base64.encode(seal(key, encoder.encode(JSON.stringify(value)), context));
}

export function openJson<T>(key: Uint8Array, sealedBase64: string, context: string): T {
  return JSON.parse(decoder.decode(open(key, base64.decode(sealedBase64), context))) as T;
}

// ---- Embrulhar a chave do cofre para um membro ----

function wrappingKey(shared: Uint8Array, ephemeralPublic: Uint8Array, recipientPublic: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concat(ephemeralPublic, recipientPublic), encoder.encode('control.wrap-v1'), KEY_BYTES);
}

// Formato: [chave pública efêmera 32 bytes][seal(...)]
export function wrapKey(recipientPublicKey: Uint8Array, key: Uint8Array, context: string): string {
  const ephemeralPrivate = randomBytes(KEY_BYTES);
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const shared = x25519.getSharedSecret(ephemeralPrivate, recipientPublicKey);
  const sealed = seal(wrappingKey(shared, ephemeralPublic, recipientPublicKey), key, context);
  return base64.encode(concat(ephemeralPublic, sealed));
}

export function unwrapKey(identity: Identity, wrappedBase64: string, context: string): Uint8Array {
  const wrapped = base64.decode(wrappedBase64);
  const ephemeralPublic = wrapped.subarray(0, KEY_BYTES);
  const shared = x25519.getSharedSecret(identity.privateKey, ephemeralPublic);
  return open(wrappingKey(shared, ephemeralPublic, identity.publicKey), wrapped.subarray(KEY_BYTES), context);
}

// ---- Convite por QR code / link ----
// O QR leva o id do convite e um segredo de 32 bytes. Do segredo saem duas coisas independentes:
// o token que o servidor confere (ele guarda só o SHA-256) e a chave que cifra a chave do cofre.
// Conhecer o hash do token não ajuda a achar a chave.

const INVITE_SCHEME = 'scannerinteligente://convite';

export function newInviteSecret(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

export function inviteKeys(secret: Uint8Array): { authToken: string; key: Uint8Array } {
  const salt = encoder.encode('control.invite-v1');
  return {
    authToken: base64.encode(hkdf(sha256, secret, salt, encoder.encode('auth'), KEY_BYTES)),
    key: hkdf(sha256, secret, salt, encoder.encode('key'), KEY_BYTES),
  };
}

// Mesmo cálculo que o servidor faz para conferir o token
export function inviteTokenHash(authToken: string): string {
  return Array.from(sha256(encoder.encode(authToken)), b => b.toString(16).padStart(2, '0')).join('');
}

export function inviteLink(inviteId: string, secret: Uint8Array): string {
  return `${INVITE_SCHEME}?i=${encodeURIComponent(inviteId)}&s=${base64urlnopad.encode(secret)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aceita o link do QR (ou colado de uma mensagem); null se não for um convite válido do Control
export function parseInviteLink(text: string): { inviteId: string; secret: Uint8Array } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${INVITE_SCHEME}?`)) return null;
  const params = new Map(
    trimmed.slice(INVITE_SCHEME.length + 1).split('&').map(pair => {
      const [k, v = ''] = pair.split('=');
      return [k, decodeURIComponent(v)] as const;
    }),
  );
  const inviteId = params.get('i') ?? '';
  const secretText = params.get('s') ?? '';
  if (!UUID.test(inviteId)) return null;
  try {
    const secret = base64urlnopad.decode(secretText);
    return secret.length === KEY_BYTES ? { inviteId, secret } : null;
  } catch {
    return null;
  }
}

// Dono: cifra a chave do cofre com a chave derivada do QR (o servidor guarda só isto)
export function sealInviteVaultKey(inviteKey: Uint8Array, vaultKey: Uint8Array, context: string): string {
  return base64.encode(seal(inviteKey, vaultKey, context));
}

// Convidado: abre a chave do cofre com a chave derivada do QR
export function openInviteVaultKey(inviteKey: Uint8Array, wrappedBase64: string, context: string): Uint8Array {
  return open(inviteKey, base64.decode(wrappedBase64), context);
}

// ---- Chaveiro: chaves antigas do cofre, cifradas com a chave atual ----
// Ao remover alguém, o dono troca a chave. Registros antigos continuam com a chave da época;
// quem fica no cofre abre o chaveiro com a chave nova. Quem saiu não recebe a chave nova.

export type Keyring = Record<number, Uint8Array>;

export function sealKeyring(currentKey: Uint8Array, ring: Keyring, context: string): string {
  const plain: Record<string, string> = {};
  for (const [version, key] of Object.entries(ring)) plain[version] = base64.encode(key);
  return sealJson(currentKey, plain, context);
}

export function openKeyring(currentKey: Uint8Array, sealedBase64: string, context: string): Keyring {
  const plain = openJson<Record<string, string>>(currentKey, sealedBase64, context);
  const ring: Keyring = {};
  for (const [version, key] of Object.entries(plain)) {
    const n = Number(version);
    if (!Number.isInteger(n) || n < 1) throw new Error('Chaveiro da gaveta em formato desconhecido.');
    ring[n] = base64.decode(key);
  }
  return ring;
}

// ---- Contextos (AAD): amarram cada texto cifrado ao seu lugar ----

export const contexts = {
  record: (vaultId: string, recordId: string, kind: string) => `record:${vaultId}:${recordId}:${kind}`,
  photo: (vaultId: string, recordId: string) => `photo:${vaultId}:${recordId}`,
  vaultKey: (vaultId: string, userId: string, keyVersion: number) => `vaultkey:${vaultId}:${userId}:${keyVersion}`,
  vaultMeta: (vaultId: string) => `vaultmeta:${vaultId}`,
  // Resumo cifrado que o servidor copia para o histórico (e a data da exclusão, porque o texto some)
  note: (vaultId: string, kind: string, recordId: string) => `note:${vaultId}:${kind}:${recordId}`,
  audit: (vaultId: string, eventId: string) => `audit:${vaultId}:${eventId}`,
  invite: (inviteId: string, vaultId: string, keyVersion: number) => `invite:${inviteId}:${vaultId}:${keyVersion}`,
  keyring: (vaultId: string, keyVersion: number) => `keyring:${vaultId}:${keyVersion}`,
};

export const encodeBase64 = (bytes: Uint8Array) => base64.encode(bytes);
export const decodeBase64 = (text: string) => base64.decode(text);
