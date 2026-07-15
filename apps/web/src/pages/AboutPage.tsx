import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BookOpen, Shield, Terminal, Users, Crown, Github, Megaphone, Sparkles, Wrench } from 'lucide-react';
import { Panel } from '../components/Panel';
import { api, type ContributorStat, type AnnouncementData } from '../lib/api';
import { announcementKindMeta } from '../lib/announcements';
import { useT, useI18n } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

// Contenus longs (règles, confidentialité, technique, blurbs équipe) traduits en
// fr/en/es/ja/ar/pt : toutes les langues de l'UI sont prises en charge.
type UiLang = Lang;
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
    version: 'V1.3',
    date: '6 juillet 2026',
    changes: [
      {
        kind: 'feature',
        text: "Deux nouvelles disciplines : Coding (CodinGame, Clash of Code, LeetCode duels…) et Pokémon (tout duel accepté, ex. Pokémon Showdown). Résultat simple gagné/perdu, classement et passe comme les autres modes.",
      },
      {
        kind: 'feature',
        text: "Coding : possibilité de coller un lien d'invitation vers ta room au moment du défi.",
      },
      {
        kind: 'feature',
        text: "Nouveau cosmétique : les ornements de photo de profil (cadres façon Discord), statiques ou animés au survol.",
      },
      {
        kind: 'fix',
        text: "Lisibilité : police allégée sur le bouton « Match aléatoire » et bannière de saison agrandie.",
      },
    ],
  },
  {
    version: 'V1.2',
    date: '6 juillet 2026',
    changes: [
      {
        kind: 'feature',
        text: "Saison Piscine 2026 : nouvel habillage (palmiers, splash de bienvenue) et refonte des grades — paliers resserrés (étain → diamant) et fins de saison revues.",
      },
      {
        kind: 'feature',
        text: "Passe de combat : les paliers cosmétiques affichent désormais de vrais items de la boutique.",
      },
      {
        kind: 'feature',
        text: "Propose tes propres cosmétiques (bannière ou titre) pour la boutique : les admins les relisent et les ajoutent.",
      },
      {
        kind: 'feature',
        text: "Changer d'émote de victoire joue son animation en aperçu. Profil épuré : courbe d'ELO remontée juste après ta carte, paris retirés.",
      },
      {
        kind: 'feature',
        text: "Accueil : activité récente avec photos et jeu affichés, boutons plus punchy. Retrait de « Je suis chaud » et de la présence cluster.",
      },
    ],
  },
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
      <div className="flex flex-col gap-6 max-h-[62vh] overflow-y-auto custom-scrollbar pe-1 -me-1 overscroll-contain">
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
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
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
                  <span className="ms-auto text-[11px] font-mono text-muted-2 shrink-0">
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
  coding: {
    label: 'coding (1 contre 1)',
    terrain: {
      intro: (
        <>Tout jeu de code accepté (CodinGame, Clash of Code, LeetCode duels…).</>
      ),
      bullets: [
        <>Résultat <span className="text-gold font-semibold">binaire</span> : gagné ou perdu, sans score chiffré ni nul.</>,
        <>Le <span className="text-text font-semibold">site de code est libre</span> — l'ELO est identique quel que soit le support.</>,
        <>Aucune sélection de personnage : on déclare simplement le <span className="text-text font-semibold">vainqueur</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League classe le <span className="text-text font-semibold">coding</span> en 1 contre 1. Chaque membre peut défier n'importe quel autre.</>
      ),
      bullets: [
        <>Déclarer = choisir <span className="text-gold font-semibold">« j'ai gagné »</span> ou « j'ai perdu ».</>,
        <>Un <span className="text-text font-semibold">lien d'invitation optionnel</span> peut être joint au défi (room du site de code).</>,
        <>L'<span className="text-text font-semibold">ELO est propre à la discipline</span>, distinct des autres jeux.</>,
      ],
    },
  },
  pokemon: {
    label: 'pokémon (1 contre 1)',
    terrain: {
      intro: (
        <>Tout duel Pokémon accepté (ex. Pokémon Showdown, cartouches, cartes…).</>
      ),
      bullets: [
        <>Résultat <span className="text-gold font-semibold">binaire</span> : gagné ou perdu, sans score chiffré ni nul.</>,
        <>Tous les <span className="text-text font-semibold">supports sont acceptés</span> — l'ELO est identique quel que soit le format.</>,
        <>Aucune sélection de personnage : on déclare simplement le <span className="text-text font-semibold">vainqueur</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League classe le <span className="text-text font-semibold">pokémon</span> en 1 contre 1. Chaque membre peut défier n'importe quel autre.</>
      ),
      bullets: [
        <>Déclarer = choisir <span className="text-gold font-semibold">« j'ai gagné »</span> ou « j'ai perdu ».</>,
        <>L'<span className="text-text font-semibold">ELO est propre à la discipline</span>, distinct des autres jeux.</>,
        <>Pas de <span className="text-text font-semibold">détail de match</span> : seul le résultat compte.</>,
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
  coding: {
    label: 'coding (1 vs 1)',
    terrain: {
      intro: (
        <>Any coding game accepted (CodinGame, Clash of Code, LeetCode duels…).</>
      ),
      bullets: [
        <><span className="text-gold font-semibold">Binary</span> result: win or loss, no numeric score, no draw.</>,
        <>The <span className="text-text font-semibold">coding site is free</span> — ELO is the same whatever the platform.</>,
        <>No character selection: you simply declare the <span className="text-text font-semibold">winner</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League ranks <span className="text-text font-semibold">coding</span> as 1 vs 1. Any member can challenge any other.</>
      ),
      bullets: [
        <>Declaring = pick <span className="text-gold font-semibold">“I won”</span> or “I lost”.</>,
        <>An <span className="text-text font-semibold">optional invite link</span> can be attached to a challenge (the code room).</>,
        <><span className="text-text font-semibold">ELO is per-discipline</span>, separate from other games.</>,
      ],
    },
  },
  pokemon: {
    label: 'pokémon (1 vs 1)',
    terrain: {
      intro: (
        <>Any Pokémon duel accepted (e.g. Pokémon Showdown, cartridges, cards…).</>
      ),
      bullets: [
        <><span className="text-gold font-semibold">Binary</span> result: win or loss, no numeric score, no draw.</>,
        <>All <span className="text-text font-semibold">formats accepted</span> — ELO is the same whatever the medium.</>,
        <>No character selection: you simply declare the <span className="text-text font-semibold">winner</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League ranks <span className="text-text font-semibold">pokémon</span> as 1 vs 1. Any member can challenge any other.</>
      ),
      bullets: [
        <>Declaring = pick <span className="text-gold font-semibold">“I won”</span> or “I lost”.</>,
        <><span className="text-text font-semibold">ELO is per-discipline</span>, separate from other games.</>,
        <>No <span className="text-text font-semibold">match details</span>: only the result matters.</>,
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
  coding: {
    label: 'coding (1 contra 1)',
    terrain: {
      intro: (
        <>Cualquier juego de código válido (CodinGame, Clash of Code, duelos LeetCode…).</>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binario</span>: victoria o derrota, sin marcador ni empate.</>,
        <>El <span className="text-text font-semibold">sitio de código es libre</span> — el ELO es el mismo sea cual sea la plataforma.</>,
        <>Sin selección de personaje: solo declaras al <span className="text-text font-semibold">ganador</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League clasifica el <span className="text-text font-semibold">coding</span> en 1 contra 1. Cualquier miembro puede desafiar a otro.</>
      ),
      bullets: [
        <>Declarar = elegir <span className="text-gold font-semibold">«gané»</span> o «perdí».</>,
        <>Se puede adjuntar un <span className="text-text font-semibold">enlace de invitación opcional</span> al desafío (sala de código).</>,
        <>El <span className="text-text font-semibold">ELO es propio de la disciplina</span>, distinto de los otros juegos.</>,
      ],
    },
  },
  pokemon: {
    label: 'pokémon (1 contra 1)',
    terrain: {
      intro: (
        <>Cualquier duelo Pokémon válido (p. ej. Pokémon Showdown, cartuchos, cartas…).</>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binario</span>: victoria o derrota, sin marcador ni empate.</>,
        <>Todos los <span className="text-text font-semibold">formatos válidos</span> — el ELO es el mismo sea cual sea el medio.</>,
        <>Sin selección de personaje: solo declaras al <span className="text-text font-semibold">ganador</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League clasifica el <span className="text-text font-semibold">pokémon</span> en 1 contra 1. Cualquier miembro puede desafiar a otro.</>
      ),
      bullets: [
        <>Declarar = elegir <span className="text-gold font-semibold">«gané»</span> o «perdí».</>,
        <>El <span className="text-text font-semibold">ELO es propio de la disciplina</span>, distinto de los otros juegos.</>,
        <>Sin <span className="text-text font-semibold">detalles del partido</span>: solo cuenta el resultado.</>,
      ],
    },
  },
};

const RULES_JA: Record<Game, GameRules> = {
  babyfoot: {
    label: 'テーブルサッカー 1対1',
    terrain: {
      intro: (
        <>
          ゴールが有効になり、試合がクリーンに競われるためのプレイ上の取り決めです：
        </>
      ),
      bullets: [
        <>
          エンゲージ（<span className="text-text font-semibold">キックオフ</span>）の後、ゴールがカウントされるには、ボールを
          <span className="text-gold font-semibold">少なくとも2回タッチ</span>する必要があります。
        </>,
        <>
          <span className="text-text font-semibold">失点したばかり</span>のプレイヤーは、リスタートのために
          <span className="text-gold font-semibold">自分のミッドフィールドバー</span>（ハーフ）からボールを出す権利があります。
        </>,
        <>
          <span className="text-gold font-semibold">ミッドフィールドバーから決めたゴール</span>（ハーフ）は
          有効です。
        </>,
        <>
          <span className="text-gold font-semibold">ガメル</span>（ゴールから跳ね返って出てきたボール）の場合、
          <span className="text-text font-semibold">自分が1点取る</span>か、
          <span className="text-text font-semibold">相手から1点減らす</span>かを選べます — ただし
          <span className="text-text font-semibold">ガメルで試合を締めくくることはできません</span>。
        </>,
        <>
          <span className="text-gold font-semibold">ルーレット</span>（回転）は
          <span className="text-text font-semibold">コントロールされている</span>必要があります（制御不能な高速回転は禁止です）。
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League は<span className="text-text font-semibold">テーブルサッカー 1対1</span>の ELO ランキングです。
          登録した各プレイヤーは、自分のリーグの他のメンバー全員にチャレンジできます。
        </>
      ),
      bullets: [
        <><span className="text-gold font-semibold">10ゴール</span>制の試合 — 先に10点に到達した方が勝ちます。</>,
        <>試合は<span className="text-text font-semibold">実際にプレイされた後</span>にのみ申告できます。</>,
        <>両プレイヤーがそれぞれ独立してスコアを申告します。食い違いがある場合、試合は無効になります。</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1対1',
    terrain: {
      intro: (
        <>
          勝利が明確になり、試合が公平になるためのセットの取り決めです：
        </>
      ),
      bullets: [
        <>
          各試合は<span className="text-gold font-semibold">ストック（残機）</span>制で行われ — 相手のストックをすべて
          奪ったプレイヤーがそのラウンドを制します。
        </>,
        <>
          各ラウンドの前に<span className="text-gold font-semibold">キャラクター</span>を選択します。ラウンドを
          落とした後、敗者は<span className="text-text font-semibold">キャラクターを変更</span>できます。
        </>,
        <>
          セットは状況（公式戦、トーナメント）に応じて<span className="text-gold font-semibold">3本先取（Bo3）</span>または{' '}
          <span className="text-gold font-semibold">5本先取（Bo5）</span>で争われます。
        </>,
        <>
          <span className="text-text font-semibold">アイテム</span>や議論の分かれるステージは、両プレイヤーが明示的に
          合意しない限り、デフォルトでオフです。
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League はここで<span className="text-text font-semibold">Super Smash Bros. 1対1</span>をストック制で
          ランク付けします。登録した各プレイヤーは、自分のリーグの他のメンバー全員にチャレンジできます。
        </>
      ),
      bullets: [
        <><span className="text-gold font-semibold">3本先取または5本先取</span>のセット（Bo3 / Bo5）。</>,
        <>勝者は<span className="text-text font-semibold">ラウンドの過半数</span>を取った方です。</>,
        <><span className="text-text font-semibold">ELO は競技ごと</span>です。あなたの Smash のレートはテーブルサッカーとは別物です。</>,
        <>両プレイヤーがそれぞれ独立して結果を申告します。食い違いがある場合、試合は無効になります。</>,
      ],
    },
  },
  chess: {
    label: 'チェス 1対1',
    terrain: {
      intro: (
        <>
          結果が議論の余地なく確定するための対局の取り決めです：
        </>
      ),
      bullets: [
        <>
          チェスの古典的なルール（触れた駒は動かす）に基づく<span className="text-gold font-semibold">1対1</span>の対局です。
        </>,
        <>
          結果は<span className="text-gold font-semibold">二者択一</span>です：勝ちか負け。引き分けは
          プレイヤーの合意に応じて指し直すか決着をつけます。
        </>,
        <>
          勝利は<span className="text-text font-semibold">チェックメイト</span>、または相手の
          <span className="text-text font-semibold">投了</span>によって確定します。
        </>,
        <>
          <span className="text-text font-semibold">持ち時間</span>（時計）を使う場合、時間切れは負けとなります。
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League はここで<span className="text-text font-semibold">チェス 1対1</span>をランク付けします。登録した各
          プレイヤーは、自分のリーグの他のメンバー全員にチャレンジできます。
        </>
      ),
      bullets: [
        <>結果は<span className="text-gold font-semibold">二者択一</span> — 勝ちか負けで、数値スコアはありません。</>,
        <>試合は<span className="text-text font-semibold">実際にプレイされた後</span>にのみ申告できます。</>,
        <><span className="text-text font-semibold">ELO はチェス専用</span>で、他の競技とは別です。</>,
        <>両プレイヤーがそれぞれ独立して結果を申告します。食い違いがある場合、試合は無効になります。</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1対1',
    terrain: {
      intro: (
        <>
          勝利が明確になり、試合が公平になるためのセットの取り決めです：
        </>
      ),
      bullets: [
        <>
          各試合は<span className="text-gold font-semibold">ラウンド</span>制で行われ — ラウンドの過半数を取った
          プレイヤーがそのゲームを制します。
        </>,
        <>
          各ラウンドの前に<span className="text-gold font-semibold">キャラクター</span>を選択します。ラウンドを
          落とした後、敗者は<span className="text-text font-semibold">キャラクターを変更</span>できます。
        </>,
        <>
          セットは状況（公式戦、トーナメント）に応じて<span className="text-gold font-semibold">3本先取（Bo3）</span>または{' '}
          <span className="text-gold font-semibold">5本先取（Bo5）</span>で争われます。
        </>,
        <>
          <span className="text-text font-semibold">標準設定</span>：タイマーと体力はデフォルト、改造や特殊なアシストは
          なし — 公平で分かりやすいセットにします。
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League はここで<span className="text-text font-semibold">Street Fighter 1対1</span>をランク付けします。
          登録した各プレイヤーは、自分のリーグの他のメンバー全員にチャレンジできます。
        </>
      ),
      bullets: [
        <><span className="text-gold font-semibold">3本先取または5本先取</span>のセット（Bo3 / Bo5）。</>,
        <>勝者は<span className="text-text font-semibold">ラウンドの過半数</span>を取った方です。</>,
        <><span className="text-text font-semibold">ELO は競技ごと</span>です。あなたの Street Fighter のレートは他のゲームとは別物です。</>,
        <>両プレイヤーがそれぞれ独立して結果を申告します。食い違いがある場合、試合は無効になります。</>,
      ],
    },
  },
  flechettes: {
    label: 'ダーツ（301 / 501）',
    terrain: {
      intro: (
        <>
          カウントが明確になり、結果が議論の余地なく確定するためのラウンドの取り決めです：
        </>
      ),
      bullets: [
        <>
          <span className="text-gold font-semibold">301または501</span>のラウンド：各プレイヤーは自分の
          スタートスコアから始め、得点するごとに<span className="text-text font-semibold">数を減らして</span>いきます。
        </>,
        <>
          最初に<span className="text-gold font-semibold">ちょうど0</span>に到達した人がそのラウンドを制します。
        </>,
        <>
          <span className="text-gold font-semibold">2〜8人</span>のプレイヤーが同じラウンドを戦えて、
          それぞれが<span className="text-text font-semibold">自分の残り点</span>を持ちます。
        </>,
        <>
          <span className="text-text font-semibold">キャラクター</span>もチームもなし — これは
          <span className="text-text font-semibold">個人</span>戦です。
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League はここで<span className="text-text font-semibold">ダーツ（301 / 501）</span>をランク付けします。
          登録した各プレイヤーは、自分のリーグの他のメンバー全員にチャレンジできます。
        </>
      ),
      bullets: [
        <><span className="text-gold font-semibold">2〜8人</span>のラウンド、<span className="text-text font-semibold">301または501</span>形式。</>,
        <>
          申告者は各プレイヤーの終了時の<span className="text-gold font-semibold">残り点</span>を入力します
          （<span className="text-text font-semibold">勝者 = 0</span>）。ランキングは残り点から導かれます：
          0 = 1位、以降は残り点の小さい順です。
        </>,
        <>
          他の各プレイヤーは<span className="text-text font-semibold">自分の残り点を確認</span>します。{' '}
          <span className="text-text font-semibold">異議があればラウンドは無効</span>になります。
        </>,
        <>
          <span className="text-text font-semibold">ELO は競技ごと</span>です。あなたのダーツのレートは他のゲームとは別物です。
          ダーツのトーナメントや2対2はありません。
        </>,
      ],
    },
  },
  coding: {
    label: 'コーディング（1対1）',
    terrain: {
      intro: (
        <>コーディング系のゲームなら何でも可（CodinGame、Clash of Code、LeetCode の対戦など）。</>
      ),
      bullets: [
        <>結果は<span className="text-gold font-semibold">二者択一</span>：勝ちか負けで、数値スコアも引き分けもありません。</>,
        <><span className="text-text font-semibold">コーディングのサイトは自由</span>です — どのプラットフォームでも ELO は同じです。</>,
        <>キャラクター選択はなし：単に<span className="text-text font-semibold">勝者</span>を申告するだけです。</>,
      ],
    },
    format: {
      intro: (
        <>42 League は<span className="text-text font-semibold">コーディング</span>を1対1でランク付けします。各メンバーは他の誰にでもチャレンジできます。</>
      ),
      bullets: [
        <>申告 = <span className="text-gold font-semibold">「勝った」</span>か「負けた」を選ぶこと。</>,
        <>チャレンジに<span className="text-text font-semibold">任意の招待リンク</span>を添付できます（コーディングサイトのルーム）。</>,
        <><span className="text-text font-semibold">ELO は競技ごと</span>で、他のゲームとは別です。</>,
      ],
    },
  },
  pokemon: {
    label: 'ポケモン（1対1）',
    terrain: {
      intro: (
        <>ポケモンの対戦なら何でも可（例：Pokémon Showdown、カートリッジ、カードなど）。</>
      ),
      bullets: [
        <>結果は<span className="text-gold font-semibold">二者択一</span>：勝ちか負けで、数値スコアも引き分けもありません。</>,
        <><span className="text-text font-semibold">すべての形式が可</span> — どの媒体でも ELO は同じです。</>,
        <>キャラクター選択はなし：単に<span className="text-text font-semibold">勝者</span>を申告するだけです。</>,
      ],
    },
    format: {
      intro: (
        <>42 League は<span className="text-text font-semibold">ポケモン</span>を1対1でランク付けします。各メンバーは他の誰にでもチャレンジできます。</>
      ),
      bullets: [
        <>申告 = <span className="text-gold font-semibold">「勝った」</span>か「負けた」を選ぶこと。</>,
        <><span className="text-text font-semibold">ELO は競技ごと</span>で、他のゲームとは別です。</>,
        <><span className="text-text font-semibold">試合の詳細</span>はなし：結果だけが重要です。</>,
      ],
    },
  },
};

const RULES_AR: Record<Game, GameRules> = {
  babyfoot: {
    label: 'بيبي فوت 1 ضد 1',
    terrain: {
      intro: (
        <>
          اتفاقيات اللعب حتى يكون الهدف صحيحًا وتبقى المباريات تُلعب بنزاهة:
        </>
      ),
      bullets: [
        <>
          بعد الافتتاح (<span className="text-text font-semibold">كيك أوف</span>)، يجب أن تُلمس الكرة
          <span className="text-gold font-semibold"> مرتين على الأقل</span> قبل أن يُحتسب الهدف.
        </>,
        <>
          يحق للاعب <span className="text-text font-semibold">الذي تلقى هدفًا للتو</span> أن يعيد الكرة
          <span className="text-gold font-semibold"> من قضيب خط الوسط الخاص به</span> (خط الوسط) لاستئناف اللعب.
        </>,
        <>
          <span className="text-gold font-semibold">الأهداف المسجَّلة من قضيب خط الوسط</span> (خط الوسط)
          صحيحة.
        </>,
        <>
          <span className="text-gold font-semibold">الغاميل</span> (الكرة التي ترتد خارجةً من المرمى): يمكنك إما
          <span className="text-text font-semibold">أخذ النقطة</span> أو
          <span className="text-text font-semibold"> خصم نقطة من الخصم</span> — لكن لا يمكن
          <span className="text-text font-semibold"> إنهاء المباراة على غاميل</span>.
        </>,
        <>
          <span className="text-gold font-semibold">اللفّات</span> يجب أن تكون
          <span className="text-text font-semibold"> مضبوطة</span> (بدون تدوير عشوائي غير منضبط).
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League تصنيف ELO لـ<span className="text-text font-semibold">بيبي فوت 1 ضد 1</span>.
          يمكن لكل لاعب مسجَّل أن يتحدى أي عضو آخر في دوريه.
        </>
      ),
      bullets: [
        <>مباراة حتى <span className="text-gold font-semibold">10 أهداف</span> — أول من يصل إلى 10 يفوز.</>,
        <>لا يمكن الإبلاغ عن المباراة إلا <span className="text-text font-semibold">بعد أن تُلعب</span>.</>,
        <>يبلّغ اللاعبان عن نتيجتهما بشكل مستقل. في حال الاختلاف، تُلغى المباراة.</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1 ضد 1',
    terrain: {
      intro: (
        <>
          اتفاقيات المجموعة حتى يكون الفوز واضحًا والمباريات عادلة:
        </>
      ),
      bullets: [
        <>
          تُلعب كل مباراة بـ<span className="text-gold font-semibold">أرصدة (أرواح)</span> — اللاعب الذي
          يستنفد كل أرصدة خصمه يفوز بالجولة.
        </>,
        <>
          اختيار <span className="text-gold font-semibold">الشخصية</span> قبل كل جولة؛ بعد خسارة جولة،
          يمكن للخاسر <span className="text-text font-semibold">تغيير الشخصية</span>.
        </>,
        <>
          تُلعب المجموعات بنظام <span className="text-gold font-semibold">أفضل من 3 (Bo3)</span> أو{' '}
          <span className="text-gold font-semibold">أفضل من 5 (Bo5)</span> حسب السياق (رسمي، بطولة).
        </>,
        <>
          تكون <span className="text-text font-semibold">العناصر</span> والمراحل المتنازع عليها معطّلة
          افتراضيًا، ما لم يتفق اللاعبان صراحةً على خلاف ذلك.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League تصنّف هنا <span className="text-text font-semibold">Super Smash Bros. 1 ضد 1</span> بالأرصدة.
          يمكن لكل لاعب مسجَّل أن يتحدى أي عضو آخر في دوريه.
        </>
      ),
      bullets: [
        <>مجموعة بنظام <span className="text-gold font-semibold">أفضل من 3 أو أفضل من 5</span> جولات (Bo3 / Bo5).</>,
        <>الفائز هو من يحصد <span className="text-text font-semibold">أغلبية الجولات</span>.</>,
        <><span className="text-text font-semibold">ELO خاص بكل تخصص</span>: تصنيفك في Smash منفصل عن بيبي فوت.</>,
        <>يبلّغ اللاعبان عن نتيجتهما بشكل مستقل. في حال الاختلاف، تُلغى المباراة.</>,
      ],
    },
  },
  chess: {
    label: 'الشطرنج 1 ضد 1',
    terrain: {
      intro: (
        <>
          اتفاقيات المباراة حتى تكون النتيجة لا تقبل الجدل:
        </>
      ),
      bullets: [
        <>
          مباراة <span className="text-gold font-semibold">1 ضد 1</span> بقواعد الشطرنج الكلاسيكية
          (القطعة الملموسة تُلعب).
        </>,
        <>
          النتيجة <span className="text-gold font-semibold">ثنائية</span>: فوز أو خسارة. التعادل
          يُعاد أو يُحسم حسب اتفاق اللاعبين.
        </>,
        <>
          يتحقق الفوز بـ<span className="text-text font-semibold">كش ملك</span> أو بـ
          <span className="text-text font-semibold">استسلام</span> الخصم.
        </>,
        <>
          إذا استُخدم <span className="text-text font-semibold">توقيت</span> (ساعة)، فإن سقوط الراية
          يُحتسب خسارة.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League تصنّف هنا <span className="text-text font-semibold">الشطرنج 1 ضد 1</span>. يمكن لكل
          لاعب مسجَّل أن يتحدى أي عضو آخر في دوريه.
        </>
      ),
      bullets: [
        <>نتيجة <span className="text-gold font-semibold">ثنائية</span> — فوز أو خسارة، بلا نتيجة رقمية.</>,
        <>لا يمكن الإبلاغ عن المباراة إلا <span className="text-text font-semibold">بعد أن تُلعب</span>.</>,
        <><span className="text-text font-semibold">ELO مخصص للشطرنج</span>، منفصل عن التخصصات الأخرى.</>,
        <>يبلّغ اللاعبان عن نتيجتهما بشكل مستقل. في حال الاختلاف، تُلغى المباراة.</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1 ضد 1',
    terrain: {
      intro: (
        <>
          اتفاقيات المجموعة حتى يكون الفوز واضحًا والمباريات عادلة:
        </>
      ),
      bullets: [
        <>
          تُلعب كل مباراة بـ<span className="text-gold font-semibold">أشواط</span> — اللاعب الذي يفوز
          بأغلبية الأشواط يحصد الجولة.
        </>,
        <>
          اختيار <span className="text-gold font-semibold">الشخصية</span> قبل كل جولة؛ بعد خسارة جولة،
          يمكن للخاسر <span className="text-text font-semibold">تغيير الشخصية</span>.
        </>,
        <>
          تُلعب المجموعات بنظام <span className="text-gold font-semibold">أفضل من 3 (Bo3)</span> أو{' '}
          <span className="text-gold font-semibold">أفضل من 5 (Bo5)</span> حسب السياق (رسمي، بطولة).
        </>,
        <>
          <span className="text-text font-semibold">إعدادات قياسية</span>: المؤقّت والصحة الافتراضيان،
          بلا معدّلات أو مساعدات غريبة — مجموعة عادلة وواضحة.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League تصنّف هنا <span className="text-text font-semibold">Street Fighter 1 ضد 1</span>.
          يمكن لكل لاعب مسجَّل أن يتحدى أي عضو آخر في دوريه.
        </>
      ),
      bullets: [
        <>مجموعة بنظام <span className="text-gold font-semibold">أفضل من 3 أو أفضل من 5</span> جولات (Bo3 / Bo5).</>,
        <>الفائز هو من يحصد <span className="text-text font-semibold">أغلبية الجولات</span>.</>,
        <><span className="text-text font-semibold">ELO خاص بكل تخصص</span>: تصنيفك في Street Fighter منفصل عن الألعاب الأخرى.</>,
        <>يبلّغ اللاعبان عن نتيجتهما بشكل مستقل. في حال الاختلاف، تُلغى المباراة.</>,
      ],
    },
  },
  flechettes: {
    label: 'الدارتس (301 / 501)',
    terrain: {
      intro: (
        <>
          اتفاقيات الجولة حتى يكون العدّ واضحًا والنتيجة لا تقبل الجدل:
        </>
      ),
      bullets: [
        <>
          جولة بنظام <span className="text-gold font-semibold">301 أو 501</span>: يبدأ كل لاعب من نتيجته
          الأولية و<span className="text-text font-semibold">ينزل</span> كلما سجّل.
        </>,
        <>
          أول من يصل إلى <span className="text-gold font-semibold">صفر بالضبط</span> يفوز بالجولة.
        </>,
        <>
          يمكن أن يلعب <span className="text-gold font-semibold">من 2 إلى 8 لاعبين</span> الجولة نفسها، لكل
          منهم <span className="text-text font-semibold">رصيده المتبقي الخاص</span>.
        </>,
        <>
          بلا <span className="text-text font-semibold">شخصيات</span> ولا فرق — إنها مواجهة
          <span className="text-text font-semibold"> فردية</span>.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League تصنّف هنا <span className="text-text font-semibold">الدارتس (301 / 501)</span>.
          يمكن لكل لاعب مسجَّل أن يتحدى أي عضو آخر في دوريه.
        </>
      ),
      bullets: [
        <>جولة من <span className="text-gold font-semibold">2 إلى 8 لاعبين</span>، بنظام <span className="text-text font-semibold">301 أو 501</span>.</>,
        <>
          يُدخل المبلِّغ لكل لاعب <span className="text-gold font-semibold">نقاطه المتبقية</span> في النهاية
          (<span className="text-text font-semibold">الفائز = 0</span>). يُستنتج الترتيب من المتبقي:
          0 = الأول، ثم من الأصغر متبقيًا إلى الأكبر.
        </>,
        <>
          يؤكّد كل لاعب آخر <span className="text-text font-semibold">متبقيه الخاص</span>؛ و{' '}
          <span className="text-text font-semibold">أي اعتراض يُلغي الجولة</span>.
        </>,
        <>
          <span className="text-text font-semibold">ELO خاص بكل تخصص</span>: تصنيفك في الدارتس منفصل عن الألعاب الأخرى.
          لا بطولة دارتس ولا 2 ضد 2.
        </>,
      ],
    },
  },
  coding: {
    label: 'البرمجة (1 ضد 1)',
    terrain: {
      intro: (
        <>أي لعبة برمجة مقبولة (CodinGame، Clash of Code، مبارزات LeetCode…).</>
      ),
      bullets: [
        <>نتيجة <span className="text-gold font-semibold">ثنائية</span>: فوز أو خسارة، بلا نتيجة رقمية ولا تعادل.</>,
        <><span className="text-text font-semibold">موقع البرمجة حرّ</span> — الـ ELO نفسه مهما كانت المنصة.</>,
        <>بلا اختيار شخصية: تعلن ببساطة عن <span className="text-text font-semibold">الفائز</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League تصنّف <span className="text-text font-semibold">البرمجة</span> بنظام 1 ضد 1. يمكن لأي عضو أن يتحدى أي عضو آخر.</>
      ),
      bullets: [
        <>الإبلاغ = اختيار <span className="text-gold font-semibold">«فُزت»</span> أو «خسِرت».</>,
        <>يمكن إرفاق <span className="text-text font-semibold">رابط دعوة اختياري</span> بالتحدي (غرفة موقع البرمجة).</>,
        <><span className="text-text font-semibold">ELO خاص بكل تخصص</span>، منفصل عن الألعاب الأخرى.</>,
      ],
    },
  },
  pokemon: {
    label: 'بوكيمون (1 ضد 1)',
    terrain: {
      intro: (
        <>أي مبارزة بوكيمون مقبولة (مثل Pokémon Showdown، الخراطيش، البطاقات…).</>
      ),
      bullets: [
        <>نتيجة <span className="text-gold font-semibold">ثنائية</span>: فوز أو خسارة، بلا نتيجة رقمية ولا تعادل.</>,
        <>جميع <span className="text-text font-semibold">الصيغ مقبولة</span> — الـ ELO نفسه مهما كان الوسيط.</>,
        <>بلا اختيار شخصية: تعلن ببساطة عن <span className="text-text font-semibold">الفائز</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League تصنّف <span className="text-text font-semibold">بوكيمون</span> بنظام 1 ضد 1. يمكن لأي عضو أن يتحدى أي عضو آخر.</>
      ),
      bullets: [
        <>الإبلاغ = اختيار <span className="text-gold font-semibold">«فُزت»</span> أو «خسِرت».</>,
        <><span className="text-text font-semibold">ELO خاص بكل تخصص</span>، منفصل عن الألعاب الأخرى.</>,
        <>بلا <span className="text-text font-semibold">تفاصيل المباراة</span>: النتيجة وحدها هي ما يهم.</>,
      ],
    },
  },
};

const RULES_PT: Record<Game, GameRules> = {
  babyfoot: {
    label: 'pebolim 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenções de jogo para que um gol seja válido e as partidas se mantenham disputadas de forma
          limpa:
        </>
      ),
      bullets: [
        <>
          Após o saque (<span className="text-text font-semibold">kick-off</span>), a bola precisa ser
          <span className="text-gold font-semibold"> tocada pelo menos duas vezes</span> antes que um gol
          conte.
        </>,
        <>
          O jogador que <span className="text-text font-semibold">acabou de sofrer um gol</span> tem o direito
          de recolocar a bola <span className="text-gold font-semibold">na sua barra do meio</span> (os meias)
          para recomeçar.
        </>,
        <>
          Os <span className="text-gold font-semibold">gols marcados a partir da barra do meio</span> (os meias)
          são válidos.
        </>,
        <>
          A <span className="text-gold font-semibold">gamelle</span> (bola que volta a sair do gol): você pode
          <span className="text-text font-semibold"> ficar com o ponto</span> ou
          <span className="text-text font-semibold"> tirar um ponto do adversário</span> — mas não dá para
          <span className="text-text font-semibold"> fechar a partida numa gamelle</span>.
        </>,
        <>
          As <span className="text-gold font-semibold">roletas</span> precisam ser
          <span className="text-text font-semibold"> controladas</span> (sem giros descontrolados).
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League é um ranking ELO de <span className="text-text font-semibold">pebolim 1 contra 1</span>.
          Cada jogador inscrito pode desafiar qualquer outro membro da sua league.
        </>
      ),
      bullets: [
        <>Partida em <span className="text-gold font-semibold">10 gols</span> — o primeiro a chegar a 10 vence.</>,
        <>Uma partida só pode ser declarada <span className="text-text font-semibold">depois de ter sido jogada</span>.</>,
        <>Os dois jogadores declaram o placar de forma independente. Em caso de desacordo, a partida é anulada.</>,
      ],
    },
  },
  smash: {
    label: 'Super Smash Bros. 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenções de set para que a vitória seja clara e as partidas justas:
        </>
      ),
      bullets: [
        <>
          Cada partida é disputada em <span className="text-gold font-semibold">stocks (vidas)</span> — o jogador
          que esgota todos os stocks do adversário vence a rodada.
        </>,
        <>
          Seleção de <span className="text-gold font-semibold">personagem</span> antes de cada rodada; após uma
          rodada perdida, o perdedor pode <span className="text-text font-semibold">trocar de personagem</span>.
        </>,
        <>
          Os sets são disputados em <span className="text-gold font-semibold">melhor de 3 (Bo3)</span> ou{' '}
          <span className="text-gold font-semibold">melhor de 5 (Bo5)</span> conforme o contexto (oficial, torneio).
        </>,
        <>
          Os <span className="text-text font-semibold">itens</span> e os estágios contestados ficam desativados
          por padrão, salvo acordo explícito dos dois jogadores.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classifica aqui o <span className="text-text font-semibold">Super Smash Bros. 1 contra 1</span> em
          stocks. Cada jogador inscrito pode desafiar qualquer outro membro da sua league.
        </>
      ),
      bullets: [
        <>Set em <span className="text-gold font-semibold">melhor de 3 ou melhor de 5</span> rodadas (Bo3 / Bo5).</>,
        <>O vencedor é quem leva a <span className="text-text font-semibold">maioria das rodadas</span>.</>,
        <>O <span className="text-text font-semibold">ELO é por modalidade</span>: seu rating de Smash é separado do pebolim.</>,
        <>Os dois jogadores declaram o resultado de forma independente. Em caso de desacordo, a partida é anulada.</>,
      ],
    },
  },
  chess: {
    label: 'xadrez 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenções de partida para que o resultado seja incontestável:
        </>
      ),
      bullets: [
        <>
          Partida <span className="text-gold font-semibold">1 contra 1</span> com as regras clássicas do xadrez
          (peça tocada, peça jogada).
        </>,
        <>
          O resultado é <span className="text-gold font-semibold">binário</span>: vitória ou derrota. Um empate
          é rejogado ou decidido conforme o acordo dos jogadores.
        </>,
        <>
          A vitória vem por <span className="text-text font-semibold">xeque-mate</span> ou por
          <span className="text-text font-semibold"> desistência</span> do adversário.
        </>,
        <>
          Se um <span className="text-text font-semibold">controle de tempo</span> (relógio) for usado, a queda
          da bandeira conta como derrota.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classifica aqui o <span className="text-text font-semibold">xadrez 1 contra 1</span>. Cada
          jogador inscrito pode desafiar qualquer outro membro da sua league.
        </>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binário</span> — vitória ou derrota, sem placar numérico.</>,
        <>Uma partida só pode ser declarada <span className="text-text font-semibold">depois de ter sido jogada</span>.</>,
        <>O <span className="text-text font-semibold">ELO é dedicado ao xadrez</span>, separado das outras modalidades.</>,
        <>Os dois jogadores declaram o resultado de forma independente. Em caso de desacordo, a partida é anulada.</>,
      ],
    },
  },
  streetfighter: {
    label: 'Street Fighter 1 contra 1',
    terrain: {
      intro: (
        <>
          Convenções de set para que a vitória seja clara e as partidas justas:
        </>
      ),
      bullets: [
        <>
          Cada partida é disputada em <span className="text-gold font-semibold">rounds</span> — o jogador que
          vence a maioria dos rounds leva a rodada.
        </>,
        <>
          Seleção de <span className="text-gold font-semibold">personagem</span> antes de cada rodada; após uma
          rodada perdida, o perdedor pode <span className="text-text font-semibold">trocar de personagem</span>.
        </>,
        <>
          Os sets são disputados em <span className="text-gold font-semibold">melhor de 3 (Bo3)</span> ou{' '}
          <span className="text-gold font-semibold">melhor de 5 (Bo5)</span> conforme o contexto (oficial, torneio).
        </>,
        <>
          <span className="text-text font-semibold">Configurações padrão</span>: timer e vida no padrão, sem
          modificadores nem assists exóticos — um set justo e legível.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classifica aqui o <span className="text-text font-semibold">Street Fighter 1 contra 1</span>.
          Cada jogador inscrito pode desafiar qualquer outro membro da sua league.
        </>
      ),
      bullets: [
        <>Set em <span className="text-gold font-semibold">melhor de 3 ou melhor de 5</span> rodadas (Bo3 / Bo5).</>,
        <>O vencedor é quem leva a <span className="text-text font-semibold">maioria das rodadas</span>.</>,
        <>O <span className="text-text font-semibold">ELO é por modalidade</span>: seu rating de Street Fighter é separado dos outros jogos.</>,
        <>Os dois jogadores declaram o resultado de forma independente. Em caso de desacordo, a partida é anulada.</>,
      ],
    },
  },
  flechettes: {
    label: 'dardos (301 / 501)',
    terrain: {
      intro: (
        <>
          Convenções de rodada para que a contagem seja clara e o resultado incontestável:
        </>
      ),
      bullets: [
        <>
          Rodada em <span className="text-gold font-semibold">301 ou 501</span>: cada jogador parte do seu placar
          inicial e <span className="text-text font-semibold">vai descontando</span> conforme pontua.
        </>,
        <>
          O primeiro a chegar a <span className="text-gold font-semibold">exatamente 0</span> vence a rodada.
        </>,
        <>
          De <span className="text-gold font-semibold">2 a 8 jogadores</span> podem disputar a mesma rodada, cada
          um com o <span className="text-text font-semibold">próprio restante</span>.
        </>,
        <>
          Sem <span className="text-text font-semibold">personagens</span> nem times — é um confronto
          <span className="text-text font-semibold"> individual</span>.
        </>,
      ],
    },
    format: {
      intro: (
        <>
          42 League classifica aqui os <span className="text-text font-semibold">dardos (301 / 501)</span>.
          Cada jogador inscrito pode desafiar qualquer outro membro da sua league.
        </>
      ),
      bullets: [
        <>Rodada de <span className="text-gold font-semibold">2 a 8 jogadores</span>, formato <span className="text-text font-semibold">301 ou 501</span>.</>,
        <>
          Quem declara insere, para cada jogador, os <span className="text-gold font-semibold">pontos restantes</span> no fim
          (o <span className="text-text font-semibold">vencedor = 0</span>). A classificação vem do restante:
          0 = 1º, depois do menor restante ao maior.
        </>,
        <>
          Cada um dos outros jogadores <span className="text-text font-semibold">confirma o próprio restante</span>; uma{' '}
          <span className="text-text font-semibold">contestação anula a rodada</span>.
        </>,
        <>
          O <span className="text-text font-semibold">ELO é por modalidade</span>: seu rating de dardos é separado dos outros jogos.
          Sem torneio de dardos e sem 2v2.
        </>,
      ],
    },
  },
  coding: {
    label: 'coding (1 contra 1)',
    terrain: {
      intro: (
        <>Qualquer jogo de código é aceito (CodinGame, Clash of Code, duelos LeetCode…).</>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binário</span>: vitória ou derrota, sem placar numérico nem empate.</>,
        <>O <span className="text-text font-semibold">site de código é livre</span> — o ELO é o mesmo em qualquer plataforma.</>,
        <>Sem seleção de personagem: você simplesmente declara o <span className="text-text font-semibold">vencedor</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League classifica o <span className="text-text font-semibold">coding</span> em 1 contra 1. Qualquer membro pode desafiar qualquer outro.</>
      ),
      bullets: [
        <>Declarar = escolher <span className="text-gold font-semibold">“ganhei”</span> ou “perdi”.</>,
        <>Um <span className="text-text font-semibold">link de convite opcional</span> pode ser anexado ao desafio (a sala do site de código).</>,
        <>O <span className="text-text font-semibold">ELO é por modalidade</span>, separado dos outros jogos.</>,
      ],
    },
  },
  pokemon: {
    label: 'pokémon (1 contra 1)',
    terrain: {
      intro: (
        <>Qualquer duelo de Pokémon é aceito (ex.: Pokémon Showdown, cartuchos, cartas…).</>
      ),
      bullets: [
        <>Resultado <span className="text-gold font-semibold">binário</span>: vitória ou derrota, sem placar numérico nem empate.</>,
        <>Todos os <span className="text-text font-semibold">formatos são aceitos</span> — o ELO é o mesmo em qualquer meio.</>,
        <>Sem seleção de personagem: você simplesmente declara o <span className="text-text font-semibold">vencedor</span>.</>,
      ],
    },
    format: {
      intro: (
        <>42 League classifica o <span className="text-text font-semibold">pokémon</span> em 1 contra 1. Qualquer membro pode desafiar qualquer outro.</>
      ),
      bullets: [
        <>Declarar = escolher <span className="text-gold font-semibold">“ganhei”</span> ou “perdi”.</>,
        <>O <span className="text-text font-semibold">ELO é por modalidade</span>, separado dos outros jogos.</>,
        <>Sem <span className="text-text font-semibold">detalhes da partida</span>: só o resultado conta.</>,
      ],
    },
  },
};

const RULES_I18N: Record<UiLang, Record<Game, GameRules>> = {
  fr: RULES_FR,
  en: RULES_EN,
  es: RULES_ES,
  ja: RULES_JA,
  ar: RULES_AR,
  pt: RULES_PT,
};

// ─── Défis & OPS (texte riche, par langue) ───────────────────────────────────

const CHALLENGES_BODY: Record<UiLang, React.ReactNode> = {
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
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
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
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
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
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
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
  ja: (
    <>
      <p>
        <span className="text-gold font-semibold">チャレンジ</span>を使うと、指定した時刻に試合を予定できます。
        相手が承認するか辞退します。
      </p>
      <p>
        <span className="text-red font-semibold">OPS</span>（オペレーション）はあなたの{' '}
        <span className="text-text font-semibold">宿敵</span>を指定します：プレイヤーを標的にすると狩りが
        始まります。一方的なアクションで、承認は不要です。
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
        <li>狩りは<span className="text-text font-semibold">24時間</span>続きます。</li>
        <li>
          その間、標的は追跡者からの<span className="text-text font-semibold">最初の3件のチャレンジ</span>を
          <span className="text-text font-semibold">拒否できません</span> — 必ずプレイしなければなりません。
        </li>
        <li>
          これらの強制試合の1つを拒否すると<span className="text-red font-semibold">敗北時の ELO の3倍</span>
          {' '}のコストがかかります（単なる棄権よりはるかに大きいです）。
        </li>
        <li>OPS は同時に1つだけ有効で、失効後は1週間のクールダウンがあります。</li>
      </ul>
    </>
  ),
  ar: (
    <>
      <p>
        تتيح لك <span className="text-gold font-semibold">التحدّيات</span> جدولة مباراة في وقت محدَّد.
        يقبل الخصم أو يرفض.
      </p>
      <p>
        الـ<span className="text-red font-semibold">OPS</span> (عملية) تحدِّد{' '}
        <span className="text-text font-semibold">عدوّك اللدود</span>: تستهدف لاعبًا فتبدأ المطاردة.
        إجراء أحادي، لا يتطلب أي قبول.
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
        <li>تستمر المطاردة <span className="text-text font-semibold">24 ساعة</span>.</li>
        <li>
          خلال هذه المدة، <span className="text-text font-semibold">لا يمكن</span> للهدف رفض
          <span className="text-text font-semibold"> أول 3 تحدّيات</span> من مطارِده — عليه أن يلعبها.
        </li>
        <li>
          رفض إحدى هذه المباريات الإجبارية يكلّف <span className="text-red font-semibold">3 أضعاف ELO الخسارة</span>
          {' '}(أكثر بكثير من مجرد انسحاب).
        </li>
        <li>عملية OPS واحدة نشطة في كل مرة، مع فترة تهدئة أسبوع بعد انتهائها.</li>
      </ul>
    </>
  ),
  pt: (
    <>
      <p>
        Os <span className="text-gold font-semibold">desafios</span> permitem agendar uma partida em um horário definido.
        O adversário aceita ou recusa.
      </p>
      <p>
        Uma <span className="text-red font-semibold">OPS</span> (operação) marca o seu{' '}
        <span className="text-text font-semibold">arqui-inimigo</span>: você mira um jogador e a caçada
        começa. Ação unilateral, sem necessidade de aceitação.
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-red/30">
        <li>A caçada dura <span className="text-text font-semibold">24 horas</span>.</li>
        <li>
          Durante esse período, o alvo <span className="text-text font-semibold">não pode recusar</span> os
          <span className="text-text font-semibold"> 3 primeiros desafios</span> do seu caçador — precisa jogá-los.
        </li>
        <li>
          Recusar uma dessas partidas forçadas custa <span className="text-red font-semibold">3× o ELO de uma derrota</span>
          {' '}(bem mais que uma simples desistência).
        </li>
        <li>Apenas uma OPS ativa por vez, com um cooldown de uma semana após expirar.</li>
      </ul>
    </>
  ),
};

const TOURNAMENTS_BODY: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <p>
      2つの形式があります：<span className="text-text font-semibold">シングルエリミネーション</span>（ブラケット、
      必要に応じて自動的にバイ）または<span className="text-text font-semibold">グループステージ</span>（12
      人以上から — 4人のグループ、各グループ2人が通過、その後は通過者のブラケット）。{' '}
      <span className="text-gold font-semibold">公式</span>トーナメントは管理者が作成し、特別な報酬を
      与えます。<span className="text-text font-semibold">親善</span>トーナメントは全員に開かれ、ELO への
      影響はなく、履歴には参加者の分だけ表示されます。
    </p>
  ),
  ar: (
    <p>
      صيغتان: <span className="text-text font-semibold">إقصاء مباشر</span> (شبكة، مع باي تلقائي عند
      الحاجة) أو <span className="text-text font-semibold">دور المجموعات</span> (اعتبارًا من 12
      لاعبًا — مجموعات من 4، يتأهل 2 من كل مجموعة، ثم شبكة المتأهلين). البطولات{' '}
      <span className="text-gold font-semibold">الرسمية</span> يُنشئها المشرفون وتمنح مكافآت خاصة؛
      أما <span className="text-text font-semibold">الودّية</span> فمفتوحة للجميع، بلا تأثير على ELO،
      ولا تظهر في السجل إلا للمشاركين فيها.
    </p>
  ),
  pt: (
    <p>
      Dois formatos: <span className="text-text font-semibold">eliminatória simples</span> (chave, byes
      automáticos se necessário) ou <span className="text-text font-semibold">fase de grupos</span> (a partir de 12
      jogadores — grupos de 4, 2 classificados por grupo, depois a chave dos classificados). Os torneios{' '}
      <span className="text-gold font-semibold">oficiais</span> são criados pelos admins e dão recompensas
      especiais; os <span className="text-text font-semibold">amistosos</span> são abertos a todos, sem impacto no
      ELO, e aparecem no histórico apenas para os seus participantes.
    </p>
  ),
};

function RulesSection() {
  const { game } = useGameMode();
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
  const t = useT();
  const rules = RULES_I18N[lang][game];
  return (
    <div className="flex flex-col gap-4">
      {/* En tête, pleine largeur : les règles propres à la discipline active. */}
      <Panel title={t('about.rules.terrain.title')} accent="book">
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>{rules.terrain.intro}</p>
          <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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
          <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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

const ELO_CONTENT: Record<UiLang, EloContent> = {
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
  ja: {
    intro: (label, scored) => (
      <>
        ランキングは<span className="text-gold font-semibold">チェスから派生した ELO システム</span>に基づき、
        <span className="text-text font-semibold">競技ごと</span>に適用されます（{label}）。
        各プレイヤーは{' '}
        <span className="text-text font-semibold">1000ポイント</span>から始めます。試合ごとに、ポイントが
        敗者から勝者へ移動します。その移動量は、結果が{' '}
        <span className="text-text font-semibold">予想外</span>であるほど
        {scored ? (
          <>、そして勝利が<span className="text-text font-semibold">大差</span>であるほど</>
        ) : null}
        大きくなります。
      </>
    ),
    term: {
      E: (
        <>
          勝者の理論上の勝率で、レート差から計算されます
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_敗者 − Elo_勝者) / 400))</code>)。
          上位のレートの相手を倒すほど多く得られます。勝利が起こりにくかったからです。
        </>
      ),
      K: (
        <>
          「中立的な」試合で動く最大ポイント量です。値が大きいほど、ランキングは速く反応します。
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − 敗者スコア) × 0.1</code> ：
          <span className="text-text font-semibold">10–0</span>での勝利は、接戦の{' '}
          <span className="text-text font-semibold">10–9</span>よりも重みがあります。勝利の大きさが重要です。
        </>
      ),
      bonus: (
        <>
          はっきり言うと：{' '}
          <span className="text-text font-semibold">
            自分よりずっと上位の相手を倒せば、はるかに多くのポイントが得られます
          </span>{' '}
          — そして相手は同じだけ失います。近いレベルの相手を倒してもわずかしか得られません：
          レート差が大きいほど、番狂わせの見返りは大きくなります。
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? '同じスコア、同じ勝利' : '同じ勝利'}：レート差+400の相手に対する番狂わせは
        <span className="text-text font-semibold">2倍のポイント</span>をもたらします。
      </>
    ),
  },
  ar: {
    intro: (label, scored) => (
      <>
        يعتمد التصنيف على نظام <span className="text-gold font-semibold">ELO مشتق من الشطرنج</span>،
        يُطبَّق <span className="text-text font-semibold">لكل تخصص</span> ({label}).
        يبدأ كل لاعب من{' '}
        <span className="text-text font-semibold">1000 نقطة</span>. في كل مباراة، تُنقل النقاط من
        الخاسر إلى الفائز، وكلما كانت النتيجة{' '}
        <span className="text-text font-semibold">غير متوقَّعة</span> أكثر
        {scored ? (
          <>، وكان الفوز <span className="text-text font-semibold">بفارق كبير</span></>
        ) : null}
        ، زاد ما يُنقل منها.
      </>
    ),
    term: {
      E: (
        <>
          الاحتمال النظري لفوز الفائز، محسوبًا من فارق التصنيف
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_الخاسر − Elo_الفائز) / 400))</code>).
          التغلب على خصم أعلى تصنيفًا يمنح نقاطًا أكثر، لأن الفوز كان غير مرجَّح.
        </>
      ),
      K: (
        <>
          الحد الأقصى لعدد النقاط المطروحة في مباراة «محايدة». كلما ارتفع، كان تفاعل التصنيف أسرع.
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − نتيجة_الخاسر) × 0.1</code> :
          الفوز <span className="text-text font-semibold">10–0</span> يزن أكثر من{' '}
          <span className="text-text font-semibold">10–9</span> المتقارب. حجم الفوز مهم.
        </>
      ),
      bonus: (
        <>
          بوضوح:{' '}
          <span className="text-text font-semibold">
            إذا هزمت شخصًا أعلى منك تصنيفًا بكثير، تكسب نقاطًا أكثر بكثير
          </span>{' '}
          — وهو يخسر بالقدر نفسه. التغلب على خصم قريب من مستواك يمنح القليل فقط:
          كلما اتسع فارق التصنيف، زاد مردود المفاجأة.
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? 'النتيجة نفسها، الفوز نفسه' : 'الفوز نفسه'}: المفاجأة أمام اللاعب على بُعد +400
        تمنح <span className="text-text font-semibold">ضعف عدد النقاط</span>.
      </>
    ),
  },
  pt: {
    intro: (label, scored) => (
      <>
        A classificação se baseia em um sistema <span className="text-gold font-semibold">ELO derivado do xadrez</span>,
        aplicado <span className="text-text font-semibold">por modalidade</span> ({label}).
        Cada jogador começa com{' '}
        <span className="text-text font-semibold">1000 pontos</span>. A cada partida, pontos são
        transferidos do perdedor para o vencedor — ainda mais quando o resultado foi{' '}
        <span className="text-text font-semibold">inesperado</span>
        {scored ? (
          <> e a vitória foi <span className="text-text font-semibold">ampla</span></>
        ) : null}
        .
      </>
    ),
    term: {
      E: (
        <>
          A chance teórica de vitória do vencedor, calculada a partir da diferença de classificação
          (<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 / (1 + 10^((Elo_perdedor − Elo_vencedor) / 400))</code>).
          Vencer um adversário mais bem classificado rende mais, já que a vitória era pouco provável.
        </>
      ),
      K: (
        <>
          A quantidade máxima de pontos em jogo em uma partida “neutra”. Quanto maior, mais rápido o
          ranking reage.
        </>
      ),
      M: (
        <>
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">1 + (10 − placar_perdedor) × 0,1</code>:
          vencer por <span className="text-text font-semibold">10–0</span> pesa mais que um{' '}
          <span className="text-text font-semibold">10–9</span> apertado. A margem da vitória conta.
        </>
      ),
      bonus: (
        <>
          Em resumo:{' '}
          <span className="text-text font-semibold">
            se você vence alguém classificado bem acima de você, ganha muito mais pontos
          </span>{' '}
          — e ele perde outro tanto. Vencer um adversário de nível parecido rende pouco:
          quanto maior a diferença de classificação, mais a zebra compensa.
        </>
      ),
    },
    exampleNote: (scored) => (
      <>
        {scored ? 'Mesmo placar, mesma vitória' : 'Mesma vitória'}: a zebra contra o jogador a +400 de diferença
        rende <span className="text-text font-semibold">o dobro de pontos</span>.
      </>
    ),
  },
};

