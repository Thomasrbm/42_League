import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BookOpen, Shield, Terminal, Users, Crown, Github, Megaphone, Sparkles, Wrench } from 'lucide-react';
import { Panel } from '../components/Panel';
import { api, type ContributorStat, type AnnouncementData } from '../lib/api';
import { announcementKindMeta } from '../lib/announcements';
import { useT, useI18n } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { useAuth } from '../hooks/useAuth';
import { useLeagueData } from '../hooks/useLeagueData';
import { useGameMode } from '../hooks/useGameMode';
import type { Game } from '../lib/gameMode';

type Tab = 'rules' | 'changelog' | 'announcements' | 'privacy' | 'tech' | 'team';

export function AboutPage() {
  const t = useT();
  const { authenticated } = useAuth();
  const [tab, setTab] = useState<Tab>('rules');

  const inner = (
    <>
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-2/60 border border-border/40 mb-5">
        <TabBtn active={tab === 'rules'} onClick={() => setTab('rules')} Icon={BookOpen}>
          {t('about.rules.title')}
        </TabBtn>
        <TabBtn active={tab === 'changelog'} onClick={() => setTab('changelog')} Icon={Sparkles}>
          {t('about.changelog.title')}
        </TabBtn>
        {authenticated && (
          <TabBtn active={tab === 'announcements'} onClick={() => setTab('announcements')} Icon={Megaphone}>
            {t('about.announcements.title')}
          </TabBtn>
        )}
        <TabBtn active={tab === 'privacy'} onClick={() => setTab('privacy')} Icon={Shield}>
          {t('about.privacy.title')}
        </TabBtn>
        <TabBtn active={tab === 'tech'} onClick={() => setTab('tech')} Icon={Terminal}>
          {t('about.tech.title')}
        </TabBtn>
        <TabBtn active={tab === 'team'} onClick={() => setTab('team')} Icon={Users}>
          {t('about.team.title')}
        </TabBtn>
      </div>

      {tab === 'rules' ? (
        <RulesSection />
      ) : tab === 'changelog' ? (
        <ChangelogSection />
      ) : tab === 'announcements' ? (
        <AnnouncementsSection />
      ) : tab === 'privacy' ? (
        <PrivacySection />
      ) : tab === 'tech' ? (
        <TechSection />
      ) : (
        <TeamSection />
      )}
    </>
  );

  // Non authentifié : page autonome (hors shell). Conteneur scrollable plein écran
  // + bouton retour vers la connexion (parcours RGPD avant login).
  if (!authenticated) {
    return (
      <div className="h-full overflow-y-auto overscroll-contain scrollbar-none">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-5">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-muted-2 hover:text-gold transition-colors text-xs font-semibold uppercase tracking-[0.14em]"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t('about.back.login')}
            </Link>
          </div>
          {inner}
        </div>
      </div>
    );
  }

  // Authentifié : rendu à l'intérieur du shell (header + scroll <main> + tab bar).
  // On s'appuie sur le scroll du shell — pas de conteneur scrollable imbriqué.
  return <div className="w-full">{inner}</div>;
}

