// Registro de perfis, roles e movimentacao de contas entre gavetas (SQL real)
jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

import * as SQLite from 'expo-sqlite';
import {
  changeProfile, countProfileDocuments, getCurrentProfile, listPendingDocuments, getProfileSettings, getSetting, saveDocument, setProfileSettings, togglePaidStatus,
} from '../src/db/database';
import {
  createProfile, getActiveProfileId, getProfile, listProfiles, normalizeProfileName, updateProfile,
} from '../src/db/profiles';

const fields = {
  documentType: 'BOLETO' as const, issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null,
  totalAmountCents: 100, dueDate: '2099-01-10', boletoLine: null,
};
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
