import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import * as DocumentScanner from 'expo-document-scanner';
import { useState } from 'react';
import { useDocument } from '../src/context/DocumentContext';

export default function CapturaScreen() {
  const { setImageUri } = useDocument();
  const [isScanning, setIsScanning] = useState(false);

  const onScan = async () => {
    if (isScanning) return;
    setIsScanning(true);

    try {
      // Abre o scanner nativo do ML Kit
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 1, // MVP: 1 pagina por enquanto
      });

      const uri = result?.pages?.[0]?.uri;

      if (uri) {
        setImageUri(uri);
        router.back(); // Volta para a tela inicial
      }
    } catch (error) {
      // Cancelamento cai aqui em algumas plataformas;
      // checamos a mensagem para nao incomodar o usuario.
      const message = error instanceof Error ? error.message : String(error);
      
      if (!message.toLowerCase().includes('cancel')) {
        Alert.alert(
          'Erro no scanner',
          'Nao foi possivel escanear o documento. Tente novamente.',
        );
        // Registro generico para nao vazar dados do documento
        console.warn('Scanner falhou. Erro registrado sem conteudo do documento.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const onGallery = () => {
    Alert.alert(
      'Em construcao',
      'A importacao da galeria sera integrada no passo 2.4.',
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Adicionar documento</Text>
      <Text style={styles.subtitle}>Escolha como quer capturar</Text>

      <Pressable
        style={[styles.button, isScanning && styles.buttonDisabled]}
        onPress={onScan}
        disabled={isScanning}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Abrindo scanner...' : 'Escanear documento'}
        </Text>
        <Text style={styles.buttonHint}>Usa a camera com deteccao de bordas</Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={onGallery}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
          Importar da galeria
        </Text>
        <Text style={[styles.buttonHint, styles.buttonHintSecondary]}>
          Escolhe uma imagem ja existente
        </Text>
      </Pressable>

      <Pressable
        style={styles.link}
        onPress={() => router.back()}
        accessibilityRole="button"
      >
        <Text style={styles.linkText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 6 },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 28,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    maxWidth: 340,
    marginBottom: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#0a7ea4' },
  buttonHint: { color: '#e6f2f5', fontSize: 12, marginTop: 4 },
  buttonHintSecondary: { color: '#5a8fa0' },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#888', fontSize: 14 },
});
