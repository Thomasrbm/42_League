import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';

// En-tête de colonne triable + helpers de tri — même comportement que le
// classement (clic répété sur une colonne inverse le sens), mais au thème zinc
// de la page GOD. Réutilisable par n'importe quel tableau.

export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * État de tri d'un tableau. Un clic sur la colonne active inverse le sens ;
 * un clic sur une autre colonne la sélectionne avec son sens par défaut
 * (texte → 'asc', numérique → 'desc', à la discrétion de l'en-tête).
 */
export function useTableSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggleSort = (key: K, defaultDir: SortDir = 'asc') =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir },
    );
  return { sort, toggleSort };
}

/**
 * Trie une liste selon l'état courant via un accesseur de valeur par clé.
 * `tiebreak` départage les égalités (toujours appliqué dans le sens ascendant).
 */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  value: (row: T, key: K) => number | string,
  tiebreak?: (a: T, b: T) => number,
): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    let cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
    cmp *= dir;
    if (cmp === 0 && tiebreak) cmp = tiebreak(a, b);
    return cmp;
  });
}

/** En-tête de colonne triable — thème GOD (zinc). À placer dans un `<thead>`. */
export function SortableTh<K extends string>({
  label,
  k,
  sort,
  onSort,
  align = 'left',
  defaultDir = 'asc',
  className = 'py-2 px-2',
}: {
  label: ReactNode;
  k: K;
  sort: SortState<K>;
  onSort: (k: K, defaultDir: SortDir) => void;
  align?: 'left' | 'right' | 'center';
  defaultDir?: SortDir;
  /** Classes du `<th>` — typiquement le padding, pour coller au tableau hôte. */
  className?: string;
}) {
  const active = sort.key === k;
  const alignCls = align === 'right' ? 'text-end' : align === 'center' ? 'text-center' : 'text-start';
  const rowCls = align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : '';
  return (
    <th className={`select-none ${alignCls} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(k, defaultDir)}
        className={`inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-zinc-200 ${rowCls} ${
          active ? 'text-zinc-200' : 'text-inherit'
        }`}
      >
        <span>{label}</span>
        <span className="w-3 inline-flex justify-center">
          {active ? (
            sort.dir === 'asc' ? (
              <ChevronUp className="w-3 h-3" strokeWidth={3} />
            ) : (
              <ChevronDown className="w-3 h-3" strokeWidth={3} />
            )
          ) : (
            <ChevronDown className="w-3 h-3 opacity-20" strokeWidth={3} />
          )}
        </span>
      </button>
    </th>
  );
}
