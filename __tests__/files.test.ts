import { saveImageLocally } from '../src/utils/files';
import { Directory, File } from 'expo-file-system';

// Mock do expo-file-system
jest.mock('expo-file-system', () => {
  return {
    Paths: { document: 'file:///mock-document' },
    Directory: jest.fn().mockImplementation(() => ({
      exists: false,
      create: jest.fn(),
      uri: 'file:///mock-document/scans',
    })),
    File: jest.fn().mockImplementation((dirOrUri, filename) => {
      if (filename) {
        return { uri: `file:///mock-document/scans/${filename}` };
      }
      return { copy: jest.fn() };
    }),
  };
});

describe('files util', () => {
  it('cria o diretorio e copia a imagem com sucesso', async () => {
    const uri = await saveImageLocally('file:///temp/image.jpg');
    
    expect(uri).toContain('scan_');
    expect(uri).toContain('.jpg');
    expect(Directory).toHaveBeenCalledWith('file:///mock-document', 'scans');
  });
});
