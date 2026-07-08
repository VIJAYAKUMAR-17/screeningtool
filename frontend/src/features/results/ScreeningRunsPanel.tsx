import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid2,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import { PageTitle } from "@/components/common/PageTitle";
import { StatusChip } from "@/components/common/StatusChip";
import { Tier2StructuredDetails } from "@/components/common/Tier2StructuredDetails";
import { api } from "@/services/api";
import { http } from "@/services/http";
import { RunRecord, ScreeningResult, Tier2ScreeningResult } from "@/types/api";

type ResultRow = ScreeningResult & { id: number };

const chartColors = ["#22a06b", "#c77700", "#d14343", "#0b5ed7"];

const vendorColumns: GridColDef<ResultRow>[] = [
  {
    field: "queriedName",
    headerName: "Name",
    flex: 1.2,
    minWidth: 200,
    renderCell: (params) => (
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ height: "100%" }}>
        <span>{params.value as string}</span>
        {params.row.resultType === "customer" && (
          <Tooltip title="Customer was also screened">
            <Chip label="Customer" size="small" color="info" variant="outlined" />
          </Tooltip>
        )}
      </Stack>
    ),
  },
  {
    field: "status",
    headerName: "Status",
    width: 160,
    renderCell: (params) => <StatusChip status={params.row.status} />,
  },
  {
    field: "matchScore",
    headerName: "Score",
    width: 100,
    valueFormatter: (value) => (typeof value === "number" ? `${value}%` : "-"),
  },
  {
    field: "matchedName",
    headerName: "Matched Entity",
    flex: 1,
    minWidth: 200,
    valueGetter: (_, row) => row.matchedName ?? "-",
  },
  {
    field: "ofacSource",
    headerName: "List",
    width: 100,
    valueGetter: (_, row) => row.ofacSource ?? "-",
  },
  {
    field: "matchType",
    headerName: "Match Type",
    width: 130,
    valueGetter: (_, row) => row.matchType ?? "-",
  },
];

function OutcomeSummary({ run }: { run: RunRecord }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {run.flagged > 0 && <Chip size="small" label={`${run.flagged} Flagged`} color="error" />}
      {run.reviewNeeded > 0 && <Chip size="small" label={`${run.reviewNeeded} Review`} color="warning" />}
      {run.clear > 0 && <Chip size="small" label={`${run.clear} Clear`} color="success" variant="outlined" />}
      {run.flagged === 0 && run.reviewNeeded === 0 && run.clear === 0 && (
        <Typography variant="body2" color="text.secondary">
          -
        </Typography>
      )}
    </Stack>
  );
}

