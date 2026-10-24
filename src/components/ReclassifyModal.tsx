import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';
import { getLearnedPatternForCategory, saveLearnedCategory } from '../db/database';

// Sugere a palavra-chave: a ja aprendida para a categoria, senao o beneficiario, senao a primeira palavra longa
export function suggestKeyword(category: string, ocrText: string): string {
  const existing = getLearnedPatternForCategory(category);
  if (existing) return existing.toUpperCase();

  const benMatch = ocrText.match(/(?:BENEFICIARIO|CEDENTE)[^A-Z0-9]+([A-Z0-9\s]{4,40})/i);
  if (benMatch) return benMatch[1].trim().split(' ')[0].toUpperCase();

  const words = ocrText.split(/\s+/).filter(w => w.length > 4 && /^[A-Za-z]+$/.test(w));
  return words.length > 0 ? words[0].toUpperCase() : '';
}

type Props = {
  initialCategory: string;
  ocrText: string;
  title?: string;
  confirmText?: string;
  // Recebe a categoria ja normalizada, depois que o padrao foi aprendido
  onSaved: (category: string) => void;
  onCancel: () => void;
};

// Renderize condicionalmente ({visible && <ReclassifyModal />}) para recalcular a sugestao a cada abertura
export function ReclassifyModal({ initialCategory, ocrText, title = 'Reclassificar e Aprender', confirmText = 'Aprender', onSaved, onCancel }: Props) {
  const [category, setCategory] = useState(initialCategory);
  const [keyword, setKeyword] = useState(() => suggestKeyword(initialCategory, ocrText));

  const handleSave = () => {
    const cat = category.trim().toUpperCase();
    if (!cat || !keyword.trim()) return;
    saveLearnedCategory(keyword.trim(), cat);
    onSaved(cat);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.help}>
            Vou aprender que boletos com esta palavra-chave pertencem a esta categoria.
          </Text>

          <Text style={styles.label}>Nome da Categoria</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="Ex: CONDOMINIO CISNE BRANCO"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Palavra-chave (padrão)</Text>
          <TextInput
            style={styles.input}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Ex: CISNE BRANCO"
            autoCapitalize="characters"
          />

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.confirm} onPress={handleSave}>
              <Text style={styles.confirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: Theme.colors.panel, padding: 20, borderRadius: 12, width: '80%', borderWidth: 1, borderColor: Theme.colors.border },
  title: { fontSize: 18, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 16, textAlign: 'center' },
  help: { color: Theme.colors.textSecondary, fontSize: 12, marginBottom: 12, textAlign: 'center' },
  label: { fontSize: 13, fontFamily: Theme.fonts.medium, color: Theme.colors.primary, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: Theme.fonts.regular,
    color: Theme.colors.text,
    backgroundColor: Theme.colors.panel,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Theme.colors.border },
  cancelText: { color: Theme.colors.textSecondary, fontFamily: Theme.fonts.bold },
  confirm: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: Theme.colors.primary },
  confirmText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold },
});
