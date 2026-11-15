// SKELETON — owned by the UI-shell track (layout, design system, selection,
// auth UI, banners). Feature tracks never edit this file.
import { BodyMapPanel } from './features/body3d';
import { AlertsPanel, VitalsPanel } from './features/vitals';
import { DemoScenarioControl, InputsPanel } from './features/inputs';
import { GroundPanel } from './features/ground';

export default function App() {
  return (
    <main>
      <h1>SpaceApp Logar</h1>
      <DemoScenarioControl />
      <BodyMapPanel />
      <AlertsPanel />
      <VitalsPanel />
      <InputsPanel />
      <GroundPanel />
    </main>
  );
}
