import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { extractTextFromImage } from '../src/utils/ocr';

jest.mock('@infinitered/react-native-mlkit-text-recognition', () => ({
  recognizeText: jest.fn(),
}));

describe('ocr util', () => {
  it('retorna o texto reconhecido pela biblioteca', async () => {
    (recognizeText as jest.Mock).mockResolvedValueOnce({
      text: 'Meu texto extraido',
      blocks: [],
    });

    const result = await extractTextFromImage('file:///tmp/image.jpg');

    expect(result).toBe('Meu texto extraido');
    expect(recognizeText).toHaveBeenCalledWith('file:///tmp/image.jpg');
  });

  it('retorna string vazia se nenhum texto for encontrado', async () => {
    (recognizeText as jest.Mock).mockResolvedValueOnce(null);

    const result = await extractTextFromImage('file:///tmp/image.jpg');
    expect(result).toBe('');
  });

  it('lanca erro se a biblioteca falhar', async () => {
    (recognizeText as jest.Mock).mockRejectedValueOnce(new Error('Erro'));

    await expect(extractTextFromImage('file:///tmp/image.jpg')).rejects.toThrow(
      'Falha ao extrair texto da imagem',
    );
  });
});
