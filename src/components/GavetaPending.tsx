import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../theme';
import { getCurrentProfile, listPendingDocuments, type PendingDocument } from '../db/database';
import { listProfiles, type Profile } from '../db/profiles';
import { switchProfile } from '../utils/profileManager';
import { formatBRL, isoToBR } from '../utils/format';

type Row = PendingDocument & { profile: Profile };

const MAX_ROWS = 15;

// Contas não pagas das gavetas compartilhadas (na nuvem), da que vence primeiro
function collect(): Row[] {
  const rows = listProfiles()
    .filter(p => p.vaultId)
    .flatMap(profile => listPendingDocuments(profile.id).map(doc => ({ ...doc, profile })));
  return rows
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, MAX_ROWS);
}

function dueText(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: 'Sem vencimento', late: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${iso}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `Venceu em ${isoToBR(iso)}`, late: true };
  if (days === 0) return { text: 'Vence hoje', late: true };
  if (days === 1) return { text: 'Vence amanhã', late: false };
  return { text: `Vence em ${days} dias (${isoToBR(iso)})`, late: false };
}

export function GavetaPending() {
  const theme = useTheme();
  const styles = useStyles();
  const [rows, setRows] = useState<Row[]>(() => collect());

  // Mostra o que já está no celular e, em seguida, sincroniza as gavetas para trazer
  // as contas que os outros membros adicionaram
  useFocusEffect(useCallback(() => {
    setRows(collect());
  }, []));

  const open = (row: Row) => {
    if (row.profile.id !== getCurrentProfile()) switchProfile(row.profile.id);
    router.push({ pathname: '/detalhes', params: { id: row.id } });
  };

  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>PENDENTES NAS GAVETAS</Text>
      {rows.map(row => {
        const due = dueText(row.dueDate);
        return (
          <Pressable
            key={`${row.profile.id}-${row.id}`}
            style={styles.row}
            onPress={() => open(row)}
            accessibilityLabel={`${row.issuer || 'Conta'} em ${row.profile.name}, ${due.text}`}
          >
            <View style={[styles.dot, { backgroundColor: row.profile.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{row.issuer || 'Conta sem emissor'}</Text>
              <Text style={[styles.detail, due.late && { color: theme.colors.danger }]} numberOfLines={1}>
                {row.profile.name} · {due.text}
              </Text>
            </View>
            {row.totalAmountCents ? <Text style={styles.value}>{formatBRL(row.totalAmountCents)}</Text> : null}
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(theme => ({
  wrap: { marginBottom: 8 },
  sectionTitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  detail: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 13, marginTop: 2 },
  value: { color: theme.colors.text, fontFamily: theme.fonts.bold, fontSize: 14 },
}));
