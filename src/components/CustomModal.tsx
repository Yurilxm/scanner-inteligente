import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';

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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { backgroundColor: Theme.colors.panel, borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: Theme.colors.border },
  title: { fontFamily: Theme.fonts.bold, fontSize: 20, color: Theme.colors.text, marginBottom: 8 },
  message: { fontFamily: Theme.fonts.regular, fontSize: 15, color: Theme.colors.textSecondary, marginBottom: 24, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: 'transparent' },
  confirmButton: { backgroundColor: Theme.colors.primary },
  destructiveButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Theme.colors.danger },
  cancelText: { fontFamily: Theme.fonts.medium, fontSize: 15, color: Theme.colors.textSecondary },
  confirmText: { fontFamily: Theme.fonts.bold, fontSize: 15, color: Theme.colors.background },
  destructiveText: { color: Theme.colors.danger },
});
