import { sha256Hex } from './sha256';

// O PIN protege o acesso pela interface do app. Os dados ficam na area privada do Android,
// mas nao sao criptografados: o PIN nao substitui a senha/bloqueio do proprio celular.

const ITERATIONS = 2000; // deixa cada tentativa mais lenta sem atrasar quem digita o PIN certo
export const PIN_MIN = 4;
export const PIN_MAX = 6;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export function newSalt(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

export function hashPin(pin: string, salt: string): string {
  let hash = `${salt}:${pin}`;
  for (let i = 0; i < ITERATIONS; i++) hash = sha256Hex(hash + salt);
  return hash;
}

// Comparacao sem retorno antecipado, para nao vazar por tempo quantos caracteres batem
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const failures = new Map<string, { count: number; lockedUntil: number }>();

// Milissegundos restantes de bloqueio apos erros seguidos (0 = pode tentar)
export function pinLockRemaining(profileId: string, now = Date.now()): number {
  const f = failures.get(profileId);
  return f && f.lockedUntil > now ? f.lockedUntil - now : 0;
}

export function verifyPin(profileId: string, pin: string, salt: string, hash: string, now = Date.now()): boolean {
  if (pinLockRemaining(profileId, now) > 0) return false;
  if (safeEqual(hashPin(pin, salt), hash)) {
    failures.delete(profileId);
    return true;
  }
  const f = failures.get(profileId) ?? { count: 0, lockedUntil: 0 };
  f.count++;
  if (f.count >= MAX_ATTEMPTS) {
    f.count = 0;
    f.lockedUntil = now + LOCK_MS;
  }
  failures.set(profileId, f);
  return false;
}

// Perfis com PIN já desbloqueados nesta sessão do app (voltam a pedir ao reabrir o app)
const unlocked = new Set<string>();

export function isUnlocked(profileId: string): boolean {
  return unlocked.has(profileId);
}

export function markUnlocked(profileId: string): void {
  unlocked.add(profileId);
}

export function forgetUnlocked(profileId: string): void {
  unlocked.delete(profileId);
}
