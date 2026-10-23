// Loaded by index.html before the app, as a file rather than inline so the
// desktop app's content policy (script-src 'self') lets it run.
// Splash text in the language the app starts in: the saved choice, else the browser's, else English.
// The table holds the splash's five strings per language: waking, still going, reload, downloading, aria label.
(function () {
  var T = {
    en: ['waking the world…', 'still going. big worlds can take a little while to wake up.', 'reload', 'downloading', 'Loading The Human Box'],
    de: ['Welt wird geweckt…', 'Es läuft noch. Große Welten brauchen einen Moment zum Aufwachen.', 'neu laden', 'lädt herunter', 'The Human Box wird geladen'],
    es: ['despertando el mundo…', 'Sigue en marcha. Los mundos grandes pueden tardar un poco en despertar.', 'recargar', 'descargando', 'Cargando The Human Box'],
    fr: ['réveil du monde…', 'Toujours en cours. Les grands mondes peuvent mettre un peu de temps à se réveiller.', 'recharger', 'téléchargement', 'Chargement de The Human Box'],
    it: ['il mondo si sta risvegliando…', 'Ancora in corso. I mondi grandi possono impiegare un po’ di tempo a risvegliarsi.', 'ricarica', 'download in corso', 'Caricamento di The Human Box'],
    ja: ['世界を目覚めさせています…', 'まだ読み込み中です。大きな世界は起動に少し時間がかかることがあります。', '再読み込み', 'ダウンロード中', 'The Human Box を読み込み中'],
    ko: ['세상을 깨우는 중…', '아직 진행 중입니다. 큰 세계는 깨어나는 데 잠시 시간이 걸릴 수 있습니다.', '새로고침', '다운로드 중', 'The Human Box 불러오는 중'],
    pl: ['budzenie świata…', 'Wciąż trwa. Duże światy mogą budzić się chwilę dłużej.', 'przeładuj', 'pobieranie', 'Wczytywanie The Human Box'],
    'pt-BR': ['acordando o mundo…', 'Ainda em andamento. Mundos grandes podem levar um tempo para acordar.', 'recarregar', 'baixando', 'Carregando The Human Box'],
    ru: ['мир просыпается…', 'Всё ещё загружается. Большим мирам нужно немного времени, чтобы проснуться.', 'перезагрузить', 'загрузка', 'Загрузка The Human Box'],
    tr: ['dünya uyandırılıyor…', 'Hâlâ devam ediyor. Büyük dünyaların uyanması biraz zaman alabilir.', 'yeniden yükle', 'indiriliyor', 'The Human Box yükleniyor'],
    uk: ['світ прокидається…', 'Ще триває. Великим світам може знадобитися трохи часу, щоб прокинутися.', 'перезавантажити', 'завантаження', 'Завантаження The Human Box'],
    'zh-CN': ['正在唤醒世界…', '仍在进行中。大型世界需要一点时间才能醒来。', '重新加载', '下载中', '正在加载 The Human Box']
  };
  function match(tag) {
    tag = String(tag).toLowerCase();
    var base = tag.split('-')[0], found = null;
    for (var c in T) {
      var l = c.toLowerCase();
      if (l === tag) return c;
      if (!found && l.split('-')[0] === base) found = c;
    }
    return found;
  }
  var tags = [];
  try { var saved = localStorage.getItem('thb-locale'); if (saved) tags.push(saved); } catch (e) {}
  tags = tags.concat(navigator.languages || [navigator.language || 'en']);
  var code = 'en';
  for (var i = 0; i < tags.length; i++) { var m = match(tags[i]); if (m) { code = m; break; } }
  var s = T[code];
  document.documentElement.lang = code;
  document.getElementById('thb-progress-text').textContent = s[0];
  document.querySelector('#thb-splash-hint span').textContent = s[1];
  document.getElementById('thb-splash-reload').textContent = s[2];
  document.getElementById('thb-splash').setAttribute('aria-label', s[4]);
  window.thbSplash = { downloading: s[3] };
})();
