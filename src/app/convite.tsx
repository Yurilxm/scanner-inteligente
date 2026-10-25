import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { makeStyles, useTheme } from '../theme';
import { PROFILE_COLORS, getProfile, listProfiles } from '../db/profiles';
import { ROLE_DESCRIPTIONS, ROLE_ICONS, ROLE_LABELS } from '../sync/roles';
import { loadAccount } from '../sync/loadAccount';
import type { InvitePreview } from '../sync/sharing';
import { switchProfile } from '../utils/profileManager';
import { inviteLinkFromParams } from '../utils/inviteText';

type Screen =
  | { kind: 'loading' }
  | { kind: 'needs-account'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'already'; profileId: string }
  | { kind: 'preview'; preview: InvitePreview }
  | { kind: 'joining'; preview: InvitePreview }
  | { kind: 'done'; profileId: string; syncError: string | null };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Aberta pelo QR (tela ler-convite) ou pelo link scannerinteligente://convite?i=...&s=...
export default function ConviteScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { i, s } = useLocalSearchParams<{ i?: string; s?: string }>();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  const check = useCallback(() => {
    let active = true;
    const done = (next: Screen) => { if (active) setScreen(next); };
    if (!i || !s) {
      done({ kind: 'error', message: 'Convite incompleto. Leia o QR de novo.' });
      return;
    }
    (async () => {
      const account = await loadAccount();
      const status = await account.getLocalAccountStatus();
      if (status.kind === 'signed-out') {
        return done({ kind: 'needs-account', message: 'Para entrar numa gaveta, primeiro entre com a sua conta Google.' });
      }
      if (!status.hasPhrase) {
        return done({ kind: 'needs-account', message: 'Falta a frase de recuperação neste celular: é ela que guarda a chave da gaveta para você.' });
      }
      const sharing = await import('../sync/sharing');
      const preview = await sharing.previewInvite(inviteLinkFromParams({ i, s }));
      const existing = listProfiles().find(p => p.vaultId === preview.vaultId);
      done(existing ? { kind: 'already', profileId: existing.id } : { kind: 'preview', preview });
    })().catch(e => done({ kind: 'error', message: errorText(e) }));
    return () => { active = false; };
  }, [i, s]);

  // Recarrega ao voltar da tela de Conta (depois de entrar ou criar a frase)
  useFocusEffect(check);

  const accept = async (preview: InvitePreview) => {
    setScreen({ kind: 'joining', preview });
    try {
      const sharing = await import('../sync/sharing');
      const result = await sharing.joinInvite(preview);
      setScreen({ kind: 'done', ...result });
    } catch (e) {
      setScreen({ kind: 'error', message: errorText(e) });
    }
  };

  const openProfile = (profileId: string) => {
    switchProfile(profileId);
    // Volta para a tela inicial que já está na pilha; aberto por link com o app fechado, não há pilha
    if (router.canDismiss()) router.dismissTo('/');
    else router.replace('/');
  };

  const preview = screen.kind === 'preview' || screen.kind === 'joining' ? screen.preview : null;
  const doneProfile = screen.kind === 'done' || screen.kind === 'already' ? getProfile(screen.profileId) : null;

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>CONVITE</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {screen.kind === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.text}>Conferindo o convite...</Text>
            </View>
          )}

          {screen.kind === 'needs-account' && (
            <View style={styles.card}>
              <MaterialCommunityIcons name="account-key-outline" size={32} color={theme.colors.warning} />
              <Text style={styles.cardTitle}>Quase lá</Text>
              <Text style={styles.text}>{screen.message}</Text>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/conta')}>
                <Text style={styles.primaryText}>Abrir Conta</Text>
              </Pressable>
              <Text style={styles.label}>Depois, volte para esta tela: o convite continua aqui.</Text>
            </View>
          )}

          {screen.kind === 'error' && (
            <View style={[styles.card, { borderColor: theme.colors.warning }]}>
              <MaterialCommunityIcons name="qrcode-remove" size={32} color={theme.colors.warning} />
              <Text style={styles.cardTitle}>Não deu para usar este convite</Text>
              <Text style={styles.text}>{screen.message}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => router.replace('/ler-convite')}>
                <Text style={styles.secondaryText}>Ler outro QR</Text>
              </Pressable>
            </View>
          )}

          {preview && (
            <>
              <View style={styles.hero}>
                <ProfileAvatar
                  name={preview.meta.name || 'Gaveta'}
                  color={preview.meta.color || PROFILE_COLORS[0]}
                  icon={preview.meta.icon || 'initial'}
                  photoUri={null}
                  size={84}
                />
                <Text style={styles.heroName}>{preview.meta.name || 'Gaveta'}</Text>
                <Text style={styles.text}>
                  <Text style={styles.bold}>{preview.inviterName || 'Alguém'}</Text> convidou você para dividir as contas desta gaveta.
                </Text>
              </View>
              <View style={styles.card}>
                <View style={styles.roleRow}>
                  <MaterialCommunityIcons name={ROLE_ICONS[preview.role] as never} size={26} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Você vai ser {ROLE_LABELS[preview.role]}</Text>
                    <Text style={styles.text}>{ROLE_DESCRIPTIONS[preview.role]}</Text>
                  </View>
                </View>
                <Text style={styles.label}>
                  As contas chegam cifradas: só quem participa da gaveta consegue abrir. Tudo que cada um faz fica no histórico.
                </Text>
              </View>
              <Pressable
                style={[styles.primaryButton, screen.kind === 'joining' && { opacity: 0.6 }]}
                onPress={() => accept(preview)}
                disabled={screen.kind === 'joining'}
              >
                {screen.kind === 'joining' ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                  <>
                    <MaterialCommunityIcons name="check" size={22} color={theme.colors.onPrimary} />
                    <Text style={styles.primaryText}>Entrar na gaveta</Text>
                  </>
                )}
              </Pressable>
              <Pressable style={styles.linkButton} onPress={() => router.back()} disabled={screen.kind === 'joining'}>
                <Text style={styles.linkText}>Agora não</Text>
              </Pressable>
            </>
          )}

          {(screen.kind === 'done' || screen.kind === 'already') && doneProfile && (
            <View style={styles.hero}>
              <ProfileAvatar name={doneProfile.name} color={doneProfile.color} icon={doneProfile.icon} photoUri={doneProfile.photoUri} size={84} />
              <MaterialCommunityIcons name="check-decagram" size={28} color={theme.colors.success} />
              <Text style={styles.heroName}>
                {screen.kind === 'done' ? `Você entrou em ${doneProfile.name}` : `Você já participa de ${doneProfile.name}`}
              </Text>
              {screen.kind === 'done' && screen.syncError && (
                <Text style={styles.text}>As contas ainda não vieram ({screen.syncError}). Elas chegam na próxima sincronização.</Text>
              )}
              <Pressable style={[styles.primaryButton, { alignSelf: 'stretch' }]} onPress={() => openProfile(doneProfile.id)}>
                <Text style={styles.primaryText}>Abrir a gaveta</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { alignItems: 'center', gap: 12, marginTop: 48 },
  hero: { alignItems: 'center', gap: 10, marginTop: 8 },
  heroName: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 22, textAlign: 'center' },
  card: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, gap: 10 },
  cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 17 },
  roleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  bold: { fontFamily: theme.fonts.bold, color: theme.colors.text },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 18 },
  primaryButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  linkButton: { alignItems: 'center', padding: 12 },
  linkText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 14, textDecorationLine: 'underline' },
}));
