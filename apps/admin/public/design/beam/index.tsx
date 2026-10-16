import type { CSSProperties } from 'react';
import styles from './BorderBeam.module.css';

export type BorderBeamProps = { active?: boolean; animated?: boolean; rounded?: boolean };

/** Decorative rim; the parent supplies position:relative and its border radius. */
export function BorderBeam({ active = false, animated = true, rounded = false }: BorderBeamProps) {
  const geometry = rounded ? { borderRadius: '50%' } as CSSProperties : undefined;
  return <span className={styles.beam} data-border-beam={active ? 'working' : 'idle'} data-animated={animated} data-rounded={rounded} style={geometry} aria-hidden="true">
    <span className={styles.bloom} />
    <span className={styles.edge} />
  </span>;
}