function TabBtn({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof BookOpen;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-2 rounded-lg text-[11px] sm:text-xs font-extrabold uppercase tracking-tight sm:tracking-[0.1em] leading-tight transition-all duration-150 ${
        active
          ? 'bg-gold/10 border border-gold/30 text-gold shadow-[inset_0_1px_0_rgba(255,215,120,0.12)]'
          : 'text-muted-2 hover:text-text'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline-flex" strokeWidth={2.5} />
      <span className="truncate">{children}</span>
    </button>
  );
}

// ─── Changelog / notes de version ─────────────────────────────────────────────
// Journal des évolutions, le plus récent en haut. Volontairement self-contained
// (contenu factuel daté) : on ne le traduit pas entry par entry, seul l'en-tête
// passe par i18n. À chaque livraison notable, on ajoute une entrée ici.

type ChangeKind = 'feature' | 'fix';
interface ChangeEntry {
  kind: ChangeKind;
  text: string;
}
interface Release {
  version: string;
  date: string;
  changes: ChangeEntry[];
}

const CHANGELOG: Release[] = [
  {
    version: 'V1.1',
    date: '10 juin 2026',
    changes: [
      {
        kind: 'fix',
        text: "Boîte Mystère réparée : elle donne enfin un lot ! 1 chance sur 10 de décrocher le titre « Mysterious » (arc-en-ciel animé), sinon un cosmétique que tu ne possèdes pas encore — avec une animation de révélation qui dévoile ton gain.",
      },
      { kind: 'feature', text: "Nouveaux titres à couleur arc-en-ciel animée." },
      {
        kind: 'feature',
        text: "La Boutique devient le QG des League Coins : onglets Boutique / Inventaire / Quêtes / Paris. Les quêtes hebdo et l'inventaire ont quitté le profil pour la boutique, et les cartes « comment gagner des coins » sont désormais cliquables.",
      },
      {
        kind: 'feature',
        text: "Tout nouvel inscrit démarre avec 300 League Coins (et les comptes à 0 ont été crédités à 300).",
      },
      {
        kind: 'feature',
        text: "Série d'assiduité ranked : jouer plusieurs jours d'affilée booste tes gains d'ELO et débloque des paliers de coins.",
      },
      {
        kind: 'feature',
        text: "Saisons : séries, win-rate, courbe d'ELO et trophées repartent de zéro à chaque nouvelle saison (le G.O.A.T, lui, reste cross-saison). Le classement n'affiche que les joueurs ayant disputé ≥ 1 partie de la saison ; clôture programmable depuis le /GOD ; les coins sont conservés d'une saison à l'autre.",
      },
      {
        kind: 'feature',
        text: "Historique (page dédiée et profil) filtrable par saison, et bloc « 7 derniers jours » du profil lié à la saison.",
      },
      {
        kind: 'fix',
        text: "OPS : impossible désormais de forcer plus de 3 matchs à une même cible (le quota tenait mal le compte des défis déjà lancés).",
      },
      { kind: 'fix', text: "Mobile : l'éditeur de personnages favoris ne sort plus de l'écran." },
      {
        kind: 'feature',
        text: "Tournois : co-organisateurs (tous les droits) + noms d'équipe pour les duos ; paris sur l'issue des matchs (victoire/nul) ; retour en inscription et retrait d'un inscrit/duo. Paris fermés dès le pile-ou-face.",
      },
      {
        kind: 'feature',
        text: "/GOD : édition de l'ELO/stats d'un autre superadmin ; ELO par discipline dans la liste des joueurs ; suivi des coins (solde + historique) en sous-page dédiée, colonnes triables.",
      },
      {
        kind: 'feature',
        text: "Perf & design : images en WebP (≈ -10 Mo), nouveau mini-logo, icônes PWA recompressées, écrans et avatars chargés à la demande, compression nginx — l'app est nettement plus légère et rapide.",
      },
    ],
  },
];

function ChangelogSection() {
  const t = useT();
  return (
    <Panel title={t('about.changelog.heading')} sub={t('about.changelog.sub')}>
      {/* Liste déroulable : on borne la hauteur et on scrolle DANS la section pour
          que toutes les entrées soient atteignables (sur mobile, les dernières
          passaient sous la barre d'onglets du bas). */}
      <div className="flex flex-col gap-6 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1 -mr-1 overscroll-contain">
        {CHANGELOG.map((rel, i) => (
          <div key={`${rel.version}-${rel.date}-${i}`} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gold/12 border border-gold/30 text-gold text-[11px] font-extrabold uppercase tracking-[0.12em]">
                <Crown className="w-3 h-3" strokeWidth={2.5} />
                {rel.version}
              </span>
              <span className="text-xs font-bold text-muted-2">{rel.date}</span>
              <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
            </div>
            <ul className="flex flex-col gap-2">
              {rel.changes.map((c, j) => {
                const isFix = c.kind === 'fix';
                const Icon = isFix ? Wrench : Sparkles;
                return (
                  <li key={j} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${
                        isFix
                          ? 'bg-red/10 border border-red/30 text-red'
                          : 'bg-teal/10 border border-teal/30 text-teal'
                      }`}
                    >
                      <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
                      {isFix ? 'Fix' : 'Nouveau'}
                    </span>
                    <span className="text-sm text-text leading-snug">{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Dernières annonces (listées en permanence) ──────────────────────────────

function AnnouncementsSection() {
  const t = useT();
  const { lang } = useI18n();
  const [list, setList] = useState<AnnouncementData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .announcements()
      .then((items) => {
        if (!cancelled) setList(items);
      })
      .catch(() => {
        /* best-effort : on laisse la liste vide */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title={t('about.announcements.heading')} sub={t('about.announcements.sub')} accent="megaphone">
      {loading ? (
        <div className="text-sm text-muted-2">…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-muted-2">{t('about.announcements.empty')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => {
            const meta = announcementKindMeta(a.kind);
            const Icon = meta.Icon;
            return (
              <div
                key={a.id}
                className="rounded-xl p-3.5"
                style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}33` }}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: meta.accent }} strokeWidth={2.4} />
                  <span className="text-sm font-bold text-text-strong leading-tight">{a.title}</span>
                  <span className="ml-auto text-[11px] font-mono text-muted-2 shrink-0">
                    {new Date(a.createdAt).toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{a.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─── Règles du jeu (adaptées à la discipline courante) ───────────────────────

/**
 * Contenu des règles propre à chaque discipline. Les contenus sont RICHES (JSX
 * avec surlignages), donc traduits par langue : `RULES_I18N[lang][game]`. Pour
 * ajouter un jeu, il faut une entrée par langue ; la `RulesSection` lit la
 * discipline active via `useGameMode()` et la langue via `useI18n()`.
 */
type GameRules = {
  /** Nom de la discipline, employé dans les phrases (ex. « babyfoot 1 contre 1 »). */
  label: string;
  /** Panneau « règles sur le terrain » : intro + puces. */
  terrain: { intro: React.ReactNode; bullets: React.ReactNode[] };
  /** Panneau « format du match » : intro + puces. */
  format: { intro: React.ReactNode; bullets: React.ReactNode[] };
};

const RULES_FR: Record<Game, GameRules> = {
  babyfoot: {
    label: 'babyfoot 1 contre 1',
    terrain: {
      intro: (
        <>
          Conventions de jeu pour qu'un but soit valable et que les matchs restent disputés
          proprement :
        </>
      ),
      bullets: [
        <>
          Après l'engagement (<span className="text-text font-semibold">kick-off</span>), la balle doit
          être <span className="text-gold font-semibold">touchée au moins deux fois</span> avant qu'un but
          ne compte.
        </>,
        <>
          Le joueur qui <span className="text-text font-semibold">vient d'encaisser un but</span> a le droit
          de remettre la balle <span className="text-gold font-semibold">au pied de sa barre du milieu</span> (demis)
          pour relancer.
        </>,
        <>
          Les <span className="text-gold font-semibold">buts marqués depuis la barre du milieu</span> (demis)
          sont valables.
        </>,
        <>
          La <span className="text-gold font-semibold">gamelle</span> (balle qui ressort du but) : tu peux
          soit <span className="text-text font-semibold">prendre le point</span>, soit
          <span className="text-text font-semibold"> retirer un point à l'adversaire</span> — mais on ne peut
          <span className="text-text font-semibold"> pas conclure le match sur une gamelle</span>.
        </>,
        <>
          Les <span className="text-gold font-semibold">roulettes</span> doivent être
          <span className="text-text font-semibold"> contrôlées</span> (pas de moulinets incontrôlés).
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League est un classement ELO de <span className="text-text font-semibold">babyfoot 1 contre 1</span>.
          Chaque joueur inscrit peut défier n'importe quel autre membre de sa league.
        </>
      ),
      bullets: [
        <>Match en <span className="text-gold font-semibold">10 buts</span> — premier arrivé à 10 gagne.</>,
        <>Un match ne peut être déclaré qu'<span className="text-text font-semibold">après avoir été joué</span>.</>,
        <>Les deux joueurs déclarent leur score indépendamment. En cas de désaccord, le match est annulé.</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1 contre 1',
    terrain: {
      intro: (
        <>
          Conventions de set pour que la victoire soit nette et les matchs équitables :
        </>
      ),
      bullets: [
        <>
          Chaque match se joue en <span className="text-gold font-semibold">stocks (vies)</span> — le joueur
          qui épuise tous ses stocks adverses remporte la manche.
        </>,
        <>
          Sélection de <span className="text-gold font-semibold">personnage</span> avant chaque manche ; après
          une manche perdue, le perdant peut <span className="text-text font-semibold">changer de personnage</span>.
        </>,
        <>
          Les sets se disputent au <span className="text-gold font-semibold">meilleur des 3 (Bo3)</span> ou{' '}
          <span className="text-gold font-semibold">des 5 (Bo5)</span> selon le contexte (officiel, tournoi).
        </>,
        <>
          Les <span className="text-text font-semibold">items</span> et stages contestés sont désactivés par
          défaut, sauf accord explicite des deux joueurs.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classe ici le <span className="text-text font-semibold">Super Smash Bros. 1 contre 1</span> en
          stocks. Chaque joueur inscrit peut défier n'importe quel autre membre de sa league.
        </>
      ),
      bullets: [
        <>Set au <span className="text-gold font-semibold">meilleur des 3 ou des 5</span> manches (Bo3 / Bo5).</>,
        <>Le vainqueur est celui qui remporte la <span className="text-text font-semibold">majorité des manches</span>.</>,
        <>L'<span className="text-text font-semibold">ELO est propre à la discipline</span> : ton rating Smash est distinct du babyfoot.</>,
        <>Les deux joueurs déclarent leur résultat indépendamment. En cas de désaccord, le match est annulé.</>,
      ],
    },
  },
  chess: {
    label: 'échecs 1 contre 1',
    terrain: {
      intro: (
        <>
          Conventions de partie pour que le résultat soit incontestable :
        </>
      ),
      bullets: [
        <>
          Partie en <span className="text-gold font-semibold">1 contre 1</span> aux règles classiques des échecs
          (pièce touchée, pièce jouée).
        </>,
        <>
          Le résultat est <span className="text-gold font-semibold">binaire</span> : victoire ou défaite. Une
          nulle se rejoue ou se tranche selon l'accord des joueurs.
        </>,
        <>
          La victoire est acquise par <span className="text-text font-semibold">échec et mat</span> ou par
          <span className="text-text font-semibold"> abandon</span> de l'adversaire.
        </>,
        <>
          Si une <span className="text-text font-semibold">cadence</span> (pendule) est utilisée, la chute du
          drapeau vaut défaite.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classe ici les <span className="text-text font-semibold">échecs 1 contre 1</span>. Chaque
          joueur inscrit peut défier n'importe quel autre membre de sa league.
        </>
      ),
      bullets: [
        <>Résultat <span className="text-gold font-semibold">binaire</span> — victoire ou défaite, pas de score chiffré.</>,
        <>Un match ne peut être déclaré qu'<span className="text-text font-semibold">après avoir été joué</span>.</>,
        <>L'<span className="text-text font-semibold">ELO est dédié aux échecs</span>, distinct des autres disciplines.</>,
        <>Les deux joueurs déclarent leur résultat indépendamment. En cas de désaccord, le match est annulé.</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1 contre 1',
    terrain: {
      intro: (
        <>
          Conventions de set pour que la victoire soit nette et les matchs équitables :
        </>
      ),
      bullets: [
        <>
          Chaque match se joue en <span className="text-gold font-semibold">rounds</span> — le joueur qui
          remporte la majorité des rounds gagne la manche.
        </>,
        <>
          Sélection de <span className="text-gold font-semibold">personnage</span> avant chaque manche ; après
          une manche perdue, le perdant peut <span className="text-text font-semibold">changer de personnage</span>.
        </>,
        <>
          Les sets se disputent au <span className="text-gold font-semibold">meilleur des 3 (Bo3)</span> ou{' '}
          <span className="text-gold font-semibold">des 5 (Bo5)</span> selon le contexte (officiel, tournoi).
        </>,
        <>
          <span className="text-text font-semibold">Réglages standards</span> : timer et vie par défaut, pas de
          modificateurs ni d'assists exotiques — on reste sur un set équitable et lisible.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classe ici le <span className="text-text font-semibold">Street Fighter 1 contre 1</span>.
          Chaque joueur inscrit peut défier n'importe quel autre membre de sa league.
        </>
      ),
      bullets: [
        <>Set au <span className="text-gold font-semibold">meilleur des 3 ou des 5</span> manches (Bo3 / Bo5).</>,
        <>Le vainqueur est celui qui remporte la <span className="text-text font-semibold">majorité des manches</span>.</>,
        <>L'<span className="text-text font-semibold">ELO est propre à la discipline</span> : ton rating Street Fighter est distinct des autres jeux.</>,
        <>Les deux joueurs déclarent leur résultat indépendamment. En cas de désaccord, le match est annulé.</>,
      ],
    },
  },
  flechettes: {
    label: 'fléchettes (301 / 501)',
    terrain: {
      intro: (
        <>
          Conventions de manche pour que le décompte soit clair et le résultat incontestable :
        </>
      ),
      bullets: [
        <>
          Manche en <span className="text-gold font-semibold">301 ou 501</span> : chaque joueur part de son
          score de départ et <span className="text-text font-semibold">descend</span> à mesure qu'il marque.
        </>,
        <>
          Le premier à atteindre <span className="text-gold font-semibold">exactement 0</span> remporte la manche.
        </>,
        <>
          De <span className="text-gold font-semibold">2 à 8 joueurs</span> peuvent disputer la même manche,
          chacun avec son <span className="text-text font-semibold">propre reste</span>.
        </>,
        <>
          Pas de <span className="text-text font-semibold">personnages</span> ni d'équipes — c'est un
          affrontement <span className="text-text font-semibold">individuel</span>.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classe ici les <span className="text-text font-semibold">fléchettes (301 / 501)</span>.
          Chaque joueur inscrit peut défier n'importe quel autre membre de sa league.
        </>
      ),
      bullets: [
        <>Manche de <span className="text-gold font-semibold">2 à 8 joueurs</span>, format <span className="text-text font-semibold">301 ou 501</span>.</>,
        <>
          Le déclarant saisit, pour chaque joueur, ses <span className="text-gold font-semibold">points restants</span> à la fin
          (le <span className="text-text font-semibold">vainqueur = 0</span>). Le classement se déduit du reste :
          0 = 1er, puis du plus petit reste au plus grand.
        </>,
        <>
          Chaque autre joueur <span className="text-text font-semibold">confirme son propre reste</span> ; une{' '}
          <span className="text-text font-semibold">contestation annule la manche</span>.
        </>,
        <>
          L'<span className="text-text font-semibold">ELO est propre à la discipline</span> : ton rating fléchettes est distinct des autres jeux.
          Pas de tournoi fléchettes ni de 2v2.
        </>,
      ],
    },
  },
};

const RULES_EN: Record<Game, GameRules> = {
  babyfoot: {
    label: 'foosball 1v1',
    terrain: {
      intro: (
        <>
          Playing conventions so a goal counts and matches stay cleanly contested:
        </>
      ),
      bullets: [
        <>
          After the serve (<span className="text-text font-semibold">kick-off</span>), the ball must be
          <span className="text-gold font-semibold"> touched at least twice</span> before a goal counts.
        </>,
        <>
          The player who <span className="text-text font-semibold">just conceded a goal</span> may put the
          ball back <span className="text-gold font-semibold">on their midfield bar</span> (the halfbacks)
          to restart play.
        </>,
        <>
          <span className="text-gold font-semibold">Goals scored from the midfield bar</span> (halfbacks)
          are valid.
        </>,
        <>
          The <span className="text-gold font-semibold">gamelle</span> (ball that bounces back out of the goal):
          you can either <span className="text-text font-semibold">take the point</span> or
          <span className="text-text font-semibold"> remove a point from your opponent</span> — but you
          <span className="text-text font-semibold"> cannot win the match on a gamelle</span>.
        </>,
        <>
          <span className="text-gold font-semibold">Spins</span> must be
          <span className="text-text font-semibold"> controlled</span> (no wild, uncontrolled twirling).
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League is an ELO ranking for <span className="text-text font-semibold">foosball 1v1</span>.
          Every registered player can challenge any other member of their league.
        </>
      ),
      bullets: [
        <>Match to <span className="text-gold font-semibold">10 goals</span> — first to 10 wins.</>,
        <>A match can only be reported <span className="text-text font-semibold">after it has been played</span>.</>,
        <>Both players report their score independently. If they disagree, the match is voided.</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1v1',
    terrain: {
      intro: (
        <>
          Set conventions so victories are clear and matches fair:
        </>
      ),
      bullets: [
        <>
          Each match is played in <span className="text-gold font-semibold">stocks (lives)</span> — the player
          who depletes all of their opponent's stocks wins the game.
        </>,
        <>
          <span className="text-gold font-semibold">Character</span> selection before each game; after a lost
          game, the loser may <span className="text-text font-semibold">switch character</span>.
        </>,
        <>
          Sets are played in a <span className="text-gold font-semibold">best of 3 (Bo3)</span> or{' '}
          <span className="text-gold font-semibold">best of 5 (Bo5)</span> depending on the context (official, tournament).
        </>,
        <>
          <span className="text-text font-semibold">Items</span> and contested stages are off by default,
          unless both players explicitly agree otherwise.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League ranks <span className="text-text font-semibold">Super Smash Bros. 1v1</span> in stocks here.
          Every registered player can challenge any other member of their league.
        </>
      ),
      bullets: [
        <>Set in a <span className="text-gold font-semibold">best of 3 or best of 5</span> games (Bo3 / Bo5).</>,
        <>The winner is whoever takes the <span className="text-text font-semibold">majority of games</span>.</>,
        <>Your <span className="text-text font-semibold">ELO is per discipline</span>: your Smash rating is separate from foosball.</>,
        <>Both players report their result independently. If they disagree, the match is voided.</>,
      ],
    },
  },
  chess: {
    label: 'chess 1v1',
    terrain: {
      intro: (
        <>
          Game conventions so the result is beyond dispute:
        </>
      ),
      bullets: [
        <>
          A <span className="text-gold font-semibold">1v1</span> game under the classic rules of chess
          (touch-move).
        </>,
        <>
          The result is <span className="text-gold font-semibold">binary</span>: win or loss. A draw is
          replayed or settled as the players agree.
        </>,
        <>
          Victory is achieved by <span className="text-text font-semibold">checkmate</span> or by the
          opponent's <span className="text-text font-semibold">resignation</span>.
        </>,
        <>
          If a <span className="text-text font-semibold">time control</span> (clock) is used, flag fall
          counts as a loss.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League ranks <span className="text-text font-semibold">chess 1v1</span> here. Every registered
          player can challenge any other member of their league.
        </>
      ),
      bullets: [
        <><span className="text-gold font-semibold">Binary</span> result — win or loss, no numeric score.</>,
        <>A match can only be reported <span className="text-text font-semibold">after it has been played</span>.</>,
        <>Your <span className="text-text font-semibold">ELO is dedicated to chess</span>, separate from the other disciplines.</>,
        <>Both players report their result independently. If they disagree, the match is voided.</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1v1',
    terrain: {
      intro: (
        <>
          Set conventions so victories are clear and matches fair:
        </>
      ),
      bullets: [
        <>
          Each match is played in <span className="text-gold font-semibold">rounds</span> — the player who
          wins the majority of rounds takes the game.
        </>,
        <>
          <span className="text-gold font-semibold">Character</span> selection before each game; after a lost
          game, the loser may <span className="text-text font-semibold">switch character</span>.
        </>,
        <>
          Sets are played in a <span className="text-gold font-semibold">best of 3 (Bo3)</span> or{' '}
          <span className="text-gold font-semibold">best of 5 (Bo5)</span> depending on the context (official, tournament).
        </>,
        <>
          <span className="text-text font-semibold">Standard settings</span>: default timer and health, no
          modifiers or exotic assists — a fair, readable set.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League ranks <span className="text-text font-semibold">Street Fighter 1v1</span> here.
          Every registered player can challenge any other member of their league.
        </>
      ),
      bullets: [
        <>Set in a <span className="text-gold font-semibold">best of 3 or best of 5</span> games (Bo3 / Bo5).</>,
        <>The winner is whoever takes the <span className="text-text font-semibold">majority of games</span>.</>,
        <>Your <span className="text-text font-semibold">ELO is per discipline</span>: your Street Fighter rating is separate from the other games.</>,
        <>Both players report their result independently. If they disagree, the match is voided.</>,
      ],
    },
  },
  flechettes: {
    label: 'darts (301 / 501)',
    terrain: {
      intro: (
        <>
          Round conventions so the count is clear and the result beyond dispute:
        </>
      ),
      bullets: [
        <>
          A round in <span className="text-gold font-semibold">301 or 501</span>: each player starts from their
          starting score and <span className="text-text font-semibold">counts down</span> as they score.
        </>,
        <>
          The first to reach <span className="text-gold font-semibold">exactly 0</span> wins the round.
        </>,
        <>
          From <span className="text-gold font-semibold">2 to 8 players</span> can play the same round, each with
          their <span className="text-text font-semibold">own remaining score</span>.
        </>,
        <>
          No <span className="text-text font-semibold">characters</span> and no teams — it's an
          <span className="text-text font-semibold"> individual</span> contest.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League ranks <span className="text-text font-semibold">darts (301 / 501)</span> here.
          Every registered player can challenge any other member of their league.
        </>
      ),
      bullets: [
        <>Round of <span className="text-gold font-semibold">2 to 8 players</span>, <span className="text-text font-semibold">301 or 501</span> format.</>,
        <>
          The reporter enters, for each player, their <span className="text-gold font-semibold">remaining points</span> at the end
          (the <span className="text-text font-semibold">winner = 0</span>). The ranking is derived from the remainder:
          0 = 1st, then from the smallest remainder to the largest.
        </>,
        <>
          Each other player <span className="text-text font-semibold">confirms their own remainder</span>; a{' '}
          <span className="text-text font-semibold">dispute voids the round</span>.
        </>,
        <>
          Your <span className="text-text font-semibold">ELO is per discipline</span>: your darts rating is separate from the other games.
          No darts tournament and no 2v2.
        </>,
      ],
    },
  },
};

const RULES_ES: Record<Game, GameRules> = {
  babyfoot: {
    label: 'futbolín 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenciones de juego para que un gol sea válido y los partidos se disputen limpiamente:
        </>
      ),
      bullets: [
        <>
          Tras el saque (<span className="text-text font-semibold">kick-off</span>), la pelota debe
          <span className="text-gold font-semibold"> tocarse al menos dos veces</span> antes de que un gol
          cuente.
        </>,
        <>
          El jugador que <span className="text-text font-semibold">acaba de encajar un gol</span> tiene
          derecho a reponer la pelota <span className="text-gold font-semibold">en su barra del medio</span> (medios)
          para reanudar.
        </>,
        <>
          Los <span className="text-gold font-semibold">goles marcados desde la barra del medio</span> (medios)
          son válidos.
        </>,
        <>
          La <span className="text-gold font-semibold">gamelle</span> (pelota que sale rebotada de la portería):
          puedes <span className="text-text font-semibold">tomar el punto</span> o
          <span className="text-text font-semibold"> quitarle un punto al rival</span> — pero no se puede
          <span className="text-text font-semibold"> cerrar el partido con una gamelle</span>.
        </>,
        <>
          Las <span className="text-gold font-semibold">ruletas</span> deben ser
          <span className="text-text font-semibold"> controladas</span> (sin molinetes descontrolados).
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League es una clasificación ELO de <span className="text-text font-semibold">futbolín 1 contra 1</span>.
          Cada jugador inscrito puede desafiar a cualquier otro miembro de su league.
        </>
      ),
      bullets: [
        <>Partido a <span className="text-gold font-semibold">10 goles</span> — el primero en llegar a 10 gana.</>,
        <>Un partido solo puede declararse <span className="text-text font-semibold">después de haberse jugado</span>.</>,
        <>Ambos jugadores declaran su marcador de forma independiente. En caso de desacuerdo, el partido se anula.</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenciones de set para que la victoria sea clara y los partidos justos:
        </>
      ),
      bullets: [
        <>
          Cada partido se juega por <span className="text-gold font-semibold">stocks (vidas)</span> — el jugador
          que agota todos los stocks del rival gana la manga.
        </>,
        <>
          Selección de <span className="text-gold font-semibold">personaje</span> antes de cada manga; tras una
          manga perdida, el perdedor puede <span className="text-text font-semibold">cambiar de personaje</span>.
        </>,
        <>
          Los sets se disputan al <span className="text-gold font-semibold">mejor de 3 (Bo3)</span> o{' '}
          <span className="text-gold font-semibold">de 5 (Bo5)</span> según el contexto (oficial, torneo).
        </>,
        <>
          Los <span className="text-text font-semibold">objetos</span> y los escenarios discutidos están
          desactivados por defecto, salvo acuerdo explícito de ambos jugadores.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League clasifica aquí <span className="text-text font-semibold">Super Smash Bros. 1 contra 1</span> por
          stocks. Cada jugador inscrito puede desafiar a cualquier otro miembro de su league.
        </>
      ),
      bullets: [
        <>Set al <span className="text-gold font-semibold">mejor de 3 o de 5</span> mangas (Bo3 / Bo5).</>,
        <>El vencedor es quien gana la <span className="text-text font-semibold">mayoría de las mangas</span>.</>,
        <>El <span className="text-text font-semibold">ELO es propio de la disciplina</span>: tu rating de Smash es distinto del de futbolín.</>,
        <>Ambos jugadores declaran su resultado de forma independiente. En caso de desacuerdo, el partido se anula.</>,
      ],
    },
  },
  chess: {
    label: 'ajedrez 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenciones de partida para que el resultado sea incontestable:
        </>
      ),
      bullets: [
        <>
          Partida <span className="text-gold font-semibold">1 contra 1</span> con las reglas clásicas del
          ajedrez (pieza tocada, pieza jugada).
        </>,
        <>
          El resultado es <span className="text-gold font-semibold">binario</span>: victoria o derrota. Unas
          tablas se vuelven a jugar o se deciden según el acuerdo de los jugadores.
        </>,
        <>
          La victoria se logra por <span className="text-text font-semibold">jaque mate</span> o por
          <span className="text-text font-semibold"> abandono</span> del rival.
        </>,
        <>
          Si se usa un <span className="text-text font-semibold">ritmo</span> (reloj), la caída de la bandera
          vale como derrota.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League clasifica aquí el <span className="text-text font-semibold">ajedrez 1 contra 1</span>. Cada
          jugador inscrito puede desafiar a cualquier otro miembro de su league.
        </>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binario</span> — victoria o derrota, sin marcador numérico.</>,
        <>Un partido solo puede declararse <span className="text-text font-semibold">después de haberse jugado</span>.</>,
        <>El <span className="text-text font-semibold">ELO está dedicado al ajedrez</span>, distinto de las demás disciplinas.</>,
        <>Ambos jugadores declaran su resultado de forma independiente. En caso de desacuerdo, el partido se anula.</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenciones de set para que la victoria sea clara y los partidos justos:
        </>
      ),
      bullets: [
        <>
          Cada partido se juega por <span className="text-gold font-semibold">rounds</span> — el jugador que
          gana la mayoría de los rounds se lleva la manga.
        </>,
        <>
          Selección de <span className="text-gold font-semibold">personaje</span> antes de cada manga; tras una
          manga perdida, el perdedor puede <span className="text-text font-semibold">cambiar de personaje</span>.
        </>,
        <>
          Los sets se disputan al <span className="text-gold font-semibold">mejor de 3 (Bo3)</span> o{' '}
          <span className="text-gold font-semibold">de 5 (Bo5)</span> según el contexto (oficial, torneo).
        </>,
        <>
          <span className="text-text font-semibold">Ajustes estándar</span>: temporizador y vida por defecto,
          sin modificadores ni assists exóticos — un set justo y legible.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League clasifica aquí el <span className="text-text font-semibold">Street Fighter 1 contra 1</span>.
          Cada jugador inscrito puede desafiar a cualquier otro miembro de su league.
        </>
      ),
      bullets: [
        <>Set al <span className="text-gold font-semibold">mejor de 3 o de 5</span> mangas (Bo3 / Bo5).</>,
        <>El vencedor es quien gana la <span className="text-text font-semibold">mayoría de las mangas</span>.</>,
        <>El <span className="text-text font-semibold">ELO es propio de la disciplina</span>: tu rating de Street Fighter es distinto del de los demás juegos.</>,
        <>Ambos jugadores declaran su resultado de forma independiente. En caso de desacuerdo, el partido se anula.</>,
      ],
    },
  },
  flechettes: {
    label: 'dardos (301 / 501)',
    terrain: {
      intro: (
        <>
          Convenciones de manga para que el recuento sea claro y el resultado incontestable:
        </>
      ),
      bullets: [
        <>
          Manga a <span className="text-gold font-semibold">301 o 501</span>: cada jugador parte de su
          marcador inicial y <span className="text-text font-semibold">va descontando</span> a medida que anota.
        </>,
        <>
          El primero en llegar a <span className="text-gold font-semibold">exactamente 0</span> gana la manga.
        </>,
        <>
          De <span className="text-gold font-semibold">2 a 8 jugadores</span> pueden disputar la misma manga, cada uno
          con su <span className="text-text font-semibold">propio resto</span>.
        </>,
        <>
          Sin <span className="text-text font-semibold">personajes</span> ni equipos — es un enfrentamiento
          <span className="text-text font-semibold"> individual</span>.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League clasifica aquí los <span className="text-text font-semibold">dardos (301 / 501)</span>.
          Cada jugador inscrito puede desafiar a cualquier otro miembro de su league.
        </>
      ),
      bullets: [
        <>Manga de <span className="text-gold font-semibold">2 a 8 jugadores</span>, formato <span className="text-text font-semibold">301 o 501</span>.</>,
        <>
          El declarante introduce, para cada jugador, sus <span className="text-gold font-semibold">puntos restantes</span> al final
          (el <span className="text-text font-semibold">vencedor = 0</span>). La clasificación se deduce del resto:
          0 = 1.º, luego del resto más pequeño al más grande.
        </>,
        <>
          Cada uno de los demás jugadores <span className="text-text font-semibold">confirma su propio resto</span>; una{' '}
          <span className="text-text font-semibold">contestación anula la manga</span>.
        </>,
        <>
          El <span className="text-text font-semibold">ELO es propio de la disciplina</span>: tu rating de dardos es distinto del de los demás juegos.
          Sin torneo de dardos ni 2v2.
        </>,
      ],
    },
  },
};

const RULES_I18N: Record<Lang, Record<Game, GameRules>> = {
  fr: RULES_FR,
  en: RULES_EN,
  es: RULES_ES,
};

// ─── Défis & OPS (texte riche, par langue) ───────────────────────────────────

const CHALLENGES_BODY: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <p>
        Les <span className="text-gold font-semibold">défis</span> permettent de planifier un match à une heure précise.
        L'adversaire accepte ou décline.
      </p>
      <p>
        Un <span className="text-red font-semibold">OPS</span> (opération) désigne ton{' '}
        <span className="text-text font-semibold">ennemi juré</span> : tu cibles un joueur et la traque
        s'ouvre. Action unilatérale, aucune acceptation requise.
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-red/30">
        <li>La traque dure <span className="text-text font-semibold">24 heures</span>.</li>
        <li>
          Pendant ce temps, la cible <span className="text-text font-semibold">ne peut pas refuser</span> les
          <span className="text-text font-semibold"> 3 premiers défis</span> de son traqueur — elle doit les jouer.
        </li>
        <li>
          Refuser un de ces matchs forcés coûte <span className="text-red font-semibold">3× l'ELO d'une défaite</span>
          {' '}(bien plus qu'un simple désistement).
        </li>
        <li>Un seul OPS actif à la fois, avec un cooldown d'une semaine après expiration.</li>
      </ul>
    </>
  ),
  en: (
    <>
      <p>
        <span className="text-gold font-semibold">Challenges</span> let you schedule a match at a set time.
        Your opponent accepts or declines.
      </p>
      <p>
        An <span className="text-red font-semibold">OPS</span> (operation) marks your{' '}
        <span className="text-text font-semibold">arch-rival</span>: you target a player and the hunt
        begins. A unilateral action — no acceptance required.
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-red/30">
        <li>The hunt lasts <span className="text-text font-semibold">24 hours</span>.</li>
        <li>
          During that window, the target <span className="text-text font-semibold">cannot decline</span> the
          <span className="text-text font-semibold"> first 3 challenges</span> from their hunter — they must play them.
        </li>
        <li>
          Declining one of these forced matches costs <span className="text-red font-semibold">3× the ELO of a loss</span>
          {' '}(far more than a simple withdrawal).
        </li>
        <li>Only one OPS active at a time, with a one-week cooldown after it expires.</li>
      </ul>
    </>
  ),
  es: (
    <>
      <p>
        Los <span className="text-gold font-semibold">desafíos</span> permiten planificar un partido a una hora concreta.
        El rival acepta o rechaza.
      </p>
      <p>
        Una <span className="text-red font-semibold">OPS</span> (operación) designa a tu{' '}
        <span className="text-text font-semibold">archienemigo</span>: marcas a un jugador y se abre la
        caza. Acción unilateral, sin necesidad de aceptación.
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-red/30">
        <li>La caza dura <span className="text-text font-semibold">24 horas</span>.</li>
        <li>
          Durante ese tiempo, el objetivo <span className="text-text font-semibold">no puede rechazar</span> los
          <span className="text-text font-semibold"> 3 primeros desafíos</span> de su cazador — debe jugarlos.
        </li>
        <li>
          Rechazar uno de estos partidos forzados cuesta <span className="text-red font-semibold">3× el ELO de una derrota</span>
          {' '}(mucho más que un simple abandono).
        </li>
        <li>Solo una OPS activa a la vez, con un cooldown de una semana tras expirar.</li>
      </ul>
    </>
  ),
};

const TOURNAMENTS_BODY: Record<Lang, React.ReactNode> = {
  fr: (
    <p>
      Deux formats : <span className="text-text font-semibold">élimination directe</span> (bracket,
      byes auto si besoin) ou <span className="text-text font-semibold">phase de poules</span> (dès 12
      joueurs — poules de 4, 2 qualifiés par poule, puis bracket des qualifiés). Les tournois{' '}
      <span className="text-gold font-semibold">officiels</span> sont créés par les admins et donnent des
      récompenses spéciales ; les <span className="text-text font-semibold">amicaux</span> sont ouverts à
      tous, sans impact ELO, et ne figurent dans l'historique que pour leurs participants.
    </p>
  ),
  en: (
    <p>
      Two formats: <span className="text-text font-semibold">single elimination</span> (bracket,
      auto byes if needed) or a <span className="text-text font-semibold">group stage</span> (from 12
      players — groups of 4, 2 qualifiers per group, then a bracket of the qualifiers). The{' '}
      <span className="text-gold font-semibold">official</span> tournaments are created by admins and grant
      special rewards; the <span className="text-text font-semibold">friendly</span> ones are open to
      everyone, have no ELO impact, and appear in the history only for their participants.
    </p>
  ),
  es: (
    <p>
      Dos formatos: <span className="text-text font-semibold">eliminación directa</span> (bracket,
      byes automáticos si hace falta) o <span className="text-text font-semibold">fase de grupos</span> (a partir de 12
      jugadores — grupos de 4, 2 clasificados por grupo, luego bracket de clasificados). Los torneos{' '}
      <span className="text-gold font-semibold">oficiales</span> los crean los admins y dan recompensas
      especiales; los <span className="text-text font-semibold">amistosos</span> están abiertos a
      todos, sin impacto en el ELO, y solo figuran en el historial de sus participantes.
    </p>
  ),
};

function RulesSection() {
  const { game } = useGameMode();
  const { lang } = useI18n();
  const t = useT();
  const rules = RULES_I18N[lang][game];
  return (
    <div className="flex flex-col gap-4">
      {/* En tête, pleine largeur : les règles propres à la discipline active. */}
      <Panel title={t('about.rules.terrain.title')} accent="book">
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>{rules.terrain.intro}</p>
          <ul className="space-y-1.5 pl-3 border-l border-gold/25">
            {rules.terrain.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* Le système ELO en pleine largeur : la formule détaillée mérite l'espace. */}
      <EloSection game={game} />

      {/* Rangée régulière de 3 panneaux « méta », hauteurs égales. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
      <Panel title={t('about.rules.format.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>{rules.format.intro}</p>
          <ul className="space-y-1.5 pl-3 border-l border-gold/25">
            {rules.format.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title={t('about.rules.challenges.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          {CHALLENGES_BODY[lang]}
        </div>
      </Panel>

      <Panel title={t('about.rules.tournaments.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          {TOURNAMENTS_BODY[lang]}
        </div>
      </Panel>
      </div>
    </div>
  );
}

// ─── Système ELO ──────────────────────────────────────────────────────────────

/**
 * Détail de la formule ELO réellement appliquée côté serveur
 * (cf. packages/shared/src/elo.ts). Présentation pédagogique, en pleine largeur.
 * L'ELO est calculé indépendamment par discipline : ne change que la phrase
 * d'introduction (et la mention de l'écart de buts, propre aux jeux scorés).
 *
 * Contenu riche (formules, surlignages) → sélectionné par langue.
 */
type EloContent = {
  /** Intro : tableau [avant-discipline, après-discipline]. Le label discipline s'insère entre les deux. */
  intro: (label: string, scored: boolean) => React.ReactNode;
  term: {
    E: React.ReactNode;
    K: React.ReactNode;
    M: React.ReactNode;
    bonus: React.ReactNode;
  };
  exampleNote: (scored: boolean) => React.ReactNode;
};

const ELO_CONTENT: Record<Lang, EloContent> = {
  fr: {
    intro: (label, scored) => (
      <>
        Le classement repose sur un système <span className="text-gold font-semibold">ELO dérivé des échecs</span>,
        appliqué <span className="text-text font-semibold">par discipline</span> ({label}).
        Chaque joueur démarre à{' '}
        <span className="text-text font-semibold">1000 points</span>. À chaque match, des points sont
        transférés du perdant vers le gagnant — d'autant plus que le résultat était{' '}
        <span className="text-text font-semibold">inattendu</span>
        {scored ? (
          <> et la victoire <span className="text-text font-semibold">large</span></>
        ) : null}
        .
      </>
    ),
    term: {
      E: (
        <>
          La chance théorique de victoire du gagnant, calculée à partir de l'écart de classement
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_perdant − Elo_gagnant) / 400))</code>).
          Battre un adversaire mieux classé rapporte plus, car la victoire était peu probable.
        </>
      ),
      K: (
        <>
          La quantité maximale de points en jeu sur un match « neutre ». Plus il est élevé, plus le
          classement réagit vite.
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − score_perdant) × 0,1</code> :
          gagner <span className="text-text font-semibold">10–0</span> pèse davantage qu'un{' '}
          <span className="text-text font-semibold">10–9</span> serré. L'ampleur de la victoire compte.
        </>
      ),
      bonus: (
        <>
          En clair :{' '}
          <span className="text-text font-semibold">
            si tu bats quelqu'un de bien mieux classé que toi, tu gagnes beaucoup plus de points
          </span>{' '}
          — et lui en perd d'autant. Battre un adversaire de niveau proche ne rapporte que peu :
          plus l'écart de classement est grand, plus l'exploit paie.
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? 'Même score, même victoire' : 'Même victoire'} : l'exploit face au joueur à +400 d'écart
        rapporte <span className="text-text font-semibold">deux fois plus de points</span>.
      </>
    ),
  },
  en: {
    intro: (label, scored) => (
      <>
        The ranking is based on a <span className="text-gold font-semibold">chess-derived ELO system</span>,
        applied <span className="text-text font-semibold">per discipline</span> ({label}).
        Each player starts at{' '}
        <span className="text-text font-semibold">1000 points</span>. In every match, points are
        transferred from the loser to the winner — all the more so when the result was{' '}
        <span className="text-text font-semibold">unexpected</span>
        {scored ? (
          <> and the win was <span className="text-text font-semibold">wide</span></>
        ) : null}
        .
      </>
    ),
    term: {
      E: (
        <>
          The winner's theoretical chance of victory, computed from the rating gap
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_loser − Elo_winner) / 400))</code>).
          Beating a higher-rated opponent pays more, since the win was unlikely.
        </>
      ),
      K: (
        <>
          The maximum amount of points at stake in a "neutral" match. The higher it is, the faster the
          ranking reacts.
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − loser_score) × 0.1</code>:
          winning <span className="text-text font-semibold">10–0</span> weighs more than a tight{' '}
          <span className="text-text font-semibold">10–9</span>. The margin of victory matters.
        </>
      ),
      bonus: (
        <>
          Put plainly:{' '}
          <span className="text-text font-semibold">
            if you beat someone rated far above you, you gain a lot more points
          </span>{' '}
          — and they lose just as many. Beating an opponent of similar level pays little:
          the wider the rating gap, the more the upset pays off.
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? 'Same score, same win' : 'Same win'}: the upset against the player +400 apart
        pays <span className="text-text font-semibold">twice as many points</span>.
      </>
    ),
  },
  es: {
    intro: (label, scored) => (
      <>
        La clasificación se basa en un sistema <span className="text-gold font-semibold">ELO derivado del ajedrez</span>,
        aplicado <span className="text-text font-semibold">por disciplina</span> ({label}).
        Cada jugador empieza con{' '}
        <span className="text-text font-semibold">1000 puntos</span>. En cada partido se transfieren
        puntos del perdedor al ganador — tanto más cuanto más{' '}
        <span className="text-text font-semibold">inesperado</span> fuera el resultado
        {scored ? (
          <> y más <span className="text-text font-semibold">amplia</span> la victoria</>
        ) : null}
        .
      </>
    ),
    term: {
      E: (
        <>
          La probabilidad teórica de victoria del ganador, calculada a partir de la diferencia de clasificación
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_perdedor − Elo_ganador) / 400))</code>).
          Ganar a un rival mejor clasificado da más, porque la victoria era poco probable.
        </>
      ),
      K: (
        <>
          La cantidad máxima de puntos en juego en un partido «neutro». Cuanto mayor es, más rápido
          reacciona la clasificación.
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − marcador_perdedor) × 0,1</code>:
          ganar <span className="text-text font-semibold">10–0</span> pesa más que un{' '}
          <span className="text-text font-semibold">10–9</span> ajustado. La magnitud de la victoria cuenta.
        </>
      ),
      bonus: (
        <>
          En claro:{' '}
          <span className="text-text font-semibold">
            si ganas a alguien mucho mejor clasificado que tú, ganas muchos más puntos
          </span>{' '}
          — y él pierde otros tantos. Ganar a un rival de nivel parecido apenas da puntos:
          cuanto mayor es la diferencia de clasificación, más paga la sorpresa.
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? 'Mismo marcador, misma victoria' : 'Misma victoria'}: la sorpresa frente al jugador a +400 de diferencia
        da <span className="text-text font-semibold">el doble de puntos</span>.
      </>
    ),
  },
};

