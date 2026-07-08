import { formatISO, subDays } from "date-fns";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  AuditLog,
  DashboardCharts,
  DashboardStats,
  ResultRecord,
  RunRecord,
  ScreenInput,
  ScreenResponse,
  ScreeningResult,
} from "@/types/api";
import { http } from "./http";

type ApiRecord = Record<string, unknown>;

type ScreenPayload = { customerName: string; entities: ScreenInput[] };

type BulkProgress = {
  processed: number;
  matchesFound: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
};

type BulkScreenOptions = {
  batchSize?: number;
  onProgress?: (progress: BulkProgress) => void;
  timeoutMs?: number;
};

const DEFAULT_BULK_BATCH_SIZE = 300;
const DASHBOARD_REPORT_LIMIT = 100;
const USE_LIVE_OFAC = import.meta.env.VITE_LIVE_OFAC === "true";
const LIVE_OFAC_FALLBACK_TO_DB = import.meta.env.VITE_LIVE_OFAC_FALLBACK_TO_DB !== "false";
const DEFAULT_DB_FALLBACK_LISTS = ["OFAC", "AUSTRALIA", "UN", "BIS", "EU"];

const parseDbFallbackLists = (): string[] => {
  const raw = import.meta.env.VITE_DB_FALLBACK_LISTS;
  if (typeof raw !== "string" || !raw.trim()) {
    return DEFAULT_DB_FALLBACK_LISTS;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length ? Array.from(new Set(parsed)) : DEFAULT_DB_FALLBACK_LISTS;
};

const DB_FALLBACK_LISTS = parseDbFallbackLists();

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0) => (typeof value === "number" ? value : fallback);
const toVendorsScreened = (run: ApiRecord) => {
  const vendors = num(run.vendors_screened);
  const outcomes = num(run.flagged) + num(run.review_needed) + num(run.clear);
  return Math.max(vendors, outcomes);
};

const toResult = (item: ApiRecord): ScreeningResult => ({
  id: typeof item.result_id === "number" ? item.result_id : typeof item.id === "number" ? item.id : undefined,
  queriedName: str(item.vendor_name ?? item.entity_name ?? item.queried_name, "Unknown"),
  status: (str(item.status, "clear") as ScreeningResult["status"]) ?? "clear",
  matchScore: typeof item.match_score === "number" ? item.match_score : typeof item.score === "number" ? item.score : null,
  ofacSource: str(item.list_source ?? item.ofac_source, "OFAC"),
  ofacProgram: typeof (item.program ?? item.ofac_program ?? item.list) === "string" ? String(item.program ?? item.ofac_program ?? item.list) : null,
  remarks: typeof (item.remarks ?? item.ai_reasoning) === "string" ? String(item.remarks ?? item.ai_reasoning) : null,
  timestamp: str(item.timestamp, formatISO(new Date())),
  matchedName: typeof (item.matched_name ?? item.top_match) === "string" ? String(item.matched_name ?? item.top_match) : null,
  matchType: typeof item.match_type === "string" ? item.match_type : null,
  rawMatchData: item.raw_match_data ?? item.all_matches ?? null,
  resultType: item.result_type === "customer" ? "customer" : "vendor",
});

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

const fallbackStats: DashboardStats = {
  totalScreenings: 0,
  matchesFound: 0,
  clearedResults: 0,
  pendingReviews: 0,
};

const fallbackCharts: DashboardCharts = {
  trend: Array.from({ length: 7 }).map((_, idx) => ({
    date: formatISO(subDays(new Date(), 6 - idx), { representation: "date" }),
    screenings: 0,
    matches: 0,
  })),
  matchDistribution: [
    { name: "Clear", value: 0 },
    { name: "Review", value: 0 },
    { name: "Match", value: 0 },
  ],
  statusBreakdown: [
    { name: "Clear", value: 0 },
    { name: "Review", value: 0 },
    { name: "Match", value: 0 },
  ],
};

