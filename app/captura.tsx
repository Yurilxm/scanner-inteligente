import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import * as DocumentScanner from 'expo-document-scanner';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useDocument } from '../src/context/DocumentContext';
import { saveImageLocally } from '../src/utils/files';

export default function CapturaScreen() {
  const { setImageUri } = useDocument();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSuccess = async (tempUri: string) => {
    try {
      // Salva permanentemente e guarda no Contexto
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
      if (uri) {
        await handleSuccess(uri);
      } else {
        setIsProcessing(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('cancel')) {
        // Vamos mostrar o erro real para diagnosticar no celular
        Alert.alert('Erro no scanner', `Detalhe do erro: ${message}`);
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
        allowsEditing: true,
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
    <View style={styles.container}>
      <Text style={styles.title}>Adicionar documento</Text>
      <Text style={styles.subtitle}>Escolha como quer capturar</Text>

      <Pressable
        style={[styles.button, isProcessing && styles.buttonDisabled]}
        onPress={onScan}
        disabled={isProcessing}
      >
        <Text style={styles.buttonText}>
          {isProcessing ? 'Processando...' : 'Escanear documento'}
        </Text>
        <Text style={styles.buttonHint}>Usa a camera com deteccao de bordas</Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonSecondary, isProcessing && styles.buttonDisabled]}
        onPress={onGallery}
        disabled={isProcessing}
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
        disabled={isProcessing}
      >
        <Text style={styles.linkText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 28, textAlign: 'center' },
  button: { backgroundColor: '#0a7ea4', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 8, width: '100%', maxWidth: 340, marginBottom: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0a7ea4' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#0a7ea4' },
  buttonHint: { color: '#e6f2f5', fontSize: 12, marginTop: 4 },
  buttonHintSecondary: { color: '#5a8fa0' },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#888', fontSize: 14 },
});
