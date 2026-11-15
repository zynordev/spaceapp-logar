// "Yer kontrol konsolu": full-screen Earth mission-control view (#/yer).
// The onboard system works on its own; this screen shows the same events
// the ground sees, but only after the one-way light delay. The delay is a
// display-only simulation on this client — the API itself answers instantly.
import { useCallback, useEffect, useRef, useState } from 'react';
import { qs, usePolling } from '../../lib/api';
import { useApp } from '../../lib/store';
import { LoginDialog } from '../../shell/LoginDialog';
import { selectMission, useAuthBootstrap, useMissions } from '../../shell/useBootstrap';
import { AttentionBadge, Button, Chip, ErrorNote, Icon, Select, ToastHost, roleLabel, toAttention, toast } from '../../ui';
import { COMPRESSIONS, PRESETS, clampSeconds, clock, formatDelay, resolveDelay, useDelaySettings, type Compression, type PresetId } from './delay';
import { buildEvents, byNewest, seenEntries, type LocalAck } from './events';
import { EscalationList, PacketPanel } from './GroundActions';
import { SignalLink } from './SignalLink';
import { Timeline } from './Timeline';
import { useNow, useReducedMotion, useTracker } from './transit';
import type { AlertRead, CrewStatusLite, EscalationRead, Recipient, SyncStatusRead } from './types';
import './console.css';

const EMPTY_ALERTS: AlertRead[] = [];
const EMPTY_ESC: EscalationRead[] = [];

interface Snapshot {
  key: string;
  attention: string;
  seenAt: number;
}

