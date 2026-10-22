import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractTextFromImage } from '../src/utils/ocr';

jest.mock('@infinitered/react-native-mlkit-text-recognition', () => ({
  recognizeText: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  cacheDirectory: 'file:///mock-cache/',
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock-cache/resized.jpg' }),
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('ocr util', () => {
  it('retorna o texto reconhecido pela biblioteca', async () => {
    (recognizeText as jest.Mock).mockResolvedValueOnce({ text: 'Meu texto extraido', blocks: [] });
    
    const result = await extractTextFromImage('file:///tmp/image.jpg');
    
    expect(result).toBe('Meu texto extraido');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalled();
    expect(recognizeText).toHaveBeenCalledWith(expect.stringContaining('ocr_temp_'));
  });

  it('lanca erro se a biblioteca falhar', async () => {
    (recognizeText as jest.Mock).mockRejectedValueOnce(new Error('Erro'));
    
    await expect(extractTextFromImage('file:///tmp/image.jpg')).rejects.toThrow(
      'Falha no OCR: Erro',
    );
  });
});
