import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { SavedDocument } from '../db/database';

// Ferramenta só de desenvolvimento: envia foto + texto do OCR + campos para o PC que roda o Expo,
// para diagnosticar a extração. O PC precisa estar com o receptor rodando na porta abaixo.
export const DIAGNOSTICS_PORT = 8787;

// hostUri ("192.168.1.64:8081") só existe quando o app está ligado ao servidor do Expo
export function getDiagnosticsUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return __DEV__ && host ? `http://${host}:${DIAGNOSTICS_PORT}/diagnostico` : null;
}

export async function sendDiagnostics(doc: SavedDocument): Promise<void> {
  const url = getDiagnosticsUrl();
  if (!url) throw new Error('Disponivel apenas com o app ligado ao servidor de desenvolvimento.');

  let imageBase64: string | null = null;
  try {
    imageBase64 = await FileSystem.readAsStringAsync(doc.imageUri, { encoding: FileSystem.EncodingType.Base64 });
  } catch {}

  const { ocrText, imageUri, ...fields } = doc;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, ocrText, imageUri, imageBase64 }),
  });
  if (!res.ok) throw new Error(`O PC respondeu ${res.status}`);
}
