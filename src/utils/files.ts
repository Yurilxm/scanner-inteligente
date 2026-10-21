import { Directory, File, Paths } from 'expo-file-system';

export async function saveImageLocally(sourceUri: string): Promise<string> {
  try {
    const documentsDir = new Directory(Paths.document, 'scans');
    
    // Cria a pasta 'scans' se ela nao existir
    if (!documentsDir.exists) {
      documentsDir.create();
    }

    const filename = `scan_${Date.now()}.jpg`;
    const sourceFile = new File(sourceUri);
    const destinationFile = new File(documentsDir, filename);

    // Copia o arquivo para o diretorio permanente
    sourceFile.copy(destinationFile);

    return destinationFile.uri;
  } catch {
    throw new Error('Falha ao salvar a imagem localmente');
  }
}
