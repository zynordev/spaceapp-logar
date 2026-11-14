/* =========================================================
   SpaceApp Logar — Astronot Sağlık Karar Desteği (tek sayfa panel)
   Vanilla JS; CDN yok, build yok, harici istek yok.
   Sunucudan gelen TÜM metinler textContent / createTextNode ile basılır.
   Bölümler:
     1. Sabitler ve sözlükler
     2. Yardımcılar (DOM, biçimlendirme)
     3. API katmanı (+ mock anahtarı)
     4. Durum (state)
     5. Veri yenileme döngüsü
     6. Çizim: genel durum, hatırlatmalar, kartlar
     7. Çizim: ana zaman grafiği, sparkline
     8. Çizim: neden / eylem kartı / alarmlar
     9. Çizim: öznel durum, laboratuvar
    10. Demo senaryoları
    11. Başlatma
    12. MOCK katmanı (?mock=1)
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. SABİTLER VE SÖZLÜKLER
   --------------------------------------------------------- */
const REFRESH_MS = 3000;
const CHECKIN_STALE_MS = 4 * 60 * 60 * 1000;
const TR = 'tr-TR';
const PARAMS = new URLSearchParams(location.search);
const MOCK_MODE = PARAMS.get('mock') === '1';

// Dikkat seviyesi: renk + ikon + metin (renk tek başına anlam taşımaz).
// rank: "en kötü" seçimi için; UNKNOWN, NORMAL'den yüksektir (kötü veri != normal sağlık).
const ATTENTION = {
  NORMAL:   { label: 'Normal',     icon: '✓', cls: 'att-normal',   rank: 1, desc: 'Etkin bir dikkat kuralı yok.' },
  UNKNOWN:  { label: 'Bilinmiyor', icon: '?',      cls: 'att-unknown',  rank: 2, desc: 'Güvenilir değerlendirme için yeterli veri yok. Bu "normal" anlamına gelmez.' },
  WATCH:    { label: 'İzle',       icon: '!',      cls: 'att-watch',    rank: 3, desc: 'Bir ölçüm izlenmeli; acil olmayan bir yeniden kontrol gerekebilir.' },
  ALERT:    { label: 'Uyarı',      icon: '▲', cls: 'att-alert',    rank: 4, desc: 'Eylem kartındaki adımlar kısa sürede uygulanmalı; görev prosedürü önceliklidir.' },
  CRITICAL: { label: 'Kritik',     icon: '✖', cls: 'att-critical', rank: 5, desc: 'Acil prosedür hemen açılmalı ve ekip sağlık sorumlusu bilgilendirilmelidir.' },
};
const QUALITY = {
  VALID:   { label: 'Geçerli', icon: '✓', cls: 'q-valid' },
  SUSPECT: { label: 'Şüpheli', icon: '!',      cls: 'q-suspect' },
  MISSING: { label: 'Eksik',   icon: '∅', cls: 'q-missing' },
  FAULT:   { label: 'Arıza',   icon: '✖', cls: 'q-fault' },
};
const ALERT_STATUS = {
  OPEN:         { label: 'Açık',    icon: '●', cls: 'st-open' },
  ACKNOWLEDGED: { label: 'Görüldü', icon: '✓', cls: 'st-ack' },
  RESOLVED:     { label: 'Çözüldü', icon: '✓✓', cls: 'st-res' },
};
const POSITION = {
  BELOW:  { label: 'Altında',  icon: '▼' },
  WITHIN: { label: 'Aralıkta', icon: '●' },
  ABOVE:  { label: 'Üstünde',  icon: '▲' },
};
const COMPARISON = { '<': '<', '>': '>', '<=': '≤', '>=': '≥', '==': '=', LT: '<', GT: '>', LTE: '≤', GTE: '≥' };
const PHASE = { PRE_FLIGHT: 'Uçuş öncesi', IN_FLIGHT: 'Uçuş sırasında', POST_FLIGHT: 'Uçuş sonrası', BASELINE: 'Başlangıç' };
const TIME_SCALE = { acute: 'Akut', subacute: 'Alt akut' };

const LAB_LABELS = {
  GLUCOSE: 'Glukoz', SODIUM: 'Sodyum', POTASSIUM: 'Potasyum', CREATININE: 'Kreatinin',
  WBC: 'Beyaz kan hücresi', HEMOGLOBIN: 'Hemoglobin', PLATELETS: 'Trombosit', ALT: 'ALT', AST: 'AST',
};

// Öznel durum alanları: API anahtarı -> etiket
const CHECKIN_FIELDS = [
  ['fatigue', 'Yorgunluk'], ['dizziness', 'Baş dönmesi'], ['nausea', 'Bulantı'],
  ['pain', 'Ağrı'], ['mood_distress', 'Ruh hali sıkıntısı'],
];
const SEVERITY_WORDS = ['Yok', 'Hafif', 'Orta', 'Şiddetli', 'Çok şiddetli'];

