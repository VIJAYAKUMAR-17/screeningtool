import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid2,
  LinearProgress,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip as MuiTooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
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

const chartColors = ["#1f7a5a", "#b86b00", "#c83f4f", "#2459d6", "#6b56d6"];

type InsightWindow = "all" | "weekly" | "monthly" | "custom";
type MetricTone = "primary" | "success" | "warning" | "error" | "violet";

const metricHelp = {
  "Entities Screened": "Total entities screened across the selected sessions.",
  "Matches Found": "Results flagged as potential sanctions matches.",
  "Needs Review": "Results awaiting analyst or compliance review.",
  "Clear Results": "Screened entities marked clear.",
  "Match Rate": "Percentage of screened entities flagged as potential matches.",
  Sessions: "Completed screening sessions inside the selected date range.",
};

const toneColors: Record<MetricTone, string> = {
  primary: "#2459d6",
  success: "#1f7a5a",
  warning: "#b86b00",
  error: "#c83f4f",
  violet: "#6b56d6",
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

function KpiCard({
  label,
  value,
  icon,
  tone,
  supportingText,
}: {
  label: keyof typeof metricHelp;
  value: number | string;
  icon: React.ReactNode;
  tone: MetricTone;
  supportingText?: string;
}) {
  const theme = useTheme();
  const color = toneColors[tone];

  return (
    <MuiTooltip title={metricHelp[label]} arrow>
      <span style={{ display: "block", height: "100%" }}>
        <Card
          component={motion.div}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18 }}
          sx={{
            height: "100%",
            overflow: "hidden",
            border: 1,
            borderColor: alpha(color, theme.palette.mode === "dark" ? 0.36 : 0.2),
            borderRadius: "8px",
            bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.76 : 0.92),
            boxShadow: `0 18px 45px ${alpha(color, theme.palette.mode === "dark" ? 0.12 : 0.08)}`,
            position: "relative",
            "&:before": {
              content: '""',
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${alpha(color, 0.13)}, transparent 46%)`,
              pointerEvents: "none",
            },
          }}
        >
          <CardContent sx={{ position: "relative", p: 2 }}>
            <Stack direction="row" spacing={1.25} alignItems="flex-start" justifyContent="space-between">
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.6, fontWeight: 800, letterSpacing: 0 }}>
                  {typeof value === "number" ? value.toLocaleString() : value}
                </Typography>
              </Box>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  flex: "0 0 auto",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "8px",
                  color,
                  bgcolor: alpha(color, 0.12),
                }}
              >
                {icon}
              </Box>
            </Stack>
            {supportingText && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {supportingText}
              </Typography>
            )}
          </CardContent>
        </Card>
      </span>
    </MuiTooltip>
  );
}

function DashboardSurface({ children, sx }: { children: React.ReactNode; sx?: object }) {
  const theme = useTheme();

  return (
    <Card
      sx={{
        height: "100%",
        border: 1,
        borderColor: alpha(theme.palette.divider, 0.9),
        borderRadius: "8px",
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.76 : 0.94),
        boxShadow: `0 18px 50px ${alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.28 : 0.07)}`,
        ...sx,
      }}
    >
      {children}
    </Card>
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

function formatRunDate(startedAt: string) {
  try {
    return format(parseISO(startedAt), "MMM d, yyyy");
  } catch {
    return "No date";
  }
}

function formatRangeLabel(window: InsightWindow, fromDate: string, toDate: string) {
  if (window === "weekly") return "Last 7 days";
  if (window === "monthly") return "This month and last month";
  if (window === "custom") {
    if (fromDate && toDate) return `${format(parseISO(fromDate), "MMM d")} - ${format(parseISO(toDate), "MMM d, yyyy")}`;
    if (fromDate || toDate) return format(parseISO(fromDate || toDate), "MMM d, yyyy");
    return "Custom range";
  }
  return "All completed sessions";
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", minHeight: 180 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

function SourceRanking({ data, loading }: { data: Array<{ name: string; value: number }>; loading: boolean }) {
  const theme = useTheme();
  const max = Math.max(...data.map((item) => item.value), 1);

  if (loading) {
    return <Skeleton variant="rounded" height={158} sx={{ borderRadius: "8px" }} />;
  }

  if (!data.length) {
    return <EmptyChartState label="No list activity in this range." />;
  }

  return (
    <Stack spacing={1.25}>
      {data.map((item, index) => (
        <Box key={item.name}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {item.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {item.value.toLocaleString()}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(item.value / max) * 100}
            sx={{
              height: 8,
              mt: 0.65,
              borderRadius: 999,
              bgcolor: alpha(theme.palette.text.primary, 0.08),
              "& .MuiLinearProgress-bar": {
                borderRadius: 999,
                bgcolor: chartColors[index % chartColors.length],
              },
            }}
          />
        </Box>
      ))}
    </Stack>
  );
}

export function DashboardPage() {
  const theme = useTheme();

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
    const latestRun = [...filteredRuns].sort((a, b) => dateKeyToNumber(getRunDateKey(b.startedAt)) - dateKeyToNumber(getRunDateKey(a.startedAt)))[0];

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
    const reviewRate = totalVendors > 0 ? Math.round((reviewNeeded / totalVendors) * 100) : 0;

    return {
      totals: {
        sessions: totalRuns,
        entitiesProcessed: totalVendors,
        flagged,
        reviewNeeded,
        clear,
        matchRate,
        reviewRate,
        failed,
      },
      latestRun,
      trend,
      riskDistribution,
      statusDistribution,
    };
  }, [filteredRuns, insightWindow]);

  const rangeLabel = formatRangeLabel(insightWindow, fromDate, toDate);
  const priorityMessage =
    insights.totals.flagged > 0
      ? `${insights.totals.flagged.toLocaleString()} flagged result${insights.totals.flagged === 1 ? "" : "s"}`
      : insights.totals.reviewNeeded > 0
        ? `${insights.totals.reviewNeeded.toLocaleString()} result${insights.totals.reviewNeeded === 1 ? "" : "s"} awaiting review`
        : "No open review pressure";

  return (
    <Stack spacing={2.5}>
      <PageTitle title="Compliance Dashboard" subtitle="Screening posture, session reports, and review signals in one workspace." />

      <DashboardSurface
        sx={{
          overflow: "hidden",
          background:
            theme.palette.mode === "dark"
              ? `linear-gradient(135deg, ${alpha("#162234", 0.92)}, ${alpha("#111820", 0.98)})`
              : `linear-gradient(135deg, ${alpha("#ffffff", 0.98)}, ${alpha("#edf4f1", 0.88)})`,
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Grid2 container spacing={2.5} alignItems="center">
            <Grid2 size={{ xs: 12, lg: 7 }}>
              <Stack spacing={1.35}>
                <Chip
                  icon={<ShieldOutlinedIcon />}
                  label={rangeLabel}
                  variant="outlined"
                  sx={{ width: "fit-content", borderRadius: "8px", fontWeight: 700 }}
                />
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 850, letterSpacing: 0 }}>
                    Session-first review desk
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mt: 0.6 }}>
                    {priorityMessage} across {insights.totals.sessions.toLocaleString()} completed sessions.
                  </Typography>
                </Box>
              </Stack>
            </Grid2>

            <Grid2 size={{ xs: 12, lg: 5 }}>
              <Stack spacing={1.2} alignItems={{ xs: "stretch", lg: "flex-end" }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={insightWindow}
                  onChange={(_, value: InsightWindow | null) => value && setInsightWindow(value)}
                  sx={{
                    flexWrap: "wrap",
                    justifyContent: { xs: "flex-start", lg: "flex-end" },
                    gap: 0.75,
                    "& .MuiToggleButton-root": {
                      border: 1,
                      borderColor: "divider",
                      borderRadius: "8px !important",
                      px: 1.45,
                      fontWeight: 700,
                    },
                  }}
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="weekly">7 Days</ToggleButton>
                  <ToggleButton value="monthly">Monthly</ToggleButton>
                  <ToggleButton value="custom">Custom</ToggleButton>
                </ToggleButtonGroup>

                {insightWindow === "custom" && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", lg: "auto" } }}>
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
            </Grid2>
          </Grid2>

          <Grid2 container spacing={1.5} sx={{ mt: 2.5 }}>
            <Grid2 size={{ xs: 6, lg: 3 }}>
              <KpiCard
                label="Entities Screened"
                value={insights.totals.entitiesProcessed}
                icon={<AssessmentOutlinedIcon fontSize="small" />}
                tone="primary"
                supportingText={`${insights.totals.sessions.toLocaleString()} sessions`}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, lg: 3 }}>
              <KpiCard
                label="Matches Found"
                value={insights.totals.flagged}
                icon={<FlagOutlinedIcon fontSize="small" />}
                tone="error"
                supportingText={`${insights.totals.matchRate}% match rate`}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, lg: 3 }}>
              <KpiCard
                label="Needs Review"
                value={insights.totals.reviewNeeded}
                icon={<PendingActionsOutlinedIcon fontSize="small" />}
                tone="warning"
                supportingText={`${insights.totals.reviewRate}% review rate`}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, lg: 3 }}>
              <KpiCard
                label="Clear Results"
                value={insights.totals.clear}
                icon={<GppGoodOutlinedIcon fontSize="small" />}
                tone="success"
                supportingText={insights.latestRun ? `Latest ${formatRunDate(insights.latestRun.startedAt)}` : "No sessions yet"}
              />
            </Grid2>
          </Grid2>
        </CardContent>
      </DashboardSurface>

      <Grid2 container spacing={2.5} alignItems="stretch">
        <Grid2 size={{ xs: 12, xl: 8 }}>
          <DashboardSurface sx={{ p: { xs: 1.5, md: 2 }, minHeight: 620 }}>
            <ScreeningRunsPanel
              title="Session Reports"
              subtitle={`${filteredRuns.length.toLocaleString()} completed sessions in ${rangeLabel.toLowerCase()}.`}
              tableHeight={520}
              runsOverride={filteredRuns}
              loadingOverride={loading}
              emptyMessage="No completed screening sessions match this date range."
            />
          </DashboardSurface>
        </Grid2>

        <Grid2 size={{ xs: 12, xl: 4 }}>
          <Stack spacing={2.5} sx={{ height: "100%" }}>
            <DashboardSurface>
              <CardContent sx={{ p: 2.25 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                      Review Priority
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {priorityMessage}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "8px",
                      color: toneColors.error,
                      bgcolor: alpha(toneColors.error, 0.12),
                    }}
                  >
                    <WarningAmberOutlinedIcon />
                  </Box>
                </Stack>

                <Divider sx={{ my: 1.8 }} />

                <Stack spacing={1.4}>
                  <Box>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Flagged
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {insights.totals.flagged.toLocaleString()}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(insights.totals.matchRate, 100)}
                      sx={{
                        mt: 0.7,
                        height: 9,
                        borderRadius: 999,
                        bgcolor: alpha(toneColors.error, 0.12),
                        "& .MuiLinearProgress-bar": { borderRadius: 999, bgcolor: toneColors.error },
                      }}
                    />
                  </Box>
                  <Box>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Review Queue
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {insights.totals.reviewNeeded.toLocaleString()}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(insights.totals.reviewRate, 100)}
                      sx={{
                        mt: 0.7,
                        height: 9,
                        borderRadius: 999,
                        bgcolor: alpha(toneColors.warning, 0.14),
                        "& .MuiLinearProgress-bar": { borderRadius: 999, bgcolor: toneColors.warning },
                      }}
                    />
                  </Box>
                </Stack>
              </CardContent>
            </DashboardSurface>

            <DashboardSurface sx={{ flex: 1, minHeight: 312 }}>
              <CardContent sx={{ p: 2.25, height: "100%" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                      Outcome Mix
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Flagged, review, clear
                    </Typography>
                  </Box>
                  <FactCheckOutlinedIcon color="action" />
                </Stack>
                {loading ? (
                  <Skeleton variant="rounded" height={220} sx={{ borderRadius: "8px" }} />
                ) : insights.riskDistribution.every((item) => item.value === 0) ? (
                  <EmptyChartState label="No outcomes available in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={insights.riskDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={84}
                        paddingAngle={3}
                        label={renderPieLabel}
                      >
                        <Cell fill={toneColors.error} />
                        <Cell fill={toneColors.warning} />
                        <Cell fill={toneColors.success} />
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                      <Legend formatter={(value, entry) => `${value}: ${(entry.payload as { value: number }).value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </DashboardSurface>

            <DashboardSurface>
              <CardContent sx={{ p: 2.25 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                      Lists Used
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Top sources
                    </Typography>
                  </Box>
                  <CalendarMonthOutlinedIcon color="action" />
                </Stack>
                <SourceRanking data={topListsQuery.data ?? []} loading={loading || topListsQuery.isLoading} />
              </CardContent>
            </DashboardSurface>
          </Stack>
        </Grid2>
      </Grid2>

      <Grid2 container spacing={2.5}>
        <Grid2 size={{ xs: 12, lg: 8 }}>
          <DashboardSurface>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                    Activity
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Screening volume over time
                  </Typography>
                </Box>
                <TrendingUpOutlinedIcon color="action" />
              </Stack>
              {loading ? (
                <Skeleton variant="rounded" height={294} sx={{ borderRadius: "8px" }} />
              ) : insights.trend.length === 0 ? (
                <EmptyChartState label="No trend data available in this range." />
              ) : (
                <ResponsiveContainer width="100%" height={294}>
                  <BarChart data={insights.trend} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.12)} />
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
                      tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                    />
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
                    <Bar dataKey="screenings" name="screenings" fill={toneColors.primary} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="matches" name="matches" fill={toneColors.error} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </DashboardSurface>
        </Grid2>

        <Grid2 size={{ xs: 12, lg: 4 }}>
          <DashboardSurface>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                    Run Health
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Completed vs failed
                  </Typography>
                </Box>
                <AssessmentOutlinedIcon color="action" />
              </Stack>
              {loading ? (
                <Skeleton variant="rounded" height={294} sx={{ borderRadius: "8px" }} />
              ) : insights.statusDistribution.every((item) => item.value === 0) ? (
                <EmptyChartState label="No completed runs in this range." />
              ) : (
                <ResponsiveContainer width="100%" height={294}>
                  <PieChart>
                    <Pie
                      data={insights.statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                      label={renderPieLabel}
                    >
                      <Cell fill={toneColors.primary} />
                      <Cell fill={toneColors.error} />
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </DashboardSurface>
        </Grid2>
      </Grid2>
    </Stack>
  );
}
