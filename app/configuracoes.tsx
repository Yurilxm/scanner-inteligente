import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../src/components/ScannerBackground';
import { Theme } from '../src/constants/theme';
import { getSetting, setSetting } from '../src/db/database';
import { CustomModal } from '../src/components/CustomModal';

export default function ConfiguracoesScreen() {
  const [daysBefore, setDaysBefore] = useState(() => parseInt(getSetting('notification_days_before', '5'), 10) || 5);
  const [frequency, setFrequency] = useState(() => getSetting('notification_frequency', 'once'));
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => getSetting('notifications_enabled', 'true') === 'true');
  const [cnpjLookupEnabled, setCnpjLookupEnabled] = useState(() => getSetting('cnpj_lookup_enabled', 'false') === 'true');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    setSetting('notification_days_before', String(daysBefore));
    setSetting('notification_frequency', frequency);
    setSetting('notifications_enabled', notificationsEnabled ? 'true' : 'false');
    setSetting('cnpj_lookup_enabled', cnpjLookupEnabled ? 'true' : 'false');
    setShowSuccess(true);
  };

  return (
    <LinearGradient colors={[Theme.colors.background, Theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={Theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>CONFIGURACOES</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Ativar Notificacoes</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#333', true: Theme.colors.primary }}
              thumbColor={notificationsEnabled ? '#fff' : '#888'}
            />
          </View>

          <Text style={styles.sectionTitle}>Notificacoes de Vencimento</Text>
          <Text style={styles.helpText}>Escolha quando quer ser avisado antes da conta vencer.</Text>

          <Text style={styles.label}>Avisar quantos dias antes?</Text>
          {[5, 3, 1].map((d) => (
            <Pressable
              key={d}
              style={[styles.option, daysBefore === d && styles.optionActive]}
              onPress={() => setDaysBefore(d)}
            >
              <Text style={[styles.optionText, daysBefore === d && styles.optionTextActive]}>
                {d} {d === 1 ? 'dia' : 'dias'} antes
              </Text>
            </Pressable>
          ))}

          <Text style={[styles.label, { marginTop: 24 }]}>Com que frequencia?</Text>
          <Pressable
            style={[styles.option, frequency === 'once' && styles.optionActive]}
            onPress={() => setFrequency('once')}
          >
            <Text style={[styles.optionText, frequency === 'once' && styles.optionTextActive]}>
              Uma vez so (no dia escolhido)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.option, frequency === 'daily' && styles.optionActive]}
            onPress={() => setFrequency('daily')}
          >
            <Text style={[styles.optionText, frequency === 'daily' && styles.optionTextActive]}>
              Todo dia nos ultimos {daysBefore} dias
            </Text>
          </Pressable>

          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Privacidade</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { flex: 1 }]}>Consultar CNPJ na internet</Text>
            <Switch
              value={cnpjLookupEnabled}
              onValueChange={setCnpjLookupEnabled}
              trackColor={{ false: '#333', true: Theme.colors.primary }}
              thumbColor={cnpjLookupEnabled ? '#fff' : '#888'}
            />
          </View>
          <Text style={[styles.helpText, { marginTop: -12 }]}>
            Quando o emissor nao for reconhecido, envia apenas o CNPJ da empresa para BrasilAPI, OpenCNPJ e PublicaCNPJ. Desligado, nenhum dado sai do aparelho.
          </Text>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveText}>SALVAR PREFERENCIAS</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <CustomModal
        visible={showSuccess}
        title="Salvo!"
        message="Suas preferencias foram atualizadas."
        confirmText="OK"
        onConfirm={() => { setShowSuccess(false); router.back(); }}
        onCancel={() => { setShowSuccess(false); router.back(); }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, letterSpacing: 1 },
  content: { padding: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.colors.panel, padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: Theme.colors.border },
  toggleLabel: { fontSize: 16, fontFamily: Theme.fonts.bold, color: Theme.colors.text },
  sectionTitle: { fontSize: 18, fontFamily: Theme.fonts.bold, color: Theme.colors.primary, marginBottom: 8 },
  helpText: { fontSize: 13, fontFamily: Theme.fonts.regular, color: Theme.colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 14, fontFamily: Theme.fonts.medium, color: Theme.colors.text, marginBottom: 12 },
  option: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: Theme.colors.panel, marginBottom: 8 },
  optionActive: { borderColor: Theme.colors.primary, backgroundColor: 'rgba(0, 212, 255, 0.1)' },
  optionText: { fontSize: 15, fontFamily: Theme.fonts.regular, color: Theme.colors.text },
  optionTextActive: { fontFamily: Theme.fonts.bold, color: Theme.colors.primary },
  saveButton: { backgroundColor: Theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  saveText: { color: Theme.colors.background, fontFamily: Theme.fonts.bold, fontSize: 16 },
});
