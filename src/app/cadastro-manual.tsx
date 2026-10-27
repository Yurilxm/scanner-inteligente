import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getDocumentById, saveDocument, updateDocument } from '../db/database';
import { scheduleActiveSync } from '../sync/schedule';
import { brDateToISO, centsToDecimal, isoToBR, maskCurrency, maskDateInput } from '../utils/format';
import { parseBRLToCents } from '../utils/money';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScannerBackground } from '../components/ScannerBackground';
import { makeStyles, useTheme } from '../theme';
import { CustomModal } from '../components/CustomModal';
import { requestNotificationPermissions, scheduleDueDateReminder, cancelDueDateReminders } from '../utils/notifications';
import { ExtractedFields } from '../types/document';

// Cadastro de conta sem comprovante (sem foto, sem OCR).
// Serve tanto para criar quanto para editar quando recebe editId.
export default function CadastroManualScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  // Editando uma conta existente: le do banco uma vez (editId nao muda
  // durante a vida da tela). useMemo evita o setState sincrono dentro
  // de useEffect, que o react-hooks/set-state-in-effect bloqueia.
  const initialDoc = useMemo(() => (editId ? getDocumentById(editId) : null), [editId]);

  const [isSaving, setIsSaving] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [editIssuer, setEditIssuer] = useState(initialDoc?.issuer || '');
  const [editReference, setEditReference] = useState(initialDoc?.referenceMonth || '');
  const [editValue, setEditValue] = useState(() => centsToDecimal(initialDoc?.totalAmountCents ?? null));
  const [editDate, setEditDate] = useState(() => isoToBR(initialDoc?.dueDate));
  const [editPixKey, setEditPixKey] = useState(initialDoc?.pixKey || '');
  const [editObservacao, setEditObservacao] = useState(initialDoc?.observacao || '');
  const [editPaymentDate, setEditPaymentDate] = useState(() => isoToBR(initialDoc?.paymentDate));

  const onCancel = () => {
    router.back();
  };

  const onSave = async () => {
    if (isSaving) return;

    const trimmedIssuer = editIssuer.trim();
    if (!trimmedIssuer) {
      Alert.alert('Nome obrigatorio', 'Informe o nome ou descricao da conta.');
      return;
    }

    const dueDateIso = editDate.trim() ? brDateToISO(editDate) : null;
    if (editDate.trim() && !dueDateIso) {
      Alert.alert('Vencimento invalido', 'Informe a data no formato DD/MM/AAAA');
      return;
    }

    const totalAmountCents = editValue.trim() ? parseBRLToCents(editValue) : null;
    if (editValue.trim() && totalAmountCents === null) {
      Alert.alert('Valor invalido', 'Informe o valor no formato 1.234,56');
      return;
    }

    const paymentDateIso = editPaymentDate.trim() ? brDateToISO(editPaymentDate) : null;
    if (editPaymentDate.trim() && !paymentDateIso) {
      Alert.alert('Data de pagamento invalida', 'Informe a data no formato DD/MM/AAAA');
      return;
    }

    setIsSaving(true);
    try {
      // Conta manual e sempre 'CONTA', sem foto (imageUri vazio) e sem OCR.
      const fields: ExtractedFields = {
        documentType: 'CONTA',
        issuer: trimmedIssuer,
        referenceMonth: editReference.trim() || null,
        cnpj: null,
        cpf: null,
        totalAmountCents,
        dueDate: dueDateIso,
        boletoLine: null,
        pixKey: editPixKey.trim() || null,
      };

      let savedId: string;
      if (editId) {
        // Mantem imageUri/ocrText existentes (aqui serao '' e '')
        const existing = getDocumentById(editId);
        updateDocument(
          editId,
          existing?.imageUri || '',
          existing?.ocrText || '',
          fields,
          paymentDateIso,
          editObservacao.trim() || null,
        );
        savedId = editId;
      } else {
        savedId = saveDocument('', '', fields, paymentDateIso, editObservacao.trim() || null);
      }

      scheduleActiveSync();

      // Reagenda notificacao: cancela as antigas e cria se ainda esta pendente
      await cancelDueDateReminders(savedId).catch(() => {});
      if (!paymentDateIso && dueDateIso && trimmedIssuer) {
        try {
          await requestNotificationPermissions();
          await scheduleDueDateReminder(savedId, trimmedIssuer, dueDateIso);
        } catch (e) {
          console.warn('Erro ao agendar lembrete', e);
        }
      }

      setIsSuccessVisible(true);
    } catch (e) {
      console.error('Erro ao salvar conta manual', e);
      Alert.alert('Erro ao salvar', e instanceof Error ? e.message : String(e));
      setIsSaving(false);
    }
  };

  return (
    <LinearGradient colors={[theme.colors.background, theme.colors.backgroundGradient]} style={styles.container}>
      <ScannerBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{editId ? 'EDITAR CONTA' : 'NOVA CONTA'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Dados da Conta</Text>
          <Text style={styles.helpText}>
            Para contas que nao tem boleto nem comprovante (academia, curso, transporte).
            Voce sera avisado antes do vencimento.
          </Text>

          <Text style={styles.label}>Nome / Descricao *</Text>
          <TextInput
            style={styles.input}
            value={editIssuer}
            onChangeText={setEditIssuer}
            placeholder="Ex: Academia, Curso de ingles, Transporte"
          />

          <Text style={styles.label}>Referencia (MM/AAAA)</Text>
          <TextInput
            style={styles.input}
            value={editReference}
            onChangeText={setEditReference}
            placeholder="Ex: 11/2026"
          />

          <Text style={styles.label}>Valor Total (R$)</Text>
          <TextInput
            style={styles.input}
            value={editValue}
            onChangeText={(t) => setEditValue(maskCurrency(t))}
            keyboardType="numeric"
            placeholder="0,00"
          />

          <Text style={styles.label}>Data de Vencimento (DD/MM/AAAA)</Text>
          <TextInput
            style={styles.input}
            value={editDate}
            onChangeText={(t) => setEditDate(maskDateInput(t))}
            placeholder="DD/MM/AAAA"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Chave Pix (opcional)</Text>
          <TextInput
            style={styles.input}
            value={editPixKey}
            onChangeText={setEditPixKey}
            placeholder="Cole a chave Pix do recebedor"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.helpText}>Cole aqui para pagar depois em qualquer banco.</Text>

          <Text style={styles.label}>Observacao</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={editObservacao}
            onChangeText={setEditObservacao}
            placeholder="Anotacao livre"
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Data de Pagamento (opcional)</Text>
          <TextInput
            style={styles.input}
            value={editPaymentDate}
            onChangeText={(t) => setEditPaymentDate(maskDateInput(t))}
            placeholder="DD/MM/AAAA"
            keyboardType="numeric"
          />
          <Text style={styles.helpText}>Preencha se ja pagou. Deixe vazio para marcar depois.</Text>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.buttonSecondary} onPress={onCancel} disabled={isSaving}>
          <Text style={styles.buttonTextSecondary}>Cancelar</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onSave} disabled={isSaving}>
          <Text style={styles.buttonText}>{editId ? 'Salvar Alteracoes' : 'Salvar Conta'}</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
      </SafeAreaView>

      <CustomModal
        visible={isSuccessVisible}
        title="Sucesso!"
        message={editId ? 'Conta atualizada.' : 'Conta cadastrada. Voce sera avisado antes do vencimento.'}
        confirmText="OK"
        onConfirm={() => { setIsSuccessVisible(false); router.back(); }}
        onCancel={() => { setIsSuccessVisible(false); router.back(); }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles(theme => ({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.bold, color: theme.colors.primary, letterSpacing: 1 },
  formContainer: { padding: 16 },
  sectionTitle: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.primary, marginTop: 8, marginBottom: 8 },
  helpText: { fontSize: 13, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, marginBottom: 16, marginTop: 6 },
  label: { fontSize: 13, fontFamily: theme.fonts.medium, color: theme.colors.primary, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: theme.fonts.regular,
    color: theme.colors.text,
    backgroundColor: theme.colors.panel,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
    backgroundColor: theme.colors.panel,
  },
  button: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: theme.colors.background, fontFamily: theme.fonts.bold, fontSize: 16 },
  buttonSecondary: {
    flex: 1,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 16 },
}));
