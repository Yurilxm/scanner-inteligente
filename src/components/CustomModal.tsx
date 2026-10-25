import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { makeStyles } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  isDestructive?: boolean;
};

export function CustomModal({ visible, title, message, confirmText = 'OK', cancelText, onConfirm, onCancel, isDestructive }: Props) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
          <View style={styles.actions}>
            {cancelText && onCancel && (
              <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                <Text style={styles.cancelText}>{cancelText}</Text>
              </Pressable>
            )}
            <Pressable style={[styles.button, isDestructive ? styles.destructiveButton : styles.confirmButton]} onPress={onConfirm}>
              <Text style={[styles.confirmText, isDestructive && styles.destructiveText]}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(theme => ({
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { backgroundColor: theme.colors.panel, borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: theme.colors.border },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.text, marginBottom: 8 },
  message: { fontFamily: theme.fonts.regular, fontSize: 15, color: theme.colors.textSecondary, marginBottom: 24, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: 'transparent' },
  confirmButton: { backgroundColor: theme.colors.primary },
  destructiveButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.danger },
  cancelText: { fontFamily: theme.fonts.medium, fontSize: 15, color: theme.colors.textSecondary },
  confirmText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.background },
  destructiveText: { color: theme.colors.danger },
}));
