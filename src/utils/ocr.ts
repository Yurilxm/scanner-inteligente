import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import * as FileSystem from 'expo-file-system/legacy';

export async function extractTextFromImage(uri: string): Promise<string> {
  try {
    // 1. Verifica se o arquivo original realmente existe
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error(`Arquivo nao encontrado: ${uri}`);
    }

    // 2. Copia a imagem para o diretorio de cache com um nome simples
    //    Isso evita problemas do ML Kit com caminhos longos ou pastas privadas
    const tempPath = `${FileSystem.cacheDirectory}ocr_temp_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: tempPath });

    // 3. Passa o caminho do cache para o OCR
    const result = await recognizeText(tempPath);
    
    // 4. Limpa o arquivo temporario
    await FileSystem.deleteAsync(tempPath, { idempotent: true });

    return result?.text || '';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha no OCR: ${msg}`);
  }
}
