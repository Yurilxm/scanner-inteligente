import { saveImageLocally } from '../src/utils/files';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('files util', () => {
  it('cria o diretorio e copia a imagem com sucesso', async () => {
    const uri = await saveImageLocally('file:///temp/image.jpg');

    expect(uri).toContain('scan_');
    expect(uri).toContain('.jpg');
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
    expect(FileSystem.copyAsync).toHaveBeenCalled();
  });
});
