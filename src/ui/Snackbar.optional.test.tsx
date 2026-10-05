import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SnackbarHost, useOptionalSnackbar, useSnackbar } from './Snackbar';

describe('useOptionalSnackbar', () => {
  it('hors de l’hôte : null, là où useSnackbar signale l’erreur', () => {
    expect(renderHook(() => useOptionalSnackbar()).result.current).toBeNull();
    expect(() => renderHook(() => useSnackbar())).toThrow('useSnackbar hors de SnackbarHost');
  });

  it('dans l’hôte : la même API que useSnackbar', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <SnackbarHost>{children}</SnackbarHost>;
    const { result } = renderHook(() => ({ optional: useOptionalSnackbar(), required: useSnackbar() }), { wrapper });
    expect(result.current.optional).toBe(result.current.required);
    expect(typeof result.current.optional?.show).toBe('function');
  });
});
