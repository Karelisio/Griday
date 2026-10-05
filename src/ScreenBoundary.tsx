/**
 * Filet de sécurité par écran : une erreur de rendu n'emporte pas toute l'app. L'écran fautif
 * affiche un message et « Réessayer », qui efface ses données en cours (`onReset`) puis le recharge.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from './ui';
import './screens/screens.css';

interface Props {
  readonly visible: boolean;
  /** Efface les données susceptibles d'avoir causé l'erreur (partie en cours, cache). */
  readonly onReset?: () => Promise<void> | void;
  readonly children: ReactNode;
}

interface State {
  readonly failed: boolean;
  readonly attempt: number;
}

export class ScreenBoundary extends Component<Props, State> {
  override state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Écran en erreur', error, info.componentStack);
  }

  private readonly retry = async (): Promise<void> => {
    try {
      await this.props.onReset?.();
    } finally {
      this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
    }
  };

  override render(): ReactNode {
    if (this.state.failed) return <ScreenError visible={this.props.visible} onRetry={() => void this.retry()} />;
    // Nouvelle clé à chaque essai : l'écran repart d'un état neuf.
    return <ScreenKey key={this.state.attempt}>{this.props.children}</ScreenKey>;
  }
}

function ScreenKey({ children }: { children: ReactNode }) {
  return children;
}

function ScreenError({ visible, onRetry }: { visible: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="screen" hidden={!visible} role="alert">
      <div className="screen__center">
        <Icon name="error" size={40} />
        <p className="md-typescale-body-large">{t('errors.screen')}</p>
        <Button variant="tonal" icon="refresh" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    </section>
  );
}
