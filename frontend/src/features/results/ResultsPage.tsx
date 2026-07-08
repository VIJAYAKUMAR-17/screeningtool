import { ScreeningRunsPanel } from "./ScreeningRunsPanel";

export function ResultsPage() {
  return (
    <ScreeningRunsPanel
      showPageTitle
      title="Screening History"
      subtitle="All past screening runs. Click anywhere on a row to view Tier 1 and Tier 2 details."
      tableHeight={600}
    />
  );
}
