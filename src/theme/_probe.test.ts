import { describe, expect, it } from 'vitest';
import { DynamicScheme, Hct, TonalPalette, Variant } from '@material/material-color-utilities';

describe('probe', () => {
  it('imports mcu', () => {
    const s = new DynamicScheme({
      sourceColorHct: Hct.fromInt(0xff5b4fc4),
      variant: Variant.TONAL_SPOT,
      contrastLevel: 0,
      isDark: false,
      specVersion: '2025',
    });
    console.log(s.primary.toString(16), s.onPrimary.toString(16), s.surface.toString(16), TonalPalette.name);
    expect(s.primary).toBeTypeOf('number');
  });
});
