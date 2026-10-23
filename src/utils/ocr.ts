import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export async function extractDocumentData(uri: string): Promise<any> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('Arquivo nao encontrado.');
    }
    if ('size' in fileInfo && fileInfo.size === 0) {
      throw new Error('Arquivo vazio.');
    }

    // Copia para o cache para ter um caminho limpo
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDir) {
      throw new Error('Diretório de cache indisponível no dispositivo.');
    }
    const cachePath = `${cacheDir}ocr_input_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: cachePath });

    let finalPath = cachePath;

    try {
      // Tenta redimensionar para 1080px
      const manipResult = await ImageManipulator.manipulateAsync(
        cachePath,
        [{ resize: { width: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      finalPath = manipResult.uri;
    } catch (e) {
      // Se falhar por falta de memoria, ignora o redimensionamento e usa o original
      console.warn("Falha ao redimensionar, tentando imagem original...", e);
    }

    const finalUri = finalPath.startsWith('file://') ? finalPath : `file://${finalPath}`;
    const result = await recognizeText(finalUri);

    // Limpeza de cache
    await FileSystem.deleteAsync(cachePath, { idempotent: true });
    if (finalPath !== cachePath) {
      await FileSystem.deleteAsync(finalPath, { idempotent: true });
    }

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha no OCR: ${msg}`);
  }
}

export async function extractTextFromImage(uri: string): Promise<string> {
  const data = await extractDocumentData(uri);
  return data?.text || '';
}

export async function extractRawOcrData(uri: string) {
  const result = await extractDocumentData(uri);
  return result;
}