function EloSection({ game }: { game: Game }) {
  const { lang } = useI18n();
  const t = useT();
  const content = ELO_CONTENT[lang];
  const label = RULES_I18N[lang][game].label;
  // L'écart de buts (multiplicateur M) n'a de sens que pour le babyfoot, qui se
  // joue en score chiffré. Smash et échecs ont un résultat sans écart de buts.
  const scored = game === 'babyfoot';
  return (
    <Panel title={t('about.elo.title')} sub={t('about.elo.sub')}>
      <div className="space-y-5 text-sm text-muted leading-relaxed">
        <p>{content.intro(label, scored)}</p>

        {/* La formule mise en avant */}
        <div className="rounded-xl border border-gold/25 bg-bg-2/50 p-4 sm:p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-2 mb-3">
            {t('about.elo.transferred')}
          </div>
          <div className="font-gaming text-center text-base sm:text-lg text-text-strong tracking-wide">
            <span className="text-gold">K</span> ×{' '}
            {scored ? (
              <>
                <span className="text-gold">M</span> ×{' '}
              </>
            ) : null}
            <span className="text-text">(1 − E)</span>
            <span className="text-muted"> + </span>
            <span className="text-gold">{t('about.elo.upsetBonus')}</span>
          </div>
        </div>

        {/* Décomposition terme par terme */}
        <div className="space-y-3">
          <EloTerm symbol="E" label={t('about.elo.term.E.label')}>
            {content.term.E}
          </EloTerm>
          <EloTerm symbol="K = 32" label={t('about.elo.term.K.label')}>
            {content.term.K}
          </EloTerm>
          {scored ? (
            <EloTerm symbol="M" label={t('about.elo.term.M.label')}>
              {content.term.M}
            </EloTerm>
          ) : null}
          <EloTerm symbol={t('about.elo.upsetBonus')} label={t('about.elo.term.bonus.label')}>
            {content.term.bonus}
          </EloTerm>
        </div>

        {/* Exemple chiffré : à score égal, seul l'écart de classement change le gain. */}
        <div className="rounded-xl border border-gold/20 bg-bg-2/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-bg-2/60 border-b border-gold/15 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-2">
            {scored ? t('about.elo.example.scored') : t('about.elo.example.unscored')}
          </div>
          <div className="divide-y divide-border/20">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-text font-semibold text-sm">{t('about.elo.example.small.title')}</div>
                <div className="text-xs text-muted-2">{t('about.elo.example.small.sub')}</div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-sm">
                <span className="text-[#7fd66e] font-extrabold">+29</span>
                <span className="text-muted-2 text-[11px]">{t('about.elo.example.heLoses')}</span>
                <span className="text-red font-extrabold">−29</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-text font-semibold text-sm">{t('about.elo.example.big.title')}</div>
                <div className="text-xs text-muted-2">{t('about.elo.example.big.sub')}</div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-sm">
                <span className="text-[#7fd66e] font-extrabold">+60</span>
                <span className="text-muted-2 text-[11px]">{t('about.elo.example.heLoses')}</span>
                <span className="text-red font-extrabold">−60</span>
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 text-xs text-muted leading-relaxed border-t border-gold/15">
            {content.exampleNote(scored)}
          </div>
        </div>

        {/* Garde-fous & règles annexes */}
        <ul className="space-y-1.5 pl-3 border-l border-gold/25">
          {ELO_GUARDRAILS[lang]}
        </ul>
      </div>
    </Panel>
  );
}

