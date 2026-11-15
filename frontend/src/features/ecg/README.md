# `src/features/ecg` — recorded ECG strip

`<EcgStrip />` replays a **recorded** 30 s ECG excerpt as a clinical-monitor
style sweep (moving write head, blank erase gap, amber trace on a dark grid).
The data is real: PhysioNet MIT-BIH Normal Sinus Rhythm Database v1.0.0,
record 16265, signal `ECG1`, 128 Hz, unit conversion only
(see `public/ecg/ATTRIBUTION.md`, licence ODC-By 1.0).

It is **not** a live sensor and it derives **nothing** from the signal: no heart
rate, no rhythm reading, no alarm. The HUD heart-rate number comes from live
API data separately; do not place the strip so that it looks like the source
of that number.

```tsx
import { EcgStrip } from '../ecg';

<EcgStrip />                 // 160 px trace
<EcgStrip compact />         // 96 px trace, smaller text (HUD card)
<EcgStrip height={120} />    // custom trace height
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `height` | `number` | `160` (`96` when compact) | Trace area height in CSS px (min 48). Width fills the parent. |
| `compact` | `boolean` | `false` | Tighter spacing, `--fs-xs` label. The label is never hidden. |
| `className` | `string` | — | Extra class on the root `<figure>`. |

Other exports: `ECG_LABEL` (the fixed label text), `loadEcg()` / `ECG_URL`
(`${BASE_URL}ecg/nsrdb-16265.json` = `/ui/ecg/nsrdb-16265.json`),
`ECG_ATTRIBUTION_URL`, type `EcgRecord`.

## Behaviour
- Always visible label: "Kayıtlı örnek EKG — MIT-BIH NSR 16265 (PhysioNet) ·
  canlı sensör değil · ritim yorumu yapılmaz", a "Kayıt · canlı değil" tag
  (clock icon + text) and a local link to `ATTRIBUTION.md` (works offline).
- Scale: grid minor box 0.2 s × 0.5 mV, kept at the 25 mm/s : 10 mm/mV paper
  ratio. One nominal mm is 96/25.4 px and shrinks only when the strip is too
  short for the excerpt's amplitude range. Playback runs at true speed
  (1 s of recording per 1 s of wall time), looping the 30 s excerpt; the line
  is broken at the loop restart and a short dashed tick marks it.
- Canvas is DPR-aware (capped at 3) and redrawn on resize (ResizeObserver).
- Animation pauses when the tab is hidden or the strip is scrolled off screen;
  a "Durdur / Oynat" button (WCAG 2.2.2) pauses it manually.
- `prefers-reduced-motion: reduce`: no animation; the whole 30 s is drawn
  statically fitted to the width (time lines drop to 1 s if 0.2 s would be
  < 4 px apart) and the scale line says so.
- Loading: skeleton. Missing/invalid file (including an HTML fallback page):
  honest `EmptyState` with "Tekrar dene"; no synthetic waveform is ever drawn.
- Colours come from tokens (`--data` trace, `--hud-line*` grid, `--bg-2`
  screen); no glow, no gradients.

## Mounting notes (for the shell/HUD session)
- Self-contained; renders its own `<figure>`, no `<Panel>`. Put it inside a
  HUD card or a `Panel` and give it a width; it fills the parent width.
- Suggested: a HUD card below/next to the heart-rate tile titled e.g.
  "Örnek EKG (kayıt)", `<EcgStrip compact />`. Keep it visually separate from
  the live heart-rate value.
- Data files live in `public/ecg/` and are copied to `dist/ecg/` by Vite;
  FastAPI serves them under `/ui/ecg/`.