export const api = {
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const { data } = await http.get<ApiRecord>("/dashboard/stats");
      return {
        totalScreenings: num(data.total_screenings ?? data.totalScreenings),
        matchesFound: num(data.matches_found ?? data.matchesFound),
        clearedResults: num(data.cleared_results ?? data.clearedResults),
        pendingReviews: num(data.pending_reviews ?? data.pendingReviews),
      };
    } catch {
      try {
        const { data } = await http.get<ApiRecord[]>(`/report/?limit=${DASHBOARD_REPORT_LIMIT}`);
        const runs = Array.isArray(data) ? data : [];
        return {
          totalScreenings: runs.reduce((sum, r) => sum + toVendorsScreened(r), 0),
          matchesFound: runs.reduce((sum, r) => sum + num(r.flagged), 0),
          clearedResults: runs.reduce((sum, r) => sum + num(r.clear), 0),
          pendingReviews: runs.reduce((sum, r) => sum + num(r.review_needed), 0),
        };
      } catch {
        return fallbackStats;
      }
    }
  },

  async getDashboardCharts(): Promise<DashboardCharts> {
    try {
      const { data } = await http.get<ApiRecord>("/dashboard/charts");
      return {
        trend: Array.isArray(data.trend) ? (data.trend as DashboardCharts["trend"]) : fallbackCharts.trend,
        matchDistribution: Array.isArray(data.match_distribution)
          ? (data.match_distribution as DashboardCharts["matchDistribution"])
          : Array.isArray(data.matchDistribution)
            ? (data.matchDistribution as DashboardCharts["matchDistribution"])
            : fallbackCharts.matchDistribution,
        statusBreakdown: Array.isArray(data.status_breakdown)
          ? (data.status_breakdown as DashboardCharts["statusBreakdown"])
          : Array.isArray(data.statusBreakdown)
            ? (data.statusBreakdown as DashboardCharts["statusBreakdown"])
            : fallbackCharts.statusBreakdown,
      };
    } catch {
      try {
        const { data } = await http.get<ApiRecord[]>(`/report/?limit=${DASHBOARD_REPORT_LIMIT}`);
        const runs = Array.isArray(data) ? data : [];

        // Build 7-day trend from run timestamps
        const byDate = new Map<string, { screenings: number; matches: number }>();
        for (let i = 6; i >= 0; i--) {
          byDate.set(
            formatISO(subDays(new Date(), i), { representation: "date" }),
            { screenings: 0, matches: 0 },
          );
        }
        for (const run of runs) {
          const date = str(run.started_at).slice(0, 10);
          if (byDate.has(date)) {
            const entry = byDate.get(date)!;
            entry.screenings += toVendorsScreened(run);
            entry.matches += num(run.flagged);
          }
        }
        const trend = Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v }));

        const totalFlagged = runs.reduce((sum, r) => sum + num(r.flagged), 0);
        const totalReview = runs.reduce((sum, r) => sum + num(r.review_needed), 0);
        const totalClear = runs.reduce((sum, r) => sum + num(r.clear), 0);
        const distribution = [
          { name: "Clear", value: totalClear },
          { name: "Review", value: totalReview },
          { name: "Match", value: totalFlagged },
        ];

        return { trend, matchDistribution: distribution, statusBreakdown: distribution };
      } catch {
        return fallbackCharts;
      }
    }
  },

  async screenEntities(payload: ScreenPayload, options: { timeoutMs?: number } = {}): Promise<ScreenResponse> {
    const vendors = payload.entities.map((e) => e.companyName);
    const createRequestBody = (liveOfac: boolean) => ({
      customer_name: payload.customerName,
      vendors,
      lists: liveOfac ? ["OFAC"] : DB_FALLBACK_LISTS,
      use_ai: false,
      live_ofac: liveOfac,
    });

    let data: ApiRecord;
    try {
      const response = await http.post<ApiRecord>("/screen/", createRequestBody(USE_LIVE_OFAC), {
        // Large screening jobs can exceed the default 30s client timeout.
        timeout: options.timeoutMs ?? 0,
      });
      data = response.data;
    } catch (error) {
      const message = (error as Error).message;
      const shouldFallback =
        USE_LIVE_OFAC &&
        LIVE_OFAC_FALLBACK_TO_DB &&
        (message.includes("Live OFAC fetch failed") ||
          message.includes("Outbound network/socket access appears blocked") ||
          message.includes("getaddrinfo failed") ||
          message.includes("Network/socket access denied"));

      if (!shouldFallback) {
        throw error;
      }

      toast.error(
        "Live sanctions list service is unreachable. Results below come from the local database copy, which may be out of date.",
        { id: "live-fallback", duration: 8000 },
      );
      const response = await http.post<ApiRecord>("/screen/", createRequestBody(false), {
        timeout: options.timeoutMs ?? 0,
      });
      data = response.data;
    }

    const resultsRaw = Array.isArray(data.results) ? (data.results as ApiRecord[]) : [];
    const sourcesRaw = (data.screening_sources ?? {}) as ApiRecord;
    return {
      runId: num(data.run_id),
      elapsedSeconds: num(data.elapsed_seconds),
      screeningSources: {
        mode: (str(sourcesRaw.mode) as "live_csl" | "database" | "") ?? "",
        listsChecked: Array.isArray(sourcesRaw.lists_checked) ? (sourcesRaw.lists_checked as string[]) : [],
        checkedAt: str(sourcesRaw.checked_at),
      },
      results: resultsRaw.map((item) => toResult(item)),
      summary: {
        flagged: num(data.flagged),
        reviewNeeded: num(data.review_needed),
        clear: num(data.clear),
        total: num(data.total_vendors, vendors.length),
      },
    };
  },

  async bulkScreen(payload: ScreenPayload, options: BulkScreenOptions = {}): Promise<ScreenResponse> {
    const entities = payload.entities;
    if (!entities.length) {
      return {
        runId: 0,
        elapsedSeconds: 0,
        results: [],
        summary: { flagged: 0, reviewNeeded: 0, clear: 0, total: 0 },
      };
    }

    const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BULK_BATCH_SIZE);
    const chunks = chunkArray(entities, batchSize);

    let runId = 0;
    let elapsedSeconds = 0;
    let processed = 0;
    let flagged = 0;
    let reviewNeeded = 0;
    let clear = 0;
    const allResults: ScreenResponse["results"] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const response = await api.screenEntities(
        {
          customerName: payload.customerName,
          entities: chunks[index],
        },
        { timeoutMs: options.timeoutMs },
      );

      runId = response.runId;
      elapsedSeconds += response.elapsedSeconds;
      processed += response.summary.total;
      flagged += response.summary.flagged;
      reviewNeeded += response.summary.reviewNeeded;
      clear += response.summary.clear;
      allResults.push(
        ...response.results.map((result) => ({
          ...result,
          tier1RunId: response.runId,
        })),
      );

      options.onProgress?.({
        processed,
        matchesFound: flagged,
        total: entities.length,
        currentBatch: index + 1,
        totalBatches: chunks.length,
      });
    }

    return {
      runId,
      elapsedSeconds,
      results: allResults,
      summary: {
        flagged,
        reviewNeeded,
        clear,
        total: entities.length,
      },
    };
  },

  async getScreeningRuns(): Promise<RunRecord[]> {
    const { data } = await http.get<ApiRecord[]>("/report/?limit=100");
    const rows = Array.isArray(data) ? data : [];
    return rows.map((run) => ({
      runId: num(run.run_id),
      customerName: str(run.customer_name, "Unknown"),
      status: str(run.status, "complete"),
      vendorsScreened: num(run.vendors_screened),
      flagged: num(run.flagged),
      reviewNeeded: num(run.review_needed),
      clear: num(run.clear),
      elapsedSeconds: typeof run.elapsed_seconds === "number" ? run.elapsed_seconds : null,
      startedAt: str(run.started_at, formatISO(new Date())),
    }));
  },

  async getRunDetails(runId: number): Promise<ScreenResponse> {
    const { data } = await http.get<ApiRecord>(`/report/${runId}`);
    const resultsRaw = Array.isArray(data.results) ? (data.results as ApiRecord[]) : [];
    return {
      runId: num(data.run_id, runId),
      elapsedSeconds: num(data.elapsed_seconds),
      results: resultsRaw.map((item) => toResult(item)),
      summary: {
        flagged: resultsRaw.filter((r) => str(r.status) === "flagged").length,
        reviewNeeded: resultsRaw.filter((r) => str(r.status) === "review_needed").length,
        clear: resultsRaw.filter((r) => str(r.status) === "clear").length,
        total: resultsRaw.length,
      },
    };
  },

  async getResults(): Promise<ResultRecord[]> {
    try {
      const { data } = await http.get<ApiRecord[]>("/results");
      const rows = Array.isArray(data) ? data : [];
      return rows.map((item) => ({
        ...toResult(item),
        resultId: num(item.result_id ?? item.id),
        screeningId: num(item.screening_id ?? item.run_id),
        entityName: str(item.entity_name ?? item.vendor_name, "Unknown"),
        country: typeof item.country === "string" ? item.country : null,
        identifier: typeof item.identifier === "string" ? item.identifier : null,
      }));
    } catch {
      const { data } = await http.get<ApiRecord[]>("/report/?limit=50");
      const runs = Array.isArray(data) ? data : [];
      return runs.map((run) => ({
        ...toResult({
          vendor_name: str(run.customer_name),
          status: str(run.status, "clear"),
          list_source: "OFAC",
          remarks: `Run ${String(run.run_id ?? "")}`,
          timestamp: str(run.started_at, formatISO(new Date())),
        }),
        resultId: num(run.run_id),
        screeningId: num(run.run_id),
        entityName: str(run.customer_name, "Unknown"),
      }));
    }
  },

  async getResultById(id: number): Promise<ResultRecord> {
    const { data } = await http.get<ApiRecord>(`/results/${id}`);
    return {
      ...toResult(data),
      resultId: num(data.result_id ?? data.id, id),
      screeningId: num(data.screening_id ?? data.run_id),
      entityName: str(data.entity_name ?? data.vendor_name, "Unknown"),
      country: typeof data.country === "string" ? data.country : null,
      identifier: typeof data.identifier === "string" ? data.identifier : null,
    };
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    try {
      const { data } = await http.get<ApiRecord[]>("/audit-logs");
      const rows = Array.isArray(data) ? data : [];
      return rows.map((item) => ({
        auditId: num(item.audit_id ?? item.id),
        timestamp: str(item.timestamp, formatISO(new Date())),
        entity: str(item.entity ?? item.vendor_name, "Unknown"),
        action: str(item.action, "SCREENING"),
        outcome: str(item.outcome ?? item.status, "UNKNOWN"),
        user: str(item.user, "Compliance User"),
      }));
    } catch {
      const { data } = await http.get<ApiRecord[]>("/report/?limit=50");
      const runs = Array.isArray(data) ? data : [];
      return runs.map((run) => ({
        auditId: num(run.run_id),
        timestamp: str(run.started_at, formatISO(new Date())),
        entity: str(run.customer_name, "Unknown"),
        action: "SCREENING_RUN",
        outcome: str(run.status, "UNKNOWN"),
        user: "System",
      }));
    }
  },

  async downloadReport(reportId: number, kind: "pdf" | "excel") {
    const extension = kind === "excel" ? "xlsx" : "pdf";
    const endpoint = kind === "excel" ? "excel" : "pdf";
    const { data } = await http.get(`/report/${reportId}/${endpoint}`, { responseType: "blob" });
    saveAs(data, `screening_report_SCR-${String(reportId).padStart(6, "0")}.${extension}`);
  },

  async downloadAllReports(ids: number[], kind: "pdf" | "excel") {
    await Promise.all(ids.map((id) => api.downloadReport(id, kind)));
  },
};