const ELO_GUARDRAILS: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <li>
        <span className="text-text font-semibold">Asymétrie sur les gros upsets</span> — le perdant surcoté encaisse
        tout le bonus (jusqu'à <span className="text-gold font-semibold">−400</span> sur un match), mais le gagnant
        ne grimpe que d'une part <span className="text-text font-semibold">plafonnée à +50</span> : battre un seul
        « boss » gonflé ne fait pas exploser ton propre rating.
      </li>
      <li>
        <span className="text-text font-semibold">Garde-fou</span> — la variation est bornée à{' '}
        <span className="text-gold font-semibold">±400 points</span> par match.
      </li>
      <li>
        <span className="text-text font-semibold">Ranked illimité</span> —{' '}
        <span className="text-text font-semibold">chaque match compte pour l'ELO</span>, sans
        limite par jour ni par adversaire.
      </li>
    </>
  ),
  en: (
    <>
      <li>
        <span className="text-text font-semibold">Asymmetry on big upsets</span> — the overrated loser takes
        the full bonus (up to <span className="text-gold font-semibold">−400</span> on a single match), but the winner
        only gains a <span className="text-text font-semibold">capped +50</span> share: beating a single
        inflated "boss" won't blow up your own rating.
      </li>
      <li>
        <span className="text-text font-semibold">Guardrail</span> — the change is capped at{' '}
        <span className="text-gold font-semibold">±400 points</span> per match.
      </li>
      <li>
        <span className="text-text font-semibold">Unlimited ranked</span> —{' '}
        <span className="text-text font-semibold">every match counts toward ELO</span>, with no
        daily or per-opponent limit.
      </li>
    </>
  ),
  es: (
    <>
      <li>
        <span className="text-text font-semibold">Asimetría en las grandes sorpresas</span> — el perdedor sobrevalorado encaja
        todo el bonus (hasta <span className="text-gold font-semibold">−400</span> en un partido), pero el ganador
        solo sube una parte <span className="text-text font-semibold">limitada a +50</span>: ganar a un solo
        «boss» inflado no dispara tu propio rating.
      </li>
      <li>
        <span className="text-text font-semibold">Salvaguarda</span> — la variación está acotada a{' '}
        <span className="text-gold font-semibold">±400 puntos</span> por partido.
      </li>
      <li>
        <span className="text-text font-semibold">Ranked ilimitado</span> —{' '}
        <span className="text-text font-semibold">cada partido cuenta para el ELO</span>, sin
        límite diario ni por rival.
      </li>
    </>
  ),
};