function EloSection({ game }: { game: Game }) {
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
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
        <ul className="space-y-1.5 ps-3 border-s border-gold/25">
          {ELO_GUARDRAILS[lang]}
        </ul>
      </div>
    </Panel>
  );
}

const ELO_GUARDRAILS: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      <li>
        <span className="text-text font-semibold">大きな番狂わせでの非対称性</span> — 過大評価された敗者は
        ボーナス全額を被ります（1試合で最大 <span className="text-gold font-semibold">−400</span> まで）が、勝者は
        <span className="text-text font-semibold">+50に上限が設けられた</span>分しか上がりません：水増しされた
        「ボス」を1人倒しただけで、自分のレートが急騰することはありません。
      </li>
      <li>
        <span className="text-text font-semibold">ガードレール</span> — 変動は1試合あたり{' '}
        <span className="text-gold font-semibold">±400ポイント</span>に制限されます。
      </li>
      <li>
        <span className="text-text font-semibold">ランク戦は無制限</span> —{' '}
        <span className="text-text font-semibold">すべての試合が ELO に反映され</span>、1日あたりや
        対戦相手ごとの制限はありません。
      </li>
    </>
  ),
  ar: (
    <>
      <li>
        <span className="text-text font-semibold">عدم تناظر في المفاجآت الكبرى</span> — الخاسر المبالَغ في
        تصنيفه يتحمّل المكافأة كاملةً (حتى <span className="text-gold font-semibold">−400</span> في مباراة واحدة)، لكن
        الفائز لا يرتفع إلا بحصة <span className="text-text font-semibold">محدودة بـ +50</span>: هزيمة «بوس»
        منتفخ واحد لا تُفجّر تصنيفك الخاص.
      </li>
      <li>
        <span className="text-text font-semibold">حاجز أمان</span> — التغيّر محدود بـ{' '}
        <span className="text-gold font-semibold">±400 نقطة</span> لكل مباراة.
      </li>
      <li>
        <span className="text-text font-semibold">مصنّف بلا حدود</span> —{' '}
        <span className="text-text font-semibold">كل مباراة تُحتسب في ELO</span>، بلا حدّ يومي ولا
        لكل خصم.
      </li>
    </>
  ),
  pt: (
    <>
      <li>
        <span className="text-text font-semibold">Assimetria nas grandes zebras</span> — o perdedor supervalorizado
        leva todo o bônus (até <span className="text-gold font-semibold">−400</span> em uma partida), mas o vencedor
        sobe apenas uma parcela <span className="text-text font-semibold">limitada a +50</span>: vencer um único
        “chefe” inflado não faz o seu próprio rating explodir.
      </li>
      <li>
        <span className="text-text font-semibold">Trava de segurança</span> — a variação é limitada a{' '}
        <span className="text-gold font-semibold">±400 pontos</span> por partida.
      </li>
      <li>
        <span className="text-text font-semibold">Ranqueado ilimitado</span> —{' '}
        <span className="text-text font-semibold">toda partida conta para o ELO</span>, sem
        limite diário nem por adversário.
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
const PRIVACY_CONTROLLER: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      このアプリケーションは、42 API の利用規約（
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ）の枠組みのもとで、42 ネットワークの学生によって開発・運営されています。あなたのデータに関するお問い合わせは：{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
  ar: (
    <>
      هذا التطبيق مطوَّر ومُشغَّل من قِبل طلاب شبكة 42 في إطار شروط استخدام واجهة 42 البرمجية (
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ). لأي سؤال يتعلق ببياناتك:{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
  pt: (
    <>
      Este aplicativo é desenvolvido e operado por estudantes da rede 42 no âmbito dos termos de uso da
      API 42 (
      <a href="https://api.intra.42.fr/apidoc" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
        api.intra.42.fr
      </a>
      ). Para qualquer dúvida sobre os seus dados:{' '}
      <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
        abidaux@student.42lehavre.fr
      </a>
    </>
  ),
};

const PRIVACY_LEGAL: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      この処理は<span className="text-text font-semibold">正当な利益</span>（GDPR 第6条(1)(f)）に基づきます：
      42 API の利用規約が定める教育的な枠組みのなかで、42 ネットワーク内のスポーツランキングを運営するためです。
      あなたの 42 プロフィールデータへのアクセスは、OAuth 接続時の明示的な同意を条件とします。
    </>
  ),
  ar: (
    <>
      تستند المعالجة إلى <span className="text-text font-semibold">المصلحة المشروعة</span> (GDPR المادة 6(1)(f)):
      إدارة تصنيف رياضي داخل شبكة 42، ضمن الإطار التعليمي الذي تحدده شروط استخدام واجهة 42 البرمجية.
      يخضع الوصول إلى بيانات ملفك الشخصي في 42 لموافقتك الصريحة أثناء تسجيل الدخول عبر OAuth.
    </>
  ),
  pt: (
    <>
      O tratamento se baseia no <span className="text-text font-semibold">interesse legítimo</span> (GDPR Art. 6(1)(f)):
      gestão de uma classificação esportiva dentro da rede 42, no âmbito pedagógico definido pelos
      termos de uso da API 42. O acesso aos seus dados de perfil da 42 está sujeito ao seu
      consentimento explícito durante o login via OAuth.
    </>
  ),
};

const PRIVACY_RIGHTS: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      <li>
        <span className="text-text font-semibold">アクセスとポータビリティ</span> — JSON エクスポートは
        <Link to="/settings" className="text-gold hover:underline">設定</Link>から利用できます。
      </li>
      <li>
        <span className="text-text font-semibold">消去</span> — アカウントの削除（匿名化）は
        <Link to="/settings" className="text-gold hover:underline">設定</Link>から行えます。
      </li>
      <li>
        <span className="text-text font-semibold">訂正</span> — メールでお問い合わせください。
      </li>
      <li>
        <span className="text-text font-semibold">異議申し立て</span> — いつでもアプリケーションの利用を
        やめて、アカウントの削除を求めることができます。
      </li>
    </>
  ),
  ar: (
    <>
      <li>
        <span className="text-text font-semibold">الوصول وقابلية النقل</span> — تصدير JSON متاح في
        <Link to="/settings" className="text-gold hover:underline"> الإعدادات</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">المحو</span> — حذف الحساب (إخفاء الهوية) متاح في
        <Link to="/settings" className="text-gold hover:underline"> الإعدادات</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">التصحيح</span> — تواصل معنا عبر البريد الإلكتروني.
      </li>
      <li>
        <span className="text-text font-semibold">الاعتراض</span> — يمكنك التوقف عن استخدام التطبيق في
        أي وقت وطلب حذف حسابك.
      </li>
    </>
  ),
  pt: (
    <>
      <li>
        <span className="text-text font-semibold">Acesso e portabilidade</span> — exportação JSON disponível
        em <Link to="/settings" className="text-gold hover:underline">Configurações</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Eliminação</span> — exclusão (anonimização)
        da conta disponível em <Link to="/settings" className="text-gold hover:underline">Configurações</Link>.
      </li>
      <li>
        <span className="text-text font-semibold">Retificação</span> — entre em contato por e-mail.
      </li>
      <li>
        <span className="text-text font-semibold">Oposição</span> — você pode parar de usar o aplicativo
        a qualquer momento e solicitar a exclusão da sua conta.
      </li>
    </>
  ),
};

