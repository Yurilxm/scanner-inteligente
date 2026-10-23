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
