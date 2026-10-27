import { useState } from 'react';
import { Text, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentScanner from 'expo-document-scanner';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDocument } from '../context/DocumentContext';
import { saveImageLocally } from '../utils/files';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomToast } from '../components/CustomToast';
import { makeStyles, useTheme } from '../theme';
import { AppStateFlag } from '../utils/AppStateFlag';

export default function CapturaScreen() {
  const theme = useTheme();
  const styles = useStyles();
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
    AppStateFlag.setPickingImage(true); // AVISA O LAYOUT QUE A CÂMERA VAI ABRIR
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
    } finally {
      AppStateFlag.setPickingImage(false); // AVISA QUE A CÂMERA FECHOU
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
    AppStateFlag.setPickingImage(true); // AVISA O LAYOUT QUE A GALERIA VAI ABRIR
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
    } finally {
      AppStateFlag.setPickingImage(false); // AVISA QUE A GALERIA FECHOU
    }
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />

      {toast && <CustomToast message={toast.msg} type={toast.type} onHide={() => setToast(null)} />}

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.title}>CAPTURAR DOCUMENTO</Text>
        <Text style={styles.subtitle}>Escolha o metodo de digitalizacao</Text>

        <Pressable style={styles.button} onPress={onScan} disabled={isProcessing}>
          <LinearGradient colors={[theme.colors.primary, theme.colors.success]} style={styles.buttonGradient}>
            <MaterialCommunityIcons name="camera" size={24} color={theme.colors.background} />
            <Text style={styles.buttonText}>{isProcessing ? 'PROCESSANDO...' : 'USAR CAMERA'}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.buttonSecondary} onPress={onGallery} disabled={isProcessing}>
          <MaterialCommunityIcons name="image-multiple" size={24} color={theme.colors.primary} />
          <Text style={styles.buttonTextSecondary}>IMPORTAR DA GALERIA</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={() => router.back()} disabled={isProcessing}>
          <Text style={styles.linkText}>Cancelar</Text>
        </Pressable>
      </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginBottom: 8, letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, marginBottom: 48 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: theme.colors.background, fontSize: 16, fontFamily: theme.fonts.bold },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, gap: 8, backgroundColor: theme.colors.panel },
  buttonTextSecondary: { color: theme.colors.primary, fontSize: 16, fontFamily: theme.fonts.bold },
  link: { marginTop: 24 },
  linkText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14 },
}));
