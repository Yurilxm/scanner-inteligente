import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { extractDocumentData } from '../src/utils/ocr';

// Mock do FileSystem com cacheDirectory definido
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1000 }),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock do ImageManipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/resized.jpg' }),
  SaveFormat: { JPEG: 'jpeg' },
}));

// Mock do OCR
jest.mock('@infinitered/react-native-mlkit-text-recognition', () => ({
  recognizeText: jest.fn().mockResolvedValue({ text: 'BOLETO Vencimento 10/11/2026 Total R$ 100,00' }),
}));

describe('Pipeline de OCR (QA Sênior)', () => {
  it('deve redimensionar a imagem para 1080px antes do OCR', async () => {
    const rawData = await extractDocumentData('file://original.jpg');
    
    // O manipulateAsync deve ser chamado com o caminho do cache (não com undefined)
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      expect.stringContaining('ocr_input_'),
      [{ resize: { width: 1080 } }],
      expect.any(Object)
    );
    expect(rawData.text).toBeDefined();
  });

  it('deve lidar com OCR retornando texto vazio (foto no escuro)', async () => {
    const mockOcr = require('@infinitered/react-native-mlkit-text-recognition');
    mockOcr.recognizeText.mockResolvedValueOnce({ text: '' });

    const rawData = await extractDocumentData('file://dark_image.jpg');
    expect(rawData.text).toBe('');
  });

  it('deve falhar graciosamente se o arquivo não existir', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false, size: 0 });
    
    await expect(extractDocumentData('file://inexistente.jpg')).rejects.toThrow('Arquivo nao encontrado.');
  });
});
