import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { makeStyles, useTheme } from '../theme';
import { ThemePicker } from '../components/ThemePicker';
import { setProfileTheme } from '../utils/profileManager';
import { appSetting, getPerfil, setAppSettingValue } from '../utils/perfil';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { CustomModal } from '../components/CustomModal';
import { scheduleTestReminder } from '../utils/notifications';
import * as Linking from 'expo-linking';

type UpdatesModule = typeof import('expo-updates');
// Carregado só se existir: APKs gerados antes do expo-updates não têm o módulo nativo e o import quebraria a tela
const Updates: UpdatesModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
})();

// Link do último APK de teste (muda a cada build; fica no .env.local e na variável do EAS)
const DEV_APK_URL = process.env.EXPO_PUBLIC_DEV_APK_URL;
// Seção de testes: no build de desenvolvimento e no APK de teste (canal preview), nunca na produção
const SHOW_DEV_SECTION = __DEV__ || Updates?.channel === 'preview';

function describeRunningUpdate(): string {
  if (__DEV__ || !Updates) return 'Rodando pelo servidor de desenvolvimento do PC.';
  const canal = Updates.channel ?? 'sem canal';
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `Canal ${canal} · versão que veio no APK.`;
  return `Canal ${canal} · atualização de ${Updates.createdAt.toLocaleString('pt-BR')}.`;
}

