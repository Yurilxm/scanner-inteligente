import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/portuguese.js';
import {
  contexts, createRecoveryPhrase, decodeBase64, encodeBase64, identityFromPhrase, isValidRecoveryPhrase,
  newVaultKey, normalizePhrase, open, openJson, seal, sealJson, setRandomSource, unwrapKey, wrapKey,
} from '../src/sync/crypto';

// No app a aleatoriedade vem do expo-crypto; aqui, do gerador seguro do Node
beforeAll(() => setRandomSource(n => new Uint8Array(nodeRandomBytes(n))));

// Gerador seguro do Node (no app, vem do expo-crypto)
const nodeRandomBytes: (n: number) => Uint8Array = require('crypto').randomBytes;
const enc = new TextEncoder();

describe('Frase de recuperação e identidade', () => {
  it('gera 12 palavras em português, válidas', () => {
    const phrase = createRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
  });

  it('a mesma frase recria exatamente as mesmas chaves (celular novo)', () => {
    const phrase = createRecoveryPhrase();
    const a = identityFromPhrase(phrase);
    const b = identityFromPhrase(`  ${phrase.toUpperCase().replace(/ /g, '   ')}  `); // digitada diferente
    expect(encodeBase64(b.publicKey)).toBe(encodeBase64(a.publicKey));
    expect(encodeBase64(b.privateKey)).toBe(encodeBase64(a.privateKey));
  });

  it('frases diferentes geram chaves diferentes', () => {
    const a = identityFromPhrase(createRecoveryPhrase());
    const b = identityFromPhrase(createRecoveryPhrase());
    expect(encodeBase64(a.publicKey)).not.toBe(encodeBase64(b.publicKey));
  });

  it('rejeita frase com palavra trocada (checksum) e palavra fora da lista', () => {
    // Frase fixa (entropia zerada) para o teste ser determinístico: com 12 palavras o checksum
    // tem 4 bits, então 1 em 16 trocas aleatórias ainda seria válida
    const words = entropyToMnemonic(new Uint8Array(16), wordlist).split(' ');
    const swapped = [...words];
    swapped[3] = wordlist.find(w => w !== words[3] && !validateMnemonic([...words.slice(0, 3), w, ...words.slice(4)].join(' '), wordlist))!;
    expect(isValidRecoveryPhrase(swapped.join(' '))).toBe(false);
    expect(() => identityFromPhrase(swapped.join(' '))).toThrow('Frase de recuperação inválida.');

    const unknown = [...words];
    unknown[0] = 'xyzinexistente';
    expect(isValidRecoveryPhrase(unknown.join(' '))).toBe(false);
  });

  it('normaliza acentos e espaços', () => {
    expect(normalizePhrase('  Ábaco   CASA ')).toBe(normalizePhrase('ábaco casa'));
  });
});

describe('Cifra dos dados do cofre', () => {
  const key = () => newVaultKey();
  const ctx = contexts.record('cofre-1', 'conta-1', 'document');

  it('ida e volta', () => {
    const k = key();
    const doc = { issuer: 'ENEL', totalAmountCents: 18131, dueDate: '2026-11-10' };
    expect(openJson(k, sealJson(k, doc, ctx), ctx)).toEqual(doc);
  });

  it('o mesmo conteúdo cifra diferente a cada vez (nonce aleatório)', () => {
    const k = key();
    expect(sealJson(k, { a: 1 }, ctx)).not.toBe(sealJson(k, { a: 1 }, ctx));
  });

  it('o texto cifrado não contém o conteúdo em claro', () => {
    const k = key();
    const sealed = seal(k, enc.encode('ENEL 181,31'), ctx);
    expect(new TextDecoder('latin1').decode(sealed)).not.toContain('ENEL');
  });

  it('detecta qualquer byte adulterado', () => {
    const k = key();
    const sealed = seal(k, enc.encode('valor: 181,31'), ctx);
    for (const i of [0, 1, 30, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[i] ^= 0x01;
      expect(() => open(k, tampered, ctx)).toThrow();
    }
  });

  it('chave errada não abre', () => {
    const sealed = seal(key(), enc.encode('segredo'), ctx);
    expect(() => open(key(), sealed, ctx)).toThrow();
  });

  it('registro movido para outro lugar não abre (contexto amarrado)', () => {
    const k = key();
    const sealed = seal(k, enc.encode('conta 1'), ctx);
    expect(() => open(k, sealed, contexts.record('cofre-1', 'conta-2', 'document'))).toThrow();
    expect(() => open(k, sealed, contexts.record('cofre-1', 'conta-1', 'payment'))).toThrow();
    expect(() => open(k, sealed, contexts.record('cofre-2', 'conta-1', 'document'))).toThrow();
  });
});

describe('Compartilhar a chave do cofre', () => {
  const vaultCtx = contexts.vaultKey('cofre-1', 'usuario-mae', 1);

  it('só o destinatário abre a chave embrulhada', () => {
    const mae = identityFromPhrase(createRecoveryPhrase());
    const intruso = identityFromPhrase(createRecoveryPhrase());
    const vaultKey = newVaultKey();
    const wrapped = wrapKey(mae.publicKey, vaultKey, vaultCtx);

    expect(encodeBase64(unwrapKey(mae, wrapped, vaultCtx))).toBe(encodeBase64(vaultKey));
    expect(() => unwrapKey(intruso, wrapped, vaultCtx)).toThrow();
  });

  it('chave embrulhada para um cofre/versão não serve em outro', () => {
    const mae = identityFromPhrase(createRecoveryPhrase());
    const wrapped = wrapKey(mae.publicKey, newVaultKey(), vaultCtx);
    expect(() => unwrapKey(mae, wrapped, contexts.vaultKey('cofre-1', 'usuario-mae', 2))).toThrow();
  });

  it('fluxo completo: dono cifra uma conta, membro abre com a chave recebida', () => {
    const dono = identityFromPhrase(createRecoveryPhrase());
    const mae = identityFromPhrase(createRecoveryPhrase());
    const vaultKey = newVaultKey();
    const ctx = contexts.record('cofre-1', 'conta-9', 'document');
    const sealed = sealJson(vaultKey, { issuer: 'PROLAGOS', totalAmountCents: 46206 }, ctx);

    const paraMae = wrapKey(mae.publicKey, vaultKey, vaultCtx);
    const chaveDaMae = unwrapKey(mae, paraMae, vaultCtx);
    expect(openJson(chaveDaMae, sealed, ctx)).toEqual({ issuer: 'PROLAGOS', totalAmountCents: 46206 });
    expect(dono.publicKey).toBeDefined();
  });

  it('base64 ida e volta', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual([0, 1, 2, 250, 255]);
  });
});

