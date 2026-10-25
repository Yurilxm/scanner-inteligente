import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import {
  MAX_PROFILE_NAME, PROFILE_COLORS, PROFILE_ICONS,
  createProfile, getProfile, listProfiles, normalizeProfileName, updateProfile,
} from '../db/profiles';
import { getCurrentProfile } from '../db/database';
import { FALLBACK_GAVETA_NAME, deleteGaveta } from '../utils/profileManager';
import { ROLE_LABELS } from '../sync/roles';

// Rota "perfil": criar ou editar uma gaveta (no código, cada gaveta é um profile).
// Gaveta tem nome, cor e ícone; PIN, tema e lembretes são do perfil da pessoa (meu-perfil).
export default function EditarGavetaScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getProfile(id) : null;
  const isNew = !existing;
  // Gaveta de outra pessoa: o nome, a cor e o ícone vêm do dono
  const sharedWithMe = !!existing && existing.role !== 'owner';

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? PROFILE_COLORS[(listProfiles().length) % PROFILE_COLORS.length]);
  const [icon, setIcon] = useState(existing?.icon ?? 'initial');
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Qualquer gaveta pode ser excluída, inclusive a aberta e a última (o app abre ou cria outra)
  const others = existing ? listProfiles().filter(p => p.id !== existing.id) : [];
  const deleteWarnings = existing ? [
    'Todas as contas, fotos e lembretes desta gaveta serão apagados deste celular. Isso não pode ser desfeito.',
    existing.vaultId && existing.role === 'owner'
      ? 'Ela também será apagada da nuvem e some para todos que participam dela.'
      : existing.vaultId ? 'Você sai da gaveta; quem compartilhou e os outros membros continuam com ela.' : null,
    existing.id === getCurrentProfile()
      ? (others.length > 0
        ? `Ela está aberta agora: depois, o app abre "${others[0].name}".`
        : `É a sua última gaveta: o app cria uma vazia, "${FALLBACK_GAVETA_NAME}".`)
      : null,
  ].filter((t): t is string => !!t) : [];

  const save = () => {
    if (saving) return;
    const finalName = normalizeProfileName(name);
    if (!finalName) {
      setNotice({ title: 'Nome obrigatório', message: 'Dê um nome à gaveta.' });
      return;
    }
    const duplicate = listProfiles().some(p => p.id !== existing?.id && p.name.toLowerCase() === finalName.toLowerCase());
    if (duplicate) {
      setNotice({ title: 'Nome já usado', message: `Já existe uma gaveta chamada "${finalName}".` });
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        updateProfile(existing.id, { name: finalName, color, icon });
        // Na nuvem: nome, cor e ícone novos chegam logo a quem participa
        if (existing.vaultId) {
          const gavetaId = existing.id;
          import('../sync/engine').then(engine => engine.syncProfile(gavetaId)).catch(e => console.warn('Sincronização', e));
        }
      } else {
        createProfile({ name: finalName, color, icon });
      }
      router.back();
    } catch (e) {
      setNotice({ title: 'Não foi possível salvar', message: e instanceof Error ? e.message : String(e) });
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!existing || removing) return;
    setRemoving(true);
    try {
      // Na nuvem primeiro: se falhar (ex.: sem internet), nada é apagado do celular
      if (existing.vaultId) await (await import('../sync/sharing')).removeFromCloud(existing.id);
      await deleteGaveta(existing.id);
      setDeleting(false);
      router.back();
    } catch (e) {
      setDeleting(false);
      setRemoving(false);
      setNotice({ title: 'Não foi possível excluir', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const openDelete = () => {
    setDeleteText('');
    setDeleting(true);
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? 'NOVA GAVETA' : 'EDITAR GAVETA'}</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.preview}>
              <ProfileAvatar name={name || '?'} color={color} icon={icon} photoUri={null} size={96} />
              <Text style={styles.previewName}>{normalizeProfileName(name) || 'Nova gaveta'}</Text>
              {isNew && (
                <Text style={[styles.panelHelp, { textAlign: 'center' }]}>
                  Separe as contas por assunto: Casa, Trabalho, Carro... Depois dá para compartilhar com quem quiser.
                </Text>
              )}
            </View>

            {sharedWithMe ? (
              <View style={[styles.panel, { marginTop: 20 }]}>
                <View style={styles.panelRow}>
                  <MaterialCommunityIcons name="account-group" size={22} color={color} />
                  <Text style={[styles.panelHelp, { flex: 1, marginTop: 0 }]}>
                    Gaveta compartilhada com você ({ROLE_LABELS[existing.role]}). O nome, a cor e o ícone são definidos por quem compartilhou.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Nome</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex: Casa, Trabalho, Carro"
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

                <Text style={styles.label}>Ícone</Text>
                <View style={styles.wrapRow}>
                  {PROFILE_ICONS.map(ic => (
                    <Pressable
                      key={ic}
                      onPress={() => setIcon(ic)}
                      style={[styles.iconOption, icon === ic && { borderColor: color, backgroundColor: theme.colors.primarySoft }]}
                    >
                      {ic === 'initial' ? (
                        <Text style={[styles.iconInitial, { color }]}>{(name.trim()[0] ?? 'A').toUpperCase()}</Text>
                      ) : (
                        <MaterialCommunityIcons name={ic as keyof typeof MaterialCommunityIcons.glyphMap} size={26} color={color} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {existing && (
              <>
                <Text style={styles.sectionTitle}>Compartilhamento</Text>
                <Pressable
                  style={styles.panel}
                  onPress={() => router.push({ pathname: '/gaveta', params: { id: existing.id } })}
                  accessibilityRole="button"
                >
                  <View style={styles.panelRow}>
                    <MaterialCommunityIcons name="account-group-outline" size={24} color={color} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.panelTitle}>
                        {existing.role === 'owner' ? 'Compartilhar esta gaveta' : 'Membros e histórico'}
                      </Text>
                      <Text style={[styles.panelHelp, { marginTop: 4 }]}>
                        {existing.role === 'owner'
                          ? 'Convide pessoas pelo e-mail ou QR code para ver, pagar ou editar as contas desta gaveta.'
                          : 'Veja quem participa desta gaveta e o que cada um fez.'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
                  </View>
                </Pressable>
              </>
            )}

            {!sharedWithMe && (
              <Pressable style={[styles.saveButton, { backgroundColor: color }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                <Text style={styles.saveText}>{isNew ? 'CRIAR GAVETA' : 'SALVAR'}</Text>
              </Pressable>
            )}

            {existing && (
              <Pressable style={styles.deleteButton} onPress={openDelete}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.danger} />
                <Text style={styles.deleteText}>
                  {existing.vaultId && existing.role !== 'owner' ? 'Sair e excluir do celular' : 'Excluir gaveta'}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={deleting} transparent animationType="fade" onRequestClose={() => setDeleting(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <MaterialCommunityIcons name="alert-outline" size={32} color={theme.colors.danger} />
            <Text style={styles.dialogTitle}>{`Excluir "${existing?.name}"?`}</Text>
            {deleteWarnings.map(text => <Text key={text} style={styles.dialogText}>{text}</Text>)}
            <Text style={styles.dialogText}>Digite o nome da gaveta para confirmar:</Text>
            <TextInput
              style={styles.input}
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder={existing?.name}
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
            />
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogCancel} onPress={() => setDeleting(false)}>
                <Text style={styles.dialogCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.dialogDelete, (removing || deleteText.trim().toLowerCase() !== existing?.name.toLowerCase()) && { opacity: 0.4 }]}
                disabled={removing || deleteText.trim().toLowerCase() !== existing?.name.toLowerCase()}
                onPress={confirmDelete}
              >
                <Text style={styles.dialogDeleteText}>{removing ? 'Excluindo...' : 'Excluir'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 28, marginBottom: 8, textTransform: 'uppercase' },
  panel: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  panelTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  panelHelp: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 10 },

  saveButton: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  saveText: { color: theme.colors.onAccent, fontFamily: theme.fonts.bold, fontSize: 16, letterSpacing: 1 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, marginTop: 12 },
  deleteText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 15 },

  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: theme.colors.background, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: theme.colors.danger, alignItems: 'stretch' },
  dialogTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 20, marginTop: 12 },
  dialogText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, marginTop: 8, marginBottom: 4, lineHeight: 20 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  dialogCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  dialogCancelText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 15 },
  dialogDelete: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.danger },
  dialogDeleteText: { color: theme.colors.danger, fontFamily: theme.fonts.bold, fontSize: 15 },
}));
