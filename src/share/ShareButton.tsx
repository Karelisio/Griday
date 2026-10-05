/** Bouton « Partager » d'un résultat (feuille de partage, sinon copie avec confirmation). */
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { Button, useSnackbar } from '../ui';
import { shareResult, shareText, type SharedResult } from './share';

export function ShareButton({ result, variant = 'filled' }: { result: SharedResult; variant?: 'filled' | 'tonal' }) {
  const { t, i18n } = useTranslation();
  const snackbar = useSnackbar();
  const share = async () => {
    const outcome = await shareResult(shareText(result, t, i18n.language as Language), t('share.dialogTitle'));
    if (outcome === 'copied') snackbar.show({ message: t('share.copied') });
    else if (outcome === 'failed') snackbar.show({ message: t('errors.share') });
  };
  return (
    <Button variant={variant} icon="share" onClick={() => void share()}>
      {t('victory.share')}
    </Button>
  );
}
