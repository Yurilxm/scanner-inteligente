import { useCallback, useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { PinPad } from '../components/PinPad';
import { makeStyles, useTheme } from '../theme';
import { APP_NAME } from '../constants';
import { getCurrentProfile } from '../db/database';
import { Profile, canEdit, getProfile, listProfiles } from '../db/profiles';
import { ROLE_LABELS } from '../sync/roles';
import { getPerfil, appSetting } from '../utils/perfil';
import { AccountBadge } from '../components/AccountBadge';
import { loadAccount } from '../sync/loadAccount';
import type { LocalAccountStatus } from '../sync/account';
import { accountBadgeState } from '../sync/badge';
import * as LocalAuthentication from 'expo-local-authentication';
import { scheduleAllSync } from '../sync/schedule';
import { countReviewEntries } from '../sync/review';

export default function HomeScreen() {
  // PORTA DE ENTRADA: Se não existe nenhuma gaveta, joga pro Onboarding
  useEffect(() => {
    if (listProfiles().length === 0) {
      router.replace('/onboarding');
    }
  }, []);

  const theme = useTheme();
  const styles = useStyles();
  const [profile, setProfile] = useState<Profile | null>(() => getProfile(getCurrentProfile()));
  // PIN do app: pedido uma vez por abertura, nÃ£o ao trocar de gaveta
  
  
  

  
  const [account, setAccount] = useState<LocalAccountStatus | null>(null);
  const [inviteCount, setInviteCount] = useState(0);

  // Volta da tela de gavetas: a gaveta aberta pode ter mudado
  useFocusEffect(
    useCallback(() => {
      setProfile(getProfile(getCurrentProfile()));
      // SÃ³ dados locais (sessÃ£o e frase guardadas): a tela inicial nÃ£o espera a rede
      let active = true;
      loadAccount()
        .then(acc => acc.getLocalAccountStatus())
        .catch((): LocalAccountStatus => ({ kind: 'signed-out' }))
        .then(status => {
          if (!active) return;
          setAccount(status);
          // Convites de gaveta para mim viram uma bolinha no sininho (busca na rede, sem travar a tela)
          if (status.kind !== 'signed-in' || !status.hasPhrase) return setInviteCount(0);
          scheduleAllSync(); // gavetas em dia e avisos do que os outros fizeram
          import('../sync/sharing')
            .then(sharing => sharing.loadMyInvites())
            .then(list => { if (active) setInviteCount(list.length + countReviewEntries()); })
            .catch(() => { if (active) setInviteCount(0); });
        });
      return () => { active = false; };
    }, [])
  );

  const badge = accountBadgeState(account);

  

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>

      <View style={styles.topBar}>
        {profile ? (
          <Pressable
            style={[styles.profileChip, { borderColor: profile.color }]}
            onPress={() => router.push('/perfis')}
            accessibilityLabel={`Gaveta ${profile.name}. Trocar de gaveta`}
          >
            <ProfileAvatar name={profile.name} color={profile.color} icon={profile.icon} photoUri={profile.photoUri} size={32} />
            <Text style={styles.profileText} numberOfLines={1}>{profile.name}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={profile.color} />
          </Pressable>
        ) : <View />}
        <View style={styles.topActions}>
        {(badge === 'synced' || badge === 'pending') && account?.kind === 'signed-in' && (
          <AccountBadge state={badge} email={account.email} onPress={() => router.push('/conta')} />
        )}
        <Pressable
          style={styles.topButton}
          onPress={() => router.push('/lembretes')}
          accessibilityLabel={inviteCount > 0 ? `PrÃ³ximos lembretes e ${inviteCount} convite${inviteCount > 1 ? 's' : ''}` : 'PrÃ³ximos lembretes'}
        >
          <MaterialCommunityIcons name={inviteCount > 0 ? 'bell-badge-outline' : 'bell-outline'} size={28} color={theme.colors.primary} />
          {inviteCount > 0 && (
            <View style={styles.bellCount}>
              <Text style={styles.bellCountText}>{inviteCount > 9 ? '9+' : inviteCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable style={styles.topButton} onPress={() => router.push('/configuracoes')} accessibilityLabel="ConfiguraÃ§Ãµes">
          <MaterialCommunityIcons name="cog" size={28} color={theme.colors.primary} />
        </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons name="radar" size={64} color={theme.colors.primary} style={styles.icon} />
        <Text style={styles.title}>{APP_NAME.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Monitore, digitalize e organize suas contas.</Text>

        {profile && profile.role !== 'owner' && (
          <Pressable
            style={styles.sharedChip}
            onPress={() => router.push({ pathname: '/gaveta', params: { id: profile.id } })}
            accessibilityLabel={`Gaveta compartilhada. VocÃª Ã© ${ROLE_LABELS[profile.role]}`}
          >
            <MaterialCommunityIcons name="account-group-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.sharedText}>Gaveta compartilhada Â· {ROLE_LABELS[profile.role]}</Text>
          </Pressable>
        )}

        {(!profile || canEdit(profile.role)) && (
          <Pressable
            style={styles.button}
            onPress={() => router.push('/captura')}
          >
            <LinearGradient colors={[theme.colors.primary, theme.colors.success]} style={styles.buttonGradient}>
              <MaterialCommunityIcons name="barcode-scan" size={24} color={theme.colors.background} />
              <Text style={styles.buttonText}>NOVO DOCUMENTO</Text>
            </LinearGradient>
          </Pressable>
        )}

        <Pressable
          style={styles.buttonSecondary}
          onPress={() => router.push('/biblioteca')}
        >
          <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color={theme.colors.primary} />
          <Text style={styles.buttonTextSecondary}>ABRIR BIBLIOTECA</Text>
        </Pressable>

        {badge === 'signed-out' && (
          <Pressable
            style={[styles.buttonSecondary, styles.buttonLogin]}
            onPress={() => router.push('/conta')}
          >
            <MaterialCommunityIcons name="google" size={24} color={theme.colors.primary} />
            <Text style={styles.buttonTextSecondary}>ENTRAR</Text>
          </Pressable>
        )}
      </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  topBar: { paddingTop: 8, paddingLeft: 16, paddingRight: 8, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  topButton: { padding: 8 },
  bellCount: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.danger, borderWidth: 2, borderColor: theme.colors.background },
  bellCountText: { color: '#FFFFFF', fontFamily: theme.fonts.bold, fontSize: 10 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  icon: { marginBottom: 16, textShadowColor: theme.colors.primary, textShadowRadius: 20 },
  title: { fontSize: 32, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginBottom: 8, letterSpacing: 2 },
  subtitle: { fontSize: 16, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 40 },
  profileChip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 22, borderWidth: 1, backgroundColor: theme.colors.panel },
  profileText: { flexShrink: 1, color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  button: { width: '100%', maxWidth: 320, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  buttonGradient: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: theme.colors.background, fontSize: 16, fontFamily: theme.fonts.bold, letterSpacing: 1 },
  buttonSecondary: { width: '100%', maxWidth: 320, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, gap: 8, backgroundColor: theme.colors.panel },
  buttonLogin: { marginTop: 16 },
  sharedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginTop: -24, marginBottom: 24 },
  sharedText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 13 },
  buttonTextSecondary: { color: theme.colors.primary, fontSize: 16, fontFamily: theme.fonts.bold, letterSpacing: 1 },
}));
