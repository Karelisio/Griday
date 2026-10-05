/** Tuile de chiffre clé : libellé, valeur, détail (pourcentage) et jauge de proportion facultatifs. */
import type { ReactNode } from 'react';
import { Card } from '../ui';
import { cssVars } from './chart';
import './stats.css';

export interface StatTileProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** Précision à côté de la valeur (ex. « 90 % »). */
  readonly detail?: ReactNode;
  /** Jauge sous la valeur : part de 0 à 1 (décorative, le détail porte le chiffre). */
  readonly meter?: number;
}

/** À placer dans un `<dl className="stat-tiles">` : libellé = terme, valeur = définition. */
export function StatTile({ label, value, detail, meter }: StatTileProps) {
  return (
    <Card className="stat-tile">
      <dt className="stat-tile__label md-typescale-label-medium">{label}</dt>
      <dd className="stat-tile__value">
        <span className="md-typescale-headline-small-emphasized">{value}</span>
        {detail ? <span className="stat-tile__detail md-typescale-title-small">{detail}</span> : null}
        {meter === undefined ? null : (
          <span className="stat-tile__meter" aria-hidden="true">
            <span style={cssVars({ '--v': meter })} />
          </span>
        )}
      </dd>
    </Card>
  );
}