function EloTerm({
  symbol,
  label,
  children,
}: {
  symbol: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-24 sm:w-28 pt-0.5">
        <div className="font-gaming text-sm font-extrabold text-gold leading-tight">{symbol}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-2 mt-0.5">{label}</div>
      </div>
      <p className="flex-1 text-sm text-muted leading-relaxed">{children}</p>
    </div>
  );
}

// ─── Politique de confidentialité ─────────────────────────────────────────────

// Paragraphes riches (liens, surlignages) → par langue.
const PRIVACY_CONTROLLER: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      Cette application est développée et opérée par des étudiants du réseau 42 dans le cadre
      des CGU de l'API 42 (
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ). Pour toute question relative à vos données :{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
  en: (
    <>
      This app is developed and operated by students of the 42 network under the terms of the 42 API
      (
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ). For any question regarding your data:{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
  es: (
    <>
      Esta aplicación es desarrollada y operada por estudiantes de la red 42 en el marco de las
      condiciones de la API 42 (
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ). Para cualquier consulta sobre tus datos:{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
};

const PRIVACY_LEGAL: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      Le traitement est fondé sur l'<span className="text-text font-semibold">intérêt légitime</span> (RGPD Art. 6(1)(f)) :
      gestion d'un classement sportif au sein du réseau 42, dans le cadre pédagogique défini
      par les CGU de l'API 42. L'accès à vos données de profil 42 est conditionné à votre
      consentement explicite lors de la connexion OAuth.
    </>
  ),
  en: (
    <>
      Processing is based on <span className="text-text font-semibold">legitimate interest</span> (GDPR Art. 6(1)(f)):
      running a sports ranking within the 42 network, in the educational context defined by the
      42 API terms. Access to your 42 profile data is subject to your explicit consent during
      the OAuth sign-in.
    </>
  ),
  es: (
    <>
      El tratamiento se basa en el <span className="text-text font-semibold">interés legítimo</span> (RGPD Art. 6(1)(f)):
      gestión de una clasificación deportiva dentro de la red 42, en el marco pedagógico definido
      por las condiciones de la API 42. El acceso a tus datos de perfil de 42 está sujeto a tu
      consentimiento explícito durante el inicio de sesión OAuth.
    </>
  ),
};

const PRIVACY_RIGHTS: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <li>
        <span className="text-text font-semibold">Accès et portabilité</span> — export JSON disponible
        dans <Link to="/settings" className="text-gold hover:underline">Réglages</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Effacement</span> — suppression (anonymisation)
        du compte disponible dans <Link to="/settings" className="text-gold hover:underline">Réglages</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Rectification</span> — contactez-nous par email.
      </li>
      <li>
        <span className="text-text font-semibold">Opposition</span> — vous pouvez cesser d'utiliser l'application
        à tout moment et demander la suppression de votre compte.
      </li>
    </>
  ),
  en: (
    <>
      <li>
        <span className="text-text font-semibold">Access and portability</span> — JSON export available
        in <Link to="/settings" className="text-gold hover:underline">Settings</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Erasure</span> — account deletion (anonymization)
        available in <Link to="/settings" className="text-gold hover:underline">Settings</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Rectification</span> — contact us by email.
      </li>
      <li>
        <span className="text-text font-semibold">Objection</span> — you can stop using the app
        at any time and request the deletion of your account.
      </li>
    </>
  ),
  es: (
    <>
      <li>
        <span className="text-text font-semibold">Acceso y portabilidad</span> — exportación JSON disponible
        en <Link to="/settings" className="text-gold hover:underline">Ajustes</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Supresión</span> — eliminación (anonimización)
        de la cuenta disponible en <Link to="/settings" className="text-gold hover:underline">Ajustes</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Rectificación</span> — contáctanos por email.
      </li>
      <li>
        <span className="text-text font-semibold">Oposición</span> — puedes dejar de usar la aplicación
        en cualquier momento y solicitar la eliminación de tu cuenta.
      </li>
    </>
  ),
};