export function GroundConsoleApp() {
  const auth = useAuthBootstrap();
  const missions = useMissions();
  const missionId = useApp((s) => s.missionId);
  const crewId = useApp((s) => s.crewId);
  const envId = useApp((s) => s.environmentTargetId);
  const token = useApp((s) => s.token);
  const user = useApp((s) => s.user);
  const offline = useApp((s) => s.offline);
  const loginRequired = useApp((s) => s.loginRequired);
  const setSelection = useApp((s) => s.setSelection);
  const [loginOpen, setLoginOpen] = useState(false);

  const [settings, update] = useDelaySettings();
  const reduced = useReducedMotion();
  const now = useNow(reduced ? 1000 : 200);

  const status = usePolling<SyncStatusRead>(missionId ? `/v1/sync/status${qs({ mission_id: missionId })}` : null, 5000);
  const alertsQ = usePolling<AlertRead[]>(missionId ? `/v1/alerts${qs({ mission_id: missionId, limit: 50 })}` : null, 3000);
  const escQ = usePolling<EscalationRead[]>(missionId ? `/v1/sync/escalations${qs({ mission_id: missionId })}` : null, 3000);
  const crewQ = usePolling<CrewStatusLite>(
    missionId && crewId ? `/v1/crew/${encodeURIComponent(crewId)}/status${qs({ mission_id: missionId, environment_target_id: envId })}` : null,
    5000,
  );

  const serverDelay = status.data?.link_delay_seconds ?? null;
  const resolved = resolveDelay(settings, serverDelay);
  const delaySeconds = resolved ?? 0;
  const compression = settings.compression;

  const tracker = useTracker(missionId);
  const alerts = alertsQ.data ?? EMPTY_ALERTS;
  const escalations = escQ.data ?? EMPTY_ESC;
  const [acks, setAcks] = useState<LocalAck[]>([]);
  useEffect(() => setAcks([]), [missionId]);

  const { register } = tracker;
  useEffect(() => {
    register(seenEntries(alerts, escalations));
  }, [alerts, escalations, register]);

  // Crew status snapshots: the ground only knows a change after the delay.
  const snaps = useRef<Snapshot[]>([]);
  const snapScope = useRef<string | null>(null);
  const scope = `${missionId}|${crewId}`;
  if (snapScope.current !== scope) {
    snapScope.current = scope;
    snaps.current = [];
  }
  const shipAttention = crewQ.data ? String(crewQ.data.overall_attention) : null;
  useEffect(() => {
    if (!shipAttention) return;
    const last = snaps.current[snaps.current.length - 1];
    if (last && last.attention === shipAttention) return;
    const key = `STATUS:${snaps.current.length}:${shipAttention}`;
    register([{ key, eventAt: null }]);
    snaps.current = [...snaps.current, { key, attention: shipAttention, seenAt: Date.now() }];
  }, [shipAttention, register]);

  // Recomputed every clock tick (cheap: at most ~100 items).
  const events = buildEvents(alerts, escalations, acks, tracker, now, delaySeconds, compression);
  const shipEvents = events.filter((e) => e.dir === 'down' || e.transit.phase !== 'transit').sort(byNewest);
  const earthEvents = events.filter((e) => e.dir === 'up' || e.transit.phase !== 'transit').sort(byNewest);
  const inTransit = events.filter((e) => e.transit.phase === 'transit').sort((a, b) => a.transit.arriveAt - b.transit.arriveAt);
  const escalationEvents = events.filter((e) => e.kind === 'ESCALATION');

  // What the ground knows about the crew's overall state.
  let earthAttention: string | null = null;
  let earthSince: number | null = null;
  for (const s of snaps.current) {
    const seen = tracker.get(s.key);
    if (!seen) continue;
    const arrive = seen.firstSeen + (delaySeconds * 1000) / compression;
    if (arrive <= now) {
      earthAttention = s.attention;
      earthSince = arrive;
    }
  }

  const [recipient, setRecipient] = useState<Recipient>('FLIGHT_SURGEON');
  const [prepareToken, setPrepareToken] = useState(0);
  const prepareFs = useCallback(() => {
    setRecipient('FLIGHT_SURGEON');
    setPrepareToken((t) => t + 1);
  }, []);
  const onAcked = useCallback((ack: LocalAck) => setAcks((list) => [...list, ack]), []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Yer kontrol konsolu — SpaceApp Logar';
    return () => {
      document.title = prev;
    };
  }, []);

  const forced = auth.authRequired === true && !token;
  const dialogOpen = loginOpen || loginRequired || forced;
  const closeLogin = forced
    ? undefined
    : () => {
        setLoginOpen(false);
        useApp.getState().setLoginRequired(false);
      };

  const list = missions.missions ?? [];
  const current = missions.current;
  const crews = current?.crew_member_ids ?? (crewId ? [crewId] : []);
  const replay = () => {
    tracker.replay();
    snaps.current = snaps.current.slice(-1);
    toast('Simülasyon yeniden başladı: bilinen tüm öğeler şimdi yola çıktı.');
  };

  const preset = PRESETS.find((p) => p.id === settings.preset) ?? PRESETS[0];
  const roleNote =
    user?.role === 'GROUND'
      ? null
      : user?.anonymous
        ? 'Demo modu: oturum açılmadan onay verilebilir (yetki bayrağı kapalı).'
        : user?.role
          ? `Rolünüz: ${roleLabel(user.role)}. Onay yalnız yer ekibi (GROUND) rolüyle verilebilir.`
          : null;

  return (
    <div className="console-root">
      <a
        className="skip-link"
        href="#console-main"
        onClick={(e) => {
          // The hash is the route (#/yer): move focus without touching it.
          e.preventDefault();
          document.getElementById('console-main')?.focus();
        }}
      >
        Ana içeriğe geç
      </a>
      <header className="console-header">
        <div className="console-header__title">
          <Icon name="signal" size={24} />
          <div>
            <h1>Dünya Görev Kontrol — uçuş cerrahı konsolu</h1>
            <p className="console-muted">Gemideki karar destek sistemi kendi başına çalışır; yer ekibi aynı olayları ışık gecikmesiyle görür.</p>
          </div>
        </div>
        <div className="console-header__controls">
          <label className="console-field">
            <span>Görev</span>
            <Select
              value={missionId ?? ''}
              onChange={(e) => {
                const m = list.find((x) => x.mission_id === e.target.value);
                if (m) selectMission(m);
              }}
              disabled={list.length === 0}
            >
              {missionId && !current && <option value={missionId}>{missionId}</option>}
              {list.length === 0 && !missionId && <option value="">Görev yok</option>}
              {list.map((m) => (
                <option key={m.mission_id} value={m.mission_id}>
                  {m.mission_id}
                </option>
              ))}
            </Select>
          </label>
          <label className="console-field">
            <span>Ekip üyesi</span>
            <Select value={crewId ?? ''} onChange={(e) => setSelection({ crewId: e.target.value || null })} disabled={crews.length === 0}>
              {crews.length === 0 && <option value="">—</option>}
              {crews.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <div className="console-header__links">
            {offline ? (
              <Chip tone="danger" icon="offline">
                Sunucu bağlantısı yok
              </Chip>
            ) : (
              <Chip tone="ok" icon="check">
                Sunucu bağlı
              </Chip>
            )}
            {token ? (
              <Button
                size="sm"
                variant="ghost"
                icon="logout"
                onClick={() => {
                  useApp.getState().setToken(null);
                  toast('Oturum kapatıldı.');
                }}
              >
                {roleLabel(user?.role)} · çıkış
              </Button>
            ) : auth.authConfigured !== false ? (
              <Button size="sm" variant="ghost" icon="user" onClick={() => setLoginOpen(true)}>
                Oturum aç
              </Button>
            ) : null}
            <a className="console-back" href="#/">
              <Icon name="swap" size={16} /> Gemi ekranına dön
            </a>
          </div>
        </div>
      </header>

      <div className="console-disclaimer" role="note">
        <Icon name="warning" size={16} />
        <span>
          <strong>Gecikme simülasyonu — yalnız gösterim.</strong> Veriler sunucudan anında gelir; gecikmeyi yalnız bu ekran canlandırır. Konsol teşhis
          koymaz, tedavi önermez: gemideki karar destek sisteminin neyi işaretlediğini ve yer ekibinin bunu en erken ne zaman bilebileceğini gösterir.
        </span>
        <Chip tone="demo">DEMO</Chip>
      </div>

      <main id="console-main" className="console-main" tabIndex={-1}>
        <section className="console-controls" aria-label="Gecikme simülasyonu ayarları">
          <fieldset className="console-seg">
            <legend>Tek yön ışık gecikmesi</legend>
            <div className="console-seg__opts">
              {PRESETS.map((p) => {
                const disabled = p.id === 'server' && serverDelay === null;
                return (
                  <label key={p.id} className={`console-seg__opt${settings.preset === p.id ? ' is-on' : ''}${disabled ? ' is-off' : ''}`}>
                    <input
                      type="radio"
                      name="console-preset"
                      value={p.id}
                      checked={settings.preset === p.id}
                      onChange={() => update({ preset: p.id as PresetId })}
                    />
                    <span className="console-seg__label">{p.label}</span>
                    <span className="console-seg__hint">
                      {p.id === 'server' ? (serverDelay === null ? 'ayarlı değil' : formatDelay(serverDelay)) : p.id === 'custom' ? 'saniye' : p.hint}
                    </span>
                  </label>
                );
              })}
            </div>
            {settings.preset === 'custom' && (
              <label className="console-field console-field--inline">
                <span>Özel gecikme (sn)</span>
                <input
                  className="ui-input console-custom"
                  type="number"
                  min={0}
                  max={7200}
                  step={0.1}
                  inputMode="decimal"
                  value={settings.customSeconds}
                  onChange={(e) => update({ customSeconds: clampSeconds(Number(e.target.value)) })}
                />
              </label>
            )}
            {settings.preset === 'server' && serverDelay === null && (
              <p className="console-inline-note">
                <Icon name="info" size={14} /> Sunucuda SPACEAPP_LINK_DELAY_SECONDS ayarlı değil (Bilinmiyor); gecikme 0 sn kabul edildi. Bir hazır ayar seçin.
              </p>
            )}
          </fieldset>

          <fieldset className="console-seg console-seg--compact">
            <legend>Hızlandırılmış gösterim</legend>
            <div className="console-seg__opts">
              {COMPRESSIONS.map((c) => (
                <label key={c} className={`console-seg__opt${compression === c ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="console-compression"
                    value={c}
                    checked={compression === c}
                    onChange={() => update({ compression: c as Compression })}
                  />
                  <span className="console-seg__label console-num">{c}×</span>
                  <span className="console-seg__hint">{c === 1 ? 'gerçek süre' : 'hızlı'}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="secondary" icon="refresh" onClick={replay}>
              Yeniden oynat
            </Button>
          </fieldset>
          <p className="console-controls__now console-muted">
            Seçili: {preset.label} · gerçek gecikme <span className="console-num">{formatDelay(delaySeconds)}</span>
            {compression > 1 && (
              <>
                {' '}
                · gösterimde <span className="console-num">{formatDelay(delaySeconds / compression)}</span>
              </>
            )}
          </p>
        </section>

        {!missionId ? (
          missions.error ? (
            <ErrorNote error={missions.error} what="Görevler" />
          ) : (
            <p className="console-muted">Görev bekleniyor… Bir demo senaryosu çalıştırıldığında burada görünür.</p>
          )
        ) : (
          <>
            <SignalLink inTransit={inTransit} delaySeconds={delaySeconds} compression={compression} reducedMotion={reduced} />

            {(alertsQ.error || escQ.error) && (
              <div className="console-errors">
                {alertsQ.error && <ErrorNote error={alertsQ.error} what="Alarmlar" compact />}
                {escQ.error && <ErrorNote error={escQ.error} what="Bildirimler" compact />}
              </div>
            )}

            <div className="console-cols">
              <Timeline
                side="ship"
                title="Gemi (anlık)"
                subtitle="Karar destek sistemi bu olayları anında işaretledi."
                status={
                  <div className="console-state">
                    <span className="console-state__label">Gemideki genel durum</span>
                    {shipAttention ? <AttentionBadge level={toAttention(shipAttention)} /> : <AttentionBadge level="UNKNOWN">Bilinmiyor</AttentionBadge>}
                    <span className="console-muted">{crewId ?? '—'}</span>
                  </div>
                }
                events={shipEvents}
                allEvents={events}
                acks={acks}
                empty="Gemide işaretlenmiş olay yok"
              />
              <Timeline
                side="earth"
                title="Dünya (gecikmeli)"
                subtitle="Yer ekibi bir olayı ancak sinyal ulaştığında bilebilir."
                status={
                  <div className="console-state">
                    <span className="console-state__label">Dünya'nın bildiği durum</span>
                    {earthAttention ? (
                      <AttentionBadge level={toAttention(earthAttention)} />
                    ) : (
                      <AttentionBadge level="UNKNOWN">Henüz ulaşmadı</AttentionBadge>
                    )}
                    <span className="console-muted">{earthSince ? `ulaştı ${clock(earthSince)}` : '—'}</span>
                  </div>
                }
                events={earthEvents}
                allEvents={events}
                acks={acks}
                empty="Dünya'ya henüz bir olay ulaşmadı"
              />
            </div>

            <div className="console-cols console-cols--actions">
              <EscalationList events={escalationEvents} onPrepare={prepareFs} />
              <div className="console-stack">
                {roleNote && (
                  <p className="console-inline-note">
                    <Icon name={user?.anonymous ? 'info' : 'lock'} size={14} /> {roleNote}
                  </p>
                )}
                <PacketPanel
                  missionId={missionId}
                  recipients={status.data?.recipients ?? null}
                  recipient={recipient}
                  onRecipient={setRecipient}
                  prepareToken={prepareToken}
                  tracker={tracker}
                  now={now}
                  delaySeconds={delaySeconds}
                  compression={compression}
                  onAcked={onAcked}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <LoginDialog open={dialogOpen} onClose={closeLogin} />
      <ToastHost />
    </div>
  );
}
