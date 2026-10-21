import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';

export async function extractTextFromImage(uri: string): Promise<string> {
  try {
    const result = await recognizeText(uri);
    return result?.text || '';
  } catch {
    throw new Error('Falha ao extrair texto da imagem');
  }
}
