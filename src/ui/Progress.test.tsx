import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CircularProgress, LinearProgress } from './Progress';
import { installMatchMedia } from './testing';

installMatchMedia();
afterEach(cleanup);

const activePath = (container: HTMLElement, kind: 'linear' | 'circular') =>
  container.querySelector(`.md-${kind}-progress__active`)?.getAttribute('d') ?? '';

describe('LinearProgress', () => {
  it('barre de progression nommée, valeur en pourcentage', () => {
    render(<LinearProgress value={0.256} aria-label="Chargement" />);
    const bar = screen.getByRole('progressbar', { name: 'Chargement' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('26');
  });

  it('indéterminé : pas de valeur annoncée', () => {
    render(<LinearProgress aria-label="Préparation" />);
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('borne la valeur entre 0 et 1', () => {
    const { rerender } = render(<LinearProgress value={3} aria-label="x" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    rerender(<LinearProgress value={-2} aria-label="x" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('dessine l’indicateur ondulé (tracé sinusoïdal), la piste et le repère de fin', () => {
    const { container } = render(<LinearProgress value={0.5} aria-label="x" />);
    const d = activePath(container, 'linear');
    expect(d.startsWith('M')).toBe(true);
    const ys = Array.from(d.matchAll(/L?[\d.]+ ([\d.]+)/g)).map((m) => Number(m[1]));
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBeGreaterThan(5); // ondulé : ordonnées variées
    expect(container.querySelector('.md-linear-progress__track')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+H[\d.]+$/);
    expect((container.querySelector('.md-linear-progress__stop') as SVGElement).style.visibility).toBe('visible');
  });

  it('variante droite : tracé horizontal', () => {
    const { container } = render(<LinearProgress variant="flat" value={0.5} aria-label="x" />);
    const ys = Array.from(activePath(container, 'linear').matchAll(/L?[\d.]+ ([\d.]+)/g)).map((m) => m[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it('terminé : plus de piste ni de repère', () => {
    const { container } = render(<LinearProgress value={1} aria-label="x" />);
    expect(container.querySelector('.md-linear-progress__track')?.getAttribute('d')).toBe('');
    expect((container.querySelector('.md-linear-progress__stop') as SVGElement).style.visibility).toBe('hidden');
  });

  it('animations réduites + indéterminé : immobile, avec pulsation CSS douce', () => {
    const { container } = render(<LinearProgress aria-label="x" />);
    expect(container.querySelector('.md-linear-progress')?.className).toContain('md-progress--pulse');
    expect(activePath(container, 'linear')).not.toBe('');
  });
});

describe('CircularProgress', () => {
  it('cercle de progression nommé, valeur, taille', () => {
    const { container } = render(<CircularProgress value={0.4} size={64} aria-label="Génération" />);
    const el = screen.getByRole('progressbar', { name: 'Génération' });
    expect(el.getAttribute('aria-valuenow')).toBe('40');
    expect((el as HTMLElement).style.width).toBe('64px');
    expect(activePath(container, 'circular')).toMatch(/^M/);
    expect(container.querySelector('.md-circular-progress__track')?.getAttribute('d')).toMatch(/^M/);
  });

  it('indéterminé sans valeur annoncée ; terminé sans piste', () => {
    const { container, rerender } = render(<CircularProgress aria-label="x" />);
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
    rerender(<CircularProgress value={1} aria-label="x" />);
    expect(container.querySelector('.md-circular-progress__track')?.getAttribute('d')).toBe('');
  });

  it('variante droite : arc à rayon constant', () => {
    const { container } = render(<CircularProgress variant="flat" value={0.5} aria-label="x" />);
    const points = Array.from(activePath(container, 'circular').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)).map((m) => Math.hypot(Number(m[1]) - 24, Number(m[2]) - 24));
    expect(Math.max(...points) - Math.min(...points)).toBeLessThan(0.05);
    const wavy = render(<CircularProgress value={0.5} aria-label="y" />).container;
    const wavyPoints = Array.from(activePath(wavy, 'circular').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)).map((m) => Math.hypot(Number(m[1]) - 24, Number(m[2]) - 24));
    expect(Math.max(...wavyPoints) - Math.min(...wavyPoints)).toBeGreaterThan(2);
  });
});
