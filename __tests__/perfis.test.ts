// Perfis rodando sobre SQLite de verdade (node:sqlite), não sobre mocks de SQL
jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

import * as SQLite from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256Hex } from '../src/utils/sha256';
import { hashPin, isValidPinFormat, newSalt, pinLockRemaining, verifyPin } from '../src/utils/pin';
import {
  createProfile, getActiveProfileId, getProfile, listProfiles, normalizeProfileName, updateProfile,
} from '../src/db/profiles';
import {
  changeProfile, countProfileDocuments, getCurrentProfile, listPendingDocuments, getProfileSettings, getSetting, saveDocument, setProfileSettings, togglePaidStatus,
} from '../src/db/database';
import { deleteProfile } from '../src/utils/profileManager';
import { appSetting, getPerfil, migrateToSinglePerfil, needsAppPin, setAppPin, tryUnlockApp } from '../src/utils/perfil';
import { forgetUnlocked } from '../src/utils/pin';

const fields = {
  documentType: 'BOLETO' as const, issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null,
  totalAmountCents: 100, dueDate: '2099-01-10', boletoLine: null,
};

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

describe('Registro de perfis (SQL real)', () => {
  let casaId = '';

  it('migra Yuri e Mãe, mantendo os bancos antigos', () => {
    const profiles = listProfiles();
    expect(profiles.map(p => [p.id, p.name])).toEqual([['yuri', 'Yuri'], ['mae', 'Mãe']]);
    expect(getCurrentProfile()).toBe('yuri');
    expect(SQLite.openDatabaseSync).toHaveBeenCalledWith('scanner_yuri.db');
  });

  it('cria perfil com nome normalizado e id seguro para arquivo', () => {
    expect(normalizeProfileName('  Casa   da   Praia  ')).toBe('Casa da Praia');
    expect(normalizeProfileName('x'.repeat(40))).toHaveLength(20);
    casaId = createProfile({ name: '  Casa  ', color: '#3fb950', icon: 'home-heart' });
    expect(casaId).toMatch(/^p[a-z0-9]+$/);
    expect(listProfiles().at(-1)).toMatchObject({ id: casaId, name: 'Casa', icon: 'home-heart', pinHash: null });
  });

  it('updateProfile ignora colunas fora da lista permitida', () => {
    updateProfile(casaId, { name: 'Casa Nova', id: 'invasor', sortOrder: 99 } as any);
    expect(getProfile(casaId)).toMatchObject({ id: casaId, name: 'Casa Nova' });
    expect(getProfile('invasor')).toBeNull();
    expect(getProfile(casaId)!.sortOrder).not.toBe(99);
  });

  it('lembra o perfil ativo', () => {
    changeProfile(casaId);
    expect(getActiveProfileId()).toBe(casaId);
    changeProfile('yuri');
    expect(getActiveProfileId()).toBe('yuri');
  });

  it('configurações de um perfil não ativo ficam no banco dele', () => {
    setProfileSettings(casaId, { notification_days_before: '1', cnpj_lookup_enabled: 'true' });
    expect(getProfileSettings(casaId, { notification_days_before: '5', cnpj_lookup_enabled: 'false', notification_frequency: 'once' }))
      .toEqual({ notification_days_before: '1', cnpj_lookup_enabled: 'true', notification_frequency: 'once' });
    expect(getSetting('notification_days_before', '5')).toBe('5'); // o perfil ativo (Yuri) não mudou
  });

  it('conta contas e pendentes de cada perfil', () => {
    const paid = saveDocument('file:///scans/y1.jpg', '', fields);
    saveDocument('file:///scans/y2.jpg', '', fields);
    togglePaidStatus(paid, 0);
    expect(countProfileDocuments('yuri')).toEqual({ total: 2, pending: 1 });
    expect(countProfileDocuments(casaId)).toEqual({ total: 0, pending: 0 });
    // Pendentes: só a não paga, e também de um perfil que não é o ativo
    expect(listPendingDocuments('yuri').map(d => d.issuer)).toEqual(['ENEL']);
    expect(listPendingDocuments(casaId)).toEqual([]);
  });

  it('PIN do app: define, confere e só desbloqueia com o certo', () => {
    setAppPin('1357');
    forgetUnlocked('__app__'); // simula reabrir o app
    expect(getPerfil().hasPin).toBe(true);
    expect(needsAppPin()).toBe(true);
    expect(tryUnlockApp('0000')).toBe('PIN incorreto.');
    expect(tryUnlockApp('1357')).toBeNull();
    expect(needsAppPin()).toBe(false);
    setAppPin(null);
    expect(getPerfil().hasPin).toBe(false);
    expect(needsAppPin()).toBe(false);
  });
});