function RunDetailsInsights({ run, results }: { run: RunRecord; results: ScreeningResult[] }) {
  const totalFromResults = results.length;
  const total = Math.max(1, totalFromResults || run.vendorsScreened || run.flagged + run.reviewNeeded + run.clear);
  const flagged = run.flagged;
  const review = run.reviewNeeded;
  const clear = run.clear;
  const matchRate = Math.round((flagged / total) * 100);

  const outcomeDistribution = [
    { name: "Flagged", value: flagged },
    { name: "Review", value: review },
    { name: "Clear", value: clear },
  ];

  const statusNormalized = run.status.toLowerCase();
  const statusDistribution = [
    { name: "Completed", value: statusNormalized === "complete" ? 1 : 0 },
    { name: "Failed", value: statusNormalized === "failed" ? 1 : 0 },
  ];

  const topListsUsed = Array.from(
    results.reduce((acc, result) => {
      const source = (result.ofacSource ?? "").trim() || "Unknown";
      acc.set(source, (acc.get(source) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()).entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const trendPoint = {
    date: format(new Date(run.startedAt), "MMM d"),
    screenings: total,
    matches: flagged,
  };

  return (
    <Card sx={{ mt: 2, border: 1, borderColor: "divider" }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1.2 }}>
          Screening Insights (This Run)
        </Typography>

        <Grid2 container spacing={2} sx={{ mb: 2 }}>
          <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
            <Chip label={
              <>
                Total Screenings: <strong>{total}</strong>
              </>
            } variant="outlined" sx={{ width: "100%", justifyContent: "flex-start" }} />
          </Grid2>
          <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
            <Chip label={
              <>
                Matches Found: <strong>{flagged}</strong>
              </>
            } color="error" variant="outlined" sx={{ width: "100%", justifyContent: "flex-start" }} />
          </Grid2>
          <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
            <Chip label={
              <>
                Cleared Results: <strong>{clear}</strong>
              </>
            } color="success" variant="outlined" sx={{ width: "100%", justifyContent: "flex-start" }} />
          </Grid2>
          <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
            <Chip label={
              <>
                Pending Reviews: <strong>{review}</strong>
              </>
            } color="warning" variant="outlined" sx={{ width: "100%", justifyContent: "flex-start" }} />
          </Grid2>
          <Grid2 size={{ xs: 12, sm: 6, lg: 3 }}>
            <Chip
              label={
                <>
                  Match Rate: <strong>{matchRate}%</strong>
                </>
              }
              color={matchRate > 30 ? "error" : "default"}
              sx={{ width: "100%", justifyContent: "flex-start" }}
            />
          </Grid2>
        </Grid2>

        <Grid2 container spacing={2}>
          <Grid2 size={{ xs: 12, lg: 6 }}>
            <Card sx={{ p: 2, height: 320 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Flagged / Review / Clear
              </Typography>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={outcomeDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    <Cell fill="#d14343" />
                    <Cell fill="#c77700" />
                    <Cell fill="#22a06b" />
                  </Pie>
                  <RechartsTooltip formatter={(value, name) => [value, name]} />
                  <Legend formatter={(value, entry) => `${value}: ${(entry.payload as { value: number }).value}`} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Grid2>

          <Grid2 size={{ xs: 12, lg: 6 }}>
            <Card sx={{ p: 2, height: 320 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Top Lists Used
              </Typography>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topListsUsed}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <RechartsTooltip formatter={(value, name) => [value, name === "value" ? "Count" : name]} />
                  <Bar dataKey="value" name="Count" fill="#0b5ed7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Grid2>
        </Grid2>

        <Grid2 container spacing={2} sx={{ mt: 0.5 }}>
          <Grid2 size={{ xs: 12, lg: 7 }}>
            <Card sx={{ p: 2, height: 360 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Screening Trends
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={[trendPoint]} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <RechartsTooltip formatter={(value, name) => [value, name === "screenings" ? "Entities Screened" : "Flagged"]} />
                  <Legend formatter={(value) => (value === "screenings" ? "Entities Screened" : "Flagged")} />
                  <Bar dataKey="screenings" name="screenings" fill="#0b5ed7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="matches" name="matches" fill="#d14343" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Grid2>

          <Grid2 size={{ xs: 12, lg: 5 }}>
            <Card sx={{ p: 2, height: 360 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Run Status Mix
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    <Cell fill="#0b5ed7" />
                    <Cell fill="#d14343" />
                  </Pie>
                  <RechartsTooltip formatter={(value, name) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Grid2>
        </Grid2>
      </CardContent>
    </Card>
  );
}

type ScreeningRunsPanelProps = {
  title?: string;
  subtitle?: string;
  showPageTitle?: boolean;
  tableHeight?: number;
};

export function ScreeningRunsPanel({
  title = "Screening History",
  subtitle = "Click anywhere on a result row to open Tier 1 and Tier 2 details.",
  showPageTitle = false,
  tableHeight = 520,
}: ScreeningRunsPanelProps) {
  const runsQuery = useQuery({
    queryKey: ["results"],
    queryFn: api.getScreeningRuns,
    placeholderData: (previousData) => previousData,
  });

  const [stableRuns, setStableRuns] = useState<RunRecord[]>([]);

  useEffect(() => {
    if (!Array.isArray(runsQuery.data)) return;
    setStableRuns((previousRuns) => {
      if (runsQuery.data.length > 0 || previousRuns.length === 0) {
        return runsQuery.data;
      }
      return previousRuns;
    });
  }, [runsQuery.data]);

  const runs = useMemo(() => {
    if (Array.isArray(runsQuery.data) && (runsQuery.data.length > 0 || stableRuns.length === 0)) {
      return runsQuery.data;
    }
    return stableRuns;
  }, [runsQuery.data, stableRuns]);

  const [search, setSearch] = useState("");
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const queryClient = useQueryClient();

  const isInitialLoading = runsQuery.isLoading && runs.length === 0;

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-charts"] });
  }, [queryClient, runs.length]);

  const { data: runDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["run-details", selectedRun?.runId],
    queryFn: () => api.getRunDetails(selectedRun!.runId),
    enabled: !!selectedRun,
  });

  const tier2Query = useQuery({
    queryKey: ["tier2-run", selectedRun?.runId],
    queryFn: async () => {
      const { data } = await http.get<Tier2ScreeningResult>(`/tier2/runs/${selectedRun!.runId}`);
      return data;
    },
    enabled: !!selectedRun,
    retry: false,
  });

  const runTier2Mutation = useMutation({
    mutationFn: async (runId: number) => {
      const { data } = await http.post<Tier2ScreeningResult>(
        "/tier2/screen",
        { run_id: runId, include_adverse_media: true },
        { timeout: 0 },
      );
      return data;
    },
    onMutate: () => toast.loading("Tier 2 screening started", { id: "tier2" }),
    onSuccess: async (data) => {
      toast.success("Tier 2 screening completed", { id: "tier2" });
      queryClient.setQueryData(["tier2-run", selectedRun?.runId], data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tier2-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-charts"] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message, { id: "tier2" }),
  });

  const filtered = useMemo(
    () => runs.filter((run) => run.customerName.toLowerCase().includes(search.toLowerCase())),
    [runs, search],
  );

  const downloadReport = async (runId: number, kind: "pdf" | "excel") => {
    const id = toast.loading(`Preparing ${kind.toUpperCase()}...`);
    try {
      await api.downloadReport(runId, kind);
      toast.success(`${kind.toUpperCase()} downloaded`, { id });
    } catch (err) {
      toast.error((err as Error).message, { id });
    }
  };

  const runColumns: GridColDef<RunRecord>[] = [
    { field: "runId", headerName: "Run #", width: 80 },
    { field: "customerName", headerName: "Customer", flex: 1, minWidth: 160 },
    { field: "vendorsScreened", headerName: "Vendors", width: 90, align: "center", headerAlign: "center" },
    {
      field: "outcomes",
      headerName: "Outcomes",
      flex: 1.2,
      minWidth: 220,
      sortable: false,
      renderCell: (params) => <OutcomeSummary run={params.row} />,
    },
    {
      field: "elapsedSeconds",
      headerName: "Duration",
      width: 100,
      valueFormatter: (value) => (typeof value === "number" ? `${value.toFixed(2)}s` : "-"),
    },
    {
      field: "startedAt",
      headerName: "Date",
      minWidth: 180,
      valueGetter: (_, row) => format(new Date(row.startedAt), "PPpp"),
    },
    {
      field: "actions",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          aria-label="view vendors"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedRun(params.row);
          }}
        >
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const detailRows: ResultRow[] = runDetails?.results.map((result, idx) => ({ ...result, id: idx + 1 })) ?? [];

  return (
    <Stack spacing={2}>
      {showPageTitle ? (
        <PageTitle title={title} subtitle={subtitle} />
      ) : (
        <Stack spacing={0.4}>
          <Typography variant="h6">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Stack>
      )}

      <TextField
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by customer name..."
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <FilterListOutlinedIcon />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ height: tableHeight }}>
        <DataGrid
          loading={isInitialLoading}
          rows={filtered}
          columns={runColumns}
          getRowId={(row) => row.runId}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          onRowClick={(params) => setSelectedRun(params.row)}
          sx={{
            "& .MuiDataGrid-row": { cursor: "pointer" },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
            "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
            "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": { backgroundColor: "inherit" },
          }}
        />
      </Box>

      <Dialog open={!!selectedRun} onClose={() => setSelectedRun(null)} fullWidth maxWidth="lg">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Run #{selectedRun?.runId} - {selectedRun?.customerName}
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={runTier2Mutation.isPending ? <CircularProgress size={14} color="inherit" /> : <PlayArrowOutlinedIcon />}
              onClick={() => selectedRun && runTier2Mutation.mutate(selectedRun.runId)}
              disabled={!selectedRun || detailsLoading || !detailRows.length || runTier2Mutation.isPending}
            >
              Run Tier 2 Screening
            </Button>
            <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => selectedRun && void downloadReport(selectedRun.runId, "pdf")}>
              PDF
            </Button>
            <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => selectedRun && void downloadReport(selectedRun.runId, "excel")}>
              Excel
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {detailsLoading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress />
            </Stack>
          ) : detailRows.length === 0 ? (
            <Alert severity="info">No vendor results found for this run.</Alert>
          ) : (
            <>
              {selectedRun && <RunDetailsInsights run={selectedRun} results={runDetails?.results ?? []} />}

              <Box sx={{ height: 420, mt: 2 }}>
                <DataGrid
                  rows={detailRows}
                  columns={vendorColumns}
                  pageSizeOptions={[10, 25]}
                  disableRowSelectionOnClick
                  sx={{
                    "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
                    "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
                    "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": { backgroundColor: "inherit" },
                  }}
                />
              </Box>

              {tier2Query.isLoading && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Loading Tier 2 findings...
                  </Typography>
                </Stack>
              )}

              {tier2Query.data && <Tier2StructuredDetails result={tier2Query.data} />}

              {tier2Query.isError && !runTier2Mutation.isPending && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Tier 2 screening has not been run for this Tier 1 run yet.
                </Alert>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

