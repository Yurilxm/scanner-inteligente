import { View, Text, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../theme';

type Props = {
  name: string;
  color: string;
  icon: string;
  photoUri?: string | null;
  size?: number;
  locked?: boolean;
};

// Foto > ícone > inicial do nome, sempre num círculo da cor do perfil
export function ProfileAvatar({ name, color, icon, photoUri, size = 48, locked }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const inner = size - 4;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
      ) : (
        <View style={[styles.fill, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }]}>
          {icon === 'initial' ? (
            <Text style={[styles.initial, { fontSize: inner * 0.45 }]}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
          ) : (
            <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={inner * 0.55} color={theme.colors.onAccent} />
          )}
        </View>
      )}
      {locked && (
        <View style={[styles.lock, { right: -2, bottom: -2 }]}>
          <MaterialCommunityIcons name="lock" size={Math.max(12, size * 0.26)} color={theme.colors.text} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(theme => ({
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fill: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: theme.fonts.bold, color: theme.colors.onAccent },
  lock: { position: 'absolute', backgroundColor: theme.colors.background, borderRadius: 10, padding: 2, borderWidth: 1, borderColor: theme.colors.border },
}));
