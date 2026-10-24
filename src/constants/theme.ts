// Shim de retrocompatibilidade: as telas ainda importam "Theme" de aqui.
// O tema real (com troca de paleta) esta em src/theme.
import { THEMES, DEFAULT_THEME } from '../theme';

/** @deprecated Use useTheme() de src/theme para seguir o tema escolhido pelo usuario. */
export const Theme = THEMES[DEFAULT_THEME];
