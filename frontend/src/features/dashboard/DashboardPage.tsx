import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Card,
  CardContent,
  Grid2,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { motion } from "framer-motion";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageTitle } from "@/components/common/PageTitle";
import { ScreeningRunsPanel } from "@/features/results/ScreeningRunsPanel";
import { api } from "@/services/api";
import { RunRecord } from "@/types/api";

const chartColors = ["#22a06b", "#c77700", "#d14343", "#0b5ed7", "#6f42c1"];

type InsightWindow = "all" | "weekly" | "monthly" | "custom";

const metricHelp: Record<string, string> = {
  "Total Screenings": "Total number of entities screened across all runs.",
  "Matches Found": "Count of results flagged as potential sanctions matches.",
  "Cleared Results": "Count of results that were screened and marked clear.",
  "Pending Reviews": "Count of results awaiting analyst/compliance review.",
  "Match Rate": "Percentage of screened entities that were flagged as potential matches.",
};

const renderPieLabel = ({
  name,
  value,
  percent,
}: {
  name: string;
  value: number;
  percent: number;
}) => (percent > 0.04 && value > 0 ? `${name}: ${value}` : "");

function KpiCard({ label, value }: { label: keyof typeof metricHelp; value: number }) {
  return (
    <MuiTooltip title={metricHelp[label]} arrow>
      <span style={{ display: "block" }}>
        <Card
          component={motion.div}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          sx={{ border: 1, borderColor: "divider", bgcolor: (theme) => theme.palette.glass.background, backdropFilter: "blur(8px)" }}
        >
          <CardContent>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h5">{value.toLocaleString()}</Typography>
          </CardContent>
        </Card>
      </span>
    </MuiTooltip>
  );
}

function isCompletedRun(run: RunRecord) {
  const normalized = run.status.toLowerCase();
  return normalized !== "pending" && normalized !== "running";
}

