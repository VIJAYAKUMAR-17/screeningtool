export type ScreeningStatus = "clear" | "review_needed" | "flagged" | "pending" | "failed" | "running";

export interface DashboardStats {
  totalScreenings: number;
  matchesFound: number;
  clearedResults: number;
  pendingReviews: number;
}

export interface TrendPoint {
  date: string;
  screenings: number;
  matches: number;
}

export interface DistributionPoint {
  name: string;
  value: number;
}

export interface DashboardCharts {
  trend: TrendPoint[];
  matchDistribution: DistributionPoint[];
  statusBreakdown: DistributionPoint[];
}

export interface ScreenInput {
  companyName: string;
  country?: string;
  identifier?: string;
}

export interface ScreeningResult {
  id?: number;
  tier1RunId?: number;
  queriedName: string;
  status: ScreeningStatus;
  matchScore: number | null;
  ofacSource: string | null;
  ofacProgram: string | null;
  remarks: string | null;
  timestamp: string;
  matchedName?: string | null;
  matchType?: string | null;
  rawMatchData?: unknown;
  resultType?: "customer" | "vendor";
}

export interface ScreenResponse {
  runId: number;
  elapsedSeconds: number;
  results: ScreeningResult[];
  summary: {
    flagged: number;
    reviewNeeded: number;
    clear: number;
    total: number;
  };
}

export interface ReportRecord {
  reportId: number;
  fileName: string;
  downloadUrl: string;
  generatedTimestamp: string;
}

export interface ResultRecord extends ScreeningResult {
  resultId: number;
  screeningId: number;
  entityName: string;
  country?: string | null;
  identifier?: string | null;
}

export interface RunRecord {
  runId: number;
  customerName: string;
  status: string;
  vendorsScreened: number;
  flagged: number;
  reviewNeeded: number;
  clear: number;
  elapsedSeconds: number | null;
  startedAt: string;
}

export interface AuditLog {
  auditId: number;
  timestamp: string;
  entity: string;
  action: string;
  outcome: string;
  user: string;
}

export interface Tier2SourceRef {
  source: string;
  url?: string | null;
  note?: string | null;
}

export interface Tier2RelatedParty {
  name: string;
  relationship: string;
  jurisdiction?: string | null;
  registration_number?: string | null;
  source_refs: Tier2SourceRef[];
}

export interface Tier2SanctionsMatch {
  name: string;
  relationship: string;
  status: string;
  score?: number | null;
  matched_name?: string | null;
  list_source?: string | null;
  match_type?: string | null;
}

export interface Tier2AdverseMediaFinding {
  entity_name: string;
  keyword: string;
  source: string;
  title: string;
  url?: string | null;
}

export interface Tier2RiskFlag {
  code: string;
  description: string;
  points: number;
}

export interface Tier2ScreeningResult {
  run_id: number;
  tier1_run_id: number;
  target_entity: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  parent_companies: Tier2RelatedParty[];
  ultimate_parent: Tier2RelatedParty[];
  subsidiaries: Tier2RelatedParty[];
  sister_entities: Tier2RelatedParty[];
  directors_and_officers: Tier2RelatedParty[];
  major_shareholders: Tier2RelatedParty[];
  beneficial_owners: Tier2RelatedParty[];
  related_entities: Tier2RelatedParty[];
  sanctions_matches: Tier2SanctionsMatch[];
  adverse_media_findings: Tier2AdverseMediaFinding[];
  risk_flags: Tier2RiskFlag[];
  data_sources_used: string[];
}

export interface Tier2DashboardSummary {
  total_tier2_runs: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  latest_runs: Tier2ScreeningResult[];
}