describe('Sem fonte de aleatoriedade', () => {
  it('recusa gerar chaves com fonte errada', () => {
    setRandomSource(() => new Uint8Array(3));
    expect(() => newVaultKey()).toThrow('tamanho errado');
    setRandomSource(n => new Uint8Array(nodeRandomBytes(n)));
  });
});

describe('Convite por QR code', () => {
  const { inviteKeys, inviteLink, inviteTokenHash, newInviteSecret, parseInviteLink } = require('../src/sync/crypto');
  const inviteId = '3f1c2a9e-5b7d-4e21-9a0b-7c6d5e4f3a21';

  it('quem escaneia o QR abre a chave do cofre; o servidor não', () => {
    const vaultKey = newVaultKey();
    const secret = newInviteSecret();
    const ctx = contexts.invite(inviteId, 'cofre-1', 2);

    // Dono: cifra a chave do cofre com a chave do QR e manda ao servidor só isso + hash do token
    const dono = inviteKeys(secret);
    const wrapped = encodeBase64(seal(dono.key, vaultKey, ctx));
    const link = inviteLink(inviteId, secret);

    // Convidado: lê o QR e chega à mesma chave
    const parsed = parseInviteLink(link)!;
    expect(parsed.inviteId).toBe(inviteId);
    const convidado = inviteKeys(parsed.secret);
    expect(convidado.authToken).toBe(dono.authToken);
    expect(encodeBase64(open(convidado.key, decodeBase64(wrapped), ctx))).toBe(encodeBase64(vaultKey));

    // Token e chave são independentes: o token não abre a chave do cofre
    expect(() => open(decodeBase64(dono.authToken), decodeBase64(wrapped), ctx)).toThrow();
  });

  it('o hash do token é igual ao calculado pelo servidor (sha256 hex)', () => {
    const { authToken } = inviteKeys(newInviteSecret());
    const expected = require('crypto').createHash('sha256').update(authToken, 'utf8').digest('hex');
    expect(inviteTokenHash(authToken)).toBe(expected);
  });

  it('o link usa o esquema do app e só caracteres seguros para URL', () => {
    const link = inviteLink(inviteId, newInviteSecret());
    expect(link.startsWith('scannerinteligente://convite?i=')).toBe(true);
    expect(link.split('&s=')[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejeita QR que não é convite do Control', () => {
    const ok = inviteLink(inviteId, newInviteSecret());
    expect(parseInviteLink('https://exemplo.com/?i=1&s=2')).toBeNull();
    expect(parseInviteLink('qualquer texto')).toBeNull();
    expect(parseInviteLink(ok.replace(inviteId, 'nao-e-uuid'))).toBeNull();
    expect(parseInviteLink(ok.slice(0, -5))).toBeNull();               // segredo cortado
    expect(parseInviteLink(`  ${ok}  `)).not.toBeNull();                 // espaços em volta, ok
  });
});
