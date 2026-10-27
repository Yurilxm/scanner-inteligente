import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';

import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { PinModal } from '../components/PinPad';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import { MAX_PROFILE_NAME, PROFILE_COLORS, PROFILE_ICONS } from '../db/profiles';
import { getPerfil, removePerfilPhoto, savePerfilPhoto, setAppPin, updatePerfil, appSetting, setAppSettingValue } from '../utils/perfil';

export default function MeuPerfilScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [perfil, setPerfil] = useState(getPerfil());
  const [name, setName] = useState(perfil.name);
  const [color, setColor] = useState(perfil.color);
  const [icon, setIcon] = useState(perfil.icon);
  const [photoUri, setPhotoUri] = useState(perfil.photoUri);
  const [modal, setModal] = useState<'pin' | 'remove_pin' | 'remove_bio' | 'success' | null>(null);
  const [useBio, setUseBio] = useState(appSetting('use_biometrics') === 'true');
  const [showExitModal, setShowExitModal] = useState(false);

  const hasChanges = name !== perfil.name || color !== perfil.color || icon !== perfil.icon || photoUri !== perfil.photoUri;
  
  const handleBack = () => {
    if (hasChanges) {
      setShowExitModal(true);
    } else {
      router.back();
    }
  };

  const save = () => {
    updatePerfil({ name, color, icon });
    if (photoUri !== perfil.photoUri) {
      if (photoUri) savePerfilPhoto(photoUri).catch(console.warn);
      else removePerfilPhoto().catch(console.warn);
    }
    router.back();
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleSetPin = (pin: string) => {
    setAppPin(pin);
    setPerfil(getPerfil());
    setModal('success');
  };

  const handleRemovePin = () => {
    setAppPin(null);
    setPerfil(getPerfil());
    setModal(null);
  };

  const handleRemoveBio = () => {
    if (perfil.hasPin) {
      setAppSettingValue('use_biometrics', 'false');
      setUseBio(false);
    } else {
      setModal('remove_bio');
    }
  };

  const toggleBiometrics = async () => {
    if (useBio) {
      setAppSettingValue('use_biometrics', 'false');
      setUseBio(false);
    } else {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Ative a biometria' });
      if (auth.success) {
        setAppSettingValue('use_biometrics', 'true');
        setUseBio(true);
      }
    }
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.title}>MEU PERFIL</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
            
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <ProfileAvatar name={name} color={color} icon={icon} photoUri={photoUri} size={100} />
            </View>

            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={MAX_PROFILE_NAME} placeholderTextColor={theme.colors.textSecondary} />

            <Text style={styles.label}>Cor</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              {PROFILE_COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorCircle, { backgroundColor: c, borderColor: color === c ? '#FFF' : 'transparent' }]} />
              ))}
            </View>

            <Text style={styles.label}>Avatar</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              {PROFILE_ICONS.map(i => (
                <Pressable key={i} onPress={() => setIcon(i)} style={[styles.iconBox, { borderColor: icon === i ? theme.colors.primary : 'transparent' }]}>
                  <ProfileAvatar name={name} color={color} icon={i} photoUri={null} size={36} />
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.photoBtn} onPress={pickImage}>
              <MaterialCommunityIcons name="image-plus" size={20} color={theme.colors.primary} />
              <Text style={styles.photoText}>Usar foto</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>SEGURANÇA</Text>

            {/* CARD DO PIN */}
            <View style={[styles.card, { marginBottom: 12 }]}>
              <View style={styles.pinHeader}>
                <MaterialCommunityIcons name="dialpad" size={24} color={theme.colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pinTitle}>{perfil.hasPin ? 'PIN Ativado' : 'Sem PIN'}</Text>
                  <Text style={styles.pinSubtitle}>{perfil.hasPin ? 'O Control pede o PIN ao abrir.' : 'Qualquer pessoa com seu celular abre o Control.'}</Text>
                </View>
              </View>
              <View style={styles.pinActions}>
                {perfil.hasPin ? (
                  <>
                    <Pressable style={styles.pinButton} onPress={() => setModal('pin')}>
                      <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.primary} />
                      <Text style={styles.pinButtonText}>Trocar PIN</Text>
                    </Pressable>
                    <Pressable style={styles.pinButton} onPress={() => { if (useBio) { setAppPin(null); setPerfil(getPerfil()); } else { setModal('remove_pin'); } }}>
                      <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.danger} />
                      <Text style={[styles.pinButtonText, { color: theme.colors.danger }]}>Remover PIN</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable style={styles.pinButton} onPress={() => setModal('pin')}>
                    <MaterialCommunityIcons name="plus" size={20} color={theme.colors.primary} />
                    <Text style={styles.pinButtonText}>Definir PIN</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* CARD DA BIOMETRIA */}
            <View style={styles.card}>
              <View style={styles.pinHeader}>
                <MaterialCommunityIcons name="fingerprint" size={24} color={theme.colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pinTitle}>{useBio ? 'Biometria Ativada' : 'Biometria Desativada'}</Text>
                  <Text style={styles.pinSubtitle}>Use sua digital ou rosto para entrar.</Text>
                </View>
              </View>
              <View style={styles.pinActions}>
                {useBio ? (
                  <Pressable style={styles.pinButton} onPress={handleRemoveBio}>
                    <MaterialCommunityIcons name="fingerprint-off" size={20} color={theme.colors.danger} />
                    <Text style={[styles.pinButtonText, { color: theme.colors.danger }]}>Remover Biometria</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.pinButton} onPress={toggleBiometrics}>
                    <MaterialCommunityIcons name="fingerprint" size={20} color={theme.colors.primary} />
                    <Text style={styles.pinButtonText}>Ativar Biometria</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={styles.sectionTitle}>CONTA GOOGLE</Text>
            <Pressable style={styles.card} onPress={() => router.push('/conta')}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="google" size={24} color={theme.colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pinTitle}>Conta e backup</Text>
                  <Text style={styles.pinSubtitle}>Ligue seu perfil à conta Google para levar as gavetas para a nuvem.</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
              </View>
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          <Pressable style={styles.saveButton} onPress={save}>
            <Text style={styles.saveText}>SALVAR</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {modal === 'pin' && (
          <PinModal
            title="Crie seu PIN"
            subtitle="Digite de 4 a 6 números"
            mode="create"
            onCreate={handleSetPin}
            onCancel={() => setModal(null)}
            cancelText="Cancelar"
          />
        )}
      <CustomModal
        visible={modal === 'remove_pin'}
        title="Remover PIN"
        message="Tem certeza que deseja remover a proteção por PIN? O app ficará desbloqueado."
        confirmText="Remover"
        cancelText="Cancelar"
        isDestructive
        onConfirm={handleRemovePin}
        onCancel={() => setModal(null)}
      />
      <CustomModal
        visible={modal === 'success'}
        title="Sucesso"
        message="O PIN foi configurado com sucesso."
        onConfirm={() => setModal(null)}
      />

      <CustomModal
        visible={modal === 'remove_bio'}
        title="Remover Biometria"
        message="Tem certeza que deseja remover a proteção por biometria? O app ficará desbloqueado."
        confirmText="Remover"
        cancelText="Cancelar"
        isDestructive
        onConfirm={() => { setAppSettingValue('use_biometrics', 'false'); setUseBio(false); setModal(null); }}
        onCancel={() => setModal(null)}
      />

      <CustomModal
        visible={showExitModal}
        title="Alterações não salvas"
        message="Você tem alterações que não foram salvas. Deseja salvar antes de sair?"
        confirmText="Salvar"
        cancelText="Sair sem salvar"
        onConfirm={() => { save(); setShowExitModal(false); }}
        onCancel={() => { setShowExitModal(false); router.back(); }}
      />

      <CustomModal
        visible={showExitModal}
        title="Alterações não salvas"
        message="Você tem alterações que não foram salvas. Deseja salvar antes de sair?"
        confirmText="Salvar"
        cancelText="Sair sem salvar"
        onConfirm={() => { save(); setShowExitModal(false); }}
        onCancel={() => { setShowExitModal(false); router.back(); }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 8 },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.primary, letterSpacing: 1 },
  label: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: theme.colors.panel, color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 16, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 24 },
  colorCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  iconBox: { borderWidth: 2, borderRadius: 24, padding: 4 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 32 },
  photoText: { color: theme.colors.primary, fontFamily: theme.fonts.bold },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12, letterSpacing: 1 },
  card: { backgroundColor: theme.colors.panel, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 16, marginBottom: 24 },
  pinHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  pinTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.text, marginBottom: 4 },
  pinSubtitle: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textSecondary },
  pinActions: { flexDirection: 'row', gap: 12 },
  pinButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: theme.colors.background },
  pinButtonText: { fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: theme.colors.border },
  saveButton: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 8, alignItems: 'center' },
  saveText: { color: theme.colors.background, fontFamily: theme.fonts.bold, fontSize: 16 },
}));
