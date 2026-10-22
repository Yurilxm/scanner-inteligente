import { Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import * as DocumentScanner from 'expo-document-scanner';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useDocument } from '../src/context/DocumentContext';
import { saveImageLocally } from '../src/utils/files';
import { LinearGradient } from 'expo-linear-gradient';

export default function CapturaScreen() {
  const { setImageUri } = useDocument();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSuccess = async (tempUri: string) => {
    try {
      const permanentUri = await saveImageLocally(tempUri);
      setImageUri(permanentUri);
      router.replace('/revisao');
    } catch {
      Alert.alert('Erro', 'Nao foi possivel salvar a imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onScan = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await DocumentScanner.scanDocument({ maxNumDocuments: 1 });
      const uri = result?.pages?.[0]?.uri;
      if (uri) await handleSuccess(uri);
      else setIsProcessing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('cancel')) {
        Alert.alert('Erro no scanner', `Detalhe: ${message}`);
      }
      setIsProcessing(false);
    }
  };

  const onGallery = async () => {
    if (isProcessing) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissao necessaria', 'Precisamos de acesso a galeria.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // Desativado para nao cortar o boleto
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        await handleSuccess(result.assets[0].uri);
      } else {
        setIsProcessing(false);
      }
    } catch {
      Alert.alert('Erro', 'Nao foi possivel importar a imagem.');
      setIsProcessing(false);
    }
  };

  return (
    <LinearGradient colors={['#0B132B', '#1C2541']} style={styles.container}>
      <Text style={styles.title}>CAPTURAR DOCUMENTO</Text>
      <Text style={styles.subtitle}>Escolha o metodo de digitalizacao</Text>

      <Pressable style={styles.button} onPress={onScan} disabled={isProcessing}>
        <LinearGradient colors={['#00F5FF', '#0088CC']} style={styles.buttonGradient}>
          <Text style={styles.buttonText}>{isProcessing ? 'PROCESSANDO...' : 'USAR CAMERA'}</Text>
        </LinearGradient>
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={onGallery} disabled={isProcessing}>
        <Text style={styles.buttonTextSecondary}>IMPORTAR DA GALERIA</Text>
      </Pressable>

      <Pressable style={styles.link} onPress={() => router.back()} disabled={isProcessing}>
        <Text style={styles.linkText}>Cancelar</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#00F5FF', marginBottom: 8, letterSpacing: 1 },
  subtitle: { fontSize: 14, color: '#A0AAB2', marginBottom: 48 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#0B132B', fontSize: 16, fontWeight: '900' },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#00F5FF' },
  buttonTextSecondary: { color: '#00F5FF', fontSize: 16, fontWeight: 'bold' },
  link: { marginTop: 24 },
  linkText: { color: '#A0AAB2', fontSize: 14 },
});
