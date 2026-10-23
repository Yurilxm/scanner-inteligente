import * as FileSystem from 'expo-file-system/legacy';

const DEBUG_FILE_PATTERN = /^(ocr_debug_|debug_ocr_).+\.(txt|json)$/;

// Remove os textos brutos de OCR exportados para debug (contêm dados das contas).
// Não apaga logo após compartilhar porque o app de destino pode ler o arquivo depois.
export async function cleanupDebugFiles(): Promise<void> {
  const dirs = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter((d): d is string => !!d);
  for (const dir of dirs) {
    try {
      const names = await FileSystem.readDirectoryAsync(dir);
      await Promise.all(
        names
          .filter(name => DEBUG_FILE_PATTERN.test(name))
          .map(name => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }))
      );
    } catch {}
  }
}

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
