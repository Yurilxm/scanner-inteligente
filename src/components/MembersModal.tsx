import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from './ProfileAvatar';
import { makeStyles, useTheme } from '../theme';
import type { Profile } from '../db/profiles';
import { ROLE_ICONS, ROLE_LABELS } from '../sync/roles';
import type { MemberRow } from '../sync/sharing';

type Props = { profile: Profile | null; onClose: () => void };

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; me: string; members: MemberRow[] };

// Quem faz parte de uma gaveta (olho na tela de Perfis). Quem usa passa key={profile.id},
// para o modal começar do zero (carregando) a cada gaveta.
export function MembersModal({ profile, onClose }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!profile) return;
    let active = true;
    import('../sync/sharing')
      .then(sharing => sharing.loadGaveta(profile.id))
      .then(g => { if (active) setState({ kind: 'ready', me: g.me, members: g.members }); })
      .catch(e => { if (active) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }); });
    return () => { active = false; };
  }, [profile]);

  const openGaveta = () => {
    if (!profile) return;
    onClose();
    router.push({ pathname: '/gaveta', params: { id: profile.id } });
  };

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          {profile && (
            <View style={styles.head}>
              <ProfileAvatar name={profile.name} color={profile.color} icon={profile.icon} photoUri={profile.photoUri} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{profile.name}</Text>
                <Text style={styles.label}>Quem faz parte desta gaveta</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}

          {state.kind === 'loading' && <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />}
          {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
          {state.kind === 'ready' && (
            <ScrollView style={{ maxHeight: 360 }}>
              {state.members.map((member, index) => (
                <View key={member.userId} style={[styles.row, index > 0 && styles.divider]}>
                  <View style={styles.initial}>
                    <Text style={styles.initialText}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{member.name}{member.userId === state.me ? ' (você)' : ''}</Text>
                    <Text style={styles.label} numberOfLines={1}>{member.email}</Text>
                  </View>
                  <View style={styles.chip}>
                    <MaterialCommunityIcons name={ROLE_ICONS[member.role] as never} size={14} color={theme.colors.primary} />
                    <Text style={styles.chipText}>{ROLE_LABELS[member.role]}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable style={styles.button} onPress={openGaveta}>
            <MaterialCommunityIcons name="history" size={18} color={theme.colors.primary} />
            <Text style={styles.buttonText}>Histórico e opções</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(theme => ({
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: theme.colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 18 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13 },
  error: { color: theme.colors.warning, fontFamily: theme.fonts.regular, fontSize: 14, marginVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  initial: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel },
  initialText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
  name: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  chipText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 12 },
  button: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
  buttonText: { color: theme.colors.primary, fontFamily: theme.fonts.bold, fontSize: 15 },
}));
