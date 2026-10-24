import { useState } from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentScanner from 'expo-document-scanner';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDocument } from '../context/DocumentContext';
import { saveImageLocally } from '../utils/files';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomToast } from '../components/CustomToast';
import { Theme } from '../constants/theme';

export default function CapturaScreen() {
  const { setImageUri } = useDocument();
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);

  const handleSuccess = async (tempUri: string) => {
    try {
      const permanentUri = await saveImageLocally(tempUri);
      setImageUri(permanentUri);
      router.replace('/revisao');
    } catch {
      setToast({ msg: 'Nao foi possivel salvar a imagem.', type: 'error' });
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
        setToast({ msg: `Erro no scanner: ${message}`, type: 'error' });
      }
      setIsProcessing(false);
    }
  };

  const onGallery = async () => {
    if (isProcessing) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ msg: 'Permissao da galeria negada.', type: 'error' });
      return;
    }
    setIsProcessing(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        await handleSuccess(result.assets[0].uri);
      } else {
        setIsProcessing(false);
      }
    } catch {
      setToast({ msg: 'Nao foi possivel importar a imagem.', type: 'error' });
      setIsProcessing(false);
    }
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      
      {toast && <CustomToast message={toast.msg} type={toast.type} onHide={() => setToast(null)} />}

      <View style={styles.content}>
        <Text style={styles.title}>CAPTURAR DOCUMENTO</Text>
        <Text style={styles.subtitle}>Escolha o metodo de digitalizacao</Text>

        <Pressable style={styles.button} onPress={onScan} disabled={isProcessing}>
          <LinearGradient colors={[Theme.colors.primary, Theme.colors.success]} style={styles.buttonGradient}>
            <MaterialCommunityIcons name="camera" size={24} color={Theme.colors.background} />
            <Text style={styles.buttonText}>{isProcessing ? 'PROCESSANDO...' : 'USAR CAMERA'}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.buttonSecondary} onPress={onGallery} disabled={isProcessing}>
          <MaterialCommunityIcons name="image-multiple" size={24} color={Theme.colors.primary} />
          <Text style={styles.buttonTextSecondary}>IMPORTAR DA GALERIA</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.back()} disabled={isProcessing}>
          <Text style={styles.linkText}>Cancelar</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 8, letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: Theme.fonts.regular, color: Theme.colors.textSecondary, marginBottom: 48 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: Theme.colors.background, fontSize: 16, fontFamily: Theme.fonts.bold },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Theme.colors.primary, gap: 8, backgroundColor: Theme.colors.panel },
  buttonTextSecondary: { color: Theme.colors.primary, fontSize: 16, fontFamily: Theme.fonts.bold },
  link: { marginTop: 24 },
  linkText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.regular, fontSize: 14 },
});
