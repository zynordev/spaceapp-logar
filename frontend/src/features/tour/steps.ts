// Tour steps. Each step points at REAL UI (a CSS selector), optionally moves
// the app there first (route / detail tab / body region / a real button) and
// shows a short, honest Turkish caption. Same order as docs/VIDEO_SCRIPT.md.
import { api, qs } from '../../lib/api';
import { useApp } from '../../lib/store';
import { requestBodyRegion } from '../body3d/selection';
import type { DetailTabId } from '../../shell/detailTab';
import type { TourId } from './store';

export interface StepCtx {
  missionId: string;
  /** Resolves with the element once it exists (null after `timeoutMs` or when the step was left). */
  waitFor: (selector: string, timeoutMs?: number) => Promise<HTMLElement | null>;
  /** True once the user left this step (stop async work). */
  left: () => boolean;
  /** Short status line under the caption ("Paket hazırlanıyor…"). */
  note: (text: string | null) => void;
}

export interface TourStep {
  id: string;
  /** Video beat this step belongs to (docs/VIDEO_SCRIPT.md). */
  beat: string;
  title: string;
  caption: string;
  /** Honesty line shown under the caption. */
  honest?: string;
  route: 'app' | 'console';
  tab?: DetailTabId;
  /** Element(s) to spotlight; the first match wins. Prefer `data-tour` hooks. */
  target: string[];
  /** Runs before the target is looked up (e.g. open the 3D body panel). */
  before?: (ctx: StepCtx) => void | Promise<void>;
  enter?: (ctx: StepCtx) => void | Promise<void>;
  /** Auto-advance dwell time. */
  ms?: number;
}

interface AlertLite {
  id: string;
  rule_id: string;
  status: string;
}

async function focusAlert(ctx: StepCtx, ruleId: string, metric: string | null) {
  try {
    const list = await api<AlertLite[]>('GET', `/v1/alerts${qs({ mission_id: ctx.missionId, limit: 100 })}`);
    const a = list.find((x) => x.rule_id === ruleId && x.status !== 'RESOLVED');
    const { useVitalsUi } = await import('../vitals/data');
    if (a) useVitalsUi.getState().setActiveAlert(a.id);
    if (metric) useVitalsUi.getState().select(metric, ruleId);
  } catch {
    /* the spotlight still shows the panel; the caption stays true */
  }
}

/** Say what actually happened in this run (escalations are never assumed). */
async function escalationNote(ctx: StepCtx, none: string) {
  try {
    const list = await api<{ priority: string; status: string }[]>('GET', `/v1/sync/escalations${qs({ mission_id: ctx.missionId })}`);
    if (ctx.left()) return;
    if (list.length === 0) ctx.note(none);
    else {
      const crit = list.filter((e) => e.priority === 'CRITICAL').length;
      ctx.note(`Bu görevde ${list.length} öncelikli bildirim oluştu${crit ? ` (${crit} Kritik)` : ''}.`);
    }
  } catch {
    /* 404 on an older server: the panel itself says so */
  }
}

/** Console steps: say when the current delay makes the travel invisible. */
async function delayNote(ctx: StepCtx) {
  try {
    // The console uses the server delay only with its "Sunucu ayarı" preset (the default).
    const preset = (JSON.parse(sessionStorage.getItem('logar.console.delay') ?? '{}') as { preset?: string }).preset ?? 'server';
    if (preset !== 'server') return;
    const s = await api<{ link_delay_seconds: number | null }>('GET', `/v1/sync/status${qs({ mission_id: ctx.missionId })}`);
    if (ctx.left()) return;
    const d = s.link_delay_seconds;
    if (d == null) ctx.note('Sunucuda gecikme ayarlı değil (0 sn kabul edilir). Konsoldan “Mars ortalama” seçin ya da görev profilini Mars yapın.');
    else if (d < 5) ctx.note(`Tek yön gecikme ≈${d.toLocaleString('en-GB', { maximumFractionDigits: 1 })} sn: sinyal hemen ulaşır. Mars profilinde ≈12,5 dk (60× gösterimde ≈12,5 sn).`);
  } catch {
    /* the console shows its own status */
  }
}

/**
 * Mission screen: the big panel shows the 3D body only after a crew card is
 * clicked. Click the selected crew member's card (as a user would) unless the
 * body is already open; never switch to another crew member.
 */
async function openBody(ctx: StepCtx) {
  const scene = await ctx.waitFor('[data-tour="scene"]');
  if (!scene || ctx.left() || scene.dataset.open === 'true') return;
  const crew = useApp.getState().crewId;
  if (!crew) return;
  const btn = await ctx.waitFor(`[data-tour="crew-open"][data-crew="${CSS.escape(crew)}"]`, 8000);
  if (!btn || ctx.left() || btn.getAttribute('aria-pressed') === 'true') return;
  btn.click();
  await ctx.waitFor('[data-tour="scene"][data-open="true"]', 3000);
}

