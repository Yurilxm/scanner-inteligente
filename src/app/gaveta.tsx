import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomModal } from '../components/CustomModal';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { makeStyles, useTheme } from '../theme';
import { getProfile } from '../db/profiles';
import { GUEST_ROLES, ROLE_DESCRIPTIONS, ROLE_ICONS, ROLE_LABELS, type GuestRole } from '../sync/roles';
import type { GavetaState, MemberRow } from '../sync/sharing';

type Screen =
  | { kind: 'loading' }
  | { kind: 'not-synced' }
  | { kind: 'error'; message: string; toAccount: boolean }
  | { kind: 'ready'; state: GavetaState };

type Confirm = { title: string; message: string; confirmText: string; action: () => Promise<void> };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Falta login ou frase: o caminho é a tela de Conta
const needsAccount = (message: string) => /Entre com o Google|frase de recuperação|não configurada/.test(message);

export default function GavetaScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState(() => (id ? getProfile(id) : null));
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; back?: boolean } | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    const current = id ? getProfile(id) : null;
    setProfile(current);
    if (!current) {
      setScreen({ kind: 'error', message: 'Gaveta não encontrada.', toAccount: false });
      return;
    }
    if (!current.vaultId) {
      setScreen({ kind: 'not-synced' });
      return;
    }
    import('../sync/sharing')
      .then(sharing => sharing.loadGaveta(current.id))
      .then(state => { if (active) setScreen({ kind: 'ready', state }); })
      .catch(e => {
        if (!active) return;
        const message = errorText(e);
        setProfile(getProfile(current.id)); // pode ter sido desligado da nuvem (removido)
        setScreen({ kind: 'error', message, toAccount: needsAccount(message) });
      });
    return () => { active = false; };
  }, [id]);

  useFocusEffect(refresh);

  const run = async (action: () => Promise<void>, done?: { title: string; message: string; back?: boolean }) => {
    setBusy(true);
    try {
      await action();
      if (done) setNotice(done);
      refresh();
    } catch (e) {
      setNotice({ title: 'Não foi possível concluir', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  // Leva a gaveta para a nuvem e já abre o convite (é para isso que a pessoa está aqui)
  const enableSync = async () => {
    setBusy(true);
    try {
      const engine = await import('../sync/engine');
      await engine.enableProfileSync(id);
      refresh();
      router.push({ pathname: '/convidar', params: { id } });
    } catch (e) {
      const message = errorText(e);
      setNotice({ title: 'Não foi possível ativar', message });
      if (needsAccount(message)) setScreen({ kind: 'error', message, toAccount: true });
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (member: MemberRow, role: GuestRole) => {
    setSelected(null);
    if (member.role === role) return;
    run(async () => (await import('../sync/sharing')).changeRole(id, member.userId, role));
  };

  const askRemove = (member: MemberRow) => {
    setSelected(null);
    setConfirm({
      title: `Remover ${member.name}?`,
      message: 'A pessoa deixa de ver esta gaveta. A chave dela é trocada: o que for registrado daqui em diante fica fora do alcance de quem saiu.',
      confirmText: 'Remover',
      action: async () => (await import('../sync/sharing')).removeMember(id, member.userId),
    });
  };

  const askLeave = () => setConfirm({
    title: 'Sair da gaveta?',
    message: 'Você deixa de receber as atualizações. As contas que já estão neste celular continuam aqui, só para você.',
    confirmText: 'Sair',
    action: async () => (await import('../sync/sharing')).leaveGaveta(id),
  });

  const runConfirm = () => {
    if (!confirm) return;
    const { action, title } = confirm;
    setConfirm(null);
    run(action, title.startsWith('Sair')
      ? { title: 'Você saiu da gaveta', message: 'A gaveta continua neste celular, sem sincronizar.', back: true }
      : undefined);
  };

  const state = screen.kind === 'ready' ? screen.state : null;
  const isOwner = state?.role === 'owner';

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>FAMÍLIA</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {profile && (
            <View style={styles.hero}>
              <ProfileAvatar name={profile.name} color={profile.color} icon={profile.icon} photoUri={profile.photoUri} size={64} />
              <Text style={styles.heroName}>{profile.name}</Text>
              {state && (
                <Text style={styles.label}>
                  {state.members.length === 1 ? 'Só você por enquanto' : `${state.members.length} pessoas`} · você é {ROLE_LABELS[state.role]}
                </Text>
              )}
            </View>
          )}

          {screen.kind === 'loading' && <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 32 }} />}

          {screen.kind === 'not-synced' && (
            <View style={styles.card}>
              <MaterialCommunityIcons name="cloud-lock-outline" size={32} color={theme.colors.primary} />
              <Text style={styles.cardTitle}>Falta um passo para convidar</Text>
              <Text style={styles.text}>
                Para dividir as contas, a gaveta precisa estar na nuvem. Ele vai cifrado: só quem você convidar consegue abrir.
              </Text>
              <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} onPress={enableSync} disabled={busy}>
                {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                  <>
                    <MaterialCommunityIcons name="qrcode-plus" size={22} color={theme.colors.onPrimary} />
                    <Text style={styles.primaryText}>Ativar e gerar convite</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {screen.kind === 'error' && (
            <View style={[styles.card, { borderColor: theme.colors.warning }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.colors.warning} />
              <Text style={styles.text}>{screen.message}</Text>
              {screen.toAccount ? (
                <Pressable style={styles.secondaryButton} onPress={() => router.push('/conta')}>
                  <Text style={styles.secondaryText}>Abrir Conta</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={refresh}>
                  <Text style={styles.secondaryText}>Tentar de novo</Text>
                </Pressable>
              )}
            </View>
          )}

          {state && (
            <>
              {isOwner && (
                <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: '/convidar', params: { id } })}>
                  <MaterialCommunityIcons name="qrcode-plus" size={22} color={theme.colors.onPrimary} />
                  <Text style={styles.primaryText}>Convidar pessoa</Text>
                </Pressable>
              )}

              <Text style={styles.sectionTitle}>Quem participa</Text>
              <View style={styles.card}>
                {state.members.map((member, index) => {
                  const me = member.userId === state.me;
                  const editable = isOwner && !me;
                  return (
                    <Pressable
                      key={member.userId}
                      style={[styles.memberRow, index > 0 && styles.divider]}
                      onPress={editable ? () => setSelected(member) : undefined}
                      disabled={!editable || busy}
                      accessibilityLabel={`${member.name}, ${ROLE_LABELS[member.role]}${editable ? '. Toque para mudar' : ''}`}
                    >
                      <View style={styles.initial}>
                        <Text style={styles.initialText}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName} numberOfLines={1}>{member.name}{me ? ' (você)' : ''}</Text>
                        <Text style={styles.label} numberOfLines={1}>{member.email}</Text>
                      </View>
                      <View style={styles.roleChip}>
                        <MaterialCommunityIcons name={ROLE_ICONS[member.role] as never} size={14} color={theme.colors.primary} />
                        <Text style={styles.roleText}>{ROLE_LABELS[member.role]}</Text>
                      </View>
                      {editable && <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />}
                    </Pressable>
                  );
                })}
              </View>

              {isOwner && (state.invites.length > 0 || state.sent.length > 0) && (
                <>
                  <Text style={styles.sectionTitle}>Convites esperando</Text>
                  <View style={styles.card}>
                    {state.sent.map((invite, index) => (
                      <View key={invite.id} style={[styles.memberRow, index > 0 && styles.divider]}>
                        <MaterialCommunityIcons name="email-fast-outline" size={24} color={theme.colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName} numberOfLines={1}>{invite.name} · {ROLE_LABELS[invite.role]}</Text>
                          <Text style={styles.label} numberOfLines={1}>{invite.email}</Text>
                        </View>
                        <Pressable
                          onPress={() => run(async () => (await import('../sync/sharing')).revokeSentInvite(invite.id))}
                          disabled={busy}
                          hitSlop={8}
                        >
                          <Text style={styles.dangerText}>Cancelar</Text>
                        </Pressable>
                      </View>
                    ))}
                    {state.invites.map((invite, index) => (
                      <View key={invite.id} style={[styles.memberRow, (index > 0 || state.sent.length > 0) && styles.divider]}>
                        <MaterialCommunityIcons name="qrcode" size={24} color={theme.colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>QR code · {ROLE_LABELS[invite.role]}</Text>
                          <Text style={styles.label}>Vale até {new Date(invite.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                        </View>
                        <Pressable
                          onPress={() => run(async () => (await import('../sync/sharing')).revokeInvite(invite.id))}
                          disabled={busy}
                          hitSlop={8}
                        >
                          <Text style={styles.dangerText}>Cancelar</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </>
              )}

              <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/historico', params: { id } })}>
                <MaterialCommunityIcons name="history" size={20} color={theme.colors.primary} />
                <Text style={styles.secondaryText}>Histórico</Text>
              </Pressable>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>O que cada um pode fazer</Text>
                {(['owner', ...GUEST_ROLES] as const).map(role => (
                  <View key={role} style={styles.bullet}>
                    <MaterialCommunityIcons name={ROLE_ICONS[role] as never} size={18} color={theme.colors.primary} />
                    <Text style={styles.bulletText}><Text style={styles.bold}>{ROLE_LABELS[role]}: </Text>{ROLE_DESCRIPTIONS[role]}</Text>
                  </View>
                ))}
              </View>

              {!isOwner && (
                <Pressable style={styles.leave} onPress={askLeave} disabled={busy}>
                  <MaterialCommunityIcons name="exit-run" size={20} color={theme.colors.danger} />
                  <Text style={styles.dangerText}>Sair da gaveta</Text>
                </Pressable>
              )}
            </>
          )}
          {busy && screen.kind === 'ready' && <ActivityIndicator color={theme.colors.primary} />}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.overlay} onPress={() => setSelected(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.cardTitle}>{selected?.name}</Text>
            <Text style={styles.label}>Escolha o que esta pessoa pode fazer</Text>
            {GUEST_ROLES.map(role => {
              const current = selected?.role === role;
              return (
                <Pressable
                  key={role}
                  style={[styles.roleOption, current && { borderColor: theme.colors.primary }]}
                  onPress={() => selected && changeRole(selected, role)}
                >
                  <MaterialCommunityIcons name={ROLE_ICONS[role] as never} size={22} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{ROLE_LABELS[role]}</Text>
                    <Text style={styles.label}>{ROLE_DESCRIPTIONS[role]}</Text>
                  </View>
                  {current && <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />}
                </Pressable>
              );
            })}
            <Pressable style={styles.leave} onPress={() => selected && askRemove(selected)}>
              <MaterialCommunityIcons name="account-remove-outline" size={20} color={theme.colors.danger} />
              <Text style={styles.dangerText}>Remover da gaveta</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <CustomModal
        visible={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmText={confirm?.confirmText}
        cancelText="Cancelar"
        isDestructive
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
      <CustomModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        onConfirm={() => {
          const back = notice?.back;
          setNotice(null);
          if (back) router.back();
        }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 4 },
  heroName: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 22 },
  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 8, textTransform: 'uppercase' },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, gap: 8 },
  cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 17 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: theme.fonts.bold, color: theme.colors.text },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  initial: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  initialText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 16 },
  memberName: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  roleText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 12 },
  primaryButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  dangerText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 15 },
  leave: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 16 },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
}));