const PRIVACY_SECURITY: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      通信は転送時に暗号化されます（HTTPS）。セッショントークンは暗号的に署名され
      （HMAC-SHA256）、<code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">HttpOnly</code>
      クッキー、または URL フラグメント（ログに記録されません）を通じてのみ送信されます。管理者向けの
      アラートに使われる内部の Discord ウェブフックを除き、いかなるデータも第三者と共有されません
      （個人データなし）。
    </>
  ),
  ar: (
    <>
      الاتصالات مشفَّرة أثناء النقل (HTTPS). رموز الجلسة موقَّعة تشفيريًا (HMAC-SHA256) وتُرسَل حصريًا عبر
      ملفات تعريف الارتباط <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">HttpOnly</code> أو
      جزء من عنوان URL (غير مسجَّل في السجلات). لا تُشارك أي بيانات مع أطراف ثالثة، باستثناء ويب هوك
      Discord الداخلي المستخدَم لتنبيهات المشرفين (بدون بيانات شخصية).
    </>
  ),
  pt: (
    <>
      As comunicações são criptografadas em trânsito (HTTPS). Os tokens de sessão são
      assinados criptograficamente (HMAC-SHA256) e transmitidos exclusivamente via
      cookies <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">HttpOnly</code> ou
      fragmento de URL (não registrados em log). Nenhum dado é compartilhado com terceiros,
      exceto o webhook interno do Discord usado para os alertas de admin
      (sem dados pessoais).
    </>
  ),
};

