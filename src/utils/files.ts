import * as FileSystem from 'expo-file-system/legacy';

export async function saveImageLocally(sourceUri: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}scans/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const filename = `scan_${Date.now()}.jpg`;
    const destUri = `${dir}${filename}`;

    // A API legada copia content:// e file:// sem corromper
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });

    return destUri;
  } catch (error) {
    throw new Error('Falha ao salvar a imagem localmente');
  }
}