const PRIVACY_SECURITY: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      Les communications sont chiffrées en transit (HTTPS). Les tokens de session
      sont signés cryptographiquement (HMAC-SHA256) et transmis exclusivement
      via cookies <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">HttpOnly</code> ou
      fragment d'URL (non loggués). Aucune donnée n'est partagée avec des tiers,
      à l'exception du webhook Discord interne utilisé pour les alertes admin
      (sans données personnelles).
    </>
  ),
  en: (
    <>
      Communications are encrypted in transit (HTTPS). Session tokens are
      cryptographically signed (HMAC-SHA256) and transmitted exclusively via
      <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text"> HttpOnly</code> cookies or
      URL fragment (not logged). No data is shared with third parties,
      except for the internal Discord webhook used for admin alerts
      (no personal data).
    </>
  ),
  es: (
    <>
      Las comunicaciones se cifran en tránsito (HTTPS). Los tokens de sesión
      se firman criptográficamente (HMAC-SHA256) y se transmiten exclusivamente
      mediante cookies <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">HttpOnly</code> o
      fragmento de URL (no registrados). No se comparte ningún dato con terceros,
      salvo el webhook interno de Discord usado para las alertas de admin
      (sin datos personales).
    </>
  ),
};

function PrivacySection() {
  const { lang } = useI18n();
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('about.privacy.controller.title')}>
        <p className="text-sm text-muted leading-relaxed">{PRIVACY_CONTROLLER[lang]}</p>
      </Panel>

      <Panel title={t('about.privacy.collected.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>{t('about.privacy.collected.intro')}</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-1.5 pr-3 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.data')}</th>
                <th className="text-left py-1.5 pr-3 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.source')}</th>
                <th className="text-left py-1.5 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.retention')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <tr>
                <td className="py-1.5 pr-3 text-text">{t('about.privacy.row1.data')}</td>
                <td className="py-1.5 pr-3 text-muted">{t('about.privacy.row1.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row1.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-text">{t('about.privacy.row2.data')}</td>
                <td className="py-1.5 pr-3 text-muted">{t('about.privacy.row2.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row2.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-text">{t('about.privacy.row3.data')}</td>
                <td className="py-1.5 pr-3 text-muted">{t('about.privacy.row3.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row3.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-text">{t('about.privacy.row4.data')}</td>
                <td className="py-1.5 pr-3 text-muted">{t('about.privacy.row4.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row4.retention')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t('about.privacy.legal.title')}>
        <p className="text-sm text-muted leading-relaxed">{PRIVACY_LEGAL[lang]}</p>
      </Panel>

      <Panel title={t('about.privacy.rights.title')}>
        <div className="space-y-2 text-sm text-muted leading-relaxed">
          <p>{t('about.privacy.rights.intro')}</p>
          <ul className="space-y-1.5 pl-3 border-l border-gold/25">
            {PRIVACY_RIGHTS[lang]}
          </ul>
          <p className="text-xs text-muted-2 pt-1">
            {t('about.privacy.authority')}{' '}
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
              cnil.fr
            </a>
          </p>
        </div>
      </Panel>

      <Panel title={t('about.privacy.security.title')}>
        <p className="text-sm text-muted leading-relaxed">{PRIVACY_SECURITY[lang]}</p>
      </Panel>
    </div>
  );
}

// ─── Coulisses techniques ─────────────────────────────────────────────────────

/**
 * Parenthèse « sous le capot » : un site utilisé par 42, autant en exposer le
 * fonctionnement. Volontairement court et synthétique, dans le ton du reste.
 * Contenu riche → par langue.
 */
const TECH_ARCHITECTURE: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <p>
        Monorepo <span className="text-text font-semibold">TypeScript</span> de bout en bout, en trois morceaux :
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-gold/25">
        <li>
          <span className="text-gold font-semibold">Front</span> — React 18 + Vite, installable en{' '}
          <span className="text-text font-semibold">PWA</span> (service worker, plein écran sur mobile).
        </li>
        <li>
          <span className="text-gold font-semibold">Back</span> — API <span className="text-text font-semibold">Hono</span>{' '}
          sur Node, base <span className="text-text font-semibold">PostgreSQL</span> via Prisma. Connexion 42 en OAuth.
        </li>
        <li>
          <span className="text-gold font-semibold">Temps réel</span> — le serveur pousse les changements en{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code> ; le classement, les défis et les OPS
          se mettent à jour <span className="text-text font-semibold">sans rechargement</span>.
        </li>
      </ul>
    </>
  ),
  en: (
    <>
      <p>
        End-to-end <span className="text-text font-semibold">TypeScript</span> monorepo, in three pieces:
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-gold/25">
        <li>
          <span className="text-gold font-semibold">Front</span> — React 18 + Vite, installable as a{' '}
          <span className="text-text font-semibold">PWA</span> (service worker, full screen on mobile).
        </li>
        <li>
          <span className="text-gold font-semibold">Back</span> — <span className="text-text font-semibold">Hono</span> API{' '}
          on Node, <span className="text-text font-semibold">PostgreSQL</span> database via Prisma. 42 sign-in over OAuth.
        </li>
        <li>
          <span className="text-gold font-semibold">Real-time</span> — the server pushes changes over{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code>; the ranking, challenges and OPS
          update <span className="text-text font-semibold">without a reload</span>.
        </li>
      </ul>
    </>
  ),
  es: (
    <>
      <p>
        Monorepo <span className="text-text font-semibold">TypeScript</span> de extremo a extremo, en tres piezas:
      </p>
      <ul className="space-y-1.5 pl-3 border-l border-gold/25">
        <li>
          <span className="text-gold font-semibold">Front</span> — React 18 + Vite, instalable como{' '}
          <span className="text-text font-semibold">PWA</span> (service worker, pantalla completa en móvil).
        </li>
        <li>
          <span className="text-gold font-semibold">Back</span> — API <span className="text-text font-semibold">Hono</span>{' '}
          sobre Node, base de datos <span className="text-text font-semibold">PostgreSQL</span> con Prisma. Conexión 42 por OAuth.
        </li>
        <li>
          <span className="text-gold font-semibold">Tiempo real</span> — el servidor envía los cambios por{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code>; la clasificación, los desafíos y las OPS
          se actualizan <span className="text-text font-semibold">sin recargar</span>.
        </li>
      </ul>
    </>
  ),
};

const TECH_HOSTING: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <p>
        Le site tourne sur un serveur <span className="text-gold font-semibold">Scaleway</span>, derrière un reverse-proxy{' '}
        <span className="text-text font-semibold">Caddy</span> qui gère le <span className="text-text font-semibold">TLS</span>{' '}
        automatiquement (Let's Encrypt).
      </p>
      <p>
        Chaque <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> sur la branche principale
        déclenche une <span className="text-gold font-semibold">GitHub Action</span> : elle construit une{' '}
        <span className="text-text font-semibold">image Docker</span>, la scanne (Trivy) puis la pousse sur le serveur, qui
        redémarre sur la nouvelle version. <span className="text-text font-semibold">Zéro déploiement manuel.</span>
      </p>
    </>
  ),
  en: (
    <>
      <p>
        The site runs on a <span className="text-gold font-semibold">Scaleway</span> server, behind a{' '}
        <span className="text-text font-semibold">Caddy</span> reverse proxy that handles <span className="text-text font-semibold">TLS</span>{' '}
        automatically (Let's Encrypt).
      </p>
      <p>
        Every <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> to the main branch
        triggers a <span className="text-gold font-semibold">GitHub Action</span>: it builds a{' '}
        <span className="text-text font-semibold">Docker image</span>, scans it (Trivy), then pushes it to the server, which
        restarts on the new version. <span className="text-text font-semibold">Zero manual deployment.</span>
      </p>
    </>
  ),
  es: (
    <>
      <p>
        El sitio corre en un servidor <span className="text-gold font-semibold">Scaleway</span>, detrás de un reverse-proxy{' '}
        <span className="text-text font-semibold">Caddy</span> que gestiona el <span className="text-text font-semibold">TLS</span>{' '}
        automáticamente (Let's Encrypt).
      </p>
      <p>
        Cada <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> a la rama principal
        dispara una <span className="text-gold font-semibold">GitHub Action</span>: construye una{' '}
        <span className="text-text font-semibold">imagen Docker</span>, la escanea (Trivy) y la envía al servidor, que
        reinicia con la nueva versión. <span className="text-text font-semibold">Cero despliegue manual.</span>
      </p>
    </>
  ),
};

const TECH_HACK: Record<Lang, React.ReactNode> = {
  fr: (
    <>
      <p>
        Détailler la stack ici, c'est assumé : un site fait <span className="text-text font-semibold">par</span> et{' '}
        <span className="text-text font-semibold">pour</span> 42 mérite d'être curieux de l'intérieur. Le code applicatif
        reste en dépôt <span className="text-gold font-semibold">privé</span>, mais le fonctionnement n'a rien d'un secret.
      </p>
      <p>
        Tu trouves une faille, un comportement louche, une idée de contournement ? <span className="text-gold font-semibold">Préviens
        plutôt que d'exploiter</span> — divulgation responsable à{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        . Les bons reports finissent crédités. 🏴‍☠️
      </p>
    </>
  ),
  en: (
    <>
      <p>
        Spelling out the stack here is deliberate: a site built <span className="text-text font-semibold">by</span> and{' '}
        <span className="text-text font-semibold">for</span> 42 deserves to be poked at from the inside. The application code
        stays in a <span className="text-gold font-semibold">private</span> repo, but how it works is no secret.
      </p>
      <p>
        Found a flaw, shady behavior, a bypass idea? <span className="text-gold font-semibold">Report rather
        than exploit</span> — responsible disclosure to{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        . Good reports end up credited. 🏴‍☠️
      </p>
    </>
  ),
  es: (
    <>
      <p>
        Detallar la stack aquí es algo asumido: un sitio hecho <span className="text-text font-semibold">por</span> y{' '}
        <span className="text-text font-semibold">para</span> 42 merece que lo curioseen por dentro. El código de la aplicación
        sigue en un repo <span className="text-gold font-semibold">privado</span>, pero su funcionamiento no es ningún secreto.
      </p>
      <p>
        ¿Encuentras un fallo, un comportamiento raro, una idea para saltártelo? <span className="text-gold font-semibold">Avisa
        en vez de explotarlo</span> — divulgación responsable a{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        . Los buenos reportes acaban acreditados. 🏴‍☠️
      </p>
    </>
  ),
};

function TechSection() {
  const { lang } = useI18n();
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('about.tech.architecture.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          {TECH_ARCHITECTURE[lang]}
        </div>
      </Panel>

      <Panel title={t('about.tech.hosting.title')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          {TECH_HOSTING[lang]}
        </div>
      </Panel>

      <Panel title={t('about.tech.hack.title')} sub={t('about.tech.hack.sub')}>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          {TECH_HACK[lang]}
        </div>
      </Panel>
    </div>
  );
}

// ─── Équipe & développeurs ────────────────────────────────────────────────────

/**
 * Les personnes derrière 42 League — de l'idée au déploiement. Chaque membre a
 * un rôle distinct dans l'histoire du projet ; l'ordre suit cette chronologie :
 * l'idée, le passage 0 → 1, l'ambition, puis l'accompagnement (bêta & infra).
 *
 * `login`, `accent`, `roleKey` sont invariants ; le `role` (via t()) et le
 * `blurb` (JSX riche) sont sélectionnés par langue à l'affichage.
 */
type Member = {
  login: string;
  /** Clé i18n du rôle (rendue via t() dans la carte). */
  roleKey: string;
  accent: 'gold' | 'red' | 'violet';
  crown?: boolean;
  /** Affiche le « ? » avec les stats de contributions git sur la carte. */
  gitStats?: boolean;
  /** Blurb riche par langue. */
  blurb: Record<Lang, React.ReactNode>;
};

// Ordre d'affichage du carrousel (gauche → droite). nithomas est centré au
// démarrage, avec throbert à sa gauche et abidaux à sa droite.
const TEAM: Member[] = [
  {
    login: 'throbert',
    roleKey: 'about.role.throbert',
    accent: 'gold',
    gitStats: true,
    blurb: {
      fr: (
        <>
          Celui qui a transformé l'idée en vrai projet. La{' '}
          <span className="text-text font-semibold">vision d'origine</span> : un{' '}
          <span className="text-text font-semibold">classement ELO 1v1</span> du campus, juste et
          vivant. Il <span className="text-gold font-semibold">développe des features</span>.{' '}
          Ensuite <span className="text-gold font-semibold">Adrien</span> les{' '}
          <span className="text-text font-semibold">peaufine pour la mise en prod</span>.
        </>
      ),
      en: (
        <>
          The one who turned the idea into a real project. The{' '}
          <span className="text-text font-semibold">original vision</span>: a fair, living{' '}
          <span className="text-text font-semibold">1v1 ELO ranking</span> of the campus. He{' '}
          <span className="text-gold font-semibold">builds features</span>.{' '}
          Then <span className="text-gold font-semibold">Adrien</span>{' '}
          <span className="text-text font-semibold">polishes them for production</span>.
        </>
      ),
      es: (
        <>
          El que convirtió la idea en un proyecto real. La{' '}
          <span className="text-text font-semibold">visión original</span>: una{' '}
          <span className="text-text font-semibold">clasificación ELO 1v1</span> del campus, justa y
          viva. Él <span className="text-gold font-semibold">desarrolla features</span>.{' '}
          Luego <span className="text-gold font-semibold">Adrien</span> las{' '}
          <span className="text-text font-semibold">pule para la puesta en producción</span>.
        </>
      ),
    },
  },
  {
    login: 'nithomas',
    roleKey: 'about.role.nithomas',
    accent: 'gold',
    blurb: {
      fr: (
        <>
          Tout est parti d'une <span className="text-text font-semibold">idée qu'il a lâchée</span> un
          jour, comme ça. Sans cette première étincelle, 42 League serait jamais sorti de terre.
        </>
      ),
      en: (
        <>
          It all started from an <span className="text-text font-semibold">idea he tossed out</span> one
          day, just like that. Without that first spark, 42 League would never have gotten off the ground.
        </>
      ),
      es: (
        <>
          Todo empezó con una <span className="text-text font-semibold">idea que soltó</span> un
          día, así sin más. Sin esa primera chispa, 42 League nunca habría salido adelante.
        </>
      ),
    },
  },
  {
    login: 'abidaux',
    roleKey: 'about.role.abidaux',
    accent: 'gold',
    gitStats: true,
    blurb: {
      fr: (
        <>
          Il a transformé l'<span className="text-text font-semibold">extension de campus</span> en
          vrai site web, puis l'a <span className="text-gold font-semibold">hébergé et déployé en ligne</span>.
          C'est lui notamment derrière les <span className="text-text font-semibold">designs et les animations</span>.
        </>
      ),
      en: (
        <>
          He turned the <span className="text-text font-semibold">campus extension</span> into a
          real website, then <span className="text-gold font-semibold">hosted and deployed it online</span>.
          He's notably behind the <span className="text-text font-semibold">designs and animations</span>.
        </>
      ),
      es: (
        <>
          Convirtió la <span className="text-text font-semibold">extensión de campus</span> en un
          sitio web real, y luego lo <span className="text-gold font-semibold">alojó y desplegó en línea</span>.
          Es él, en particular, quien está detrás de los <span className="text-text font-semibold">diseños y las animaciones</span>.
        </>
      ),
    },
  },
  {
    login: 'jagharra',
    roleKey: 'about.role.jagharra',
    accent: 'violet',
    blurb: {
      fr: (
        <>
          Son expertise en <span className="text-text font-semibold">cybersécurité</span> a blindé le
          projet : il audite les routes, traque les failles et{' '}
          <span className="text-[#c97bff] font-semibold">patch avant que ça devienne un problème</span>.
          Pas de vulnérabilité qui passe entre ses doigts.
        </>
      ),
      en: (
        <>
          His <span className="text-text font-semibold">cybersecurity</span> expertise hardened the
          project: he audits the routes, hunts for flaws and{' '}
          <span className="text-[#c97bff] font-semibold">patches before it becomes a problem</span>.
          No vulnerability slips through his fingers.
        </>
      ),
      es: (
        <>
          Su experiencia en <span className="text-text font-semibold">ciberseguridad</span> blindó el
          proyecto: audita las rutas, caza los fallos y{' '}
          <span className="text-[#c97bff] font-semibold">parchea antes de que se convierta en problema</span>.
          Ninguna vulnerabilidad se le escapa entre los dedos.
        </>
      ),
    },
  },
  {
    login: 'sbonneau',
    roleKey: 'about.role.sbonneau',
    accent: 'violet',
    blurb: {
      fr: (
        <>
          Le <span className="text-text font-semibold">poil à gratter</span> du projet : il{' '}
          <span className="text-[#c97bff] font-semibold">malmène l'app</span> dans tous les sens,
          déclenche les cas tordus et les abus auxquels personne n'avait pensé{' '}
          <span className="text-text font-semibold">avant que les joueurs ne tombent dessus</span>.
        </>
      ),
      en: (
        <>
          The project's <span className="text-text font-semibold">stress-tester</span>: he{' '}
          <span className="text-[#c97bff] font-semibold">hammers the app</span> every which way,
          triggering the edge cases and abuses nobody thought of{' '}
          <span className="text-text font-semibold">before players ever hit them</span>.
        </>
      ),
      es: (
        <>
          El <span className="text-text font-semibold">probador a destajo</span> del proyecto:{' '}
          <span className="text-[#c97bff] font-semibold">maltrata la app</span> de todas las formas,
          provocando los casos límite y los abusos en los que nadie pensó{' '}
          <span className="text-text font-semibold">antes de que los jugadores los encuentren</span>.
        </>
      ),
    },
  },
  {
    login: 'rbardet-',
    roleKey: 'about.role.rbardet',
    accent: 'red',
    blurb: {
      fr: (
        <>
          Son <span className="text-text font-semibold">expertise e-sport</span> et sa connaissance
          des sites de ranked ont beaucoup pesé : c'est lui qui a apporté l'
          <span className="text-text font-semibold">analyse UX/UI</span> pour rendre l'app nette et
          lisible.
        </>
      ),
      en: (
        <>
          His <span className="text-text font-semibold">e-sport expertise</span> and his knowledge
          of ranked sites weighed heavily: he's the one who brought the{' '}
          <span className="text-text font-semibold">UX/UI analysis</span> to make the app crisp and
          readable.
        </>
      ),
      es: (
        <>
          Su <span className="text-text font-semibold">experiencia en e-sport</span> y su conocimiento
          de los sitios de ranked pesaron mucho: es él quien aportó el{' '}
          <span className="text-text font-semibold">análisis UX/UI</span> para hacer la app nítida y
          legible.
        </>
      ),
    },
  },
];

// La page « À propos » est accessible avant connexion (parcours RGPD) — là, le
// contexte LeagueData n'existe pas. On ne lit les photos intra que connecté.
/**
 * Stats de contributions git par login, rafraîchies « naturellement » : au montage
 * puis toutes les 60 s (la valeur évolue au fil des commits — live en dev,
 * réinjectée à chaque déploiement en prod). Échec silencieux → pas de « ? ».
 */
function useContributorStats() {
  const [stats, setStats] = useState<Record<string, ContributorStat>>({});
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .contributorStats()
        .then(({ stats }) => {
          if (!cancelled) setStats(stats);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return stats;
}

function TeamSection() {
  const { authenticated } = useAuth();
  const stats = useContributorStats();
  return authenticated ? (
    <TeamSectionAuthed stats={stats} />
  ) : (
    <TeamCarousel photos={{}} stats={stats} />
  );
}

// La photo intra d'un membre est la même quel que soit le jeu, mais le
// `leaderboard` du contexte est *par mode* : un membre absent du classement du
// mode courant (ex. il n'a pas joué aux échecs) n'y figure pas, et sa photo
// disparaîtrait en changeant de mode. On récupère donc les photos directement
// par login (indépendant du mode), avec le leaderboard courant comme amorce.
function TeamSectionAuthed({ stats }: { stats: Record<string, ContributorStat> }) {
  const { leaderboard } = useLeagueData();
  const [fetched, setFetched] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    // Résolution par login via l'API 42 (cache serveur), y compris pour les membres
    // « crédits » qui ne sont pas des joueurs inscrits — sinon leur fiche 404ait et
    // la photo retombait sur l'initiale. Voir GET /team/photos.
    api
      .teamPhotos(TEAM.map((m) => m.login))
      .then(({ photos }) => {
        if (!cancelled) setFetched(photos);
      })
      .catch(() => {
        /* le leaderboard sert d'amorce ; à défaut, fallback initiale */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Amorce immédiate depuis le leaderboard courant (évite un flash), puis
  // complétée/écrasée par les photos récupérées par login.
  const photos: Record<string, string | null> = {};
  for (const u of leaderboard) photos[u.login] = u.imageUrl;
  for (const [login, url] of Object.entries(fetched)) {
    if (url) photos[login] = url;
  }
  return <TeamCarousel photos={photos} stats={stats} />;
}

function TeamCarousel({
  photos,
  stats,
}: {
  photos: Record<string, string | null>;
  stats: Record<string, ContributorStat>;
}) {
  const t = useT();
  // Ordre déclaré tel quel : nithomas centré au démarrage (throbert à gauche,
  // abidaux à droite).
  const members = TEAM;
  const startIndex = Math.max(0, members.findIndex((m) => m.login === 'nithomas'));
  const [active, setActive] = useState(startIndex);
  const touchX = useRef<number | null>(null);
  const wheelLock = useRef(false);

  const n = members.length;
  // Carrousel infini : on boucle modulo n (pas de butée aux extrémités).
  const go = (dir: number) => setActive((i) => (i + dir + n) % n);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };
  // Molette / trackpad : un cran = une carte, avec un petit verrou anti-rafale.
  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8 || wheelLock.current) return;
    wheelLock.current = true;
    go(d > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLock.current = false;
    }, 350);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('about.team.devs.title')} sub={t('about.team.devs.sub')}>
        <p className="text-sm text-muted leading-relaxed">
          {t('about.team.intro')}{' '}
          <span className="text-muted-2">{t('about.team.intro.hint')}</span>
        </p>
      </Panel>

      {/* Carrousel « coverflow » : carte centrale nette, voisines en retrait et floutées. */}
      <div
        className="relative h-[clamp(540px,76vh,780px)] select-none touch-pan-y overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {members.map((m, i) => {
          // Décalage circulaire : une carte « au bout » réapparaît de l'autre
          // côté (effet coverflow infini).
          let offset = i - active;
          if (offset > n / 2) offset -= n;
          else if (offset < -n / 2) offset += n;
          const abs = Math.abs(offset);
          const hidden = abs > 2;
          return (
            <div
              key={m.login}
              className="absolute top-1/2 left-1/2 transition-all duration-300 ease-out will-change-transform"
              style={{
                transform: `translate(-50%, -50%) translateX(${offset * 58}%) scale(${
                  offset === 0 ? 1 : 0.82
                })`,
                filter: offset === 0 ? 'none' : 'blur(2px)',
                opacity: hidden ? 0 : offset === 0 ? 1 : abs === 1 ? 0.55 : 0.25,
                zIndex: 10 - abs,
                pointerEvents: hidden ? 'none' : 'auto',
              }}
              onClick={() => offset !== 0 && setActive(i)}
              aria-hidden={offset !== 0}
            >
              <MemberCard
                member={m}
                imageUrl={photos[m.login] ?? null}
                active={offset === 0}
                stat={stats[m.login]}
              />
            </div>
          );
        })}

        {/* Flèches de navigation */}
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t('about.team.prev')}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-20 grid place-items-center w-9 h-9 rounded-full bg-bg-2/80 border border-border/60 text-text hover:text-gold hover:border-gold/40 transition-all"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('about.team.next')}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 grid place-items-center w-9 h-9 rounded-full bg-bg-2/80 border border-border/60 text-text hover:text-gold hover:border-gold/40 transition-all"
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Pagination par points */}
      <div className="flex justify-center gap-2">
        {members.map((m, i) => (
          <button
            key={m.login}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`${t('about.team.goto')} ${m.login}`}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? 'w-6 bg-gold' : 'w-1.5 bg-border hover:bg-muted-2'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Styles d'accent par membre (bordure de carte + pastille de rôle).
const ACCENT: Record<Member['accent'], { border: string; badge: string }> = {
  gold: { border: 'border-gold/50', badge: 'text-gold border-gold/40 bg-gold/15' },
  red: { border: 'border-red/40', badge: 'text-red border-red/40 bg-red/15' },
  violet: {
    border: 'border-[#c97bff]/55',
    badge: 'text-[#c97bff] border-[#c97bff]/40 bg-[#c97bff]/15',
  },
};

function MemberCard({
  member,
  imageUrl,
  active,
  stat,
}: {
  member: Member;
  imageUrl: string | null;
  active: boolean;
  stat?: ContributorStat;
}) {
  const { lang } = useI18n();
  const t = useT();
  const accent = ACCENT[member.accent];
  const [broken, setBroken] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const showImg = imageUrl && !broken;
  // « ? » des stats git : seulement si la carte le demande ET qu'on a des chiffres.
  const hasStats = member.gitStats && stat && stat.added + stat.deleted > 0;
  return (
    <div
      className={`relative w-[300px] sm:w-[370px] h-[480px] sm:h-[620px] rounded-2xl overflow-hidden border-2 bg-bg-2 transition-shadow duration-300 ${
        accent.border
      } ${active ? 'shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)]' : 'shadow-lg'}`}
    >
      {/* Image intra plein cadre (ou initiale en repli) */}
      {showImg ? (
        <img
          src={imageUrl}
          alt={member.login}
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center font-display text-7xl font-bold text-white/90"
          style={{ background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' }}
        >
          {(member.login[0] ?? '?').toUpperCase()}
        </div>
      )}

      {/* Dégradé bas pour lisibilité du texte */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(8,11,18,0.97) 0%, rgba(8,11,18,0.82) 30%, rgba(8,11,18,0.25) 52%, transparent 68%)',
        }}
      />

      {/* Couronne du founder */}
      {member.crown && (
        <Crown
          className="absolute top-3 right-3 w-6 h-6 text-gold drop-shadow-[0_2px_6px_rgba(255,201,74,0.7)] z-10"
          fill="currentColor"
          strokeWidth={2}
        />
      )}

      {/* Pastille GitHub des stats de contributions git (lignes ajout/suppr/net),
          en haut à droite — seulement sur la carte active et si on a des chiffres.
          Le récap apparaît au survol (desktop) ou au tap (tactile, via showStats). */}
      {hasStats && active && (
        <div className="absolute top-3 right-3 z-20 group/git">
          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            aria-label={t('about.stats.aria')}
            className={`grid place-items-center w-7 h-7 rounded-full border backdrop-blur-sm transition-colors group-hover/git:border-gold/60 group-hover/git:text-gold ${
              showStats
                ? 'border-gold/70 bg-gold/25 text-gold'
                : 'border-white/30 bg-black/40 text-white/85'
            }`}
          >
            <Github className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <div
            className={`absolute right-0 mt-2 w-44 rounded-xl border border-gold/25 bg-bg-2/95 backdrop-blur-md p-3 shadow-xl transition-opacity duration-100 group-hover/git:opacity-100 group-hover/git:pointer-events-auto ${
              showStats ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Github className="w-3 h-3 text-gold/85" strokeWidth={2.4} />
              <span className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-gold/85">
                {t('about.stats.title')}
              </span>
              <span className="ml-auto text-[10px] font-mono font-bold text-muted-2">@{member.login}</span>
            </div>
            <div className="space-y-1 text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-muted-2">{t('about.stats.added')}</span>
                <span className="font-bold text-emerald-300">+{stat!.added.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-2">{t('about.stats.deleted')}</span>
                <span className="font-bold text-red">−{stat!.deleted.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-1 mt-1">
                <span className="text-muted-2">{t('about.stats.net')}</span>
                <span className="font-extrabold text-gold">{stat!.net.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contenu texte en bas */}
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="font-gaming text-xl sm:text-2xl font-extrabold text-white tracking-wide">
          {member.login}
        </div>
        <div
          className={`inline-block mt-2 text-[11px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-md border ${accent.badge}`}
        >
          {t(member.roleKey)}
        </div>
        <p className="mt-3 text-sm text-white/85 leading-relaxed">{member.blurb[lang]}</p>
      </div>
    </div>
  );
}