function PrivacySection() {
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
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
                <th className="text-start py-1.5 pe-3 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.data')}</th>
                <th className="text-start py-1.5 pe-3 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.source')}</th>
                <th className="text-start py-1.5 text-muted-2 font-bold uppercase tracking-wider">{t('about.privacy.table.retention')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <tr>
                <td className="py-1.5 pe-3 text-text">{t('about.privacy.row1.data')}</td>
                <td className="py-1.5 pe-3 text-muted">{t('about.privacy.row1.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row1.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pe-3 text-text">{t('about.privacy.row2.data')}</td>
                <td className="py-1.5 pe-3 text-muted">{t('about.privacy.row2.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row2.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pe-3 text-text">{t('about.privacy.row3.data')}</td>
                <td className="py-1.5 pe-3 text-muted">{t('about.privacy.row3.source')}</td>
                <td className="py-1.5 text-muted">{t('about.privacy.row3.retention')}</td>
              </tr>
              <tr>
                <td className="py-1.5 pe-3 text-text">{t('about.privacy.row4.data')}</td>
                <td className="py-1.5 pe-3 text-muted">{t('about.privacy.row4.source')}</td>
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
          <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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
const TECH_ARCHITECTURE: Record<UiLang, React.ReactNode> = {
  fr: (
    <>
      <p>
        Monorepo <span className="text-text font-semibold">TypeScript</span> de bout en bout, en trois morceaux :
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
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
  ja: (
    <>
      <p>
        端から端まで <span className="text-text font-semibold">TypeScript</span> のモノレポで、3つの部分から成ります：
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
        <li>
          <span className="text-gold font-semibold">フロント</span> — React 18 + Vite、{' '}
          <span className="text-text font-semibold">PWA</span> としてインストール可能（サービスワーカー、モバイルで全画面）。
        </li>
        <li>
          <span className="text-gold font-semibold">バック</span> — Node 上の <span className="text-text font-semibold">Hono</span> API{' '}
          、Prisma 経由の <span className="text-text font-semibold">PostgreSQL</span> データベース。42 へのログインは OAuth。
        </li>
        <li>
          <span className="text-gold font-semibold">リアルタイム</span> — サーバーは変更を{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code> でプッシュします。ランキング、チャレンジ、OPS は
          <span className="text-text font-semibold">再読み込みなし</span>で更新されます。
        </li>
      </ul>
    </>
  ),
  ar: (
    <>
      <p>
        مستودع أحادي <span className="text-text font-semibold">TypeScript</span> من الطرف إلى الطرف، من ثلاثة أجزاء:
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
        <li>
          <span className="text-gold font-semibold">الواجهة الأمامية</span> — React 18 + Vite، قابلة للتثبيت كـ{' '}
          <span className="text-text font-semibold">PWA</span> (service worker، ملء الشاشة على الجوال).
        </li>
        <li>
          <span className="text-gold font-semibold">الواجهة الخلفية</span> — واجهة <span className="text-text font-semibold">Hono</span>{' '}
          على Node، وقاعدة بيانات <span className="text-text font-semibold">PostgreSQL</span> عبر Prisma. تسجيل الدخول إلى 42 عبر OAuth.
        </li>
        <li>
          <span className="text-gold font-semibold">الوقت الفعلي</span> — يدفع الخادم التغييرات عبر{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code>؛ ويُحدَّث التصنيف والتحدّيات وعمليات OPS
          <span className="text-text font-semibold"> بلا إعادة تحميل</span>.
        </li>
      </ul>
    </>
  ),
  pt: (
    <>
      <p>
        Monorepo <span className="text-text font-semibold">TypeScript</span> de ponta a ponta, em três partes:
      </p>
      <ul className="space-y-1.5 ps-3 border-s border-gold/25">
        <li>
          <span className="text-gold font-semibold">Front</span> — React 18 + Vite, instalável como{' '}
          <span className="text-text font-semibold">PWA</span> (service worker, tela cheia no celular).
        </li>
        <li>
          <span className="text-gold font-semibold">Back</span> — API <span className="text-text font-semibold">Hono</span>{' '}
          no Node, banco <span className="text-text font-semibold">PostgreSQL</span> via Prisma. Login na 42 por OAuth.
        </li>
        <li>
          <span className="text-gold font-semibold">Tempo real</span> — o servidor envia as mudanças por{' '}
          <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">SSE</code>; a classificação, os desafios e as OPS
          se atualizam <span className="text-text font-semibold">sem recarregar</span>.
        </li>
      </ul>
    </>
  ),
};

const TECH_HOSTING: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      <p>
        サイトは <span className="text-gold font-semibold">Scaleway</span> のサーバー上で動作し、{' '}
        <span className="text-text font-semibold">Caddy</span> のリバースプロキシの背後で <span className="text-text font-semibold">TLS</span>{' '}
        を自動的に処理します（Let's Encrypt）。
      </p>
      <p>
        メインブランチへの各 <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> は
        <span className="text-gold font-semibold">GitHub Action</span> をトリガーします：{' '}
        <span className="text-text font-semibold">Docker イメージ</span>をビルドし、スキャン（Trivy）してから
        サーバーへプッシュし、サーバーは新しいバージョンで再起動します。<span className="text-text font-semibold">手動デプロイはゼロです。</span>
      </p>
    </>
  ),
  ar: (
    <>
      <p>
        يعمل الموقع على خادم <span className="text-gold font-semibold">Scaleway</span>، خلف بروكسي عكسي{' '}
        <span className="text-text font-semibold">Caddy</span> يتولّى <span className="text-text font-semibold">TLS</span>{' '}
        تلقائيًا (Let's Encrypt).
      </p>
      <p>
        كل <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> إلى الفرع الرئيسي
        يُطلق <span className="text-gold font-semibold">GitHub Action</span>: تبني{' '}
        <span className="text-text font-semibold">صورة Docker</span>، وتفحصها (Trivy) ثم تدفعها إلى الخادم، الذي
        يعيد التشغيل على الإصدار الجديد. <span className="text-text font-semibold">صفر نشر يدوي.</span>
      </p>
    </>
  ),
  pt: (
    <>
      <p>
        O site roda em um servidor <span className="text-gold font-semibold">Scaleway</span>, atrás de um reverse proxy{' '}
        <span className="text-text font-semibold">Caddy</span> que cuida do <span className="text-text font-semibold">TLS</span>{' '}
        automaticamente (Let's Encrypt).
      </p>
      <p>
        Cada <code className="bg-bg-2 px-1 py-0.5 rounded text-xs text-text">push</code> na branch principal
        dispara uma <span className="text-gold font-semibold">GitHub Action</span>: ela constrói uma{' '}
        <span className="text-text font-semibold">imagem Docker</span>, escaneia (Trivy) e a envia ao servidor, que
        reinicia na nova versão. <span className="text-text font-semibold">Zero deploy manual.</span>
      </p>
    </>
  ),
};

const TECH_HACK: Record<UiLang, React.ReactNode> = {
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
  ja: (
    <>
      <p>
        ここでスタックを詳しく説明するのは意図的です：42 <span className="text-text font-semibold">によって</span>、そして 42 の
        <span className="text-text font-semibold">ために</span>作られたサイトは、内側から探られる価値があります。アプリケーションのコードは
        <span className="text-gold font-semibold">プライベート</span>リポジトリのままですが、その仕組みは何ら秘密ではありません。
      </p>
      <p>
        脆弱性、怪しい挙動、抜け道のアイデアを見つけましたか？ <span className="text-gold font-semibold">悪用するより
        報告を</span> — 責任ある開示は{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        まで。良い報告は最終的にクレジットされます。🏴‍☠️
      </p>
    </>
  ),
  ar: (
    <>
      <p>
        تفصيل حزمة التقنيات هنا أمر مقصود: موقع صُنع <span className="text-text font-semibold">بواسطة</span> 42 و{' '}
        <span className="text-text font-semibold">من أجلها</span> يستحق أن يُستكشف من الداخل. تبقى شيفرة التطبيق
        في مستودع <span className="text-gold font-semibold">خاص</span>، لكن طريقة عمله ليست سرًّا على الإطلاق.
      </p>
      <p>
        هل وجدت ثغرة أو سلوكًا مريبًا أو فكرة للالتفاف؟ <span className="text-gold font-semibold">أبلِغ
        بدل أن تستغل</span> — الإفصاح المسؤول إلى{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        . التقارير الجيدة يُنسب إليها الفضل في النهاية. 🏴‍☠️
      </p>
    </>
  ),
  pt: (
    <>
      <p>
        Detalhar a stack aqui é assumido: um site feito <span className="text-text font-semibold">por</span> e{' '}
        <span className="text-text font-semibold">para</span> a 42 merece ser espiado por dentro. O código da aplicação
        continua em um repositório <span className="text-gold font-semibold">privado</span>, mas o funcionamento não é segredo nenhum.
      </p>
      <p>
        Achou uma falha, um comportamento suspeito, uma ideia de contorno? <span className="text-gold font-semibold">Avise
        em vez de explorar</span> — divulgação responsável para{' '}
        <a href="mailto:abidaux@student.42lehavre.fr" className="text-gold hover:underline">
          abidaux@student.42lehavre.fr
        </a>
        . Os bons relatos acabam creditados. 🏴‍☠️
      </p>
    </>
  ),
};

function TechSection() {
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
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
  blurb: Record<UiLang, React.ReactNode>;
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
      ja: (
        <>
          アイデアを本物のプロジェクトに変えた人物です。{' '}
          <span className="text-text font-semibold">当初のビジョン</span>：公平で活気のある、キャンパスの{' '}
          <span className="text-text font-semibold">1v1 の ELO ランキング</span>。彼が{' '}
          <span className="text-gold font-semibold">機能を開発</span>します。{' '}
          その後、<span className="text-gold font-semibold">Adrien</span> がそれらを{' '}
          <span className="text-text font-semibold">本番投入に向けて磨き上げます</span>。
        </>
      ),
      ar: (
        <>
          هو من حوّل الفكرة إلى مشروع حقيقي.{' '}
          <span className="text-text font-semibold">الرؤية الأصلية</span>: <span className="text-text font-semibold">تصنيف ELO 1 ضد 1</span> للحرم الجامعي، عادل وحيّ. هو{' '}
          <span className="text-gold font-semibold">يطوّر الميزات</span>.{' '}
          ثم <span className="text-gold font-semibold">Adrien</span>{' '}
          <span className="text-text font-semibold">يصقلها للنشر في الإنتاج</span>.
        </>
      ),
      pt: (
        <>
          Quem transformou a ideia em um projeto de verdade. A{' '}
          <span className="text-text font-semibold">visão original</span>: um{' '}
          <span className="text-text font-semibold">ranking ELO 1v1</span> do campus, justo e
          vivo. Ele <span className="text-gold font-semibold">desenvolve features</span>.{' '}
          Depois o <span className="text-gold font-semibold">Adrien</span> as{' '}
          <span className="text-text font-semibold">refina para a produção</span>.
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
      ja: (
        <>
          すべては、ある日ふと彼が<span className="text-text font-semibold">口にしたアイデア</span>から始まりました。
          その最初のひらめきがなければ、42 League が世に出ることは決してありませんでした。
        </>
      ),
      ar: (
        <>
          بدأ كل شيء من <span className="text-text font-semibold">فكرة أطلقها</span> ذات يوم، هكذا ببساطة.
          لولا تلك الشرارة الأولى، لما رأى 42 League النور أبدًا.
        </>
      ),
      pt: (
        <>
          Tudo começou com uma <span className="text-text font-semibold">ideia que ele soltou</span> um
          dia, assim do nada. Sem aquela primeira faísca, o 42 League nunca teria saído do papel.
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
      ja: (
        <>
          彼は<span className="text-text font-semibold">キャンパスの拡張機能</span>を本物のウェブサイトに変え、
          その後<span className="text-gold font-semibold">オンラインでホスティングしデプロイ</span>しました。
          とりわけ<span className="text-text font-semibold">デザインとアニメーション</span>を手がけているのは彼です。
        </>
      ),
      ar: (
        <>
          حوّل <span className="text-text font-semibold">إضافة الحرم الجامعي</span> إلى موقع ويب حقيقي، ثم
          <span className="text-gold font-semibold"> استضافه ونشره على الإنترنت</span>.
          وهو تحديدًا من يقف خلف <span className="text-text font-semibold">التصاميم والرسوم المتحركة</span>.
        </>
      ),
      pt: (
        <>
          Ele transformou a <span className="text-text font-semibold">extensão de campus</span> em um
          site de verdade e depois o <span className="text-gold font-semibold">hospedou e publicou online</span>.
          É ele, em especial, por trás dos <span className="text-text font-semibold">designs e das animações</span>.
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
      ja: (
        <>
          彼の<span className="text-text font-semibold">サイバーセキュリティ</span>の専門知識がプロジェクトを
          堅牢にしました：ルートを監査し、脆弱性を追い、{' '}
          <span className="text-[#c97bff] font-semibold">問題になる前にパッチを当てます</span>。
          彼の手をすり抜ける脆弱性はありません。
        </>
      ),
      ar: (
        <>
          خبرته في <span className="text-text font-semibold">الأمن السيبراني</span> حصّنت المشروع:
          يدقّق المسارات، ويطارد الثغرات، و{' '}
          <span className="text-[#c97bff] font-semibold">يرقّعها قبل أن تصبح مشكلة</span>.
          لا ثغرة تفلت من بين يديه.
        </>
      ),
      pt: (
        <>
          A sua expertise em <span className="text-text font-semibold">cibersegurança</span> blindou o
          projeto: ele audita as rotas, caça as falhas e{' '}
          <span className="text-[#c97bff] font-semibold">corrige antes que vire um problema</span>.
          Nenhuma vulnerabilidade escapa por entre os dedos dele.
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
      ja: (
        <>
          プロジェクトの<span className="text-text font-semibold">やっかいな存在</span>です：彼は{' '}
          <span className="text-[#c97bff] font-semibold">アプリをあらゆる方向から酷使し</span>、
          誰も思いつかなかった厄介なケースや悪用を、{' '}
          <span className="text-text font-semibold">プレイヤーが遭遇する前に</span>引き起こします。
        </>
      ),
      ar: (
        <>
          <span className="text-text font-semibold">مثير المتاعب</span> في المشروع: فهو{' '}
          <span className="text-[#c97bff] font-semibold">يعذّب التطبيق</span> في كل الاتجاهات،
          ويُطلق الحالات الملتوية والاستغلالات التي لم يفكّر فيها أحد{' '}
          <span className="text-text font-semibold">قبل أن يقع عليها اللاعبون</span>.
        </>
      ),
      pt: (
        <>
          O <span className="text-text font-semibold">pé no saco</span> do projeto: ele{' '}
          <span className="text-[#c97bff] font-semibold">judia do app</span> de todos os jeitos,
          disparando os casos tortos e os abusos em que ninguém pensou{' '}
          <span className="text-text font-semibold">antes de os jogadores esbarrarem neles</span>.
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
      ja: (
        <>
          彼の<span className="text-text font-semibold">e スポーツの専門知識</span>とランク戦サイトへの
          知見は大きな影響を与えました：アプリを洗練させ読みやすくするための{' '}
          <span className="text-text font-semibold">UX/UI 分析</span>をもたらしたのは彼です。
        </>
      ),
      ar: (
        <>
          <span className="text-text font-semibold">خبرته في الرياضات الإلكترونية</span> ومعرفته بمواقع
          اللعب المصنّف كان لهما وزن كبير: فهو من قدّم <span className="text-text font-semibold">تحليل UX/UI</span> لجعل
          التطبيق واضحًا وسهل القراءة.
        </>
      ),
      pt: (
        <>
          A sua <span className="text-text font-semibold">expertise em e-sport</span> e o seu conhecimento
          dos sites de ranqueado pesaram muito: foi ele quem trouxe a{' '}
          <span className="text-text font-semibold">análise UX/UI</span> para deixar o app limpo e
          legível.
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
  const { lang: _lang } = useI18n();
  const lang: UiLang = _lang;
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
              <span className="ms-auto text-[10px] font-mono font-bold text-muted-2">@{member.login}</span>
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
