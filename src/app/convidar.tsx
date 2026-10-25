import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Share, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import { getProfile } from '../db/profiles';
import { GUEST_ROLES, ROLE_DESCRIPTIONS, ROLE_ICONS, ROLE_LABELS, type GuestRole } from '../sync/roles';

type Invite = { link: string; expiresAt: string; role: GuestRole };
type Sent = { name: string; email: string; expiresAt: string; role: GuestRole };
type Mode = 'email' | 'qr';

const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

export default function ConvidarScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = id ? getProfile(id) : null;
  const [role, setRole] = useState<GuestRole>('payer');
  const [invite, setInvite] = useState<Invite | null>(null);
  // E-mail é o padrão: o convite chega no sininho da pessoa, sem QR nem mensagem
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const sharing = await import('../sync/sharing');
      const created = await sharing.createInvite(id, role);
      setInvite({ link: created.link, expiresAt: created.expiresAt, role });
    } catch (e) {
      setNotice({ title: 'Não foi possível criar o convite', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const sendByEmail = async () => {
    setBusy(true);
    try {
      const sharing = await import('../sync/sharing');
      const result = await sharing.inviteByEmail(id, email, role);
      setSent({ name: result.name, email: email.trim(), expiresAt: result.expiresAt, role });
    } catch (e) {
      setNotice({ title: 'Não foi possível convidar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!invite) return;
    await Share.share({
      message: `Convite para a gaveta "${profile?.name ?? ''}" no Control (${ROLE_LABELS[invite.role]}). Copie esta mensagem e, no Control, vá em Gavetas > Entrar numa gaveta (QR code) > Colar convite recebido por mensagem.\n\n${invite.link}`,
    });
  };

  const expires = invite ? new Date(invite.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>CONVIDAR</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!invite && !sent && (
            <>
              <View style={styles.tabs} accessibilityRole="tablist">
                {([['email', 'email-fast-outline', 'Pelo e-mail'], ['qr', 'qrcode', 'QR code']] as const).map(([value, icon, label]) => {
                  const active = mode === value;
                  return (
                    <Pressable
                      key={value}
                      style={[styles.tab, active && styles.tabActive]}
                      onPress={() => setMode(value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                    >
                      <MaterialCommunityIcons name={icon} size={18} color={active ? theme.colors.onPrimary : theme.colors.primary} />
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {mode === 'email' && (
                <>
                  <Text style={styles.text}>
                    Digite o e-mail Google que a pessoa usa no Control. O convite aparece no sininho do app dela, para aceitar ou recusar.
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="nome@gmail.com"
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                  />
                </>
              )}
              <Text style={styles.text}>
                Escolha o que a pessoa vai poder fazer em <Text style={styles.bold}>{profile?.name}</Text>. Dá para mudar depois.
              </Text>
              {GUEST_ROLES.map(option => {
                const active = option === role;
                return (
                  <Pressable
                    key={option}
                    style={[styles.roleOption, active && { borderColor: theme.colors.primary, borderWidth: 2 }]}
                    onPress={() => setRole(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <MaterialCommunityIcons name={ROLE_ICONS[option] as never} size={26} color={theme.colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleTitle}>{ROLE_LABELS[option]}</Text>
                      <Text style={styles.label}>{ROLE_DESCRIPTIONS[option]}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name={active ? 'radiobox-marked' : 'radiobox-blank'}
                      size={22}
                      color={active ? theme.colors.primary : theme.colors.textSecondary}
                    />
                  </Pressable>
                );
              })}
              {mode === 'email' ? (
                <Pressable
                  style={[styles.primaryButton, (busy || !looksLikeEmail(email)) && { opacity: 0.5 }]}
                  onPress={sendByEmail}
                  disabled={busy || !looksLikeEmail(email)}
                >
                  {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                    <>
                      <MaterialCommunityIcons name="send" size={20} color={theme.colors.onPrimary} />
                      <Text style={styles.primaryText}>Enviar convite</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} onPress={generate} disabled={busy}>
                  {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                    <>
                      <MaterialCommunityIcons name="qrcode" size={22} color={theme.colors.onPrimary} />
                      <Text style={styles.primaryText}>Gerar QR code</Text>
                    </>
                  )}
                </Pressable>
              )}
              {mode === 'email' && (
                <Text style={styles.label}>
                  A pessoa precisa já ter entrado no Control uma vez (com o Google e a frase de recuperação). Se ainda não usa, convide pelo QR code.
                </Text>
              )}
            </>
          )}

          {sent && (
            <>
              <View style={styles.qrCard}>
                <MaterialCommunityIcons name="email-check-outline" size={48} color={theme.colors.success} />
                <Text style={styles.qrTitle}>Convite enviado para {sent.name}</Text>
                <Text style={styles.label}>{sent.email} · {ROLE_LABELS[sent.role]}</Text>
                <Text style={[styles.label, { textAlign: 'center' }]}>
                  Aparece no sininho do Control da pessoa. Vale até {new Date(sent.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
                </Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
                <Text style={styles.secondaryText}>Voltar para a gaveta</Text>
              </Pressable>
              <Pressable style={styles.linkButton} onPress={() => { setSent(null); setEmail(''); }}>
                <Text style={styles.linkText}>Convidar outra pessoa</Text>
              </Pressable>
            </>
          )}

          {invite && (
            <>
              <View style={styles.qrCard}>
                {/* Fundo branco e margem: o leitor de QR precisa do contraste, em qualquer tema */}
                <View style={styles.qrBox}>
                  <QRCode value={invite.link} size={230} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
                </View>
                <Text style={styles.qrTitle}>{profile?.name} · {ROLE_LABELS[invite.role]}</Text>
                <Text style={styles.label}>Vale até {expires}, para uma pessoa só.</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Como a pessoa entra</Text>
                {[
                  'No celular dela, abra o Control e entre com a conta Google.',
                  'Vá em Gavetas > Entrar numa gaveta (QR code) e aponte para este código.',
                  'Ela confirma, e a gaveta aparece no celular dela, sincronizada com a sua.',
                ].map((line, i) => (
                  <View key={line} style={styles.bullet}>
                    <Text style={styles.step}>{i + 1}</Text>
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={styles.secondaryButton} onPress={shareLink}>
                <MaterialCommunityIcons name="share-variant" size={20} color={theme.colors.primary} />
                <Text style={styles.secondaryText}>Enviar por mensagem</Text>
              </Pressable>
              <Text style={styles.label}>
                A mensagem funciona como o QR: quem tiver ela pode entrar (uma vez, até expirar). Mande só para quem você quer convidar.
              </Text>
              <Pressable style={styles.linkButton} onPress={() => setInvite(null)}>
                <Text style={styles.linkText}>Gerar outro convite</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 15, lineHeight: 22 },
  bold: { fontFamily: theme.fonts.bold, color: theme.colors.text },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 18 },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  roleTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 16 },
  primaryButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary, marginTop: 8 },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  qrCard: { alignItems: 'center', gap: 8, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  qrBox: { padding: 16, borderRadius: 12, backgroundColor: '#FFFFFF' },
  qrTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18, marginTop: 8 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, gap: 10 },
  cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 16 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  step: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, overflow: 'hidden', backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 12 },
  bulletText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  linkButton: { alignItems: 'center', padding: 12 },
  tabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  tab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 14 },
  tabTextActive: { color: theme.colors.onPrimary },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: theme.fonts.regular, color: theme.colors.text, backgroundColor: theme.colors.panel },
  linkText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 14, textDecorationLine: 'underline' },
}));