describe('Excluir perfil (SQL real)', () => {
  it('não exclui o perfil ativo', async () => {
    await expect(deleteProfile(getCurrentProfile())).rejects.toThrow('Abra outra gaveta');
  });

  it('apaga banco, fotos das contas, foto do perfil e lembretes, sem tocar nos outros perfis', async () => {
    changeProfile('mae');
    const docId = saveDocument('file:///scans/mae1.jpg', '', fields);
    updateProfile('mae', { photoUri: 'file:///profiles/mae.jpg' });
    changeProfile('yuri');

    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'novo', content: { data: { docId, profile: 'mae' } } },
      { identifier: 'antigo', content: { data: { docId } } },                      // antes de gravar o perfil
      { identifier: 'do-yuri', content: { data: { docId: 'outro', profile: 'yuri' } } },
    ]);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
    (FileSystem.deleteAsync as jest.Mock).mockClear();

    await deleteProfile('mae');

    expect(getProfile('mae')).toBeNull();
    expect(SQLite.deleteDatabaseSync).toHaveBeenCalledWith('scanner_mae.db');
    const cancelled = (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map(c => c[0]);
    expect(cancelled.sort()).toEqual(['antigo', 'novo']);
    const deleted = (FileSystem.deleteAsync as jest.Mock).mock.calls.map(c => c[0]);
    expect(deleted).toEqual(expect.arrayContaining(['file:///scans/mae1.jpg']));
    expect(countProfileDocuments('yuri').total).toBe(2); // Yuri intacto
  });

  it('mantém pelo menos um perfil', async () => {
    for (const p of listProfiles()) if (p.id !== 'yuri') await deleteProfile(p.id);
    expect(listProfiles().map(p => p.id)).toEqual(['yuri']);
    await expect(deleteProfile('yuri')).rejects.toThrow('pelo menos uma gaveta');
  });
});

describe('Migração para perfil único + gavetas (SQL real)', () => {
  it('o perfil ativo empresta nome, PIN e ajustes; as gavetas perdem o PIN e mantêm a nuvem', () => {
    const { linkProfileVault } = require('../src/db/profiles');
    const { setAppSetting } = require('../src/db/profiles');
    const trabalho = createProfile({ name: 'Trabalho', color: '#a371f7', icon: 'briefcase' });
    linkProfileVault(trabalho, 'cofre-1', 'payer');
    // Estado antigo: PIN e ajustes no perfil ativo (Yuri)
    const salt = newSalt();
    updateProfile('yuri', { pinHash: hashPin('2468', salt), pinSalt: salt, photoUri: 'file:///profiles/yuri.jpg' });
    updateProfile(trabalho, { pinHash: hashPin('1111', salt), pinSalt: salt });
    setProfileSettings('yuri', { notification_days_before: '3', theme: 'claro' });
    setAppSetting('perfil_version', null); // como se o app novo abrisse pela primeira vez

    expect(migrateToSinglePerfil()).toBe(true);

    const perfil = getPerfil();
    expect(perfil.name).toBe(getProfile('yuri')!.name);
    expect(perfil.photoUri).toBe('file:///profiles/yuri.jpg');
    expect(perfil.hasPin).toBe(true);
    forgetUnlocked('__app__');
    expect(tryUnlockApp('2468')).toBeNull(); // o PIN do Yuri virou o PIN do app
    expect(appSetting('notification_days_before')).toBe('3');
    expect(appSetting('theme')).toBe('claro');
    for (const p of listProfiles()) {
      expect(p.pinHash).toBeNull();
      expect(p.photoUri).toBeNull();
    }
    // Gaveta aceita logo antes da atualização continua ligada (antes era desligada e a conta não subia)
    expect(getProfile(trabalho)).toMatchObject({ vaultId: 'cofre-1', role: 'payer' });
    // Roda uma vez só
    expect(migrateToSinglePerfil()).toBe(false);
    setAppPin(null);
  });
});

