import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { CustomModal } from '../components/CustomModal';
import { makeStyles, useTheme } from '../theme';
import { AppUpdateRequired, loadAccount } from '../sync/loadAccount';
import type { AccountStatus } from '../sync/account';
import { listProfiles, type Profile } from '../db/profiles';

type Screen = { kind: 'loading' } | { kind: 'error'; message: string } | AccountStatus;

export default function ContaScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [updateRequired, setUpdateRequired] = useState(false);

  const refresh = useCallback(() => {
    let active = true;
    loadAccount()
      .then(account => account.getAccountStatus())
      .then(status => {
        if (!active) return;
        setUpdateRequired(false);
        setScreen(status);
        setProfiles(listProfiles());
        if (status.kind === 'signed-in' && status.identity === 'ready') {
          import('../sync/engine')
            .then(async engine => {
              // Traz as gavetas da nuvem e forca o download das contas imediatamente
              await engine.adoptRemoteVaults();
              await engine.syncAllProfiles();
            })
            .then(() => { if (active) setProfiles(listProfiles()); })
            .catch(e => console.warn('Gavetas da nuvem', e));
        }
      })
      .catch(e => {
        if (!active) return;
        if (e instanceof AppUpdateRequired) {
          setUpdateRequired(true);
          setScreen({ kind: 'signed-out' });
          return;
        }
        setScreen({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => { active = false; };
  }, []);

  useFocusEffect(refresh);

  const handleLogin = async () => {
    if (updateRequired) {
      setNotice({
        title: 'Falta instalar a versão nova',
        message: 'A tela de login está neste Control. Entrar com Google usa o navegador e o chaveiro do Android, que o app instalado ainda não tem. Quando o APK novo estiver no celular, este botão abre a conta do Google.',
      });
      return;
    }
    setBusy(true);
    try {
      const account = await loadAccount();
      await account.login();
      setScreen(await account.getAccountStatus());
    } catch (e) {
      setNotice({ title: 'Não foi possível entrar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const syncMessage = (report: { pushed: number; pulled: number; photosUp: number; photosDown: number }) => {
    const total = report.pushed + report.pulled + report.photosUp + report.photosDown;
    if (total === 0) return 'Tudo em dia.';
    return `Enviadas ${report.pushed}, recebidas ${report.pulled}. Fotos: ${report.photosUp} para a nuvem, ${report.photosDown} para este celular.`;
  };

  const runSyncAction = async (action: 'all' | 'enable', profileId?: string) => {
    setBusy(true);
    try {
      const engine = await import('../sync/engine');
      if (action === 'enable' && profileId) {
        const report = await engine.enableProfileSync(profileId);
        setNotice({ title: 'Gaveta na nuvem', message: report ? syncMessage(report) : 'Sincronização ativada.' });
      } else if (action === 'all') {
        const reports = await engine.syncAllProfiles();
        const sum = reports.reduce((acc, r) => ({
          pushed: acc.pushed + r.pushed,
          pulled: acc.pulled + r.pulled,
          photosUp: acc.photosUp + r.photosUp,
          photosDown: acc.photosDown + r.photosDown,
        }), { pushed: 0, pulled: 0, photosUp: 0, photosDown: 0 });
        setNotice({ title: reports.length ? 'Sincronizado' : 'Nada na nuvem', message: reports.length ? syncMessage(sum) : 'Ative a nuvem em pelo menos uma gaveta.' });
      }
    } catch (e) {
      setNotice({ title: 'Não foi possível sincronizar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setProfiles(listProfiles());
      setBusy(false);
    }
  };

  const handleBackupToGoogle = async () => {
    if (screen.kind !== 'signed-in') return;
    setBusy(true);
    try {
      const saved = await (await loadAccount()).backupPhraseToGoogle(screen.userId, screen.email);
      if (saved) {
        setNotice({ title: 'Frase salva', message: 'Ela está no Gerenciador de Senhas da sua conta Google, com o nome "Frase de recuperação do Control".' });
      }
    } catch (e) {
      setNotice({ title: 'Não foi possível salvar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFromGoogle = async () => {
    if (screen.kind !== 'signed-in') return;
    setBusy(true);
    try {
      const account = await loadAccount();
      if (await account.restoreFromGoogle(screen.userId)) {
        setScreen(await account.getAccountStatus());
        setNotice({ title: 'Celular conectado', message: 'Frase recuperada da sua conta Google e conferida.' });
      }
    } catch (e) {
      setNotice({ title: 'Não foi possível recuperar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (screen.kind !== 'signed-in') return;
    setConfirmLogout(false);
    setBusy(true);
    try {
      const account = await loadAccount();
      await account.logout(screen.userId);
      setScreen(await account.getAccountStatus());
    } catch (e) {
      setNotice({ title: 'Não foi possível sair', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
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
          <Text style={styles.headerTitle}>CONTA</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {screen.kind === 'loading' && <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 48 }} />}

          {screen.kind === 'error' && (
            <View style={[styles.card, { borderColor: theme.colors.warning }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.colors.warning} />
              <Text style={styles.cardTitle}>Login indisponível</Text>
              <Text style={styles.text}>{screen.message}</Text>
            </View>
          )}

          {screen.kind === 'not-configured' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sincronização não configurada</Text>
              <Text style={styles.text}>Esta versão do app foi gerada sem os dados do servidor.</Text>
            </View>
          )}

          {screen.kind === 'signed-out' && (
            <>
              <View style={styles.card}>
                <MaterialCommunityIcons name="cloud-lock-outline" size={36} color={theme.colors.primary} />
                <Text style={styles.cardTitle}>Backup e sincronização</Text>
                {[
                  'Opcional: o Control continua funcionando sem conta.',
                  'Suas contas são cifradas no celular antes de sair dele. Nem o servidor consegue lê-las.',
                  'Use em mais de um celular e compartilhe listas com quem você escolher.',
                ].map(line => (
                  <View key={line} style={styles.bullet}>
                    <MaterialCommunityIcons name="check" size={18} color={theme.colors.success} />
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
                <View style={styles.bullet}>
                  <MaterialCommunityIcons name="key-variant" size={18} color={theme.colors.warning} />
                  <Text style={styles.bulletText}>
                    O app cria uma frase de 12 palavras que abre seus dados. Você pode guardá-la na sua conta Google ou anotar em papel.
                  </Text>
                </View>
              </View>
              {updateRequired && (
                <Text style={styles.text}>Dá para ver esta tela agora. Entrar de verdade espera o APK novo, com o login incluído.</Text>
              )}
              <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
                {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                  <>
                    <MaterialCommunityIcons name="google" size={22} color={theme.colors.onPrimary} />
                    <Text style={styles.primaryText}>Entrar com Google</Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {screen.kind === 'signed-in' && (
            <>
              <View style={styles.card}>
                <MaterialCommunityIcons name="account-circle-outline" size={36} color={theme.colors.primary} />
                <Text style={styles.label}>Conectado como</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{screen.email || 'Conta Google'}</Text>
              </View>

              {screen.identity === 'needs-setup' && (
                <View style={[styles.card, { borderColor: theme.colors.warning }]}>
                  <MaterialCommunityIcons name="key-variant" size={28} color={theme.colors.warning} />
                  <Text style={styles.cardTitle}>Falta criar sua frase de recuperação</Text>
                  <Text style={styles.text}>É ela que protege e recupera seus dados. Dá para salvar direto na sua conta Google.</Text>
                  <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: '/frase', params: { modo: 'criar' } })}>
                    <Text style={styles.primaryText}>Criar frase de recuperação</Text>
                  </Pressable>
                </View>
              )}

              {screen.identity === 'needs-restore' && (
                <View style={[styles.card, { borderColor: theme.colors.warning }]}>
                  <MaterialCommunityIcons name="restore" size={28} color={theme.colors.warning} />
                  <Text style={styles.cardTitle}>Digite sua frase de recuperação</Text>
                  <Text style={styles.text}>Esta conta já tem uma frase. Digite-a para usar a nuvem neste celular.</Text>
                  <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} onPress={handleRestoreFromGoogle} disabled={busy}>
                    <MaterialCommunityIcons name="google" size={20} color={theme.colors.onPrimary} />
                    <Text style={styles.primaryText}>Recuperar da conta Google</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/frase', params: { modo: 'restaurar' } })}>
                    <Text style={styles.secondaryText}>Digitar frase</Text>
                  </Pressable>
                </View>
              )}

              {screen.identity === 'ready' && (
                <>
                  <View style={[styles.card, { borderColor: theme.colors.success }]}>
                    <MaterialCommunityIcons name="shield-check-outline" size={28} color={theme.colors.success} />
                    <Text style={styles.cardTitle}>Criptografia pronta</Text>
                    <Text style={styles.text}>Sua frase está guardada no chaveiro seguro deste celular.</Text>
                    <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/frase', params: { modo: 'ver' } })}>
                      <MaterialCommunityIcons name="eye-outline" size={20} color={theme.colors.primary} />
                      <Text style={styles.secondaryText}>Ver frase de recuperação</Text>
                    </Pressable>
                    <Pressable style={[styles.secondaryButton, busy && { opacity: 0.6 }]} onPress={handleBackupToGoogle} disabled={busy}>
                      <MaterialCommunityIcons name="google" size={20} color={theme.colors.primary} />
                      <Text style={styles.secondaryText}>Salvar frase na conta Google</Text>
                    </Pressable>
                    <Text style={styles.label}>
                      Fica nas senhas salvas da sua conta Google: num celular novo, recupera com um toque. O servidor do app continua sem conseguir ler suas contas.
                    </Text>
                  </View>
                  <View style={styles.card}>
                    <MaterialCommunityIcons name="cloud-sync-outline" size={28} color={theme.colors.primary} />
                    <Text style={styles.cardTitle}>Gavetas na nuvem</Text>
                    <Text style={styles.text}>Cada gaveta pode ter uma cópia cifrada na nuvem, para backup e para usar em outro celular. Sem internet, o celular continua com as contas dele.</Text>
                    {profiles.map(profile => (
                      <View key={profile.id} style={styles.profileRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bulletText}>{profile.name}</Text>
                          <Text style={styles.label}>{profile.vaultId ? 'Na nuvem' : 'Só neste celular'}</Text>
                        </View>
                        {!profile.vaultId && (
                          <Pressable onPress={() => runSyncAction('enable', profile.id)} disabled={busy}>
                            <Text style={styles.secondaryText}>Ativar</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                    <Pressable style={[styles.secondaryButton, busy && { opacity: 0.6 }]} onPress={() => runSyncAction('all')} disabled={busy}>
                      {busy ? <ActivityIndicator color={theme.colors.primary} /> : (
                        <Text style={styles.secondaryText}>Sincronizar agora</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}

              <Pressable style={styles.logout} onPress={() => setConfirmLogout(true)} disabled={busy}>
                <MaterialCommunityIcons name="logout" size={20} color={theme.colors.danger} />
                <Text style={styles.logoutText}>Sair da conta</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <CustomModal
        visible={confirmLogout}
        title="Sair da conta?"
        message="As contas continuam neste celular. A frase de recuperação será removida daqui: para entrar de novo, recupere da sua conta Google ou digite a frase."
        confirmText="Sair"
        cancelText="Cancelar"
        isDestructive
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
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
  content: { padding: 16, gap: 14 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, gap: 8 },
  cardTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13 },
  text: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { flex: 1, color: theme.colors.text, fontFamily: theme.fonts.regular, fontSize: 14, lineHeight: 20 },
  primaryButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, backgroundColor: theme.colors.primary, marginTop: 4 },
  primaryText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 16 },
  secondaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, marginTop: 4 },
  secondaryText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  logout: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 16 },
  logoutText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 15 },
}));
