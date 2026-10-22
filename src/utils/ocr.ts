import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export async function extractTextFromImage(uri: string): Promise<string> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error(`Arquivo nao encontrado: ${uri}`);

    // Redimensiona para 1080px de largura. O ML Kit perde texto em fotos muito grandes!
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    const tempPath = `${FileSystem.cacheDirectory}ocr_temp_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: manipResult.uri, to: tempPath });

    const result = await recognizeText(tempPath);
    await FileSystem.deleteAsync(tempPath, { idempotent: true });

    return result?.text || '';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha no OCR: ${msg}`);
  }
}
