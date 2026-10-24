import * as ExpoCrypto from 'expo-crypto';
import { setRandomSource } from './crypto';

// Gerador aleatório seguro do sistema (SecureRandom no Android). Importar este módulo antes de gerar chaves.
setRandomSource(byteCount => ExpoCrypto.getRandomBytes(byteCount));