/** The selected crew member's card (open), else any crew card. */
const CREW_CARD = ['[data-tour="crew-card"][data-open="true"]', '[data-tour="crew-card"]', '[data-tour="hud"]'];
const SCENE = ['[data-tour="scene"]', '[data-tour="hud"]'];

function click(el: HTMLElement | null) {
  if (el && !(el as HTMLButtonElement).disabled) el.click();
}

/** Console: prepare the flight-surgeon packet, then press "Onayla (ack)" once every item has reached Earth. */
async function consoleAck(ctx: StepCtx) {
  const panel = await ctx.waitFor('section[aria-labelledby="console-packet-title"]');
  if (!panel || ctx.left()) return;
  const radio = panel.querySelector<HTMLInputElement>('input[name="console-recipient"][value="FLIGHT_SURGEON"]');
  if (radio && !radio.checked) radio.click();
  await new Promise((r) => setTimeout(r, 150));
  if (ctx.left()) return;
  ctx.note('Uçuş cerrahı paketi hazırlanıyor…');
  click(panel.querySelector<HTMLElement>('.console-packet__actions .ui-btn'));
  const deadline = Date.now() + 90_000;
  while (!ctx.left() && Date.now() < deadline) {
    const ack = panel.querySelector<HTMLButtonElement>('.console-packet .ui-btn--primary');
    if (ack && !ack.disabled) {
      ctx.note('Tur, yer ekibi adına “Onayla (ack)” düğmesine bastı (demo).');
      ack.click();
      return;
    }
    if (ack?.disabled) {
      if (panel.querySelector('.console-packet .console-inline-note')) {
        ctx.note('Paketteki öğeler henüz Dünya’ya ulaşmadı; onay hepsi ulaşınca verilecek…');
      } else {
        ctx.note('Onaylanacak yeni öğe yok.');
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ctx.left() && !panel.querySelector('.console-problem')) ctx.note(null);
}

const DECISION_SUPPORT = 'Karar desteği, teşhis değil.';
const SYNTHETIC = 'Veriler sentetik demo senaryosundan; gerçek astronot ölçümü değil.';

export const TOURS: Record<TourId, TourStep[]> = {
  co2: [
    {
      id: 'cabin-co2',
      beat: '0–4 sn',
      title: 'Kabin CO₂ yükseliyor',
      caption: 'Sentetik senaryo kabin CO₂ kısmi basıncını yükseltir. Üst şeritteki CO₂ sütunu değeri, durumu ve eşiğin kaynağını gösterir.',
      honest: SYNTHETIC,
      route: 'app',
      target: ['[data-tour="metric-CABIN_CO2_PARTIAL_PRESSURE"]', '[data-tour="cabin"]', '[data-tour="hud"]'],
      before: openBody,
      enter: () => requestBodyRegion('cabin'),
      ms: 4000,
    },
    {
      id: 'body-cabin',
      beat: '0–4 sn',
      title: '3B haritada kabin bölgesi',
      caption: 'Mürettebat kartı astronotun 3B vücut modelini açar. Kabin ortamı bölgesi işaretlenir; sağda aynı astronotun vital bulguları ve kayıtlı EKG şeridi durur.',
      honest: SYNTHETIC,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('cabin'),
      ms: 4000,
    },
    {
      id: 'body-head',
      beat: '0–4 sn',
      title: 'Astronot baş ağrısı bildiriyor',
      caption: 'Öznel bildirim aynı kurala bağlanır: baş bölgesi de yanar. Sistem iki bulguyu birlikte gösterir.',
      honest: DECISION_SUPPORT,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('head'),
      ms: 4000,
    },
    {
      id: 'action-card',
      beat: '4–10 sn',
      title: 'Eylem kartı: ne yapmalıyım, neden?',
      caption: 'Önceden yazılmış adımlar, her adımın nedeni ve yeniden değerlendirme sayacı. CO₂ eşiği NASA-STD-3001 kaynaklı (STANDART).',
      honest: 'Diğer eşikler DEMO (kanıt sınıfı F): uzman doğrulaması bekliyor. Yazılım araç komutu vermez.',
      route: 'app',
      tab: 'rules',
      target: ['#details .vt-ac', '#details'],
      enter: (ctx) => focusAlert(ctx, 'ENV_CO2_NOMINAL_V1', 'CABIN_CO2_PARTIAL_PRESSURE'),
      ms: 6000,
    },
    {
      id: 'escalation',
      beat: '10–17 sn',
      title: 'Uçuş cerrahına otomatik yükseltme',
      caption: 'Uyarı veya Kritik bir alarm açıldığı anda uçuş cerrahı için öncelikli bildirim kendiliğinden oluşur; kimse düğmeye basmaz.',
      honest: 'Bildirim bağlantı penceresinde yere gider; gemi beklemeden çalışmaya devam eder.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-esc', '.gp-root'],
      enter: (ctx) => escalationNote(ctx, 'Bu senaryoda CO₂ alarmı İzle seviyesinde kaldı: öncelikli bildirim gerekmedi. Otomatik bildirimi “Kırmızı bayrak” turunda görün.'),
      ms: 5000,
    },
    {
      id: 'routing',
      beat: '10–17 sn',
      title: 'Doğru ekibe yönlendirme',
      caption: 'CO₂ ve kabin atmosferi verisi yaşam destek ekibinin paketine; sağlık verisi uçuş cerrahına gider.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-rcp--life_support', '.gp-rcps'],
      ms: 3500,
    },
    {
      id: 'packet',
      beat: '10–17 sn',
      title: 'İmzalı paket',
      caption: 'Paket içeriği sha256 ile özetlenir; sunucuda anahtar varsa HMAC-SHA256 ile imzalanır. Yer, onaylarken özeti doğrular.',
      honest: 'Bütünlük ve kaynak doğrulaması — şifreleme değil.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-rcp--flight_surgeon', '.gp-rcps'],
      enter: async (ctx) => {
        const card = await ctx.waitFor('.gp-rcp--flight_surgeon');
        if (!card || ctx.left() || card.querySelector('.gp-packet')) return;
        click(card.querySelector<HTMLElement>('.gp-actions .gp-btn'));
      },
      ms: 5000,
    },
    {
      id: 'console',
      beat: '17–24 sn',
      title: 'Dünya gecikmeli görür',
      caption: 'Yer kontrol konsolu aynı olayları ışık gecikmesiyle görür. Sayaç, sinyalin Dünya’ya ne zaman ulaşacağını gösterir.',
      honest: 'Gecikme simülasyonu: veriler sunucudan anında gelir, gecikmeyi yalnız bu ekran canlandırır.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
    {
      id: 'ack',
      beat: '24–30 sn',
      title: 'Yer ekibi onaylar',
      caption: 'Uçuş cerrahı paketi ulaştığında yer ekibi onaylar (ack). Tur, onay düğmesine yer ekibi adına basar.',
      honest: 'Oturum açıkken onayı yalnız yer ekibi (GROUND) rolü verebilir.',
      route: 'console',
      target: ['section[aria-labelledby="console-packet-title"]', '.console-main'],
      enter: consoleAck,
      ms: 8000,
    },
    {
      id: 'ack-back',
      beat: '24–30 sn',
      title: 'Onay gemiye dönüyor',
      caption: 'Onay da aynı gecikmeyle gemiye yolculuk eder. Gemi bu sürede kendi karar desteğiyle çalışmayı sürdürür.',
      honest: DECISION_SUPPORT + ' Gecikme simülasyonu.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
  ],
  redflag: [
    {
      id: 'rf-report',
      beat: '0–4 sn',
      title: 'Göğüs ağrısı bildirimi',
      caption: 'Ölçümler normal seyrederken astronot göğüs ağrısı bildirir (kırmızı bayrak). Gövde bölgesi işaretlenir.',
      honest: SYNTHETIC,
      route: 'app',
      target: SCENE,
      before: openBody,
      enter: () => requestBodyRegion('torso'),
      ms: 4000,
    },
    {
      id: 'rf-critical',
      beat: '4–10 sn',
      title: 'Anında KRİTİK',
      caption: 'Kırmızı bayrak ortalama beklemez: mürettebat kartında genel durum hemen Kritik olur, acil durum satırı açık alarmı gösterir. Normal ölçümler ciddi bir olayı dışlamaz.',
      honest: DECISION_SUPPORT,
      route: 'app',
      target: CREW_CARD,
      before: openBody,
      ms: 5000,
    },
    {
      id: 'rf-card',
      beat: '10–17 sn',
      title: 'Acil eylem kartı',
      caption: 'Kart görev prosedürünü öne alır. Alarm ölçümlerle kendiliğinden kapanmaz; ekip değerlendirip kapatır.',
      honest: 'Teşhis konmaz, ilaç veya doz önerilmez.',
      route: 'app',
      tab: 'rules',
      target: ['#details .vt-ac', '#details'],
      enter: (ctx) => focusAlert(ctx, 'RED_FLAG_SYMPTOM_V1', null),
      ms: 6000,
    },
    {
      id: 'rf-escalation',
      beat: '17–24 sn',
      title: 'Uçuş cerrahına KRİTİK bildirim',
      caption: 'Kritik alarm, uçuş cerrahı için öncelikli bildirimi kendiliğinden oluşturur; kimse düğmeye basmaz.',
      route: 'app',
      tab: 'ground',
      target: ['.gp-esc', '.gp-root'],
      enter: (ctx) => escalationNote(ctx, 'Bu görevde henüz öncelikli bildirim görünmüyor.'),
      ms: 5000,
    },
    {
      id: 'rf-console',
      beat: '24–30 sn',
      title: 'Dünya gecikmeyle öğrenir',
      caption: 'Yer ekibi bildirimi ancak sinyal ulaşınca görür. Gecikme uzunsa ilk karar gemideki sağlık sorumlusundadır.',
      honest: 'Gecikme simülasyonu — yalnız gösterim.',
      route: 'console',
      target: ['.console-link-band', '.console-main'],
      enter: delayNote,
      ms: 6000,
    },
  ],
};