function getRunDateKey(startedAt: string) {
  const raw = startedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  try {
    return format(parseISO(startedAt), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function getRunMonthKey(startedAt: string) {
  const dateKey = getRunDateKey(startedAt);
  if (!dateKey) {
    return "";
  }
  return dateKey.slice(0, 7);
}

function dateKeyToNumber(key: string) {
  const compact = key.replace(/-/g, "");
  const n = Number(compact);
  return Number.isFinite(n) ? n : NaN;
}

export function DashboardPage() {

  const runsQuery = useQuery({
    queryKey: ["results"],
    queryFn: api.getScreeningRuns,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    placeholderData: (previousData) => previousData,
  });

  const [stableRuns, setStableRuns] = React.useState<RunRecord[]>([]);

  React.useEffect(() => {
    if (!Array.isArray(runsQuery.data)) return;
    setStableRuns((previousRuns) => {
      if (runsQuery.data.length > 0 || previousRuns.length === 0) {
        return runsQuery.data;
      }
      return previousRuns;
    });
  }, [runsQuery.data]);

  const effectiveRuns = React.useMemo(() => {
    if (Array.isArray(runsQuery.data) && (runsQuery.data.length > 0 || stableRuns.length === 0)) {
      return runsQuery.data;
    }
    return stableRuns;
  }, [runsQuery.data, stableRuns]);

  const allCompletedRuns = React.useMemo(() => effectiveRuns.filter(isCompletedRun), [effectiveRuns]);


  const [insightWindow, setInsightWindow] = React.useState<InsightWindow>("all");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  const loading = runsQuery.isLoading && effectiveRuns.length === 0;

  const filteredRuns = React.useMemo(() => {
    const source = effectiveRuns.filter(isCompletedRun);
    if (!source.length) {
      return [];
    }

    const now = new Date();
    const todayNum = dateKeyToNumber(format(now, "yyyy-MM-dd"));

    if (insightWindow === "all") {
      return source;
    }

    if (insightWindow === "weekly") {
      const startNum = dateKeyToNumber(format(subDays(now, 6), "yyyy-MM-dd"));
      return source.filter((run) => {
        const keyNum = dateKeyToNumber(getRunDateKey(run.startedAt));
        return Number.isFinite(keyNum) && keyNum >= startNum && keyNum <= todayNum;
      });
    }

    if (insightWindow === "monthly") {
      const monthlyStart = startOfMonth(subMonths(now, 1));
      const startNum = dateKeyToNumber(format(monthlyStart, "yyyy-MM-dd"));
      return source.filter((run) => {
        const keyNum = dateKeyToNumber(getRunDateKey(run.startedAt));
        return Number.isFinite(keyNum) && keyNum >= startNum && keyNum <= todayNum;
      });
    }

    if (!fromDate && !toDate) {
      return [];
    }

    const rawStart = fromDate || toDate;
    const rawEnd = toDate || fromDate;
    const startNum = Math.min(dateKeyToNumber(rawStart), dateKeyToNumber(rawEnd));
    const endNum = Math.max(dateKeyToNumber(rawStart), dateKeyToNumber(rawEnd));

    return source.filter((run) => {
      const keyNum = dateKeyToNumber(getRunDateKey(run.startedAt));
      return Number.isFinite(keyNum) && keyNum >= startNum && keyNum <= endNum;
    });
  }, [effectiveRuns, fromDate, insightWindow, toDate]);

  const filteredRunIds = React.useMemo(
    () => filteredRuns.map((run) => run.runId).sort((a, b) => a - b),
    [filteredRuns],
  );

  const topListsQuery = useQuery({
    queryKey: ["dashboard-top-lists", filteredRunIds],
    enabled: filteredRunIds.length > 0,
    queryFn: async () => {
      const details = await Promise.all(filteredRunIds.map((runId) => api.getRunDetails(runId)));
      const counts = new Map<string, number>();

      for (const detail of details) {
        for (const result of detail.results) {
          const source = (result.ofacSource ?? "").trim() || "Unknown";
          counts.set(source, (counts.get(source) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));
    },
  });

  const insights = React.useMemo(() => {
    const totalRuns = filteredRuns.length;
    const totalVendors = filteredRuns.reduce((sum, run) => sum + run.vendorsScreened, 0);
    const flagged = filteredRuns.reduce((sum, run) => sum + run.flagged, 0);
    const reviewNeeded = filteredRuns.reduce((sum, run) => sum + run.reviewNeeded, 0);
    const clear = filteredRuns.reduce((sum, run) => sum + run.clear, 0);
    const failed = filteredRuns.filter((run) => run.status.toLowerCase() === "failed").length;

    const trendMap = new Map<string, { screenings: number; matches: number }>();
    for (const run of filteredRuns) {
      const key = insightWindow === "monthly" ? getRunMonthKey(run.startedAt) : getRunDateKey(run.startedAt);
      if (!key) continue;
      const existing = trendMap.get(key) ?? { screenings: 0, matches: 0 };
      existing.screenings += run.vendorsScreened;
      existing.matches += run.flagged;
      trendMap.set(key, existing);
    }

    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));

    const riskDistribution = [
      { name: "Flagged", value: flagged },
      { name: "Review", value: reviewNeeded },
      { name: "Clear", value: clear },
    ];

    const statusDistribution = [
      { name: "Completed", value: Math.max(totalRuns - failed, 0) },
      { name: "Failed", value: failed },
    ];

    const matchRate = totalVendors > 0 ? Math.round((flagged / totalVendors) * 100) : 0;

    return {
      totals: {
        completedScreenings: totalRuns,
        entitiesProcessed: totalVendors,
        flagged,
        reviewNeeded,
        clear,
        matchRate,
      },
      trend,
      riskDistribution,
      statusDistribution,
    };
  }, [filteredRuns, insightWindow]);

  return (
    <Stack spacing={2.5}>
      <PageTitle title="Compliance Dashboard" subtitle="Operational overview of sanctions screening performance." />



      <Card sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Dashboard Insights</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ xs: "stretch", md: "center" }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={insightWindow}
              onChange={(_, value: InsightWindow | null) => value && setInsightWindow(value)}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="weekly">Weekly</ToggleButton>
              <ToggleButton value="monthly">Monthly</ToggleButton>
              <ToggleButton value="custom">Custom Date</ToggleButton>
            </ToggleButtonGroup>

            {insightWindow === "custom" && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  type="date"
                  label="From"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="To"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            )}
          </Stack>
          <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
              <KpiCard label="Total Screenings" value={insights.totals.entitiesProcessed} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
              <KpiCard label="Matches Found" value={insights.totals.flagged} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
              <KpiCard label="Cleared Results" value={insights.totals.clear} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
              <KpiCard label="Pending Reviews" value={insights.totals.reviewNeeded} />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
              <MuiTooltip title={metricHelp["Match Rate"]} arrow>
                <span style={{ display: "block", height: "100%" }}>
                  <Card sx={{ border: 1, borderColor: "divider", height: "100%" }}>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">Match Rate</Typography>
                      <Typography variant="h5">{insights.totals.matchRate}%</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Based on {insights.totals.entitiesProcessed.toLocaleString()} entities screened
                      </Typography>
                    </CardContent>
                  </Card>
                </span>
              </MuiTooltip>
            </Grid2>
          </Grid2>

          <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, lg: 6 }}>
              <Card sx={{ p: 2, height: 320 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  Flagged / Review / Clear
                </Typography>
                {loading ? (
                  <Skeleton variant="rounded" height={240} />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={insights.riskDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={82}
                        paddingAngle={3}
                        label={renderPieLabel}
                      >
                        <Cell fill="#d14343" />
                        <Cell fill="#c77700" />
                        <Cell fill="#22a06b" />
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                      <Legend formatter={(value, entry) => `${value}: ${(entry.payload as { value: number }).value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Grid2>

            <Grid2 size={{ xs: 12, lg: 6 }}>
              <Card sx={{ p: 2, height: 320 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  Top Lists Used
                </Typography>
                {loading || topListsQuery.isLoading ? (
                  <Skeleton variant="rounded" height={240} />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={topListsQuery.data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => [value, name === "value" ? "Count" : name]} />
                      <Bar dataKey="value" name="Count" fill="#0b5ed7" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Grid2>
          </Grid2>
        </Stack>
      </Card>

      <Grid2 container spacing={2}>
        <Grid2 size={{ xs: 12, lg: 7 }}>
          <Card sx={{ p: 2, height: 360 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Screening Trends
            </Typography>
            {loading ? (
              <Skeleton variant="rounded" height={280} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={insights.trend} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => {
                      if (insightWindow === "monthly") {
                        try {
                          return format(parseISO(`${value}-01`), "MMM yyyy");
                        } catch {
                          return value;
                        }
                      }
                      try {
                        return format(parseISO(value), "MMM d");
                      } catch {
                        return value;
                      }
                    }}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => [value, name === "screenings" ? "Entities Screened" : "Flagged"]}
                    labelFormatter={(label: string) => {
                      if (insightWindow === "monthly") {
                        try {
                          return format(parseISO(`${label}-01`), "MMMM yyyy");
                        } catch {
                          return label;
                        }
                      }
                      try {
                        return format(parseISO(label), "MMM d, yyyy");
                      } catch {
                        return label;
                      }
                    }}
                  />
                  <Legend formatter={(value) => (value === "screenings" ? "Entities Screened" : "Flagged")} />
                  <Bar dataKey="screenings" name="screenings" fill="#0b5ed7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="matches" name="matches" fill="#d14343" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Grid2>

      </Grid2>

      <Grid2 container spacing={2}>
        <Grid2 size={{ xs: 12, lg: 12 }}>
          <Card sx={{ p: 2, height: 320 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Run Status Mix
            </Typography>
            {loading ? (
              <Skeleton variant="rounded" height={240} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={insights.statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={82}
                    paddingAngle={3}
                    label={renderPieLabel}
                  >
                    {insights.statusDistribution.map((_, idx) => (
                      <Cell key={idx} fill={chartColors[(idx + 2) % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Grid2>
      </Grid2>

      <ScreeningRunsPanel
        title="Results"
        subtitle="All screening runs on dashboard. Click anywhere on a row to open detailed results."
        tableHeight={520}
      />    </Stack>
  );
}
































