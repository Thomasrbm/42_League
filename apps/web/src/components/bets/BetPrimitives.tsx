import { useState } from 'react';
import { DRAW_CHOICE, type BetStatus } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Avatar } from '../Avatar';

/** Cote fixe des paris : un pari gagnant rapporte 2× la mise. */
export const BET_MULTIPLIER = 2;
/** Cote d'un pari match avec SCORE EXACT pile : ×4 (vainqueur ×2, score exact ×2). */
export const BET_EXACT_MULTIPLIER = 4;

/** Petit montant en coins avec l'icône 42coin. */
export function CoinAmount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <img src="/42coin.webp" alt="" className="w-4 h-4" />
      {value}
    </span>
  );
}

/** Petit badge de discipline (ex. STREETFIGHTER). */
export function GameTag({ game }: { game: string | null }) {
  if (!game) return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold bg-white/5 text-muted-2">
      {game}
    </span>
  );
}

/** Classe d'un badge de statut de pari (ouvert / gagné / perdu / remboursé). */
export function betStatusStyle(status: BetStatus): string {
  switch (status) {
    case 'won':
      return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
    case 'lost':
      return 'border-red/25 bg-red/10 text-red';
    case 'refunded':
      return 'border-sky-400/25 bg-sky-400/10 text-sky-300';
    default:
      return 'border-gold/25 bg-gold/10 text-gold';
  }
}

/**
 * Formulaire inline de placement de pari : choix d'un pronostic parmi `choices`
 * + saisie de la mise (bornée au solde). Partagé entre l'onglet Paris du profil
 * et l'onglet Parier d'un tournoi.
 */
