import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decodeBase64, encodeBase64 } from './crypto';
import type { PhotoIO } from './runSync';

// Leitura de boleto com zoom continua boa e a foto fica com ~150-300 KB
const UPLOAD_MAX_WIDTH = 1200;
const UPLOAD_QUALITY = 0.7;

// Fotos do boleto ficam na mesma pasta dos scans feitos neste celular.
export const photos: PhotoIO = {
  // Devolve a foto já comprimida para envio (a original no celular não muda)
  async read(uri) {
    if (!uri) return null;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const original = await ImageManipulator.manipulateAsync(uri, []);
    const actions = original.width > UPLOAD_MAX_WIDTH ? [{ resize: { width: UPLOAD_MAX_WIDTH } }] : [];
    const compressed = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: UPLOAD_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    try {
      const b64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: FileSystem.EncodingType.Base64 });
      return decodeBase64(b64);
    } finally {
      await FileSystem.deleteAsync(original.uri, { idempotent: true });
      await FileSystem.deleteAsync(compressed.uri, { idempotent: true });
    }
  },
  async write(id, bytes) {
    const dir = `${FileSystem.documentDirectory}scans/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const uri = `${dir}nuvem-${safe}.jpg`;
    await FileSystem.writeAsStringAsync(uri, encodeBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  },
  async remove(uri) {
    if (!uri) return;
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },
};
