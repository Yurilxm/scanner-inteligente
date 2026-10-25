import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProfileAvatar } from './ProfileAvatar';
import { CustomModal } from './CustomModal';
import { makeStyles, useTheme } from '../theme';
import { PROFILE_COLORS } from '../db/profiles';
import { ROLE_DESCRIPTIONS, ROLE_ICONS, ROLE_LABELS } from '../sync/roles';
import type { OutgoingInvite, PendingInvite } from '../sync/sharing';
import { switchProfile } from '../utils/profileManager';
import { acceptReview, loadReviewEntries, refuseReview, type ReviewEntry } from '../sync/review';
import { getCurrentProfile } from '../db/database';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Tela do sininho: convites de gaveta recebidos (Aceitar/Recusar) e os que esta pessoa
// mandou e ainda esperam resposta (Cancelar). Sem conta, sem frase ou sem internet, não aparece nada.
export function InviteInbox() {
  const theme = useTheme();
  const styles = useStyles();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingInvite[]>([]);
  // Contas novas que outras pessoas adicionaram nas gavetas (montadas na sincronização)
  const [reviews, setReviews] = useState<ReviewEntry[]>(loadReviewEntries);
  const [confirmRefuse, setConfirmRefuse] = useState<ReviewEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; profileId?: string } | null>(null);

  const load = useCallback(() => {
    let active = true;
    setReviews(loadReviewEntries());
    // Sincroniza antes de mostrar: traz as contas novas dos outros e a fila de revisão atualizada
    import('../sync/engine')
      .then(engine => engine.syncAllProfiles())
      .catch(() => {})
      .finally(() => { if (active) setReviews(loadReviewEntries()); });
    import('../sync/sharing')
      // Uma lista com erro não esconde a outra
      .then(sharing => Promise.all([
        sharing.loadMyInvites().catch((): PendingInvite[] => []),
        sharing.loadOutgoingInvites().catch((): OutgoingInvite[] => []),
      ]))
      .then(([received, sent]) => {
        if (!active) return;
        setInvites(received);
        setOutgoing(sent);
      })
      .catch(() => {
        if (!active) return;
        setInvites([]);
        setOutgoing([]);
      });
    return () => { active = false; };
  }, []);

  useFocusEffect(load);

  const answer = async (invite: PendingInvite, accept: boolean) => {
    setBusyId(invite.id);
    try {
      const sharing = await import('../sync/sharing');
      const result = await sharing.answerMyInvite(invite, accept);
      setInvites(list => list.filter(i => i.id !== invite.id));
      const name = invite.meta.name || 'a gaveta';
      if (result) {
        setNotice({
          title: `Você entrou em ${name}`,
          message: result.syncError
            ? `As contas chegam na próxima sincronização (${result.syncError}).`
            : 'A gaveta e as contas já estão no seu celular.',
          profileId: result.profileId,
        });
      }
    } catch (e) {
      setNotice({ title: 'Não foi possível responder', message: errorText(e) });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (invite: OutgoingInvite) => {
    setBusyId(invite.id);
    try {
      const sharing = await import('../sync/sharing');
      await sharing.cancelOutgoingInvite(invite);
      setOutgoing(list => list.filter(i => i.id !== invite.id));
    } catch (e) {
      setNotice({ title: 'Não foi possível cancelar', message: errorText(e) });
    } finally {
      setBusyId(null);
    }
  };

  const openReview = (item: ReviewEntry) => {
    if (item.profile.id !== getCurrentProfile()) switchProfile(item.profile.id);
    router.push({ pathname: '/detalhes', params: { id: item.docId } });
  };

  const accept = (item: ReviewEntry) => {
    acceptReview(item.profile.id, item.docId);
    setReviews(loadReviewEntries());
  };

  const refuse = (item: ReviewEntry) => {
    setConfirmRefuse(null);
    try {
      refuseReview(item.profile.id, item.docId);
      setReviews(loadReviewEntries());
      import('../sync/engine').then(engine => engine.syncProfile(item.profile.id)).catch(e => console.warn('Sincronização', e));
    } catch (e) {
      setNotice({ title: 'Não foi possível recusar', message: errorText(e) });
    }
  };

  if (invites.length === 0 && outgoing.length === 0 && reviews.length === 0 && !notice) return null;

  return (
    <View style={styles.wrap}>
      {invites.length > 0 && <Text style={styles.sectionTitle}>CONVITES</Text>}
      {invites.map(invite => {
        const busy = busyId === invite.id;
        const name = invite.meta.name || 'Gaveta';
        return (
          <Animated.View key={invite.id} entering={FadeInUp} style={styles.card}>
            <View style={styles.top}>
              <ProfileAvatar
                name={name}
                color={invite.meta.color || PROFILE_COLORS[0]}
                icon={invite.meta.icon || 'initial'}
                photoUri={null}
                size={48}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  <Text style={styles.bold}>{invite.inviterName || 'Alguém'}</Text> convidou você para <Text style={styles.bold}>{name}</Text>
                </Text>
                <View style={styles.roleRow}>
                  <MaterialCommunityIcons name={ROLE_ICONS[invite.role] as never} size={14} color={theme.colors.primary} />
                  <Text style={styles.role}>{ROLE_LABELS[invite.role]}: {ROLE_DESCRIPTIONS[invite.role]}</Text>
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.decline} onPress={() => answer(invite, false)} disabled={busy}>
                <Text style={styles.declineText}>Recusar</Text>
              </Pressable>
              <Pressable style={[styles.accept, busy && { opacity: 0.6 }]} onPress={() => answer(invite, true)} disabled={busy}>
                {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color={theme.colors.onPrimary} />
                    <Text style={styles.acceptText}>Aceitar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Animated.View>
        );
      })}

      {reviews.length > 0 && <Text style={[styles.sectionTitle, invites.length > 0 && { marginTop: 8 }]}>CONTAS NOVAS NAS GAVETAS</Text>}
      {reviews.map(item => (
        <Animated.View key={`${item.profile.id}-${item.docId}`} entering={FadeInUp} style={styles.card}>
          <Pressable style={styles.top} onPress={() => openReview(item)} accessibilityLabel={`${item.text}, em ${item.profile.name}. Abrir a conta`}>
            <ProfileAvatar name={item.profile.name} color={item.profile.color} icon={item.profile.icon} photoUri={null} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.text}</Text>
              <Text style={styles.role}>{item.profile.name} · {new Date(item.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · toque para ver</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </Pressable>
          <View style={styles.actions}>
            {item.canRefuse && (
              <Pressable style={styles.decline} onPress={() => setConfirmRefuse(item)}>
                <Text style={styles.declineText}>Recusar</Text>
              </Pressable>
            )}
            <Pressable style={styles.accept} onPress={() => accept(item)}>
              <MaterialCommunityIcons name="check" size={18} color={theme.colors.onPrimary} />
              <Text style={styles.acceptText}>{item.canRefuse ? 'Aceitar' : 'Ok, vi'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ))}

      {outgoing.length > 0 && <Text style={[styles.sectionTitle, (invites.length > 0 || reviews.length > 0) && { marginTop: 8 }]}>AGUARDANDO RESPOSTA</Text>}
      {outgoing.map(invite => (
        <View key={`${invite.kind}-${invite.id}`} style={styles.outCard}>
          <MaterialCommunityIcons
            name={invite.kind === 'email' ? 'email-fast-outline' : 'qrcode'}
            size={24}
            color={theme.colors.textSecondary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.outTitle} numberOfLines={1}>
              {invite.kind === 'email' ? invite.name : 'Convite por QR code'} · {ROLE_LABELS[invite.role]}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {invite.profileName}{invite.email ? ` · ${invite.email}` : ''} · até {new Date(invite.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </Text>
          </View>
          <Pressable onPress={() => cancel(invite)} disabled={busyId === invite.id} hitSlop={8}>
            {busyId === invite.id
              ? <ActivityIndicator color={theme.colors.danger} />
              : <Text style={styles.cancelText}>Cancelar</Text>}
          </Pressable>
        </View>
      ))}

      <CustomModal
        visible={!!confirmRefuse}
        title="Recusar esta conta?"
        message={confirmRefuse ? `${confirmRefuse.text}. Ela será excluída da gaveta "${confirmRefuse.profile.name}" para todos que participam.` : ''}
        confirmText="Recusar e excluir"
        cancelText="Voltar"
        isDestructive
        onConfirm={() => confirmRefuse && refuse(confirmRefuse)}
        onCancel={() => setConfirmRefuse(null)}
      />

      <CustomModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        confirmText={notice?.profileId ? 'Abrir agora' : 'OK'}
        cancelText={notice?.profileId ? 'Depois' : undefined}
        onCancel={() => setNotice(null)}
        onConfirm={() => {
          const profileId = notice?.profileId;
          setNotice(null);
          if (profileId) {
            switchProfile(profileId);
            if (router.canDismiss()) router.dismissTo('/');
            else router.replace('/');
          }
        }}
      />
    </View>
  );
}

const useStyles = makeStyles(theme => ({
  wrap: { marginBottom: 8 },
  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.panel, marginBottom: 10, gap: 12 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { color: theme.colors.text, fontFamily: theme.fonts.regular, fontSize: 15, lineHeight: 21 },
  bold: { fontFamily: theme.fonts.bold },
  roleRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 4 },
  role: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  decline: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  declineText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 15 },
  accept: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, backgroundColor: theme.colors.primary },
  acceptText: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold, fontSize: 15 },
  outCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 10 },
  outTitle: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  cancelText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: 14 },
}));