export default function ConfiguracoesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [daysBefore, setDaysBefore] = useState(() => parseInt(appSetting('notification_days_before'), 10) || 5);
  const [frequency, setFrequency] = useState(() => appSetting('notification_frequency'));
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => appSetting('notifications_enabled') === 'true');
  const [cnpjLookupEnabled, setCnpjLookupEnabled] = useState(() => appSetting('cnpj_lookup_enabled') === 'true');
  const [showSuccess, setShowSuccess] = useState(false);
  const [perfil, setPerfil] = useState(getPerfil);
  useFocusEffect(useCallback(() => setPerfil(getPerfil()), []));
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const handleSave = () => {
    setAppSettingValue('notification_days_before', String(daysBefore));
    setAppSettingValue('notification_frequency', frequency);
    setAppSettingValue('notifications_enabled', notificationsEnabled ? 'true' : 'false');
    setAppSettingValue('cnpj_lookup_enabled', cnpjLookupEnabled ? 'true' : 'false');
    setShowSuccess(true);
  };

  const handleDownloadDevApk = async () => {
    if (!DEV_APK_URL) {
      setNotice({ title: 'Link não configurado', message: 'Defina EXPO_PUBLIC_DEV_APK_URL no .env.local do PC e reinicie o servidor.' });
      return;
    }
    try {
      await Linking.openURL(DEV_APK_URL);
    } catch (e) {
      setNotice({ title: 'Não foi possível abrir o link', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const handleCheckUpdate = async () => {
    if (!Updates) return;
    setCheckingUpdate(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setNotice({ title: 'Está em dia', message: 'Não há atualização nova para este aparelho.' });
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // reinicia já na versão nova
    } catch (e) {
      setNotice({ title: 'Não foi possível atualizar', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTestReminder = async () => {
    try {
      await scheduleTestReminder(10);
      setNotice({ title: 'Lembrete agendado', message: 'Ele chega em 10 segundos. Minimize o app para ver como notificação.' });
    } catch (e) {
      setNotice({ title: 'Não foi possível agendar', message: e instanceof Error ? e.message : String(e) });
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
          <Text style={styles.headerTitle}>CONFIGURACOES</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Pressable style={styles.profileRow} onPress={() => router.push('/meu-perfil')}>
            <ProfileAvatar name={perfil.name} color={perfil.color} icon={perfil.icon} photoUri={perfil.photoUri} size={40} locked={perfil.hasPin} />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileHint}>Meu perfil</Text>
              <Text style={styles.profileName} numberOfLines={1}>{perfil.name}</Text>
            </View>
            <Text style={styles.profileLink}>Editar</Text>
          </Pressable>

          <Pressable style={styles.profileRow} onPress={() => router.push('/perfis')}>
            <MaterialCommunityIcons name="archive-outline" size={28} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>Gavetas</Text>
              <Text style={styles.profileHint}>Suas contas separadas por assunto; compartilhe as que quiser</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.primary} />
          </Pressable>

          <Pressable style={styles.profileRow} onPress={() => router.push('/conta')}>
            <MaterialCommunityIcons name="cloud-lock-outline" size={28} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>Conta e backup</Text>
              <Text style={styles.profileHint}>Login com Google e sincronização criptografada</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.primary} />
          </Pressable>

          <Text style={styles.sectionTitle}>Aparência</Text>
          <Text style={styles.helpText}>Vale para o app todo e muda na hora.</Text>
          <View style={{ marginBottom: 28 }}>
            <ThemePicker value={theme.name} onChange={setProfileTheme} />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Ativar Notificacoes</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: theme.colors.trackOff, true: theme.colors.primary }}
              thumbColor={notificationsEnabled ? theme.colors.thumbOn : theme.colors.thumbOff}
            />
          </View>

          <Text style={styles.sectionTitle}>Notificacoes de Vencimento</Text>
          <Text style={styles.helpText}>Escolha quando quer ser avisado antes da conta vencer.</Text>

          <Text style={styles.label}>Avisar quantos dias antes?</Text>
          {[5, 3, 1].map((d) => (
            <Pressable
              key={d}
              style={[styles.option, daysBefore === d && styles.optionActive]}
              onPress={() => setDaysBefore(d)}
            >
              <Text style={[styles.optionText, daysBefore === d && styles.optionTextActive]}>
                {d} {d === 1 ? 'dia' : 'dias'} antes
              </Text>
            </Pressable>
          ))}

          <Text style={[styles.label, { marginTop: 24 }]}>Com que frequencia?</Text>
          <Pressable
            style={[styles.option, frequency === 'once' && styles.optionActive]}
            onPress={() => setFrequency('once')}
          >
            <Text style={[styles.optionText, frequency === 'once' && styles.optionTextActive]}>
              Uma vez so (no dia escolhido)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.option, frequency === 'daily' && styles.optionActive]}
            onPress={() => setFrequency('daily')}
          >
            <Text style={[styles.optionText, frequency === 'daily' && styles.optionTextActive]}>
              Todo dia nos ultimos {daysBefore} dias
            </Text>
          </Pressable>

          <Pressable style={styles.remindersButton} onPress={() => router.push('/lembretes')}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.remindersText}>Ver próximos lembretes</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.primary} />
          </Pressable>

          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Privacidade</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { flex: 1 }]}>Consultar CNPJ na internet</Text>
            <Switch
              value={cnpjLookupEnabled}
              onValueChange={setCnpjLookupEnabled}
              trackColor={{ false: theme.colors.trackOff, true: theme.colors.primary }}
              thumbColor={cnpjLookupEnabled ? theme.colors.thumbOn : theme.colors.thumbOff}
            />
          </View>
          <Text style={[styles.helpText, { marginTop: -12 }]}>
            Quando o emissor nao for reconhecido, envia apenas o CNPJ da empresa para BrasilAPI, OpenCNPJ e PublicaCNPJ. Desligado, nenhum dado sai do aparelho.
          </Text>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveText}>SALVAR PREFERENCIAS</Text>
          </Pressable>

          {SHOW_DEV_SECTION && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Desenvolvimento</Text>
              <Text style={styles.helpText}>Visível só nos builds de teste. {describeRunningUpdate()}</Text>
              {!__DEV__ && (
                <Pressable style={styles.option} onPress={handleCheckUpdate} disabled={checkingUpdate}>
                  <Text style={styles.optionText}>{checkingUpdate ? 'Buscando atualização...' : 'Buscar atualização agora'}</Text>
                </Pressable>
              )}
              <Pressable style={styles.option} onPress={handleTestReminder}>
                <Text style={styles.optionText}>Disparar lembrete de teste em 10s</Text>
              </Pressable>
              <Pressable style={styles.option} onPress={handleDownloadDevApk}>
                <Text style={styles.optionText}>Baixar APK de teste mais recente</Text>
                <Text style={styles.helpText}>
                  {DEV_APK_URL ? 'Abre o download no navegador. Instale por cima deste app.' : 'Link não configurado (EXPO_PUBLIC_DEV_APK_URL).'}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <CustomModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        onConfirm={() => setNotice(null)}
      />

      <CustomModal
        visible={showSuccess}
        title="Salvo!"
        message="Suas preferencias foram atualizadas."
        confirmText="OK"
        onConfirm={() => { setShowSuccess(false); router.back(); }}
        onCancel={() => { setShowSuccess(false); router.back(); }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 24 },
  profileHint: { fontSize: 12, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary },
  profileName: { fontSize: 16, fontFamily: theme.fonts.bold, color: theme.colors.text },
  profileLink: { fontSize: 13, fontFamily: theme.fonts.bold, color: theme.colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.panel, padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: theme.colors.border },
  toggleLabel: { fontSize: 16, fontFamily: theme.fonts.bold, color: theme.colors.text },
  sectionTitle: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginBottom: 8 },
  helpText: { fontSize: 13, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 14, fontFamily: theme.fonts.medium, color: theme.colors.text, marginBottom: 12 },
  option: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 8 },
  optionActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  optionText: { fontSize: 15, fontFamily: theme.fonts.regular, color: theme.colors.text },
  optionTextActive: { fontFamily: theme.fonts.bold, color: theme.colors.primary },
  remindersButton: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, marginTop: 16 },
  remindersText: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.primary },
  saveButton: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  saveText: { color: theme.colors.background, fontFamily: theme.fonts.bold, fontSize: 16 },
}));