export function BetForm({
  choices,
  avatars,
  partners,
  labels,
  maxStake,
  busy,
  scorePrediction,
  onSubmit,
  onCancel,
}: {
  choices: string[];
  /** Map login → URL de photo, pour afficher la pp à côté de chaque choix. */
  avatars?: Record<string, string | null>;
  /**
   * Tournois en DUO (2v2) : map capitaine → login du coéquipier. Quand il existe,
   * le choix s'affiche comme l'ÉQUIPE (capitaine & coéquipier) — mais la valeur
   * pariée reste le login du capitaine (clé canonique côté règlement).
   */
  partners?: Record<string, string | null>;
  /**
   * Label custom par choix (remplace l'affichage « @login »). Sert p.ex. à afficher
   * « Nul » pour le pronostic d'égalité d'un match, ou un nom d'équipe.
   */
  labels?: Record<string, string>;
  maxStake: number;
  busy: boolean;
  /**
   * Paris MATCH uniquement : active le pronostic de SCORE EXACT (gain ×4 si pile).
   * `required` (je joue ce match) → le score exact est le SEUL pari possible ; le
   * pronostic de vainqueur est alors déduit du score (égalité → nul si `allowDraw`).
   * `teamA`/`teamB` = capitaines des deux camps, l'ordre fixe le sens du score.
   */
  scorePrediction?: { required: boolean; teamA: string; teamB: string; allowDraw: boolean };
  onSubmit: (choiceLogin: string, stake: number, scores?: { a: number; b: number }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState<string>('');
  const [stake, setStake] = useState<string>('');
  const [scoreA, setScoreA] = useState<string>('');
  const [scoreB, setScoreB] = useState<string>('');
  const stakeNum = Number(stake);
  const stakeOk = Number.isInteger(stakeNum) && stakeNum > 0 && stakeNum <= maxStake;
  // Score exact : valide quand les DEUX côtés sont saisis (entiers >= 0). Une
  // égalité pronostiquée n'est possible que si le nul existe (phase de ligue).
  const a = Number(scoreA);
  const b = Number(scoreB);
  const hasScores =
    !!scorePrediction &&
    scoreA !== '' &&
    scoreB !== '' &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0;
  const drawInvalid = hasScores && a === b && !scorePrediction.allowDraw;
  // Vainqueur déduit du score exact (prioritaire sur le choix manuel).
  const impliedChoice = !hasScores
    ? ''
    : a === b
      ? DRAW_CHOICE
      : a > b
        ? scorePrediction.teamA
        : scorePrediction.teamB;
  const effectiveChoice = hasScores ? impliedChoice : choice;
  const scoreRequired = scorePrediction?.required ?? false;
  const valid =
    stakeOk && !drawInvalid && (scoreRequired ? hasScores : !!effectiveChoice);
  const multiplier = hasScores ? BET_EXACT_MULTIPLIER : BET_MULTIPLIER;

  return (
    <div className="mt-3 pt-3 border-t border-gold/10 space-y-3">
      {/* Choix manuel du vainqueur — masqué quand le score exact décide (saisi ou
          obligatoire) : le pronostic est alors déduit du score. */}
      {!scoreRequired && !hasScores && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-muted-2 mb-2">
            {t('bets.chooseWinner')}
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((login) => {
              const active = login === choice;
              const hasAvatar = avatars !== undefined;
              const partner = partners?.[login] ?? null;
              return (
                <button
                  key={login}
                  type="button"
                  onClick={() => setChoice(login)}
                  className={`flex items-center gap-2 ${hasAvatar ? 'ps-1.5 pe-3' : 'px-3'} h-8 rounded-lg text-xs font-bold tap-transparent transition-colors ${
                    active
                      ? 'border border-gold/50 bg-gold/20 text-gold'
                      : 'border border-white/8 bg-white/[0.02] text-muted hover:text-text'
                  }`}
                >
                  {labels?.[login] ? (
                    <span>{labels[login]}</span>
                  ) : (
                    <>
                      {hasAvatar && <Avatar login={login} imageUrl={avatars[login] ?? null} size="xs" />}
                      @{login}
                      {partner && (
                        <>
                          <span className="opacity-60">&amp;</span>
                          {hasAvatar && (
                            <Avatar login={partner} imageUrl={avatars[partner] ?? null} size="xs" />
                          )}
                          @{partner}
                        </>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pronostic de SCORE EXACT (paris match) : deux champs alignés sur A et B. */}
      {scorePrediction && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-muted-2 mb-1">
            {t('bets.exactScore')} <span className="text-gold">×{BET_EXACT_MULTIPLIER}</span>
          </div>
          <p className="text-[11px] text-muted-2 mb-2 leading-snug">
            {scoreRequired ? t('bets.exactScoreRequiredHint') : t('bets.exactScoreOptionalHint')}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              placeholder={`@${scorePrediction.teamA}`}
              className="w-full h-9 rounded-xl bg-bg-2/80 border border-gold/15 px-3 text-sm text-text-strong tabular-nums outline-none focus:border-gold/40"
            />
            <span className="text-muted-2 text-xs font-black shrink-0">—</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              placeholder={`@${scorePrediction.teamB}`}
              className="w-full h-9 rounded-xl bg-bg-2/80 border border-gold/15 px-3 text-sm text-text-strong tabular-nums outline-none focus:border-gold/40"
            />
          </div>
          {drawInvalid && (
            <p className="text-[11px] text-red mt-1">{t('bets.exactScoreNoDraw')}</p>
          )}
          {hasScores && !drawInvalid && (
            <p className="text-[11px] text-gold/80 mt-1">
              {t('bets.choice')} :{' '}
              {impliedChoice === DRAW_CHOICE ? t('bets.draw') : `@${impliedChoice}`} ({scoreA}-{scoreB})
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            min={1}
            max={maxStake}
            inputMode="numeric"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder={t('bets.stake')}
            className="w-full h-9 rounded-xl bg-bg-2/80 border border-gold/15 px-3 text-sm text-text-strong tabular-nums outline-none focus:border-gold/40"
          />
        </div>
        {valid && (
          <span className="text-[11px] text-muted-2 shrink-0">
            {t('bets.potentialGain')}{' '}
            <CoinAmount value={stakeNum * multiplier} className="text-gold font-bold" />
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-9 rounded-xl border border-white/8 bg-white/[0.02] text-muted-2 text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent"
        >
          {t('bets.cancel')}
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() =>
            onSubmit(effectiveChoice, stakeNum, hasScores ? { a, b } : undefined)
          }
          className={`flex-1 h-9 rounded-xl text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent transition-colors ${
            valid && !busy
              ? 'border border-gold/40 bg-gold/15 text-gold hover:bg-gold/25'
              : 'border border-white/5 bg-white/[0.02] text-muted-2 cursor-not-allowed'
          }`}
        >
          {t('bets.confirm')}
        </button>
      </div>
    </div>
  );
}
