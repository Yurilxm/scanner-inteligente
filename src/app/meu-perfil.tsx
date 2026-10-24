import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { PinModal } from '../components/PinPad';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import { MAX_PROFILE_NAME, PROFILE_COLORS, PROFILE_ICONS } from '../db/profiles';
import { getPerfil, removePerfilPhoto, savePerfilPhoto, setAppPin, updatePerfil } from '../utils/perfil';

type PhotoChange = { kind: 'keep' } | { kind: 'set'; uri: string } | { kind: 'remove' };
type PinChange = { kind: 'keep' } | { kind: 'set'; pin: string } | { kind: 'remove' };

// O perfil da pessoa: um só no app, com as gavetas dentro. PIN vale para abrir o app.
export default function MeuPerfilScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [initial] = useState(getPerfil);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [icon, setIcon] = useState(initial.icon);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [pin, setPin] = useState<PinChange>({ kind: 'keep' });
  const [creatingPin, setCreatingPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const photoUri = photo.kind === 'set' ? photo.uri : photo.kind === 'remove' ? null : initial.photoUri;
  const hasPin = pin.kind === 'set' || (pin.kind === 'keep' && initial.hasPin);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice({ title: 'Sem acesso à galeria', message: 'Permita o acesso às fotos para escolher a imagem do perfil.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) setPhoto({ kind: 'set', uri: result.assets[0].uri });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      updatePerfil({ name: name.trim().slice(0, MAX_PROFILE_NAME), color, icon });
      if (photo.kind === 'set') await savePerfilPhoto(photo.uri);
      if (photo.kind === 'remove') await removePerfilPhoto();
      if (pin.kind === 'set') setAppPin(pin.pin);
      if (pin.kind === 'remove') setAppPin(null);
      router.back();
    } catch (e) {
      setNotice({ title: 'Não foi possível salvar', message: e instanceof Error ? e.message : String(e) });
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>MEU PERFIL</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.preview}>
              <ProfileAvatar name={name || '?'} color={color} icon={icon} photoUri={photoUri} size={96} locked={hasPin} />
              <Text style={styles.previewName}>{name.trim() || 'Eu'}</Text>
            </View>

            <Text style={styles.label}>Nome</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor={theme.colors.textSecondary}
              maxLength={MAX_PROFILE_NAME}
            />

            <Text style={styles.label}>Cor</Text>
            <View style={styles.wrapRow}>
              {PROFILE_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                  accessibilityLabel={`Cor ${c}`}
                >
                  {color === c && <MaterialCommunityIcons name="check" size={20} color={theme.colors.onAccent} />}
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Avatar</Text>
            <View style={styles.wrapRow}>
              {PROFILE_ICONS.map(ic => (
                <Pressable
                  key={ic}
                  onPress={() => { setIcon(ic); if (photoUri) setPhoto({ kind: 'remove' }); }}
                  style={[styles.iconOption, icon === ic && !photoUri && { borderColor: color, backgroundColor: theme.colors.primarySoft }]}
                >
                  {ic === 'initial' ? (
                    <Text style={[styles.iconInitial, { color }]}>{(name.trim()[0] ?? 'A').toUpperCase()}</Text>
                  ) : (
                    <MaterialCommunityIcons name={ic as keyof typeof MaterialCommunityIcons.glyphMap} size={26} color={color} />
                  )}
                </Pressable>
              ))}
            </View>
            <View style={styles.photoRow}>
              <Pressable style={styles.secondaryButton} onPress={pickPhoto}>
                <MaterialCommunityIcons name="image-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.secondaryText}>{photoUri ? 'Trocar foto' : 'Usar foto'}</Text>
              </Pressable>
              {photoUri && (
                <Pressable style={styles.secondaryButton} onPress={() => setPhoto({ kind: 'remove' })}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>Remover foto</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.sectionTitle}>Segurança</Text>
            <View style={styles.panel}>
              <View style={styles.panelRow}>
                <MaterialCommunityIcons name={hasPin ? 'lock' : 'lock-open-variant-outline'} size={22} color={hasPin ? color : theme.colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelTitle}>{hasPin ? 'PIN ativado' : 'Sem PIN'}</Text>
                  <Text style={styles.panelHelp}>
                    {hasPin ? 'O Control pede o PIN ao abrir.' : 'Qualquer pessoa com o celular abre o Control.'}
                  </Text>
                </View>
              </View>
              <View style={styles.photoRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setCreatingPin(true)}>
                  <MaterialCommunityIcons name="numeric" size={20} color={theme.colors.primary} />
                  <Text style={styles.secondaryText}>{hasPin ? 'Trocar PIN' : 'Definir PIN'}</Text>
                </Pressable>
                {hasPin && (
                  <Pressable style={styles.secondaryButton} onPress={() => setPin({ kind: 'remove' })}>
                    <MaterialCommunityIcons name="lock-off-outline" size={20} color={theme.colors.textSecondary} />
                    <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>Remover PIN</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={styles.sectionTitle}>Conta Google</Text>
            <Pressable style={styles.panel} onPress={() => router.push('/conta')} accessibilityRole="button">
              <View style={styles.panelRow}>
                <MaterialCommunityIcons name="google" size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelTitle}>Conta e backup</Text>
                  <Text style={[styles.panelHelp, { marginTop: 4 }]}>
                    Ligue seu perfil à conta Google para levar as gavetas para a nuvem e compartilhar.
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
              </View>
            </Pressable>

            <Pressable style={[styles.saveButton, { backgroundColor: color }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveText}>SALVAR</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {creatingPin && (
        <PinModal
          mode="create"
          title={hasPin ? 'Novo PIN' : 'Definir PIN'}
          subtitle="Digite de 4 a 6 números"
          color={color}
          onCreate={value => { setPin({ kind: 'set', pin: value }); setCreatingPin(false); }}
          onCancel={() => setCreatingPin(false)}
        />
      )}

      <CustomModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        onConfirm={() => setNotice(null)}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, paddingBottom: 48 },
  preview: { alignItems: 'center', marginBottom: 8 },
  previewName: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 22, marginTop: 12 },
  label: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 13, marginTop: 20, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 16, fontFamily: theme.fonts.regular, color: theme.colors.text, backgroundColor: theme.colors.panel },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: theme.colors.text },
  iconOption: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  iconInitial: { fontFamily: theme.fonts.bold, fontSize: 22 },
  photoRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 14 },
  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 28, marginBottom: 8, textTransform: 'uppercase' },
  panel: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  panelTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  panelHelp: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 10 },
  saveButton: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  saveText: { color: theme.colors.onAccent, fontFamily: theme.fonts.bold, fontSize: 16, letterSpacing: 1 },
}));
