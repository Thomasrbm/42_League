import type { Lang } from '../i18n';

type Dict = Record<string, string>;

/**
 * Traductions du domaine « Réglages » + noms des modes de jeu.
 * Fusionné dans le dictionnaire global par i18n.tsx.
 */
export const dict: Record<Lang, Dict> = {
  fr: {
    // Noms canoniques des modes de jeu
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Échecs',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Fléchettes',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    // Réglages — modes de jeu
    'settings.gameModes.title': 'Modes de jeu',
    'settings.gameModes.hint': 'Tu apparais dans les classements et stats des modes activés.',
    'settings.gameModes.minOne': 'Au moins un mode doit rester actif',

    // Réglages — qualité graphique (palier de perf, cf. lib/perf.ts)
    'settings.quality': 'Qualité graphique',
    'settings.quality.hint':
      'Auto réduit les effets si l’appareil rame, sans rien changer sur les machines puissantes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Élevée',
    'settings.quality.perf': 'Performance',

    // Réglages — notifications push
    'settings.push': 'Notifications push',
    'settings.push.enable': 'Activer sur cet appareil',
    'settings.push.disable': 'Désactiver sur cet appareil',
    'settings.push.enabled': 'Notifications activées — tu seras prévenu même app fermée.',
    'settings.push.disabled': 'Notifications désactivées sur cet appareil.',
    'settings.push.denied':
      'Les notifications sont bloquées par le navigateur. Autorise-les dans les réglages du site pour les activer.',
    'settings.push.error': 'Impossible d’activer les notifications.',
    'settings.push.hint':
      'Défis reçus, scores à valider, matchs de tournoi : prévenu même quand l’app est fermée.',

    // Réglages — cinématiques automatiques
    'settings.cinematics': 'Cinématiques automatiques',
    'settings.cinematics.on': 'Activées',
    'settings.cinematics.off': 'Désactivées',
    'settings.cinematics.hint':
      'Level-up, récompense débloquée, rage, réactions… Les animations liées à tes actions directes (et le narguage) restent.',

    // Réglages — émote de victoire (narguage post-1v1)
    'settings.tauntEmote': 'Émote de victoire',
    'settings.tauntEmote.hint':
      'Montrée au joueur que tu bats en 1v1, à sa prochaine connexion (après l’écran versus).',
    'settings.tauntEmote.saved': 'Émote enregistrée !',
    'settings.tauntEmote.error': 'Impossible d’enregistrer l’émote.',

    // Réglages — compte / divers
    'settings.connectedAs': 'Connecté en tant que',
    'settings.exportError': "Erreur lors de l'export.",
    'settings.deleteError': 'Erreur lors de la suppression.',

    // Sélecteur d'univers (FAB)
    'settings.universe': 'Univers',
    'settings.close': 'Fermer',
    'settings.currentUniverse': 'Univers actuel',
    'settings.changeGame': 'Changer de jeu.',
  },
  en: {
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Chess',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Darts',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    'settings.gameModes.title': 'Game modes',
    'settings.gameModes.hint': 'You appear in the leaderboards and stats of the modes you enable.',
    'settings.gameModes.minOne': 'At least one mode must stay active',

    'settings.quality': 'Graphics quality',
    'settings.quality.hint':
      'Auto trims effects only when the device struggles — nothing changes on powerful machines.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'High',
    'settings.quality.perf': 'Performance',

    'settings.push': 'Push notifications',
    'settings.push.enable': 'Enable on this device',
    'settings.push.disable': 'Disable on this device',
    'settings.push.enabled': 'Notifications on — you’ll be pinged even with the app closed.',
    'settings.push.disabled': 'Notifications disabled on this device.',
    'settings.push.denied':
      'Notifications are blocked by the browser. Allow them in the site settings to enable.',
    'settings.push.error': 'Could not enable notifications.',
    'settings.push.hint':
      'Challenges received, scores to confirm, tournament matches: pinged even when the app is closed.',

    'settings.cinematics': 'Automatic cinematics',
    'settings.cinematics.on': 'Enabled',
    'settings.cinematics.off': 'Disabled',
    'settings.cinematics.hint':
      'Level-up, reward unlocked, rage, reactions… Animations tied to your direct actions (and taunts) stay.',

    'settings.tauntEmote': 'Victory emote',
    'settings.tauntEmote.hint':
      'Shown to the player you beat in a 1v1, on their next visit (after the versus screen).',
    'settings.tauntEmote.saved': 'Emote saved!',
    'settings.tauntEmote.error': 'Could not save the emote.',

    'settings.connectedAs': 'Signed in as',
    'settings.exportError': 'Export failed.',
    'settings.deleteError': 'Deletion failed.',

    'settings.universe': 'Universe',
    'settings.close': 'Close',
    'settings.currentUniverse': 'Current universe',
    'settings.changeGame': 'Change game.',
  },
  es: {
    'game.babyfoot': 'Babyfoot',
    'game.smash': 'Smash',
    'game.chess': 'Ajedrez',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Dardos',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    'settings.gameModes.title': 'Modos de juego',
    'settings.gameModes.hint': 'Apareces en las clasificaciones y estadísticas de los modos activados.',
    'settings.gameModes.minOne': 'Al menos un modo debe permanecer activo',

    'settings.quality': 'Calidad gráfica',
    'settings.quality.hint':
      'Auto reduce los efectos solo si el dispositivo va lento, sin cambiar nada en equipos potentes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Alta',
    'settings.quality.perf': 'Rendimiento',

    'settings.push': 'Notificaciones push',
    'settings.push.enable': 'Activar en este dispositivo',
    'settings.push.disable': 'Desactivar en este dispositivo',
    'settings.push.enabled': 'Notificaciones activadas — te avisaremos incluso con la app cerrada.',
    'settings.push.disabled': 'Notificaciones desactivadas en este dispositivo.',
    'settings.push.denied':
      'El navegador bloquea las notificaciones. Permítelas en los ajustes del sitio para activarlas.',
    'settings.push.error': 'No se pudieron activar las notificaciones.',
    'settings.push.hint':
      'Desafíos recibidos, resultados por confirmar, partidos de torneo: aviso incluso con la app cerrada.',

    'settings.cinematics': 'Cinemáticas automáticas',
    'settings.cinematics.on': 'Activadas',
    'settings.cinematics.off': 'Desactivadas',
    'settings.cinematics.hint':
      'Subida de nivel, recompensa, rabia, reacciones… Las animaciones de tus acciones directas (y las burlas) se mantienen.',

    'settings.tauntEmote': 'Emote de victoria',
    'settings.tauntEmote.hint':
      'Se muestra al jugador que vences en 1v1 en su próxima visita (tras la pantalla de versus).',
    'settings.tauntEmote.saved': '¡Emote guardado!',
    'settings.tauntEmote.error': 'No se pudo guardar el emote.',

    'settings.connectedAs': 'Conectado como',
    'settings.exportError': 'Error al exportar.',
    'settings.deleteError': 'Error al eliminar.',

    'settings.universe': 'Universo',
    'settings.close': 'Cerrar',
    'settings.currentUniverse': 'Universo actual',
    'settings.changeGame': 'Cambiar de juego.',
  },
  ja: {
    'game.babyfoot': 'テーブルサッカー',
    'game.smash': 'スマブラ',
    'game.chess': 'チェス',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'ダーツ',
    'game.coding': 'Coding',
    'game.pokemon': 'ポケモン',

    'settings.gameModes.title': 'ゲームモード',
    'settings.gameModes.hint': '有効にしたモードのランキングと統計に表示されます。',
    'settings.gameModes.minOne': '少なくとも1つのモードを有効にしておく必要があります',

    'settings.quality': 'グラフィック品質',
    'settings.quality.hint':
      '「自動」はデバイスが重いときだけ効果を減らし、高性能なマシンでは何も変更しません。',
    'settings.quality.auto': '自動',
    'settings.quality.high': '高',
    'settings.quality.perf': 'パフォーマンス',

    'settings.push': 'プッシュ通知',
    'settings.push.enable': 'このデバイスで有効にする',
    'settings.push.disable': 'このデバイスで無効にする',
    'settings.push.enabled': '通知が有効です — アプリを閉じていても通知が届きます。',
    'settings.push.disabled': 'このデバイスで通知が無効です。',
    'settings.push.denied':
      '通知はブラウザによってブロックされています。有効にするにはサイトの設定で許可してください。',
    'settings.push.error': '通知を有効にできませんでした。',
    'settings.push.hint':
      '受け取ったチャレンジ、承認待ちのスコア、トーナメントの試合：アプリを閉じていても通知されます。',

    'settings.cinematics': '自動シネマティック',
    'settings.cinematics.on': '有効',
    'settings.cinematics.off': '無効',
    'settings.cinematics.hint':
      'レベルアップ、報酬解放、レイジ、リアクションなど。自分の直接の操作に関連するアニメーション（と挑発）は残ります。',

    'settings.tauntEmote': '勝利エモート',
    'settings.tauntEmote.hint':
      '1v1で倒した相手に、次回のログイン時に表示されます（versus画面のあと）。',
    'settings.tauntEmote.saved': 'エモートを保存しました！',
    'settings.tauntEmote.error': 'エモートを保存できませんでした。',

    'settings.connectedAs': 'ログイン中：',
    'settings.exportError': 'エクスポート中にエラーが発生しました。',
    'settings.deleteError': '削除中にエラーが発生しました。',

    'settings.universe': 'ユニバース',
    'settings.close': '閉じる',
    'settings.currentUniverse': '現在のユニバース',
    'settings.changeGame': 'ゲームを変更。',
  },
  ar: {
    'game.babyfoot': 'بيبي فوت',
    'game.smash': 'سماش',
    'game.chess': 'الشطرنج',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'الدارتس',
    'game.coding': 'Coding',
    'game.pokemon': 'بوكيمون',

    'settings.gameModes.title': 'أنماط اللعب',
    'settings.gameModes.hint': 'تظهر في تصنيفات وإحصائيات الأنماط التي تفعّلها.',
    'settings.gameModes.minOne': 'يجب أن يبقى نمط واحد على الأقل مفعّلًا',

    'settings.quality': 'جودة الرسومات',
    'settings.quality.hint':
      'يقلّل «تلقائي» التأثيرات فقط عندما يتعثّر الجهاز، دون تغيير أي شيء على الأجهزة القوية.',
    'settings.quality.auto': 'تلقائي',
    'settings.quality.high': 'عالية',
    'settings.quality.perf': 'الأداء',

    'settings.push': 'الإشعارات الفورية',
    'settings.push.enable': 'تفعيل على هذا الجهاز',
    'settings.push.disable': 'تعطيل على هذا الجهاز',
    'settings.push.enabled': 'الإشعارات مفعّلة — سيتم تنبيهك حتى مع إغلاق التطبيق.',
    'settings.push.disabled': 'الإشعارات معطّلة على هذا الجهاز.',
    'settings.push.denied':
      'المتصفّح يحظر الإشعارات. اسمح بها في إعدادات الموقع لتفعيلها.',
    'settings.push.error': 'تعذّر تفعيل الإشعارات.',
    'settings.push.hint':
      'التحديات المستلمة، النتائج بانتظار التأكيد، مباريات البطولة: يتم تنبيهك حتى عند إغلاق التطبيق.',

    'settings.cinematics': 'المشاهد السينمائية التلقائية',
    'settings.cinematics.on': 'مفعّلة',
    'settings.cinematics.off': 'معطّلة',
    'settings.cinematics.hint':
      'ارتقاء المستوى، مكافأة مفتوحة، غضب، ردود أفعال… تبقى الرسوم المتحركة المرتبطة بأفعالك المباشرة (والاستفزاز).',

    'settings.tauntEmote': 'إيموت النصر',
    'settings.tauntEmote.hint':
      'يُعرض للاعب الذي تهزمه في 1v1 عند تسجيل دخوله التالي (بعد شاشة المواجهة).',
    'settings.tauntEmote.saved': 'تم حفظ الإيموت!',
    'settings.tauntEmote.error': 'تعذّر حفظ الإيموت.',

    'settings.connectedAs': 'مُسجَّل الدخول باسم',
    'settings.exportError': 'خطأ أثناء التصدير.',
    'settings.deleteError': 'خطأ أثناء الحذف.',

    'settings.universe': 'العالم',
    'settings.close': 'إغلاق',
    'settings.currentUniverse': 'العالم الحالي',
    'settings.changeGame': 'تغيير اللعبة.',
  },
  pt: {
    'game.babyfoot': 'Pebolim',
    'game.smash': 'Smash',
    'game.chess': 'Xadrez',
    'game.streetfighter': 'Street Fighter',
    'game.flechettes': 'Dardos',
    'game.coding': 'Coding',
    'game.pokemon': 'Pokémon',

    'settings.gameModes.title': 'Modos de jogo',
    'settings.gameModes.hint': 'Você aparece nas classificações e estatísticas dos modos que ativar.',
    'settings.gameModes.minOne': 'Pelo menos um modo deve permanecer ativo',

    'settings.quality': 'Qualidade gráfica',
    'settings.quality.hint':
      'O modo Auto reduz os efeitos apenas quando o dispositivo trava, sem mudar nada em máquinas potentes.',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'Alta',
    'settings.quality.perf': 'Desempenho',

    'settings.push': 'Notificações push',
    'settings.push.enable': 'Ativar neste dispositivo',
    'settings.push.disable': 'Desativar neste dispositivo',
    'settings.push.enabled': 'Notificações ativadas — você será avisado mesmo com o app fechado.',
    'settings.push.disabled': 'Notificações desativadas neste dispositivo.',
    'settings.push.denied':
      'As notificações estão bloqueadas pelo navegador. Permita-as nas configurações do site para ativá-las.',
    'settings.push.error': 'Não foi possível ativar as notificações.',
    'settings.push.hint':
      'Desafios recebidos, placares a confirmar, partidas de torneio: avisado mesmo com o app fechado.',

    'settings.cinematics': 'Cinemáticas automáticas',
    'settings.cinematics.on': 'Ativadas',
    'settings.cinematics.off': 'Desativadas',
    'settings.cinematics.hint':
      'Subida de nível, recompensa desbloqueada, raiva, reações… As animações ligadas às suas ações diretas (e as provocações) permanecem.',

    'settings.tauntEmote': 'Emote de vitória',
    'settings.tauntEmote.hint':
      'Mostrado ao jogador que você vence no 1v1, no próximo acesso dele (após a tela de versus).',
    'settings.tauntEmote.saved': 'Emote salvo!',
    'settings.tauntEmote.error': 'Não foi possível salvar o emote.',

    'settings.connectedAs': 'Conectado como',
    'settings.exportError': 'Erro ao exportar.',
    'settings.deleteError': 'Erro ao excluir.',

    'settings.universe': 'Universo',
    'settings.close': 'Fechar',
    'settings.currentUniverse': 'Universo atual',
    'settings.changeGame': 'Trocar de jogo.',
  },
};
