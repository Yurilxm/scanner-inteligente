import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useDocument } from '../src/context/DocumentContext';
import { extractTextFromImage } from '../src/utils/ocr';

export default function RevisaoScreen() {
  const { imageUri, ocrText, setOcrText, reset } = useDocument();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!imageUri) {
      router.replace('/');
      return;
    }

    let isMounted = true;

    async function runOcr() {
      try {
        setIsLoading(true);
        const text = await extractTextFromImage(imageUri!);
        if (isMounted) {
          setOcrText(text);
        }
      } catch {
        if (isMounted) {
          Alert.alert('Erro no OCR', 'Nao foi possivel ler o texto da imagem.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    runOcr();

    return () => {
      isMounted = false;
    };
  }, [imageUri, setOcrText]);

  if (!imageUri) return null;

  const onCancel = () => {
    reset();
    router.replace('/');
  };

  const onSave = () => {
    Alert.alert('Em construcao', 'O salvamento no banco de dados sera feito na Fase 5.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.label}>Texto reconhecido (edite se necessario):</Text>
        
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <Text style={styles.loadingText}>Processando OCR no aparelho...</Text>
          </View>
        ) : (
          <TextInput
            style={styles.textInput}
            multiline
            value={ocrText || ''}
            onChangeText={setOcrText}
            placeholder="Nenhum texto reconhecido."
            textAlignVertical="top"
          />
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.buttonSecondary} onPress={onCancel}>
          <Text style={styles.buttonTextSecondary}>Descartar</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onSave} disabled={isLoading}>
          <Text style={styles.buttonText}>Salvar Documento</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  imageContainer: {
    height: '40%',
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  textContainer: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, color: '#555' },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonTextSecondary: { color: '#555', fontSize: 16, fontWeight: '600' },
});
