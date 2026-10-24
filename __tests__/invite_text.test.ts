import { extractInvite, inviteLinkFromParams } from '../src/utils/inviteText';

const ID = '3f1c2a9e-5b7d-4e21-9a0b-7c6d5e4f3a21';
const SECRET = 'Zm9vYmFyLWJhei1xdXV4LTEyMzQ1Njc4OTAtYWJjZGVm';
const LINK = `scannerinteligente://convite?i=${ID}&s=${SECRET}`;

describe('extractInvite', () => {
  it('lê o link do QR', () => {
    expect(extractInvite(LINK)).toEqual({ i: ID, s: SECRET });
  });

  it('acha o convite no meio da mensagem colada do WhatsApp', () => {
    const msg = `Convite para a gaveta "Casa" no Control (Pagador). Copie esta mensagem...\n\n${LINK}\nAbraço!`;
    expect(extractInvite(msg)).toEqual({ i: ID, s: SECRET });
  });

  it('recusa texto que não é convite ou está incompleto', () => {
    expect(extractInvite('https://exemplo.com')).toBeNull();
    expect(extractInvite('scannerinteligente://convite?i=' + ID)).toBeNull();
    expect(extractInvite('')).toBeNull();
  });

  it('monta de volta o mesmo link', () => {
    expect(inviteLinkFromParams({ i: ID, s: SECRET })).toBe(LINK);
  });
});
