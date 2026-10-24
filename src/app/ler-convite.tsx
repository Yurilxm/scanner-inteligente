import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../theme';
import { extractInvite, type InviteParams } from '../utils/inviteText';

export default function LerConviteScreen() {
  const theme = useTheme();
  const styles = useStyles();
  // Câmera só ligada com a tela visível (a doc do expo-camera recomenda desmontar fora de foco)
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const [permission, requestPermission] = useCameraPermissions();
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [wrongCode, setWrongCode] = useState(false);
  const handled = useRef(false);

  const open = (params: InviteParams) => {
    handled.current = true;
    router.replace({ pathname: '/convite', params });
  };

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const params = extractInvite(data);
    if (params) open(params);
    else setWrongCode(true);
  };

  const pastedInvite = extractInvite(pasted);

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>ENTRAR NA GAVETA</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!pasteMode && (
              <>
                <Text style={styles.text}>Aponte a câmera para o QR code que aparece no celular de quem convidou.</Text>
                <View style={styles.cameraBox}>
                  {permission?.granted && focused ? (
                    <CameraView
                      style={styles.camera}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={onScanned}
                    />
                  ) : (
                    <View style={styles.cameraPlaceholder}>
                      <MaterialCommunityIcons name="camera-outline" size={42} color={theme.colors.textSecondary} />
                      {permission && !permission.granted && (
                        <>
                          <Text style={styles.text}>
                            {permission.canAskAgain
                              ? 'O Control precisa da câmera para ler o QR.'
                              : 'A câmera está bloqueada para o Control. Libere nas configurações do Android, ou cole o convite.'}
                          </Text>
                          {permission.canAskAgain && (
                            <Pressable style={styles.primaryButton} onPress={requestPermission}>
                              <Text style={styles.primaryText}>Permitir câmera</Text>
                            </Pressable>
                          )}
                        </>
                      )}
                    </View>
                  )}
                  {permission?.granted && <View pointerEvents="none" style={styles.frame} />}
                </View>
                {wrongCode && (
                  <View style={styles.warning}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.colors.warning} />
                    <Text style={styles.warningText}>Esse código não é um convite do Control. Tente o QR da tela de convite.</Text>
                  </View>
                )}
                <Pressable style={styles.secondaryButton} onPress={() => setPasteMode(true)}>
                  <MaterialCommunityIcons name="content-paste" size={20} color={theme.colors.primary} />
                  <Text style={styles.secondaryText}>Colar convite recebido por mensagem</Text>
                </Pressable>
              </>
            )}

            {pasteMode && (
              <>
                <Text style={styles.text}>Cole aqui a mensagem do convite (pode colar ela inteira).</Text>
                <TextInput
                  style={styles.input}
                  value={pasted}
                  onChangeText={setPasted}
                  placeholder="scannerinteligente://convite?..."
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {pasted.length > 0 && !pastedInvite && (
                  <Text style={styles.warningText}>Não achei um convite do Control nesse texto.</Text>
                )}
                <Pressable
                  style={[styles.primaryButton, !pastedInvite && { opacity: 0.4 }]}
                  disabled={!pastedInvite}
                  onPress={() => pastedInvite && open(pastedInvite)}
                >
                  <Text style={styles.primaryText}>Continuar</Text>
                </Pressable>
                <Pressable style={styles.linkButton} onPress={() => setPasteMode(false)}>
                  <Text style={styles.linkText}>Ler QR code em vez disso</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, gap: 14 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  cameraBox: { width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderWidth: 3, borderRadius: 18, borderColor: '#FFFFFF' },
  warning: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  warningText: { flex: 1, color: theme.colors.warning, fontFamily: theme.fonts.regular, fontSize: 14 },
  input: { minHeight: 110, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: theme.fonts.mono, color: theme.colors.text, backgroundColor: theme.colors.panel },
  primaryButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  linkButton: { alignItems: 'center', padding: 12 },
  linkText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 14, textDecorationLine: 'underline' },
}));
