import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { MembersModal } from '../components/MembersModal';
import { makeStyles, useTheme } from '../theme';
import { Profile, listProfiles } from '../db/profiles';
import { countProfileDocuments, getCurrentProfile, getProfileSettings } from '../db/database';
import { switchProfile } from '../utils/profileManager';
import { GAVETA_MEMBERS_SETTING, GAVETA_OWNER_SETTING, GAVETA_SYNC_ERROR_SETTING, ROLE_LABELS, parseCachedMembers, sharedWithText } from '../sync/roles';

// Rota "perfis": lista as gavetas (no código, cada gaveta é um profile)
type Row = Profile & { summary: string; ownerName: string; sharedWith: string | null; syncError: string };

export default function GavetasScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState(getCurrentProfile());
  const [membersOf, setMembersOf] = useState<Profile | null>(null);

  const load = useCallback(() => {
    setActiveId(getCurrentProfile());
    setRows(listProfiles().map(p => {
      // Gaveta de outra pessoa: quem compartilhou (vem com o nome da gaveta, na sincronização)
      // e quem participa (cópia local da última sincronização)
      const settings = getProfileSettings(p.id, { [GAVETA_OWNER_SETTING]: '', [GAVETA_MEMBERS_SETTING]: '[]', [GAVETA_SYNC_ERROR_SETTING]: '' });
      const ownerName = p.role !== 'owner' ? settings[GAVETA_OWNER_SETTING] : '';
      const sharedWith = p.vaultId ? sharedWithText(parseCachedMembers(settings[GAVETA_MEMBERS_SETTING])) : null;
      const { total, pending: open } = countProfileDocuments(p.id);
      const contas = total === 1 ? '1 conta' : `${total} contas`;
      const syncError = p.vaultId ? settings[GAVETA_SYNC_ERROR_SETTING] : '';
      return { ...p, ownerName, sharedWith, syncError, summary: open > 0 ? `${contas} · ${open} pendente${open > 1 ? 's' : ''}` : contas };
    }));
  }, []);

  // Mostra o que já está no celular e, depois de sincronizar, quem entrou ou saiu das gavetas
  useFocusEffect(useCallback(() => {
    let active = true;
    load();
    import('../sync/engine')
      .then(engine => engine.syncAllProfiles())
      .catch(() => {})
      .finally(() => { if (active) load(); });
    return () => { active = false; };
  }, [load]));

  const open = (gaveta: Profile) => {
    if (gaveta.id !== getCurrentProfile()) switchProfile(gaveta.id);
    router.back();
  };

  const mine = rows.filter(r => r.role === 'owner');
  const shared = rows.filter(r => r.role !== 'owner');

  const renderRow = (item: Row) => {
    const active = item.id === activeId;
    const isMine = item.role === 'owner';
    return (
      <Pressable key={item.id} style={[styles.card, active && { borderColor: item.color }]} onPress={() => open(item)}>
        <ProfileAvatar name={item.name} color={item.color} icon={item.icon} photoUri={null} size={52} />
        <View style={styles.cardContent}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {active && (
              <View style={[styles.badge, { backgroundColor: item.color }]}>
                <Text style={styles.badgeText}>ABERTA</Text>
              </View>
            )}
          </View>
          {isMine && item.sharedWith && (
            <View style={styles.sharedRow}>
              <MaterialCommunityIcons name="account-group" size={14} color={item.color} />
              <Text style={styles.sharedText} numberOfLines={1}>{item.sharedWith}</Text>
            </View>
          )}
          {!isMine && (
            <View style={styles.sharedRow}>
              <MaterialCommunityIcons name="account-group" size={14} color={item.color} />
              <Text style={styles.sharedText} numberOfLines={1}>
                {item.ownerName ? `Compartilhada por ${item.ownerName}` : 'Compartilhada com você'} · {ROLE_LABELS[item.role]}
              </Text>
            </View>
          )}
          <Text style={styles.summary}>
            {isMine && item.vaultId ? 'Na nuvem · ' : ''}{item.summary}
          </Text>
          {!!item.syncError && (
            <View style={styles.sharedRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.colors.warning} />
              <Text style={styles.errorText} numberOfLines={2}>Não sincronizou: {item.syncError}</Text>
            </View>
          )}
        </View>
        {isMine && item.sharedWith && (
          <Pressable
            hitSlop={8}
            style={styles.action}
            onPress={() => setMembersOf(item)}
            accessibilityLabel={`Ver quem faz parte de ${item.name}`}
          >
            <MaterialCommunityIcons name="eye-outline" size={22} color={theme.colors.primary} />
          </Pressable>
        )}
        {isMine ? (
          <Pressable
            hitSlop={8}
            style={styles.action}
            onPress={() => router.push({ pathname: '/gaveta', params: { id: item.id } })}
            accessibilityLabel={`Compartilhar ${item.name}`}
          >
            <MaterialCommunityIcons name="account-group-outline" size={22} color={theme.colors.primary} />
          </Pressable>
        ) : (
          <Pressable
            hitSlop={8}
            style={styles.action}
            onPress={() => setMembersOf(item)}
            accessibilityLabel={`Ver quem faz parte de ${item.name}`}
          >
            <MaterialCommunityIcons name="eye-outline" size={22} color={theme.colors.primary} />
          </Pressable>
        )}
        <Pressable
          hitSlop={8}
          style={styles.action}
          onPress={() => router.push({ pathname: '/perfil', params: { id: item.id } })}
          accessibilityLabel={`Editar gaveta ${item.name}`}
        >
          <MaterialCommunityIcons name="pencil-outline" size={22} color={theme.colors.primary} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>GAVETAS</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.help}>
            Separe as contas por assunto (casa, trabalho, carro...). Cada gaveta pode ficar só no celular, na nuvem ou ser compartilhada.
          </Text>

          <Text style={styles.sectionTitle}>Minhas gavetas</Text>
          {mine.map(renderRow)}
          <Pressable style={styles.addButton} onPress={() => router.push('/perfil')}>
            <MaterialCommunityIcons name="plus" size={22} color={theme.colors.primary} />
            <Text style={styles.addText}>Nova gaveta</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Compartilhadas comigo</Text>
          {shared.length > 0 ? shared.map(renderRow) : (
            <Text style={styles.help}>Quando alguém compartilhar uma gaveta com você, ela aparece aqui.</Text>
          )}
          <Pressable style={styles.addButton} onPress={() => router.push('/ler-convite')}>
            <MaterialCommunityIcons name="qrcode-scan" size={22} color={theme.colors.primary} />
            <Text style={styles.addText}>Entrar numa gaveta (QR code)</Text>
          </Pressable>
          <Text style={[styles.help, { marginTop: 10 }]}>
            Convites pelo e-mail aparecem no sininho da tela inicial. Para compartilhar uma gaveta sua, toque no ícone de pessoas ao lado dela.
          </Text>
        </ScrollView>
      </SafeAreaView>

      <MembersModal key={membersOf?.id ?? 'nenhum'} profile={membersOf} onClose={() => setMembersOf(null)} />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  list: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  help: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 12 },
  cardContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 17 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: theme.colors.onAccent, fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sharedText: { flexShrink: 1, color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 13 },
  summary: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 2 },
  errorText: { flexShrink: 1, color: theme.colors.warning, fontFamily: theme.fonts.regular, fontSize: 12 },
  action: { padding: 6 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary },
  addText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 16 },
}));