describe('Cofre e papéis do perfil', () => {
  it('perfis existentes são do próprio usuário (dono) e ainda não sincronizam', () => {
    expect(getProfile('yuri')).toMatchObject({ vaultId: null, role: 'owner' });
  });

  it('o que cada papel pode fazer', () => {
    const { canPay, canEdit, canManageMembers } = require('../src/db/profiles');
    const table = (['viewer', 'payer', 'editor', 'owner'] as const).map(r => [r, canPay(r), canEdit(r), canManageMembers(r)]);
    expect(table).toEqual([
      ['viewer', false, false, false],
      ['payer', true, false, false],
      ['editor', true, true, false],
      ['owner', true, true, true],
    ]);
  });
});

describe('Mover conta entre gavetas (SQL real)', () => {
  it('a conta vai para a outra gaveta (marcada para enviar) e vira marca de exclusão na de origem', () => {
    const { getDocuments, moveDocumentToProfile } = require('../src/db/database');
    const destino = createProfile({ name: 'Casa compartilhada', color: '#fff', icon: 'initial' });
    changeProfile('yuri');
    const id = saveDocument('file:///scans/mover.jpg', 'texto', { ...fields, issuer: 'AGUA' });

    moveDocumentToProfile(id, destino);

    expect(getDocuments().some((d: { id: string }) => d.id === id)).toBe(false); // sumiu da origem
    expect(listPendingDocuments(destino).map(d => d.issuer)).toEqual(['AGUA']);
    changeProfile(destino);
    const moved = getDocuments().find((d: { id: string }) => d.id === id);
    expect(moved).toMatchObject({ imageUri: 'file:///scans/mover.jpg', ocrText: 'texto', contentDirty: 1, paymentDirty: 1 });
    expect(() => moveDocumentToProfile(id, destino)).toThrow('já está nesta gaveta');
    changeProfile('yuri');
  });
});

// Por último: apaga todas as gavetas, inclusive as que os testes acima usam
describe('Excluir a gaveta aberta (SQL real)', () => {
  it('abre outra antes; se era a última, cria uma vazia', async () => {
    const { FALLBACK_GAVETA_NAME, deleteGaveta, switchProfile } = require('../src/utils/profileManager');
    const carro = createProfile({ name: 'Carro', color: '#a371f7', icon: 'initial' });
    switchProfile(carro);

    const aberta = await deleteGaveta(carro);
    expect(getProfile(carro)).toBeNull();
    expect(aberta).not.toBe(carro);
    expect(getCurrentProfile()).toBe(aberta);

    // Apaga todas: a última dá lugar a uma gaveta vazia, que fica aberta
    for (const p of listProfiles()) {
      if (p.id !== getCurrentProfile()) await deleteGaveta(p.id);
    }
    const ultima = getCurrentProfile();
    const nova = await deleteGaveta(ultima);
    expect(getProfile(ultima)).toBeNull();
    expect(listProfiles().map(p => p.name)).toEqual([FALLBACK_GAVETA_NAME]);
    expect(getCurrentProfile()).toBe(nova);
    expect(countProfileDocuments(nova).total).toBe(0);
  });
});
