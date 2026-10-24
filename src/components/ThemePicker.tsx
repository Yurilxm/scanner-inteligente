import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEMES, THEME_ORDER, ThemeName, makeStyles, useTheme } from '../theme';

type Props = {
  value: ThemeName;
  onChange: (name: ThemeName) => void;
};

// Cada cartão é uma miniatura desenhada com as cores do próprio tema
export function ThemePicker({ value, onChange }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {THEME_ORDER.map(name => {
        const t = THEMES[name];
        const selected = value === name;
        return (
          <Pressable
            key={name}
            onPress={() => onChange(name)}
            style={[styles.card, selected && { borderColor: theme.colors.primary, borderWidth: 2 }]}
            accessibilityLabel={`Tema ${t.label}`}
            accessibilityState={{ selected }}
          >
            <View style={[styles.preview, { backgroundColor: t.colors.background }]}>
              <View style={[styles.previewPanel, { backgroundColor: t.colors.panel, borderColor: t.colors.border }]}>
                <View style={[styles.previewLine, { backgroundColor: t.colors.text, width: '70%' }]} />
                <View style={[styles.previewLine, { backgroundColor: t.colors.textSecondary, width: '45%' }]} />
              </View>
              <View style={[styles.previewButton, { backgroundColor: t.colors.primary }]} />
            </View>
            <View style={styles.labelRow}>
              <Text style={[styles.label, selected && { color: theme.colors.primary }]}>{t.label}</Text>
              {selected && <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(theme => ({
  row: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, padding: 8 },
  preview: { height: 72, borderRadius: 8, padding: 8, justifyContent: 'space-between' },
  previewPanel: { borderRadius: 5, borderWidth: 1, padding: 5, gap: 4 },
  previewLine: { height: 4, borderRadius: 2 },
  previewButton: { height: 10, borderRadius: 5, width: '60%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 },
  label: { color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 13 },
}));
