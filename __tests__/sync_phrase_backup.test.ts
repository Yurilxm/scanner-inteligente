jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)) }));

const mockSignUpWithPassword = jest.fn();
const mockSignIn = jest.fn();
jest.mock('react-native-credentials-manager', () => ({
  signUpWithPassword: (...a: unknown[]) => mockSignUpWithPassword(...a),
  signIn: (...a: unknown[]) => mockSignIn(...a),
}));

import { createRecoveryPhrase, setRandomSource } from '../src/sync/crypto';
import { phraseLabel, readPhraseFromGoogle, savePhraseToGoogle } from '../src/sync/phraseBackup';

beforeAll(() => setRandomSource(n => new Uint8Array(require('crypto').randomBytes(n))));
beforeEach(() => jest.clearAllMocks());

describe('Frase no Gerenciador de Senhas do Google', () => {
  it('salva com um nome reconhecível e a frase como senha', async () => {
    const phrase = createRecoveryPhrase();
    mockSignUpWithPassword.mockResolvedValue({ success: true });
    await expect(savePhraseToGoogle('kayo@gmail.com', phrase)).resolves.toBe(true);
    expect(mockSignUpWithPassword).toHaveBeenCalledWith({ username: 'Frase de recuperação do Control (kayo@gmail.com)', password: phrase });
  });

  it('recusar a janela do Android não é erro', async () => {
    mockSignUpWithPassword.mockRejectedValue(new Error('User cancelled the operation'));
    await expect(savePhraseToGoogle('x', createRecoveryPhrase())).resolves.toBe(false);
  });

  it('outros erros chegam à tela', async () => {
    mockSignUpWithPassword.mockRejectedValue(new Error('No provider'));
    await expect(savePhraseToGoogle('x', createRecoveryPhrase())).rejects.toThrow('No provider');
  });

  it('recupera a frase escolhida', async () => {
    const phrase = createRecoveryPhrase();
    mockSignIn.mockResolvedValue({ type: 'password', username: phraseLabel('x'), password: phrase });
    await expect(readPhraseFromGoogle()).resolves.toBe(phrase);
    expect(mockSignIn).toHaveBeenCalledWith(['password'], {});
  });

  it('recusa uma senha que não é frase do Control', async () => {
    mockSignIn.mockResolvedValue({ type: 'password', username: 'site', password: 'minhaSenha123' });
    await expect(readPhraseFromGoogle()).rejects.toThrow('não é uma frase de recuperação');
  });

  it('cancelar a escolha devolve null', async () => {
    mockSignIn.mockRejectedValue(new Error('activity is cancelled by the user.'));
    await expect(readPhraseFromGoogle()).resolves.toBeNull();
  });
});
