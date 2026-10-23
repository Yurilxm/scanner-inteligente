// Mock do Reanimated manual e leve (evita carregar o worklets nativo)
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: View,
      Text: Text,
      createAnimatedComponent: (comp) => comp,
    },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: () => ({}),
    withTiming: (val) => val,
    withRepeat: (val) => val,
    Easing: { linear: () => {} },
    FadeInUp: {},
    FadeOutUp: {},
  };
});

// Mock do expo-font para nao tentar carregar fontes nativas no teste
jest.mock('expo-font', () => ({
  isLoaded: jest.fn().mockReturnValue(true),
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));


// Mocks adicionados automaticamente
// Mocks globais para testes do Jest

// Mock do expo-asset (necessário para expo-sqlite não quebrar)
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })),
  },
  useAssets: jest.fn(() => [undefined, false]),
}), { virtual: true });

// Mock do expo-sqlite para testes que importam database.ts indiretamente
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
    closeSync: jest.fn(),
  })),
}));

// Mock do expo-notifications (usado no notifications.ts)
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// Mock do expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

// Mock do expo-print
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(() => Promise.resolve({ uri: 'file://fake.pdf' })),
}));

// Mock do expo-file-system
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ exists: true, delete: jest.fn() })),
  Paths: { document: 'file://documents/' },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1000 })),
  copyAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'file://resized.jpg' })),
  SaveFormat: { JPEG: 'jpeg' },
}));
