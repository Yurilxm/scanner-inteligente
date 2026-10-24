// SHA-256 e PIN: slice temporario de __tests__/perfis.test.ts (unificado em 3a.4)
import { sha256Hex } from '../src/utils/sha256';
import { hashPin, isValidPinFormat, newSalt, pinLockRemaining, verifyPin } from '../src/utils/pin';
describe('SHA-256 (vetores do NIST)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('"%s"', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });
});

describe('PIN', () => {
  it('aceita só de 4 a 6 números', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
  });

  it('o hash depende do salt e não guarda o PIN em texto', () => {
    const salt = newSalt();
    const hash = hashPin('1234', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('1234');
    expect(hashPin('1234', salt)).toBe(hash);
    expect(hashPin('1234', newSalt())).not.toBe(hash);
  });

  it('bloqueia por 30s após 5 erros seguidos', () => {
    const salt = newSalt();
    const hash = hashPin('2468', salt);
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(verifyPin('perfil-x', '0000', salt, hash, t0)).toBe(false);
    expect(pinLockRemaining('perfil-x', t0)).toBe(30_000);
    expect(verifyPin('perfil-x', '2468', salt, hash, t0 + 1_000)).toBe(false); // certo, mas ainda bloqueado
    expect(verifyPin('perfil-x', '2468', salt, hash, t0 + 30_001)).toBe(true);
  });
});