// /v1/metrics ulaşılamazsa yedek liste (normalde etiketler API'den gelir).
const FALLBACK_METRICS = [
  { metric: 'HEART_RATE', label: 'Kalp hızı', unit: 'bpm', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SPO2', label: 'SpO2', unit: '%', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'RESPIRATION_RATE', label: 'Solunum hızı', unit: '/dk', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'BODY_TEMPERATURE', label: 'Vücut sıcaklığı', unit: '°C', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SYSTOLIC_BP', label: 'Sistolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'DIASTOLIC_BP', label: 'Diyastolik tansiyon', unit: 'mmHg', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'SLEEP_DURATION', label: 'Uyku süresi', unit: 'h', target_type: 'CREW_MEMBER', category: 'vital' },
  { metric: 'CABIN_CO2_PARTIAL_PRESSURE', label: 'Kabin CO₂ kısmi basıncı', unit: 'mmHg', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_O2_FRACTION', label: 'Kabin O₂ oranı', unit: '%', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'CABIN_PRESSURE', label: 'Kabin basıncı', unit: 'kPa', target_type: 'ENVIRONMENT', category: 'environment' },
  { metric: 'RADIATION_DOSE_RATE', label: 'Radyasyon doz hızı', unit: 'µSv/h', target_type: 'ENVIRONMENT', category: 'environment' },
];

// "Bu ölçüm neden önemli?" — genel bilgi; teşhis/tedavi dili yok.
// why: neden izlenir; watch: ne zaman dikkat edilir (genel).
const GENERIC_NEXT = ' Ne yapılacağı için eylem kartına ve görev prosedürüne bakın.';
const METRIC_INFO = {
  HEART_RATE: {
    why: 'Kalp hızı dinlenme, aktivite ve stres bağlamında kardiyovasküler yükü gösterir.',
    watch: 'Dinlenmedeyken kişisel başlangıç değerinden belirgin ve süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  SPO2: {
    why: 'SpO2, kandaki oksijen satürasyonunun parmak/kulak sensörüyle tahmin edilen yüzdesidir.',
    watch: 'Değer belirlenen eşiğin altında bir süre kaldığında; sensör hatası olasılığı için ölçüm tekrarlanmalıdır.',
  },
  RESPIRATION_RATE: {
    why: 'Solunum hızı, dakikadaki nefes sayısıdır ve fiziksel yük ile ortam koşullarına duyarlıdır.',
    watch: 'Dinlenmedeyken süreli yükselme, özellikle kalp hızı veya belirtilerle birlikte görüldüğünde.',
  },
  BODY_TEMPERATURE: {
    why: 'Vücut sıcaklığı, kişisel başlangıca göre süreli değişimi izlemek için kullanılır.',
    watch: 'Tek ölçüm yerine, kişisel başlangıçtan süreli sapma görüldüğünde.',
  },
  SYSTOLIC_BP: {
    why: 'Sistolik tansiyon, kalp atarken damarlardaki basıncı gösterir.',
    watch: 'Kişisel başlangıçtan süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  DIASTOLIC_BP: {
    why: 'Diyastolik tansiyon, kalpler dinlenirken damarlardaki basıncı gösterir.',
    watch: 'Kişisel başlangıçtan süreli sapma ya da eşlik eden belirtiler olduğunda.',
  },
  SLEEP_DURATION: {
    why: 'Uyku süresi, toparlanma ve performans bağlamında yorgunluk yükünü anlamaya yardım eder.',
    watch: 'Birkaç gece üst üste kişisel düzenin belirgin altında kalındığında.',
  },
  CABIN_CO2_PARTIAL_PRESSURE: {
    why: 'Kabin CO₂ kısmi basıncı, havalandırma ve yaşam destek sisteminin etkinliğini yansıtan çevre ölçümüdür.',
    watch: 'Saatlik ortalama nominal habitat sınırını aştığında ve baş ağrısı gibi öznel belirtiler eşlik ettiğinde.',
  },
  CABIN_O2_FRACTION: {
    why: 'Kabin O₂ oranı, solunan havadaki oksijen payını gösterir.',
    watch: 'Görev için tanımlı aralığın dışına çıktığında.',
  },
  CABIN_PRESSURE: {
    why: 'Kabin basıncı, habitatın yapısal ve solunum güvenliği için temel çevre ölçümüdür.',
    watch: 'Görev için tanımlı aralıktan sapma ya da beklenmeyen düşüş eğilimi görüldüğünde.',
  },
  RADIATION_DOSE_RATE: {
    why: 'Radyasyon doz hızı, ortamdaki iyonlaştırıcı radyasyon düzeyini ve birikimli maruziyeti izlemeye yarar.',
    watch: 'Doz hızı beklenen düzeyin üzerine çıktığında veya görev uyarıları verildiğinde.',
  },
};

/* ---------------------------------------------------------
   2. YARDIMCILAR
   --------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);

// Güvenli DOM üretici: string çocuklar metin düğümü olur (HTML olarak yorumlanmaz).
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    n.append(c);
  }
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const clear = (n) => n.replaceChildren();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const toMs = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };

function fmtNum(v, max = 2) {
  if (!isNum(v)) return '—';
  return v.toLocaleString(TR, { maximumFractionDigits: max });
}
function fmtSigned(v, unit) {
  if (!isNum(v)) return '—';
  const s = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString(TR, { maximumFractionDigits: 2 });
  return unit ? `${s} ${unit}` : s;
}
function fmtDateTime(iso, withSeconds = false) {
  const t = toMs(iso);
  if (t == null) return '—';
  const o = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  if (withSeconds) o.second = '2-digit';
  // Gerçek OSDR verisi gibi başka yıllara ait tarihlerde yılı da göster.
  if (new Date(t).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return new Date(t).toLocaleString(TR, o);
}
function fmtClock(iso) {
  const t = toMs(iso);
  return t == null ? '—' : new Date(t).toLocaleTimeString(TR, { hour: '2-digit', minute: '2-digit' });
}
function relTime(iso) {
  const t = toMs(iso);
  if (t == null) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < -60) return 'gelecekte';
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}
function qs(obj) {
  const p = Object.entries(obj).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return p.length ? `?${p.join('&')}` : '';
}
function safeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
}
function cmpSymbol(c) { return COMPARISON[c] || c || ''; }

function attBadge(att, big = false) {
  const a = ATTENTION[att] || ATTENTION.UNKNOWN;
  return el('span', { class: `badge ${a.cls}${big ? ' big' : ''}` }, el('span', { class: 'bi', 'aria-hidden': 'true', text: a.icon }), a.label);
}
function qualityBadge(q) {
  const d = QUALITY[q] || { label: q || '—', icon: '?', cls: 'q-missing' };
  return el('span', { class: `badge ${d.cls}`, title: 'Veri kalitesi' }, el('span', { class: 'bi', 'aria-hidden': 'true', text: d.icon }), `Veri: ${d.label}`);
}
function validationBadge(v) {
  if (v === 'DEMO_PENDING_REVIEW') return el('span', { class: 'badge demo' }, 'DEMO — uzman doğrulaması bekliyor');
  if (v === 'APPROVED') return el('span', { class: 'badge approved' }, el('span', { class: 'bi', 'aria-hidden': 'true', text: '✓' }), 'Doğrulanmış');
  return v ? el('span', { class: 'badge q-missing' }, String(v)) : null;
}
function statusBadge(s) {
  const d = ALERT_STATUS[s] || { label: s || '—', icon: '?', cls: 'st-res' };
  return el('span', { class: `badge ${d.cls}` }, el('span', { class: 'bi', 'aria-hidden': 'true', text: d.icon }), d.label);
}

// Bölüm bazlı önbellek: veri değişmediyse yeniden çizme (odak/seçim kaybını önler).
const renderSigs = {};
function memo(name, sig, fn) {
  const s = typeof sig === 'string' ? sig : JSON.stringify(sig);
  if (renderSigs[name] === s) return;
  renderSigs[name] = s;
  fn();
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

/* ---------------------------------------------------------
   3. API KATMANI
   --------------------------------------------------------- */
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
async function api(method, path, body, timeoutMs = 8000) {
  if (MOCK_MODE) return mockApi(method, path, body);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    if (res.status === 204) return null;
    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', 0); // ağ hatası / zaman aşımı / bozuk JSON
  } finally {
    clearTimeout(to);
  }
}

/* ---------------------------------------------------------
   4. DURUM (STATE)
   --------------------------------------------------------- */
const state = {
  metrics: [], missions: [], scenarios: [],
  missionId: null, crewId: null, envId: null,
  status: null, alerts: [], labs: null, series: {},
  selectedMetric: null, selectedRuleId: null, alertCardId: null,
  scenarioId: null, runResult: null, running: false,
  offline: false, loaded: false,
};

const currentMission = () => state.missions.find((m) => m.mission_id === state.missionId) || null;
const metricInfo = (m) => state.metrics.find((x) => x.metric === m) || { metric: m, label: m || '', unit: '', category: 'vital' };
const rulesAll = () => (state.status && Array.isArray(state.status.rules)) ? state.status.rules : [];
const ruleRank = (r) => (ATTENTION[r.health_attention] || ATTENTION.UNKNOWN).rank;
function worstRule(list) {
  let best = null;
  for (const r of list) if (!best || ruleRank(r) > ruleRank(best)) best = r;
  return best;
}
function rulesForMetric(m) {
  const all = rulesAll();
  const primary = all.filter((r) => r.metric === m);
  return primary.length ? primary : all.filter((r) => Array.isArray(r.related_metrics) && r.related_metrics.includes(m));
}
function selectedRule() {
  const all = rulesAll();
  return all.find((r) => r.rule_id === state.selectedRuleId) || worstRule(rulesForMetric(state.selectedMetric)) || null;
}
function seriesPoints(m) {
  const s = state.series[m];
  return s && Array.isArray(s.points) ? s.points : [];
}
const lastValuePoint = (pts) => { for (let i = pts.length - 1; i >= 0; i--) if (isNum(pts[i].value)) return pts[i]; return null; };

function selectMetric(m, ruleId = null) {
  state.selectedMetric = m;
  state.selectedRuleId = ruleId;
  state.alertCardId = null;
  renderAll();
}

function resetMissionData() {
  state.status = null; state.alerts = []; state.labs = null; state.series = {};
  state.selectedMetric = null; state.selectedRuleId = null; state.alertCardId = null;
  for (const k of Object.keys(renderSigs)) delete renderSigs[k];
}

function applyMissionSelection(id) {
  state.missionId = id;
  const m = currentMission();
  state.crewId = m && m.crew_member_ids && m.crew_member_ids[0] || null;
  state.envId = m && m.environment_target_ids && m.environment_target_ids[0] || null;
}

/* ---------------------------------------------------------
   5. VERİ YENİLEME DÖNGÜSÜ
   --------------------------------------------------------- */
let refreshing = false;
let pendingRefresh = false;
let timer = null;

function scheduleNext() {
  clearTimeout(timer);
  if (document.hidden) return; // sekme gizliyse durdur
  timer = setTimeout(refresh, REFRESH_MS);
}

async function refresh() {
  clearTimeout(timer);
  if (refreshing) { pendingRefresh = true; return; }
  refreshing = true;
  try {
    await refreshOnce();
  } catch (e) {
    console.error('Yenileme hatası', e); // çökme olmasın
  } finally {
    refreshing = false;
    if (pendingRefresh) { pendingRefresh = false; refresh(); } else scheduleNext();
  }
}

async function refreshOnce() {
  // Metrik tanımları (başarılı olana dek tekrar dene)
  if (!state.metrics.length) {
    try { state.metrics = await api('GET', '/v1/metrics'); } catch (e) { /* yedek listeye düşülür */ }
    if (!Array.isArray(state.metrics) || !state.metrics.length) state.metrics = [];
  }
  const metrics = state.metrics.length ? state.metrics : FALLBACK_METRICS;

  // Görevler
  let missions;
  try {
    missions = await api('GET', '/v1/missions');
    if (!Array.isArray(missions)) throw new ApiError('bad', 0);
  } catch (e) {
    setOffline(true);
    renderAll();
    return;
  }
  state.missions = missions;
  if (!state.missionId || !currentMission()) {
    const changed = !!state.missionId;
    if (changed) resetMissionData();
    applyMissionSelection(missions.length ? missions[0].mission_id : null);
  }
  state.loaded = true;
  if (!state.missionId) { setOffline(false); renderAll(); return; }

  const mid = state.missionId, crew = state.crewId, env = state.envId;
  const isLive = () => state.missionId === mid; // görev değiştiyse eski yanıtı at

  const jobs = [];
  jobs.push(crew
    ? api('GET', `/v1/crew/${encodeURIComponent(crew)}/status${qs({ mission_id: mid, environment_target_id: env })}`)
    : Promise.resolve(null));
  jobs.push(api('GET', `/v1/alerts${qs({ mission_id: mid, limit: 50 })}`));
  jobs.push(crew
    ? api('GET', `/v1/crew/${encodeURIComponent(crew)}/lab-results${qs({ mission_id: mid })}`)
    : Promise.resolve(null));
  for (const m of metrics) {
    const target = m.category === 'environment' ? env : crew;
    jobs.push(target
      ? api('GET', `/v1/measurements${qs({ mission_id: mid, target_id: target, metric: m.metric, limit: 500 })}`)
      : Promise.resolve(null));
  }
  const res = await Promise.allSettled(jobs);
  if (!isLive()) return;

  const [rStatus, rAlerts, rLabs, ...rSeries] = res;
  // Durum çağrısı ağ/sunucu hatasıyla düşerse "Sunucuya ulaşılamıyor"
  const statusFailed = crew && rStatus.status === 'rejected';
  setOffline(!!statusFailed);
  if (rStatus.status === 'fulfilled' && rStatus.value) state.status = rStatus.value;
  if (rAlerts.status === 'fulfilled' && Array.isArray(rAlerts.value)) state.alerts = rAlerts.value;
  if (rLabs.status === 'fulfilled') state.labs = rLabs.value;
  else if (rLabs.reason && rLabs.reason.status > 0 && rLabs.reason.status < 500) state.labs = null; // 404 vb.: veri yok
  metrics.forEach((m, i) => {
    const r = rSeries[i];
    if (r.status === 'fulfilled' && r.value) state.series[m.metric] = r.value;
  });

  // İlk açılışta: en kötü kuralın ölçümü, yoksa veri olan ilk ölçüm
  if (!state.selectedMetric || !metrics.some((m) => m.metric === state.selectedMetric)) {
    const w = worstRule(rulesAll().filter((r) => r.metric));
    const firstWithData = metrics.find((m) => seriesPoints(m.metric).length);
    state.selectedMetric = (w && w.metric) || (firstWithData && firstWithData.metric) || (metrics[0] && metrics[0].metric) || null;
    state.selectedRuleId = null;
  }
  renderAll();
}

function setOffline(v) {
  state.offline = v;
  $('#offlineBanner').hidden = !v;
}

/* ---------------------------------------------------------
   6. ÇİZİM: genel durum, hatırlatmalar, kartlar
   --------------------------------------------------------- */
function renderAll() {
  const a = document.activeElement;
  const fk = a && a.dataset ? a.dataset.fk : null;

  const hasMission = !!state.missionId;
  const showEmpty = state.loaded && !hasMission;
  $('#dashboard').hidden = !hasMission;
  $('#emptyState').hidden = !(showEmpty || (!state.loaded && state.offline));
  if (!state.loaded && state.offline) {
    $('#emptyTitle').textContent = 'Sunucuya ulaşılamıyor';
    $('#emptyText').textContent = 'Sunucu yanıt verince veriler otomatik yüklenecek.';
  } else {
    $('#emptyTitle').textContent = 'Henüz görev yok';
    $('#emptyText').textContent = 'Bir demo senaryosu çalıştırın.';
  }
  renderMissionSelect();
  if (hasMission) {
    renderOverall();
    renderReminders();
    renderCards();
    renderChart();
    renderWhy();
    renderAction();
    renderAlerts();
    renderLatestCheckin();
    renderLabs();
  }
  if (fk) {
    const n = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (n && n !== document.activeElement) n.focus({ preventScroll: true });
  }
}

function renderMissionSelect() {
  memo('missionSelect', [state.missions.map((m) => [m.mission_id, m.scenario_id, m.last_observed_at]), state.missionId, state.crewId], () => {
    const sel = $('#missionSelect');
    clear(sel);
    if (!state.missions.length) sel.append(el('option', { value: '', text: 'Görev yok' }));
    for (const m of state.missions) {
      const label = `${m.scenario_id || 'görev'} · ${fmtDateTime(m.last_observed_at)}`;
      sel.append(el('option', { value: m.mission_id, title: m.mission_id, text: label }));
    }
    sel.value = state.missionId || '';
    sel.disabled = !state.missions.length;
    const mission = currentMission();
    const crews = (mission && mission.crew_member_ids) || [];
    $('#crewField').hidden = crews.length <= 1;
    const cs = $('#crewSelect');
    clear(cs);
    for (const c of crews) cs.append(el('option', { value: c, text: c }));
    cs.value = state.crewId || '';
  });
}

function renderOverall() {
  const st = state.status;
  const rules = rulesAll();
  memo('overall', [st && st.overall_attention, st && st.generated_at, rules.map((r) => [r.rule_id, r.health_attention]), st && st.limitations, state.offline], () => {
    const box = $('#overall');
    clear(box);
    const att = (st && ATTENTION[st.overall_attention]) ? st.overall_attention : 'UNKNOWN';
    const a = ATTENTION[att];
    box.className = `panel overall ${a.cls}`;
    box.setAttribute('aria-labelledby', 'h-overall');
    box.append(el('div', { class: 'overall-head' },
      el('h2', { id: 'h-overall', text: 'Genel durum' }),
      attBadge(att, true),
    ));
    box.append(el('p', { class: 'desc', text: st ? a.desc : 'Veri bekleniyor.' }));
    if (rules.length) {
      const counts = {};
      for (const r of rules) counts[r.health_attention] = (counts[r.health_attention] || 0) + 1;
      const wrap = el('div', { class: 'rule-counts', 'aria-label': 'Kural dağılımı' });
      for (const k of ['CRITICAL', 'ALERT', 'WATCH', 'UNKNOWN', 'NORMAL']) {
        if (counts[k]) wrap.append(el('span', { class: `badge ${ATTENTION[k].cls}` }, el('span', { class: 'bi', 'aria-hidden': 'true', text: ATTENTION[k].icon }), `${ATTENTION[k].label}: ${counts[k]}`));
      }
      box.append(wrap);
    }
    box.append(el('p', { class: 'updated', text: st ? `Son güncelleme: ${fmtDateTime(st.generated_at, true)} (${relTime(st.generated_at)})` : '' }));
    if (st && Array.isArray(st.limitations) && st.limitations.length) {
      box.append(el('details', { class: 'limits' },
        el('summary', { text: 'Sınırlamalar' }),
        el('ul', null, st.limitations.map((t) => el('li', { text: t })))));
    }
  });
}

function renderReminders() {
  const open = state.alerts.filter((a) => a.status === 'OPEN' && a.action_card);
  const ci = state.status && state.status.latest_check_in;
  const ciMs = ci ? toMs(ci.observed_at) : null;
  const stale = !ci || ciMs == null || (Date.now() - ciMs) > CHECKIN_STALE_MS;
  memo('reminders', [open.map((a) => [a.id, a.action_card.title_tr]), ci && ci.observed_at, stale, Math.floor(Date.now() / 60000)], () => {
    const ul = $('#reminderList');
    clear(ul);
    for (const a of open) {
      const rule = rulesAll().find((r) => r.rule_id === a.rule_id);
      const name = (rule && rule.title) || a.rule_id;
      ul.append(el('li', { class: 'r-alert' },
        el('span', { class: 'ri', 'aria-hidden': 'true', text: '▲' }),
        el('span', null, el('strong', { text: 'Açık alarm: ' }), `${name} — `, el('strong', { text: a.action_card.title_tr }), ' kartını uygula.')));
    }
    if (stale) {
      ul.append(el('li', { class: 'r-info' },
        el('span', { class: 'ri', 'aria-hidden': 'true', text: '●' }),
        el('span', { text: ci ? `Öznel durum kontrolünü doldurma zamanı (son kayıt ${relTime(ci.observed_at)}).` : 'Öznel durum kontrolünü doldurma zamanı (kayıt yok).' })));
    }
    if (!ul.children.length) ul.append(el('li', null, el('span', { class: 'ri', 'aria-hidden': 'true', text: '✓' }), el('span', { class: 'muted', text: 'Şu an hatırlatma yok.' })));
  });
}

function renderCards() {
  const metrics = state.metrics.length ? state.metrics : FALLBACK_METRICS;
  const sig = metrics.map((m) => {
    const pts = seriesPoints(m.metric);
    const last = pts[pts.length - 1];
    return [m.metric, pts.length, last && last.observed_at, last && last.value, rulesForMetric(m.metric).map((r) => [r.rule_id, r.health_attention, r.data_quality, r.observed_value])];
  });
  memo('cards', [sig, state.selectedMetric], () => {
    const wrap = $('#cards');
    clear(wrap);
    for (const m of metrics) {
      const pts = seriesPoints(m.metric);
      const last = lastValuePoint(pts);
      const top = worstRule(rulesForMetric(m.metric));
      const selected = state.selectedMetric === m.metric;
      const noData = !pts.length;
      const att = top ? (ATTENTION[top.health_attention] ? top.health_attention : 'UNKNOWN') : null;
      const cls = att ? ATTENTION[att].cls : 'att-none';
      const quality = top ? top.data_quality : (noData ? 'MISSING' : (last ? last.reported_quality : 'MISSING'));
      const badges = el('div', { class: 'badge-row' },
        att ? attBadge(att) : el('span', { class: 'badge att-none', title: 'Bu ölçüm için etkin kural yok' }, el('span', { class: 'bi', 'aria-hidden': 'true', text: '–' }), 'Kural yok'),
        (noData || (quality && quality !== 'VALID')) ? qualityBadge(quality) : null);
      const valueText = last ? fmtNum(last.value) : '—';
      const card = el('button', {
        type: 'button', class: `card ${cls}${noData ? ' nodata' : ''}`, 'aria-pressed': selected ? 'true' : 'false', 'data-fk': `card-${m.metric}`,
        'aria-label': `${m.label}: ${last ? `${valueText} ${m.unit}` : 'veri yok'}. ${att ? ATTENTION[att].label : 'Kural yok'}. Grafiği bu ölçüme geçir.`,
        onclick: () => selectMetric(m.metric),
      },
        el('span', { class: 'c-label' }, el('span', { text: m.label }), el('span', { class: 'c-cat', text: m.category === 'environment' ? 'Çevre' : 'Vital' })),
        el('span', { class: 'c-value' }, valueText, ' ', el('small', { text: last ? m.unit : '' })),
        noData ? el('span', { class: 'c-time', text: 'Veri yok' }) : sparkline(pts),
        el('span', { class: 'c-time', text: last ? `Son: ${fmtClock(last.observed_at)}` : '' }),
        badges);
      wrap.append(card);
    }
  });
}

/* ---------------------------------------------------------
   7. ÇİZİM: ana zaman grafiği ve sparkline
   --------------------------------------------------------- */
// Noktalardan çizilebilir parçalar (kopukluklarla). Eksik/arızalı/boş değerde ve büyük zaman boşluğunda kopar.
function buildSegments(pts) {
  const times = [];
  for (let i = 1; i < pts.length; i++) {
    const a = toMs(pts[i - 1].observed_at), b = toMs(pts[i].observed_at);
    if (a != null && b != null && b > a) times.push(b - a);
  }
  times.sort((x, y) => x - y);
  const median = times.length ? times[Math.floor(times.length / 2)] : 60000;
  const maxGap = Math.max(median * 3, 1000);
  const segments = [];
  const gaps = []; // [t0, t1]
  let cur = [];
  let prev = null;
  let broke = false;
  for (const p of pts) {
    const t = toMs(p.observed_at);
    const ok = t != null && isNum(p.value) && p.reported_quality !== 'MISSING' && p.reported_quality !== 'FAULT';
    if (!ok) { broke = true; continue; }
    const item = { t, v: p.value, p };
    if (prev && (broke || t - prev.t > maxGap)) {
      if (cur.length) segments.push(cur);
      cur = [];
      gaps.push([prev.t, t]);
    }
    cur.push(item);
    prev = item;
    broke = false;
  }
  if (cur.length) segments.push(cur);
  return { segments, gaps };
}

function sparkline(pts) {
  const W = 120, H = 36;
  const recent = pts.slice(-90);
  const { segments } = buildSegments(recent);
  const all = segments.flat();
  const root = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  if (!all.length) return root;
  const t0 = all[0].t, t1 = all[all.length - 1].t;
  let lo = Math.min(...all.map((x) => x.v)), hi = Math.max(...all.map((x) => x.v));
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const X = (t) => (t1 === t0 ? W / 2 : 2 + ((t - t0) / (t1 - t0)) * (W - 4));
  const Y = (v) => H - 3 - ((v - lo) / (hi - lo)) * (H - 6);
  for (const seg of segments) {
    root.append(svg('path', { d: seg.map((s, i) => `${i ? 'L' : 'M'}${X(s.t).toFixed(1)},${Y(s.v).toFixed(1)}`).join(''), 'vector-effect': 'non-scaling-stroke' }));
  }
  const last = all[all.length - 1];
  root.append(svg('circle', { cx: X(last.t), cy: Y(last.v), r: 2.2 }));
  return root;
}

function niceTicks(min, max, count = 5) {
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return { ticks, step };
}

// Seçili ölçümle ilgili alarmların açılış/kapanış zamanları
function alertMarkers(metric) {
  const ids = new Set(rulesAll().filter((r) => r.metric === metric).map((r) => r.rule_id));
  const out = [];
  for (const a of state.alerts) {
    if (!ids.has(a.rule_id)) continue;
    const o = toMs(a.opened_at), r = toMs(a.resolved_at);
    if (o != null) out.push({ t: o, kind: 'open' });
    if (r != null) out.push({ t: r, kind: 'res' });
  }
  return out;
}

let chartSig = '';
function renderChart() {
  const box = $('#chartBox');
  const metric = state.selectedMetric;
  const info = metricInfo(metric);
  $('#chartTitle').textContent = metric ? `${info.label} — zaman grafiği (${info.unit})` : 'Zaman grafiği';
  const pts = seriesPoints(metric);
  const rule = selectedRule();
  const thr = rule && rule.metric === metric && isNum(rule.threshold) ? rule : null;
  const markers = alertMarkers(metric);
  const last = pts[pts.length - 1];
  const W = Math.max(300, Math.floor(box.clientWidth || 600));
  const sig = JSON.stringify([state.missionId, metric, pts.length, last && last.observed_at, last && last.value, thr && [thr.threshold, thr.comparison], markers, W]);
  if (sig === chartSig) return;
  chartSig = sig;
  clear(box);
  renderLegend(!!thr, markers.length > 0);
  const plottable = pts.map((p) => ({ t: toMs(p.observed_at), v: p.value, p }))
    .filter((x) => x.t != null && isNum(x.v) && x.p.reported_quality !== 'MISSING' && x.p.reported_quality !== 'FAULT');
  if (!plottable.length) {
    box.append(el('p', { class: 'muted', text: metric ? 'Bu ölçüm için çizilecek veri yok. Eksik veri "normal" anlamına gelmez.' : 'Bir ölçüm seçin.' }));
    return;
  }

  const H = W < 520 ? 260 : 320;
  const m = { l: 54, r: 16, t: 30, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  let t0 = plottable[0].t, t1 = plottable[plottable.length - 1].t;
  if (t1 === t0) { t0 -= 60000; t1 += 60000; }
  let lo = Math.min(...plottable.map((x) => x.v)), hi = Math.max(...plottable.map((x) => x.v));
  if (thr) { lo = Math.min(lo, thr.threshold); hi = Math.max(hi, thr.threshold); }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: '0', 'data-fk': 'chart',
    'aria-label': `${info.label} zaman grafiği. ${plottable.length} ölçüm. Son değer ${fmtNum(plottable[plottable.length - 1].v)} ${info.unit}. Ok tuşlarıyla noktalar arasında gezinebilirsiniz.`,
  });

  // Izgara ve Y ekseni
  const yt = niceTicks(lo, hi, 5);
  const dec = Math.max(0, -Math.floor(Math.log10(yt.step)));
  for (const v of yt.ticks) {
    root.append(svg('line', { class: 'grid-line', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    root.append(svg('text', { class: 'axis-text', x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' },
      v.toLocaleString(TR, { minimumFractionDigits: dec, maximumFractionDigits: dec })));
  }
  // X ekseni
  const longSpan = (t1 - t0) > 36 * 3600 * 1000;
  const nTicks = W < 520 ? 3 : 5;
  for (let i = 0; i <= nTicks; i++) {
    const t = t0 + ((t1 - t0) * i) / nTicks;
    const label = new Date(t).toLocaleString(TR, longSpan ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
    root.append(svg('line', { class: 'grid-line', x1: X(t), x2: X(t), y1: m.t, y2: H - m.b }));
    root.append(svg('text', { class: 'axis-text', x: X(t), y: H - m.b + 16, 'text-anchor': i === 0 ? 'start' : i === nTicks ? 'end' : 'middle' }, label));
  }
  root.append(svg('line', { class: 'axis-line', x1: m.l, x2: m.l, y1: m.t, y2: H - m.b }));
  root.append(svg('line', { class: 'axis-line', x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));

  // Veri boşlukları + seri çizgisi (boşluklarda kopuk)
  const { segments, gaps } = buildSegments(pts);
  for (const [a, b] of gaps) {
    root.append(svg('rect', { class: 'gap-band', x: X(a), y: m.t, width: Math.max(1, X(b) - X(a)), height: ih }));
    if (X(b) - X(a) > 70) root.append(svg('text', { class: 'gap-text', x: (X(a) + X(b)) / 2, y: m.t + 12, 'text-anchor': 'middle' }, 'Veri boşluğu'));
  }
  for (const seg of segments) {
    if (seg.length === 1) root.append(svg('circle', { class: 'series-dot', cx: X(seg[0].t), cy: Y(seg[0].v), r: 3 }));
    else root.append(svg('path', { class: 'series-line', d: seg.map((s, i) => `${i ? 'L' : 'M'}${X(s.t).toFixed(1)},${Y(s.v).toFixed(1)}`).join('') }));
  }
  // Şüpheli noktalar: içi boş işaret (renge ek olarak şekil)
  for (const s of plottable) {
    if (s.p.reported_quality === 'SUSPECT') root.append(svg('rect', { class: 'suspect-dot', x: X(s.t) - 3.5, y: Y(s.v) - 3.5, width: 7, height: 7, transform: `rotate(45 ${X(s.t)} ${Y(s.v)})` }));
  }

  // Kural eşiği
  if (thr) {
    const y = Y(thr.threshold);
    root.append(svg('line', { class: 'thr-line', x1: m.l, x2: W - m.r, y1: y, y2: y }));
    root.append(svg('text', { class: 'thr-text', x: W - m.r - 4, y: y - 5, 'text-anchor': 'end' },
      `Eşik ${cmpSymbol(thr.comparison)} ${fmtNum(thr.threshold)} ${info.unit}`));
  }

  // Alarm açılış/kapanış işaretleri
  for (const mk of markers) {
    if (mk.t < t0 || mk.t > t1) continue;
    const x = X(mk.t);
    const open = mk.kind === 'open';
    root.append(svg('line', { class: open ? 'mk-open' : 'mk-res', x1: x, x2: x, y1: m.t - 6, y2: H - m.b }));
    root.append(svg('text', { class: open ? 'mk-open-text' : 'mk-res-text', x: x + (x > W - 90 ? -4 : 4), y: m.t - 10 + (open ? 0 : 0), 'text-anchor': x > W - 90 ? 'end' : 'start' },
      open ? '▲ Alarm açıldı' : '✓ Alarm kapandı'));
  }

  // Hover katmanı
  const hLine = svg('line', { class: 'hover-line', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  const hDot = svg('circle', { class: 'hover-dot', r: 5, visibility: 'hidden' });
  root.append(hLine, hDot);
  const overlay = svg('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  root.append(overlay);
  box.append(root);
  const tip = el('div', { class: 'tooltip', role: 'presentation', hidden: true });
  box.append(tip);

  let idx = plottable.length - 1;
  const show = (i) => {
    idx = Math.max(0, Math.min(plottable.length - 1, i));
    const s = plottable[idx];
    const x = X(s.t), y = Y(s.v);
    hLine.setAttribute('x1', x); hLine.setAttribute('x2', x); hLine.setAttribute('visibility', 'visible');
    hDot.setAttribute('cx', x); hDot.setAttribute('cy', y); hDot.setAttribute('visibility', 'visible');
    clear(tip);
    tip.append(el('div', { text: fmtDateTime(s.p.observed_at, true) }),
      el('div', { class: 'tv', text: `${fmtNum(s.v)} ${info.unit}` }),
      el('div', null, qualityBadge(s.p.reported_quality || 'VALID')));
    if (s.p.activity_state) tip.append(el('div', { class: 'muted', text: `Aktivite: ${s.p.activity_state}` }));
    tip.hidden = false;
    const scale = box.clientWidth / W;
    const left = x * scale;
    tip.style.left = `${left > box.clientWidth - 190 ? left - tip.offsetWidth - 12 : left + 12}px`;
    tip.style.top = `${Math.max(4, Math.min(y * scale - 20, box.clientHeight - tip.offsetHeight - 4))}px`;
  };
  const hide = () => { hLine.setAttribute('visibility', 'hidden'); hDot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const nearest = (clientX) => {
    const r = root.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const t = t0 + ((px - m.l) / iw) * (t1 - t0);
    let best = 0, bd = Infinity;
    for (let i = 0; i < plottable.length; i++) { const d = Math.abs(plottable[i].t - t); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  overlay.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  overlay.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  overlay.addEventListener('pointerleave', hide);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(idx - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { show(idx + 1); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); e.preventDefault(); }
    else if (e.key === 'End') { show(plottable.length - 1); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  });
  root.addEventListener('blur', hide);
}

function renderLegend(hasThr, hasMarkers) {
  const ul = $('#chartLegend');
  clear(ul);
  const sw = (...kids) => el('span', { class: 'sw', 'aria-hidden': 'true' }, svg('svg', { width: 22, height: 10, viewBox: '0 0 22 10' }, ...kids));
  ul.append(el('li', null, sw(svg('line', { x1: 0, x2: 22, y1: 5, y2: 5, stroke: '#5cc8ff', 'stroke-width': 2 })), 'Ölçüm'));
  ul.append(el('li', null, sw(svg('rect', { x: 7, y: 1, width: 7, height: 7, fill: 'none', stroke: '#ffc83d', 'stroke-width': 2, transform: 'rotate(45 10.5 4.5)' })), 'Şüpheli veri'));
  ul.append(el('li', null, sw(svg('rect', { x: 0, y: 0, width: 22, height: 10, fill: 'rgba(154,164,186,.3)' })), 'Veri boşluğu (eksik/arıza)'));
  if (hasThr) ul.append(el('li', null, sw(svg('line', { x1: 0, x2: 22, y1: 5, y2: 5, stroke: '#ffc83d', 'stroke-width': 2, 'stroke-dasharray': '5 3' })), 'Kural eşiği'));
  if (hasMarkers) {
    ul.append(el('li', null, sw(svg('line', { x1: 11, x2: 11, y1: 0, y2: 10, stroke: '#ff7a35', 'stroke-width': 2, 'stroke-dasharray': '2 2' })), 'Alarm açıldı'));
    ul.append(el('li', null, sw(svg('line', { x1: 11, x2: 11, y1: 0, y2: 10, stroke: '#5cc8ff', 'stroke-width': 2, 'stroke-dasharray': '2 2' })), 'Alarm kapandı'));
  }
}

let resizeTimer = null;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { chartSig = ''; if (state.missionId) renderChart(); }, 120);
}

/* ---------------------------------------------------------
   8. ÇİZİM: neden / eylem kartı / alarmlar
   --------------------------------------------------------- */
function kv(label, value) {
  return [el('dt', { text: label }), el('dd', null, value)];
}

function renderWhy() {
  const metric = state.selectedMetric;
  const rule = selectedRule();
  const rules = rulesAll();
  memo('why', [metric, rule, rules.map((r) => [r.rule_id, r.health_attention, r.title])], () => {
    const box = $('#why');
    clear(box);
    box.append(el('h2', { id: 'h-why', text: 'Neden bu durum?' }));

    if (rules.length) {
      const chips = el('div', { class: 'rule-chips', role: 'group', 'aria-label': 'Kurallar' });
      for (const r of rules) {
        chips.append(el('button', {
          type: 'button', class: 'rule-chip', 'aria-pressed': rule && rule.rule_id === r.rule_id ? 'true' : 'false', 'data-fk': `rule-${r.rule_id}`,
          onclick: () => selectMetric(r.metric || state.selectedMetric, r.rule_id),
        }, attBadge(r.health_attention), r.title || r.rule_id));
      }
      box.append(chips);
    }

    if (rule) {
      box.append(el('div', { class: 'why-title', text: rule.title || rule.rule_id }));
      box.append(el('div', { class: 'badge-row' }, attBadge(rule.health_attention), qualityBadge(rule.data_quality), rule.validation_status === 'DEMO_PENDING_REVIEW' ? null : validationBadge(rule.validation_status)));
      if (rule.validation_status === 'DEMO_PENDING_REVIEW') {
        box.append(el('div', { class: 'demo-note', text: 'DEMO eşik — uzman doğrulaması bekliyor' }));
      }
      if (rule.data_quality && rule.data_quality !== 'VALID') {
        box.append(el('div', { class: 'quality-note', text: 'Veri kalitesi sorunu var: bu durum sağlık değerlendirmesinin güvenilir olmadığını gösterir. Kötü veri "normal" anlamına gelmez.' }));
      }
      box.append(el('p', { class: 'why-text', text: rule.explanation || 'Açıklama yok.' }));
      const url = safeUrl(rule.source_uri);
      const dl = el('dl', { class: 'kv' },
        kv('Gözlenen değer', isNum(rule.observed_value) ? `${fmtNum(rule.observed_value)} ${rule.unit || ''}` : '—'),
        kv('Eşik', isNum(rule.threshold) ? `${cmpSymbol(rule.comparison)} ${fmtNum(rule.threshold)} ${rule.unit || ''}` : '—'),
        kv('Pencere', isNum(rule.window_minutes) ? `${fmtNum(rule.window_minutes, 0)} dk` : '—'),
        kv('Kaynak', url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: rule.source || url }) : (rule.source || '—')),
        kv('Kanıt düzeyi', rule.evidence_level || '—'),
        kv('Değerlendirme', fmtDateTime(rule.evaluated_at, true)),
      );
      box.append(dl);
      if (Array.isArray(rule.related_metrics) && rule.related_metrics.length) {
        box.append(el('p', { class: 'muted', text: `Birlikte değerlendirilen ölçümler: ${rule.related_metrics.map((x) => metricInfo(x).label).join(', ')}` }));
      }
    } else {
      box.append(el('p', { class: 'muted', text: metric ? 'Bu ölçüm için etkin bir kural bulunmuyor. Kural yoksa "normal" demek değildir; yalnızca bu ölçüm için dikkat kuralı tanımlı değildir.' : 'Bir ölçüm seçin.' }));
    }

    const info = METRIC_INFO[metric];
    if (info) {
      box.append(el('div', { class: 'info-box' },
        el('h3', { text: `Bu ölçüm neden önemli? (${metricInfo(metric).label})` }),
        el('p', { text: info.why }),
        el('h3', { text: 'Ne zaman dikkat?' }),
        el('p', { text: info.watch + GENERIC_NEXT })));
    }
  });
}

function actionCardView(card, contextText, situation) {
  const a = ATTENTION[card.attention] || ATTENTION.UNKNOWN;
  const sit = situation || null;
  const done = new Map((sit && Array.isArray(sit.completed_steps) ? sit.completed_steps : []).map((d) => [d.step_key, d]));
  const wrap = el('div', { class: `action-card ${a.cls}` });
  wrap.append(el('div', { class: 'badge-row' }, attBadge(card.attention), validationBadge(card.validation_status)));
  if (contextText) wrap.append(el('p', { class: 'muted', text: contextText }));
  wrap.append(el('div', { class: 'ac-title', text: card.title_tr || card.title_key || 'Eylem kartı' }));
  if (card.reason_tr) wrap.append(el('p', { text: card.reason_tr }));

  // Şu an ne oluyor? (ölçülen gerçekler; tavsiye değil)
  if (sit && Array.isArray(sit.facts_tr) && sit.facts_tr.length) {
    wrap.append(el('div', { class: 'ac-situation', role: 'group', 'aria-label': 'Şu anki durum' },
      el('h3', { text: 'Şu an ne oluyor?' }),
      el('ul', null, sit.facts_tr.map((f) => el('li', { text: f })))));
  }

  // Yeniden değerlendirme sayacı
  if (sit && sit.reassess_at) {
    const left = toMs(sit.reassess_at) - Date.now();
    const due = left <= 0;
    const mins = Math.max(0, Math.ceil(left / 60000));
    const every = card.reassess_minutes ? `, her ${card.reassess_minutes} dk` : '';
    wrap.append(el('div', { class: `callout reassess${due ? ' due' : ''}`, role: 'status' },
      el('span', { 'aria-hidden': 'true', text: '⏱' }),
      el('span', { text: due
        ? `Yeniden değerlendirme zamanı geldi (${fmtDateTime(sit.reassess_at)}). Ölçümleri ve belirtileri tekrar kontrol et.`
        : `Yeniden değerlendirme: ${fmtDateTime(sit.reassess_at)} (${mins} dk kaldı${every}).` })));
  }

  if (card.requires_mission_procedure) {
    wrap.append(el('div', { class: 'callout proc' }, el('span', { 'aria-hidden': 'true', text: '⚑' }), el('span', { text: 'Görev prosedürü önceliklidir.' })));
  }

  // Adımlar: ne yap + neden + "Yaptım"
  const steps = Array.isArray(card.steps) ? card.steps : [];
  if (steps.length) {
    const alertId = sit && sit.alert_id;
    wrap.append(el('h3', { text: 'Ne yapmalıyım?' }));
    wrap.append(el('ol', { class: 'ac-steps' }, steps.map((st) => {
      const d = done.get(st.key);
      const li = el('li', { class: d ? 'step done' : 'step' });
      li.append(el('div', { class: 'step-text', text: st.text_tr || st.key }));
      if (st.why_tr) li.append(el('div', { class: 'step-why' }, el('b', { text: 'Neden: ' }), document.createTextNode(st.why_tr)));
      if (d) {
        li.append(el('div', { class: 'step-done', text: `✓ Yapıldı — ${fmtDateTime(d.done_at)} (${d.crew_member_id})` }));
      } else if (alertId) {
        li.append(el('button', {
          type: 'button', class: 'btn small', 'data-fk': `step-${alertId}-${st.key}`,
          'aria-label': `Adımı yaptım olarak işaretle: ${st.text_tr || st.key}`,
          onclick: (e) => markStepDone(alertId, st.key, e.currentTarget),
        }, 'Yaptım'));
      }
      return li;
    })));
  }

  // Ne olursa yükselir / ne zaman kapanır
  const esc = Array.isArray(card.escalate_if_tr) ? card.escalate_if_tr : [];
  if (esc.length) {
    wrap.append(el('div', { class: 'ac-cond escalate' },
      el('h3', { text: 'Seviye yükselir / acil durum' }),
      el('ul', null, esc.map((x) => el('li', { text: x })))));
  }
  if (card.closes_when_tr) {
    wrap.append(el('div', { class: 'ac-cond closes' },
      el('h3', { text: 'Ne zaman kapanır?' }), el('p', { text: card.closes_when_tr })));
  }

  // Olası açıklamalar (teşhis değil)
  const cons = Array.isArray(card.considerations_tr) ? card.considerations_tr : [];
  if (cons.length) {
    wrap.append(el('details', { class: 'ac-considerations' },
      el('summary', { text: 'Olası açıklamalar (teşhis değildir)' }),
      el('ul', null, cons.map((x) => el('li', { text: x })))));
  }

  if (card.allows_automatic_vehicle_command === false) {
    wrap.append(el('div', { class: 'callout nocmd' }, el('span', { 'aria-hidden': 'true', text: 'ℹ' }), el('span', { text: 'Yazılım araç/ekipman komutu vermez.' })));
  }
  if (card.footer_note_tr) wrap.append(el('p', { class: 'footer-note', text: card.footer_note_tr }));

  const refs = Array.isArray(card.references) ? card.references : [];
  if (refs.length) {
    const p = el('p', { class: 'card-refs' }, 'Kaynak: ');
    refs.forEach((r, i) => {
      if (i) p.append(document.createTextNode(' · '));
      p.append(/^https?:\/\//.test(r.uri || '')
        ? el('a', { href: r.uri, target: '_blank', rel: 'noopener noreferrer', text: r.label })
        : el('span', { text: `${r.label} (${r.uri})` }));
    });
    wrap.append(p);
  }
  wrap.append(el('p', { class: 'card-meta', text: `Kart: ${card.card_id || '—'}${card.version != null ? ` v${card.version}` : ''}` }));
  return wrap;
}

async function markStepDone(alertId, stepKey, btn) {
  if (!state.crewId) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('POST', `/v1/alerts/${encodeURIComponent(alertId)}/steps`, { crew_member_id: state.crewId, step_key: stepKey });
    await refresh();
  } catch (e) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = e.status === 0 ? 'Bağlantı yok' : 'Kaydedilemedi';
  }
}

function renderAction() {
  const rule = selectedRule();
  const fromAlert = state.alertCardId ? state.alerts.find((a) => a.id === state.alertCardId) : null;
  let card = null, ctx = '', sit = null;
  if (fromAlert && fromAlert.action_card) {
    card = fromAlert.action_card;
    ctx = 'Seçili alarmın eylem kartı.';
    const r = rulesAll().find((x) => x.rule_id === fromAlert.rule_id);
    if (r && r.situation && r.situation.alert_id === fromAlert.id) sit = r.situation;
  } else if (rule && rule.action_card) {
    card = rule.action_card;
    ctx = `Kural: ${rule.title || rule.rule_id}`;
    sit = rule.situation || null;
  } else {
    const other = worstRule(rulesAll().filter((r) => r.action_card));
    if (other) {
      card = other.action_card;
      sit = other.situation || null;
      ctx = `Seçili ölçümün kuralında eylem kartı yok; en yüksek dikkatli kuralın kartı gösteriliyor (${other.title || other.rule_id}).`;
    }
  }
  memo('action', [card, ctx, sit, Math.floor(Date.now() / 30000)], () => {
    const box = $('#actionPanel');
    clear(box);
    box.append(el('h2', { id: 'h-action', text: 'Eylem kartı' }));
    if (card) box.append(actionCardView(card, ctx, sit));
    else box.append(el('p', { class: 'muted', text: 'Şu an etkin bir eylem kartı yok. Kartlar yalnızca bir kural dikkat gerektirdiğinde, önceden yazılmış metinlerle gösterilir.' }));
  });
}

function renderAlerts() {
  const list = state.alerts.slice().sort((a, b) => (toMs(b.opened_at) || 0) - (toMs(a.opened_at) || 0));
  memo('alerts', [list, state.crewId, state.alertCardId, Math.floor(Date.now() / 60000)], () => {
    const ul = $('#alertList');
    clear(ul);
    if (!list.length) {
      ul.append(el('li', { class: 'muted', text: 'Bu görev için alarm yok.' }));
      return;
    }
    for (const a of list) {
      const att = ATTENTION[a.health_attention] ? a.health_attention : 'UNKNOWN';
      const rule = rulesAll().find((r) => r.rule_id === a.rule_id);
      const meta = [`Açıldı: ${fmtDateTime(a.opened_at)}`];
      if (a.acknowledged_at) meta.push(`Görüldü: ${fmtDateTime(a.acknowledged_at)}${a.acknowledged_by ? ` (${a.acknowledged_by})` : ''}`);
      if (a.resolved_at) meta.push(`Çözüldü: ${fmtDateTime(a.resolved_at)}${a.resolved_by ? ` (${a.resolved_by})` : ''}`);
      if (a.manual_resolution && a.status !== 'RESOLVED') meta.push('Ölçümlerle kendiliğinden kapanmaz; ekip üyesi değerlendirip kapatır.');
      const actions = el('div', { class: 'alert-actions' });
      if (a.status === 'OPEN') {
        actions.append(el('button', {
          type: 'button', class: 'btn small primary', 'data-fk': `ack-${a.id}`,
          'aria-label': `Alarmı gördüm olarak işaretle: ${(rule && rule.title) || a.rule_id}`,
          onclick: (e) => acknowledge(a, e.currentTarget),
        }, 'Gördüm'));
      }
      if (a.manual_resolution && a.status !== 'RESOLVED') {
        actions.append(el('button', {
          type: 'button', class: 'btn small', 'data-fk': `resolve-${a.id}`,
          'aria-label': `Değerlendirildi olarak kapat: ${(rule && rule.title) || a.rule_id}`,
          onclick: (e) => resolveAlert(a, e.currentTarget),
        }, 'Değerlendirildi, kapat'));
      }
      if (a.action_card) {
        actions.append(el('button', {
          type: 'button', class: 'btn small', 'data-fk': `showcard-${a.id}`,
          onclick: () => { state.alertCardId = a.id; if (rule && rule.metric) { state.selectedMetric = rule.metric; state.selectedRuleId = rule.rule_id; } renderAll(); $('#actionPanel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); },
        }, 'Eylem kartını göster'));
      }
      ul.append(el('li', { class: `alert-item ${ATTENTION[att].cls}` },
        el('div', { class: 'alert-top' }, statusBadge(a.status), attBadge(att),
          el('span', { class: 'alert-title', text: (rule && rule.title) || a.rule_id }),
          el('span', { class: 'alert-time', text: `${fmtDateTime(a.opened_at)} · ${relTime(a.opened_at)}` })),
        el('p', { class: 'alert-exp', text: a.explanation || '' }),
        el('div', { class: 'alert-meta', text: meta.join(' · ') }),
        actions));
    }
  });
}

async function acknowledge(alertObj, btn) {
  const msg = $('#alertsMsg');
  msg.hidden = true;
  if (!state.crewId) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('POST', `/v1/alerts/${encodeURIComponent(alertObj.id)}/acknowledge`, { crew_member_id: state.crewId });
    refresh();
  } catch (e) {
    msg.textContent = e.status === 0 ? 'Sunucuya ulaşılamıyor; alarm işaretlenemedi.' : `Alarm işaretlenemedi (${e.message}).`;
    msg.hidden = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

// Kırmızı bayrak alarmları ölçümlerle kapanmaz; bir ekip üyesi değerlendirip kapatır.
async function resolveAlert(alertObj, btn) {
  const msg = $('#alertsMsg');
  msg.hidden = true;
  if (!state.crewId) return;
  if (!window.confirm('Bu kırmızı bayrak olayı ekip sağlık sorumlusu tarafından değerlendirildi mi? Alarm kapatılacak ve kaydedilecek.')) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('POST', `/v1/alerts/${encodeURIComponent(alertObj.id)}/resolve`, { crew_member_id: state.crewId });
    refresh();
  } catch (e) {
    msg.textContent = e.status === 0 ? 'Sunucuya ulaşılamıyor; alarm kapatılamadı.' : `Alarm kapatılamadı (${e.message}).`;
    msg.hidden = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

/* ---------------------------------------------------------
   9. ÇİZİM: kırmızı bayrak, öznel durum formu, laboratuvar
   --------------------------------------------------------- */
async function loadRedFlagCatalog() {
  if (MOCK_MODE) return;
  let catalog;
  try { catalog = await api('GET', '/v1/red-flags/catalog'); } catch (e) { return; }
  if (!Array.isArray(catalog) || !catalog.length) return;
  const box = $('#redFlagOptions');
  clear(box);
  for (const item of catalog) {
    const id = `rf-${item.flag}`;
    box.append(el('label', { for: id },
      el('input', { type: 'checkbox', id, name: 'redflag', value: item.flag }),
      el('span', { text: item.label })));
  }
  $('#redFlagForm').addEventListener('submit', submitRedFlags);
  $('#redFlagPanel').hidden = false;
}

async function submitRedFlags(e) {
  e.preventDefault();
  const msg = $('#redFlagMsg');
  const btn = $('#redFlagBtn');
  if (!state.missionId || !state.crewId) { msg.className = 'msg err'; msg.textContent = 'Önce bir görev seçin.'; return; }
  const flags = [...document.querySelectorAll('#redFlagOptions input:checked')].map((x) => x.value);
  if (!flags.length) { msg.className = 'msg err'; msg.textContent = 'En az bir belirti seçin.'; return; }
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('POST', '/v1/red-flags', {
      mission_id: state.missionId, crew_member_id: state.crewId, flags,
      observed_at: new Date().toISOString(), source_type: 'MANUAL', source_id: 'dashboard-user',
    });
    document.querySelectorAll('#redFlagOptions input:checked').forEach((x) => { x.checked = false; });
    msg.className = 'msg err';
    msg.textContent = 'Acil durum bildirildi. Eylem kartını uygulayın ve ekip sağlık sorumlusuna haber verin.';
    state.selectedRuleId = 'RED_FLAG_SYMPTOM_V1';
    await refresh();
    $('#actionPanel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.status === 0 ? 'Sunucuya ulaşılamıyor; bildirilemedi. Ekibe sözlü olarak haber verin.' : `Bildirilemedi (${err.message}). Ekibe sözlü olarak haber verin.`;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

function buildCheckinForm() {
  const box = $('#sliders');
  for (const [key, label] of CHECKIN_FIELDS) {
    const id = `ci-${key}`;
    const out = el('output', { for: id, id: `${id}-out`, text: `0 — ${SEVERITY_WORDS[0]}` });
    const input = el('input', { type: 'range', id, name: key, min: 0, max: 4, step: 1, value: 0, 'aria-describedby': `${id}-out` });
    input.addEventListener('input', () => { out.textContent = `${input.value} — ${SEVERITY_WORDS[Number(input.value)]}`; });
    box.append(el('div', { class: 'slider-row' },
      el('label', { for: id, text: label }), input, out,
      el('div', { class: 'slider-scale', 'aria-hidden': 'true' }, el('span', { text: '0 Yok' }), el('span', { text: '4 Çok şiddetli' }))));
  }
  $('#checkinForm').addEventListener('submit', submitCheckin);
}

async function submitCheckin(e) {
  e.preventDefault();
  const msg = $('#checkinMsg');
  const btn = $('#checkinBtn');
  if (!state.missionId || !state.crewId) { msg.className = 'msg err'; msg.textContent = 'Önce bir görev seçin.'; return; }
  const body = {
    mission_id: state.missionId, crew_member_id: state.crewId,
    observed_at: new Date().toISOString(), source_type: 'MANUAL', source_id: 'dashboard-user',
  };
  for (const [key] of CHECKIN_FIELDS) body[key] = Number($(`#ci-${key}`).value);
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('POST', '/v1/check-ins', body);
    msg.className = 'msg ok';
    msg.textContent = 'Kaydedildi.';
    refresh();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.status === 0 ? 'Sunucuya ulaşılamıyor; kaydedilemedi.' : `Kaydedilemedi (${err.message}).`;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

function renderLatestCheckin() {
  const ci = state.status && state.status.latest_check_in;
  memo('latestCheckin', ci || null, () => {
    const box = $('#latestCheckin');
    clear(box);
    if (!ci) { box.append(el('p', { class: 'muted', text: 'Henüz öznel kayıt yok.' })); return; }
    for (const [key, label] of CHECKIN_FIELDS) {
      const v = ci[key];
      box.append(el('div', { class: 'lc' }, `${label}: `, el('b', { text: isNum(v) ? `${v} — ${SEVERITY_WORDS[v] || ''}` : '—' })));
    }
    box.append(el('div', { class: 'lc muted', text: `Zaman: ${fmtDateTime(ci.observed_at)} (${relTime(ci.observed_at)})` }));
  });
}

function renderLabs() {
  const labs = state.labs;
  const results = labs && Array.isArray(labs.results) ? labs.results : [];
  memo('labs', [results, labs && labs.limitations], () => {
    const panel = $('#labPanel');
    panel.hidden = !results.length; // laboratuvar verisi yoksa bölüm gizli
    if (!results.length) return;
    // Analit başına en son örnek
    const latest = {};
    for (const r of results) {
      const cur = latest[r.analyte];
      if (!cur || (toMs(r.sampled_at) || 0) >= (toMs(cur.sampled_at) || 0)) latest[r.analyte] = r;
    }
    const order = Object.keys(LAB_LABELS).filter((k) => latest[k]).concat(Object.keys(latest).filter((k) => !LAB_LABELS[k]));
    const grid = $('#labGrid');
    clear(grid);
    for (const key of order) grid.append(labCard(latest[key]));
    const lim = $('#labLimits');
    clear(lim);
    if (labs && Array.isArray(labs.limitations) && labs.limitations.length) {
      lim.append(el('div', { class: 'limits-box' }, el('h3', { text: 'Sınırlamalar' }), el('ul', null, labs.limitations.map((t) => el('li', { text: t })))));
    }
  });
}

function labCard(r) {
  const label = LAB_LABELS[r.analyte] || r.analyte;
  const pos = POSITION[r.position_vs_reference];
  const lo = r.reference_low, hi = r.reference_high;
  const card = el('div', { class: 'lab-card' });
  card.append(el('div', { class: 'lab-top' },
    el('span', { class: 'lab-name', text: label }),
    pos ? el('span', { class: 'badge pos' }, el('span', { class: 'bi', 'aria-hidden': 'true', text: pos.icon }), pos.label) : null));
  card.append(el('div', { class: 'lab-value' }, fmtNum(r.value), ' ', el('small', { text: r.unit || '' })));
  if (isNum(lo) && isNum(hi) && isNum(r.value)) {
    const span = Math.max(hi - lo, 1e-9);
    const dmin = Math.min(lo, r.value) - span * 0.4;
    const dmax = Math.max(hi, r.value) + span * 0.4;
    const pct = (v) => Math.max(0, Math.min(100, ((v - dmin) / (dmax - dmin)) * 100));
    card.append(el('div', {
      class: 'refbar', role: 'img',
      'aria-label': `Değer ${fmtNum(r.value)} ${r.unit || ''}, referans aralığı ${fmtNum(lo)}–${fmtNum(hi)}; konum: ${pos ? pos.label : '—'}`,
    },
      el('div', { class: 'band', style: `left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%` }),
      el('div', { class: 'marker', style: `left:${pct(r.value)}%` })));
    card.append(el('div', { class: 'lab-meta', text: `Referans aralığı: ${fmtNum(lo)}–${fmtNum(hi)} ${r.unit || ''}` }));
  } else {
    card.append(el('div', { class: 'lab-meta', text: 'Referans aralığı yok.' }));
  }
  const prev = isNum(r.change_from_previous) ? fmtSigned(r.change_from_previous, r.unit) : '—';
  const base = isNum(r.change_from_baseline) ? fmtSigned(r.change_from_baseline, r.unit) : '—';
  card.append(el('div', { class: 'lab-meta' },
    el('div', { text: `Önceki örneğe göre: ${prev}` }),
    el('div', { text: `Uçuş öncesi başlangıca göre: ${base}` }),
    el('div', { text: `Faz: ${PHASE[r.phase] || r.phase || '—'} · Örnek: ${fmtDateTime(r.sampled_at)}` }),
    el('div', { text: `Kaynak: ${r.source_id || '—'}${r.source_type ? ` (${r.source_type})` : ''}` })));
  return card;
}

/* ---------------------------------------------------------
   10. DEMO SENARYOLARI
   --------------------------------------------------------- */
async function loadScenarios() {
  const sel = $('#scenarioSelect');
  const btn = $('#runBtn');
  try {
    const list = await api('GET', '/v1/demo/scenarios');
    if (!Array.isArray(list) || !list.length) throw new ApiError('empty', 404);
    state.scenarios = list;
    clear(sel);
    for (const s of list) sel.append(el('option', { value: s.scenario_id, text: s.title || s.scenario_id }));
    state.scenarioId = list[0].scenario_id;
    sel.value = state.scenarioId;
    sel.disabled = false; btn.disabled = false;
    renderScenarioInfo();
  } catch (e) {
    clear(sel);
    sel.append(el('option', { value: '', text: 'Senaryo yok' }));
    sel.disabled = true; btn.disabled = true;
    btn.title = 'Demo senaryoları yüklenemedi';
  }
}

function renderScenarioInfo() {
  const s = state.scenarios.find((x) => x.scenario_id === state.scenarioId);
  const box = $('#scenarioInfo');
  box.hidden = !s;
  if (!s) return;
  $('#scenarioTitle').textContent = s.title || s.scenario_id;
  const sc = $('#scenarioScale');
  sc.textContent = TIME_SCALE[s.time_scale] ? `Zaman ölçeği: ${TIME_SCALE[s.time_scale]}` : '';
  sc.hidden = !sc.textContent;
  $('#scenarioDesc').textContent = s.description || '';
  const ex = $('#scenarioExpected');
  clear(ex);
  for (const t of (s.expected || [])) ex.append(el('li', { text: t }));
  if (!ex.children.length) ex.append(el('li', { class: 'muted', text: 'Belirtilmemiş.' }));
  const rr = state.runResult;
  const showRes = rr && rr.scenario_id === s.scenario_id;
  $('#runResult').hidden = !showRes;
  if (showRes) {
    $('#runCount').textContent = `${rr.observations_posted != null ? rr.observations_posted : '?'} gözlem gönderildi.`;
    const ul = $('#runSummary');
    clear(ul);
    for (const t of (rr.summary || [])) ul.append(el('li', { text: t }));
  }
}

async function runScenario() {
  if (state.running || !state.scenarioId) return;
  const btn = $('#runBtn');
  const err = $('#runError');
  err.hidden = true;
  state.running = true;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  const old = btn.textContent;
  btn.textContent = 'Çalıştırılıyor…';
  try {
    const res = await api('POST', `/v1/demo/scenarios/${encodeURIComponent(state.scenarioId)}/run`, undefined, 120000);
    state.runResult = res;
    renderScenarioInfo();
    resetMissionData();
    // Yeni görevi yükle ve otomatik seç
    try { state.missions = await api('GET', '/v1/missions'); } catch (e) { /* döngü yeniden dener */ }
    if (res && res.mission_id) {
      if (!state.missions.some((m) => m.mission_id === res.mission_id)) {
        state.missions.unshift({ mission_id: res.mission_id, scenario_id: res.scenario_id, last_observed_at: null, crew_member_ids: [res.crew_member_id], environment_target_ids: [res.environment_target_id] });
      }
      applyMissionSelection(res.mission_id);
    }
    state.loaded = true;
    await refresh();
  } catch (e) {
    err.textContent = e.status === 0 ? 'Sunucuya ulaşılamıyor; senaryo çalıştırılamadı.' : `Senaryo çalıştırılamadı (${e.message}).`;
    err.hidden = false;
  } finally {
    state.running = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = old;
  }
}

// Gerçek NASA OSDR (Inspiration4) laboratuvar verisini yükler ve o görevi seçer.
async function importOsdrLabs() {
  if (state.running) return;
  const btn = $('#osdrBtn');
  const err = $('#runError');
  err.hidden = true;
  state.running = true;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Yükleniyor…';
  try {
    const res = await api('POST', '/v1/demo/osdr-labs/import', undefined, 60000);
    resetMissionData();
    try { state.missions = await api('GET', '/v1/missions'); } catch (e) { /* döngü yeniden dener */ }
    if (res && res.mission_id) applyMissionSelection(res.mission_id);
    state.loaded = true;
    await refresh();
  } catch (e) {
    err.textContent = e.status === 0 ? 'Sunucuya ulaşılamıyor.' : `OSDR verisi yüklenemedi (${e.message}).`;
    err.hidden = false;
  } finally {
    state.running = false;
    btn.disabled = false;
    btn.textContent = old;
  }
}

/* ---------------------------------------------------------
   11. BAŞLATMA
   --------------------------------------------------------- */
function init() {
  if (MOCK_MODE) $('#mockBanner').hidden = false;
  buildCheckinForm();
  loadRedFlagCatalog();

  $('#missionSelect').addEventListener('change', (e) => {
    resetMissionData();
    applyMissionSelection(e.target.value || null);
    // Keep the scenario description in sync with the selected mission.
    const mission = state.missions.find((m) => m.mission_id === state.missionId);
    if (mission && mission.scenario_id && state.scenarios.some((s) => s.scenario_id === mission.scenario_id)) {
      state.scenarioId = mission.scenario_id;
      $('#scenarioSelect').value = mission.scenario_id;
      renderScenarioInfo();
    }
    chartSig = '';
    renderAll();
    refresh();
  });
  $('#crewSelect').addEventListener('change', (e) => {
    const id = state.missionId;
    resetMissionData();
    applyMissionSelection(id);
    state.crewId = e.target.value || state.crewId;
    chartSig = '';
    renderAll();
    refresh();
  });
  $('#scenarioSelect').addEventListener('change', (e) => { state.scenarioId = e.target.value; renderScenarioInfo(); });
  $('#runBtn').addEventListener('click', runScenario);
  $('#osdrBtn').addEventListener('click', importOsdrLabs);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer); else refresh();
  });
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe($('#chartBox'));

  $('#runBtn').disabled = true;
  renderAll();
  loadScenarios();
  refresh();
}

/* ---------------------------------------------------------
   12. MOCK KATMANI (?mock=1) — sözleşmeye uyan sahte veri
   Ek parametreler: &empty=1 (görev yok). Konsoldan: window.__mockOffline = true
   --------------------------------------------------------- */
let MOCK = null;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function mockCard(ruleId, attention, title, reason, steps) {
  return {
    card_id: `${ruleId}_CARD`, version: 1, attention, rule_id: ruleId,
    title_key: `${ruleId}.title`, reason_key: `${ruleId}.reason`, step_keys: steps.map((_, i) => `${ruleId}.step${i + 1}`),
    title_tr: title, reason_tr: reason, steps: steps.map((t, i) => ({ key: `${ruleId}.step${i + 1}`, text_tr: t })),
    footer_note_tr: 'Bu kart teşhis veya tedavi önerisi değildir; görev prosedürü ve uçuş cerrahı yönlendirmesi önceliklidir.',
    requires_mission_procedure: true, allows_automatic_vehicle_command: false, validation_status: 'DEMO_PENDING_REVIEW',
  };
}

function mockMission(id, scenarioId, variant, end) {
  const m = {
    mission_id: id, scenario_id: scenarioId, variant, end,
    crew_member_ids: ['crew-01'], environment_target_ids: ['iss-destiny-lab'],
    n: 120, step: 60000, alerts: [], checkIn: null,
  };
  const t = (i) => new Date(end - (m.n - 1 - i) * m.step).toISOString();
  m.t = t;
  if (variant === 'co2') {
    m.alerts = [
      { id: `${id}-a1`, mission_id: id, target_id: 'crew-01', rule_id: 'MULTI_CARDIO_RESP_V1', status: 'OPEN', health_attention: 'ALERT', opened_at: t(90), last_evaluated_at: t(119), acknowledged_at: null, acknowledged_by: null, resolved_at: null,
        explanation: 'Dinlenmede kalp hızı ve solunum hızı birlikte yükseldi; öznel belirti bildirildi.', action_card: mockCard('MULTI_CARDIO_RESP_V1', 'ALERT', 'Ölçümleri doğrula ve görev prosedürüne başvur', 'Dinlenmede kalp ve solunum hızı birlikte yükseldi ve öznel belirti bildirildi.', ['Sensör yerleşimini kontrol edip ölçümü tekrarla.', 'Dinlenme durumunu doğrulayıp birkaç dakika sonra yeniden ölç.', 'Görev prosedürünün ilgili bölümünü aç ve yer kontrol ile iletişime geç.']) },
      { id: `${id}-a2`, mission_id: id, target_id: 'iss-destiny-lab', rule_id: 'ENV_CO2_NOMINAL_V1', status: 'RESOLVED', health_attention: 'WATCH', opened_at: t(40), last_evaluated_at: t(70), acknowledged_at: t(45), acknowledged_by: 'crew-01', resolved_at: t(70),
        explanation: 'Bir saatlik ortalama kabin CO₂ kısmi basıncı 3 mmHg nominal sınırını aştı, sonra geri döndü.', action_card: null },
    ];
    m.checkIn = { mission_id: id, crew_member_id: 'crew-01', fatigue: 2, dizziness: 1, nausea: 0, pain: 2, mood_distress: 1, observed_at: new Date(end - 5 * 3600000).toISOString(), source_type: 'MANUAL', source_id: 'seed' };
  } else {
    m.checkIn = { mission_id: id, crew_member_id: 'crew-01', fatigue: 0, dizziness: 0, nausea: 0, pain: 0, mood_distress: 0, observed_at: new Date(end - 30 * 60000).toISOString(), source_type: 'MANUAL', source_id: 'seed' };
  }
  return m;
}

function buildMock() {
  const now = Date.now();
  const missions = PARAMS.get('empty') === '1' ? [] : [
    mockMission('demo-co2-headache-20261114T101500', 'co2-headache', 'co2', now),
    mockMission('demo-baseline-20261114T060000', 'baseline', 'normal', now - 3 * 3600000),
  ];
  return { now, missions };
}

function mockSeries(mission, metric) {
  const meta = FALLBACK_METRICS.find((x) => x.metric === metric);
  const co2 = mission.variant === 'co2';
  const rnd = mulberry32(hashStr(metric + mission.mission_id));
  const gen = {
    HEART_RATE: (i) => 68 + 3 * Math.sin(i / 9) + rnd() * 2 + (co2 && i > 85 ? (i - 85) * 1.1 : 0),
    RESPIRATION_RATE: (i) => 14 + rnd() + (co2 && i > 85 ? (i - 85) * 0.25 : 0),
    CABIN_CO2_PARTIAL_PRESSURE: (i) => (co2 ? 2.0 + i * 0.012 : 2.3) + rnd() * 0.1,
    SPO2: (i) => (co2 && i >= 55 && i < 70 ? 88 + rnd() * 10 : 97 + rnd() - (co2 && i >= 95 ? 0.7 : 0)),
    BODY_TEMPERATURE: (i) => 36.7 + 0.1 * Math.sin(i / 14) + rnd() * 0.05,
  }[metric];
  const points = [];
  if (gen) {
    for (let i = 0; i < mission.n; i++) {
      let value = +gen(i).toFixed(2), q = 'VALID';
      if (metric === 'SPO2' && co2) {
        if (i >= 55 && i < 70) q = 'SUSPECT';
        if (i >= 80 && i < 95) { value = null; q = 'MISSING'; }
      }
      points.push({ observed_at: mission.t(i), value, reported_quality: q, activity_state: metric === 'HEART_RATE' || metric === 'RESPIRATION_RATE' ? 'REST' : null });
    }
  }
  return { metric, unit: meta ? meta.unit : '', target_id: meta && meta.category === 'environment' ? mission.environment_target_ids[0] : mission.crew_member_ids[0], points };
}

function mockRules(mission) {
  const last = (metric) => { const p = mockSeries(mission, metric).points; for (let i = p.length - 1; i >= 0; i--) if (p[i].value != null) return p[i].value; return null; };
  const ev = new Date(mission.end).toISOString();
  const base = (o) => ({ target_id: 'crew-01', evaluated_at: ev, source: 'DEMO eşik (proje varsayımı)', source_uri: 'https://www.nasa.gov/hrp/', evidence_level: 'F', validation_status: 'DEMO_PENDING_REVIEW', action_card: null, ...o });
  if (mission.variant !== 'co2') {
    return [
      base({ rule_id: 'VITAL_TEMP_TREND_V1', title: 'Vücut sıcaklığı eğilimi', metric: 'BODY_TEMPERATURE', health_attention: 'NORMAL', data_quality: 'VALID', observed_value: last('BODY_TEMPERATURE'), unit: '°C', threshold: 37.8, comparison: '>', window_minutes: 120, explanation: 'Kişisel başlangıçtan süreli sapma yok.' }),
      base({ rule_id: 'MULTI_CARDIO_RESP_V1', title: 'Kalp + solunum birlikte yükselme', metric: 'HEART_RATE', related_metrics: ['RESPIRATION_RATE'], health_attention: 'NORMAL', data_quality: 'VALID', observed_value: last('HEART_RATE'), unit: 'bpm', threshold: 100, comparison: '>', window_minutes: 15, explanation: 'Dinlenmede kalp ve solunum hızı beklenen aralıkta.', validation_status: 'APPROVED' }),
    ];
  }
  return [
    base({ rule_id: 'MULTI_CARDIO_RESP_V1', title: 'Kalp + solunum birlikte yükselme', metric: 'HEART_RATE', related_metrics: ['RESPIRATION_RATE'], health_attention: 'ALERT', data_quality: 'VALID', observed_value: last('HEART_RATE'), unit: 'bpm', threshold: 100, comparison: '>', window_minutes: 15,
      explanation: 'Dinlenmede kalp hızı 15 dakikadır eşiğin üstünde ve solunum hızı da yüksek; öznel belirti (baş dönmesi/yorgunluk) bildirildi. Bu bir teşhis değildir.',
      action_card: mockCard('MULTI_CARDIO_RESP_V1', 'ALERT', 'Ölçümleri doğrula ve görev prosedürüne başvur', 'Dinlenmede kalp ve solunum hızı birlikte yükseldi ve öznel belirti bildirildi.', ['Sensör yerleşimini kontrol edip ölçümü tekrarla.', 'Dinlenme durumunu doğrulayıp birkaç dakika sonra yeniden ölç.', 'Görev prosedürünün ilgili bölümünü aç ve yer kontrol ile iletişime geç.']) }),
    base({ rule_id: 'ENV_CO2_NOMINAL_V1', title: 'Kabin CO₂ nominal sınırı', metric: 'CABIN_CO2_PARTIAL_PRESSURE', target_id: 'iss-destiny-lab', health_attention: 'WATCH', data_quality: 'VALID', observed_value: last('CABIN_CO2_PARTIAL_PRESSURE'), unit: 'mmHg', threshold: 3.0, comparison: '>', window_minutes: 60,
      explanation: 'Bir saatlik ortalama kabin ppCO₂, NASA nominal habitat sınırı olan 3 mmHg\'yi aştı. Bu sınır "kritik" değil, izleme sınırıdır.', source: 'NASA-STD-3001 Vol. 2', source_uri: 'https://www.nasa.gov/', evidence_level: 'A', validation_status: 'APPROVED',
      action_card: { ...mockCard('ENV_CO2_NOMINAL_V1', 'WATCH', 'Kabin CO₂ değerini izle', 'Bir saatlik ortalama kabin CO₂ nominal sınırın üstünde.', ['Kabin CO₂ göstergesini birkaç dakikada bir kontrol et.', 'Görev prosedüründeki havalandırma kontrol adımlarına bak.']), validation_status: 'APPROVED' } }),
    base({ rule_id: 'VITAL_SPO2_SUSTAINED_V1', title: 'SpO2 düşüklüğü', metric: 'SPO2', health_attention: 'UNKNOWN', data_quality: 'SUSPECT', observed_value: last('SPO2'), unit: '%', threshold: 95.0, comparison: '<', window_minutes: 10,
      explanation: 'SpO2 sensörü verisi şüpheli ve bir bölümü eksik; güvenilir bir sağlık değerlendirmesi yapılamıyor. Sensör yerleşimini kontrol edip ölçümü tekrarlayın. Bu "normal" anlamına gelmez.' }),
    base({ rule_id: 'VITAL_TEMP_TREND_V1', title: 'Vücut sıcaklığı eğilimi', metric: 'BODY_TEMPERATURE', health_attention: 'NORMAL', data_quality: 'VALID', observed_value: last('BODY_TEMPERATURE'), unit: '°C', threshold: 37.8, comparison: '>', window_minutes: 120, explanation: 'Kişisel başlangıçtan süreli sapma yok.', validation_status: 'APPROVED' }),
  ];
}

function mockLabs() {
  const row = (analyte, unit, value, lo, hi, prev, base, phase = 'POST_FLIGHT') => ({
    analyte, unit, value, reference_low: lo, reference_high: hi,
    position_vs_reference: value < lo ? 'BELOW' : value > hi ? 'ABOVE' : 'WITHIN', phase,
    sampled_at: new Date(Date.now() - 2 * 86400000).toISOString(), source_type: 'OSDR', source_id: 'OSD-575',
    previous_value: prev, change_from_previous: prev == null ? null : +(value - prev).toFixed(2), baseline_value: base, change_from_baseline: base == null ? null : +(value - base).toFixed(2),
  });
  return {
    results: [
      row('GLUCOSE', 'mg/dL', 98, 70, 99, null, 90),
      row('SODIUM', 'mmol/L', 138, 135, 145, 140, 139),
      row('POTASSIUM', 'mmol/L', 5.3, 3.5, 5.1, 4.9, 4.4),
      row('CREATININE', 'mg/dL', 0.7, 0.74, 1.35, 0.8, 0.9),
      row('WBC', '10^3/µL', 7.2, 4.5, 11, 6.8, 6.5),
      row('HEMOGLOBIN', 'g/dL', 14.1, 13.5, 17.5, null, null),
      row('PLATELETS', '10^3/µL', 250, 150, 400, 240, 230),
      row('ALT', 'U/L', 24, 7, 56, 22, 20),
      row('AST', 'U/L', 31, 10, 40, 28, 25),
    ],
    limitations: ['Laboratuvar sonuçları periyodiktir; anlık durum göstergesi değildir.', 'Referans aralığına göre konum teşhis veya normal/anormal yargısı değildir.'],
  };
}

async function mockApi(method, path, body) {
  if (!MOCK) MOCK = buildMock();
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  if (window.__mockOffline) throw new ApiError('network', 0);
  const u = new URL(path, location.href);
  const p = u.pathname, q = u.searchParams;
  const findMission = (id) => MOCK.missions.find((m) => m.mission_id === id);

  if (method === 'GET' && p === '/v1/metrics') {
    return FALLBACK_METRICS.map((m) => ({ ...m }));
  }
  if (method === 'GET' && p === '/v1/missions') {
    return MOCK.missions.map((m) => ({ mission_id: m.mission_id, scenario_id: m.scenario_id, last_observed_at: new Date(m.end).toISOString(), crew_member_ids: m.crew_member_ids, environment_target_ids: m.environment_target_ids }));
  }
  if (method === 'GET' && p === '/v1/measurements') {
    const m = findMission(q.get('mission_id'));
    if (!m) throw new ApiError('HTTP 404', 404);
    const s = mockSeries(m, q.get('metric'));
    const lim = Math.min(Number(q.get('limit')) || 500, 2000);
    s.points = s.points.slice(-lim);
    return s;
  }
  let mt = p.match(/^\/v1\/crew\/([^/]+)\/status$/);
  if (method === 'GET' && mt) {
    const m = findMission(q.get('mission_id'));
    if (!m) throw new ApiError('HTTP 404', 404);
    const rules = mockRules(m);
    const top = rules.reduce((b, r) => (!b || ATTENTION[r.health_attention].rank > ATTENTION[b].rank ? r.health_attention : b), null);
    return { mission_id: m.mission_id, crew_member_id: mt[1], environment_target_id: q.get('environment_target_id'), generated_at: new Date().toISOString(), co2: null, latest_check_in: m.checkIn, limitations: ['Prototip: eşiklerin bir kısmı DEMO etiketlidir.', 'Öznel girişler yalnızca bağlamdır.'], overall_attention: top, rules };
  }
  mt = p.match(/^\/v1\/crew\/([^/]+)\/lab-results$/);
  if (method === 'GET' && mt) return mockLabs();
  if (method === 'GET' && p === '/v1/alerts') {
    const m = findMission(q.get('mission_id'));
    return m ? m.alerts.map((a) => ({ ...a })) : [];
  }
  mt = p.match(/^\/v1\/alerts\/([^/]+)\/acknowledge$/);
  if (method === 'POST' && mt) {
    for (const m of MOCK.missions) {
      const a = m.alerts.find((x) => x.id === decodeURIComponent(mt[1]));
      if (a) { a.status = 'ACKNOWLEDGED'; a.acknowledged_at = new Date().toISOString(); a.acknowledged_by = body.crew_member_id; return { ...a }; }
    }
    throw new ApiError('HTTP 404', 404);
  }
  if (method === 'POST' && p === '/v1/check-ins') {
    const m = findMission(body.mission_id);
    if (!m) throw new ApiError('HTTP 404', 404);
    m.checkIn = { ...body };
    return { ...body };
  }
  if (method === 'GET' && p === '/v1/demo/scenarios') {
    return [
      { scenario_id: 'co2-headache', title: 'CO₂ yükselmesi ve baş ağrısı', time_scale: 'acute', description: 'Kabin CO₂ değeri saatler içinde yükselir; astronot yorgunluk ve baş dönmesi bildirir; kalp ve solunum hızı birlikte artar.', expected: ['Kabin CO₂ kuralı İzle durumuna geçer.', 'Çok-sinyalli kalp/solunum kuralı Uyarı verir ve eylem kartı açılır.', 'SpO2 sensör verisi şüpheli olduğundan o kural Bilinmiyor kalır.'] },
      { scenario_id: 'baseline', title: 'Sakin referans gün', time_scale: 'subacute', description: 'Tüm ölçümler kişisel başlangıç çevresinde seyreder.', expected: ['Etkin dikkat kuralı yok.'] },
    ];
  }
  mt = p.match(/^\/v1\/demo\/scenarios\/([^/]+)\/run$/);
  if (method === 'POST' && mt) {
    await new Promise((r) => setTimeout(r, 1500));
    const sc = decodeURIComponent(mt[1]);
    const id = `demo-${sc}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
    MOCK.missions.unshift(mockMission(id, sc, sc === 'co2-headache' ? 'co2' : 'normal', Date.now()));
    return { mission_id: id, crew_member_id: 'crew-01', environment_target_id: 'iss-destiny-lab', scenario_id: sc, observations_posted: 600, summary: ['600 gözlem eklendi.', sc === 'co2-headache' ? '1 açık alarm üretildi.' : 'Alarm üretilmedi.'] };
  }
  throw new ApiError('HTTP 404', 404);
}

init();
