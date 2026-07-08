import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid2,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link as RouterLink } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageTitle } from "@/components/common/PageTitle";
import { StatusChip } from "@/components/common/StatusChip";
import { api } from "@/services/api";
import { http } from "@/services/http";
import { Tier2ScreeningResult } from "@/types/api";
import { screeningFormSchema, ScreeningFormValues } from "./screeningSchema";
import { Tier2StructuredDetails } from "@/components/common/Tier2StructuredDetails";

type ScreeningResultRow = Awaited<ReturnType<typeof api.screenEntities>>["results"][number] & { id: number };
type ScreeningPageCache = {
  lastResult: Awaited<ReturnType<typeof api.screenEntities>> | null;
  tier2ByEntity: Record<string, Tier2ScreeningResult>;
  tier2LoadingByEntity: Record<string, boolean>;
  tier2ErrorByEntity: Record<string, string>;
  activeEntity: string | null;
};

const insightChartColors = {
  clear: "#22a06b",
  review: "#c77700",
  flagged: "#d14343",
};

const screeningPageCache: ScreeningPageCache = {
  lastResult: null,
  tier2ByEntity: {},
  tier2LoadingByEntity: {},
  tier2ErrorByEntity: {},
  activeEntity: null,
};

export function ScreeningPage() {
  const form = useForm<ScreeningFormValues>({
    resolver: zodResolver(screeningFormSchema),
    defaultValues: {
      customerName: "",
      entries: [{ companyName: "", country: "", identifier: "" }],
    },
  });

  const entriesArray = useFieldArray({ control: form.control, name: "entries" });
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof api.screenEntities>> | null>(screeningPageCache.lastResult);
  const [tier2ByEntity, setTier2ByEntity] = useState<Record<string, Tier2ScreeningResult>>(screeningPageCache.tier2ByEntity);
  const [tier2LoadingByEntity, setTier2LoadingByEntity] = useState<Record<string, boolean>>(screeningPageCache.tier2LoadingByEntity);
  const [tier2ErrorByEntity, setTier2ErrorByEntity] = useState<Record<string, string>>(screeningPageCache.tier2ErrorByEntity);
  const [activeEntity, setActiveEntity] = useState<string | null>(screeningPageCache.activeEntity);
  const [selectedResult, setSelectedResult] = useState<ScreeningResultRow | null>(null);

  useEffect(() => {
    screeningPageCache.lastResult = lastResult;
  }, [lastResult]);

  useEffect(() => {
    screeningPageCache.tier2ByEntity = tier2ByEntity;
  }, [tier2ByEntity]);

  useEffect(() => {
    screeningPageCache.tier2LoadingByEntity = tier2LoadingByEntity;
  }, [tier2LoadingByEntity]);

  useEffect(() => {
    screeningPageCache.tier2ErrorByEntity = tier2ErrorByEntity;
  }, [tier2ErrorByEntity]);

  useEffect(() => {
    screeningPageCache.activeEntity = activeEntity;
  }, [activeEntity]);

  const refreshDerivedScreens = async (runId?: number) => {
    const ops = [
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-charts"] }),
      queryClient.invalidateQueries({ queryKey: ["results"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
      queryClient.invalidateQueries({ queryKey: ["tier2-dashboard"] }),
    ];
    if (runId) {
      ops.push(queryClient.invalidateQueries({ queryKey: ["tier2-run", runId] }));
    }
    await Promise.all(ops);
  };

  const runTier2ForEntity = async (runId: number, entityName: string): Promise<boolean> => {
    setTier2LoadingByEntity((prev) => ({ ...prev, [entityName]: true }));
    setTier2ErrorByEntity((prev) => ({ ...prev, [entityName]: "" }));

    try {
      const { data } = await http.post<Tier2ScreeningResult>(
        "/tier2/screen",
        { run_id: runId, primary_entity: entityName, include_adverse_media: true },
        { timeout: 0 },
      );
      setTier2ByEntity((prev) => ({ ...prev, [entityName]: data }));
      return true;
    } catch (err) {
      setTier2ErrorByEntity((prev) => ({ ...prev, [entityName]: (err as Error).message }));
      return false;
    } finally {
      setTier2LoadingByEntity((prev) => ({ ...prev, [entityName]: false }));
    }
  };

  const runAllTier2 = async (runId: number, names: string[]) => {
    const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    if (!uniqueNames.length) return;

    toast.loading("Tier 2 screening started for all rows", { id: "tier2-batch" });
    const outcomes = await Promise.all(uniqueNames.map((name) => runTier2ForEntity(runId, name)));

    const failed = outcomes.filter((ok) => !ok).length;
    if (failed > 0) {
      toast.error(`Tier 2 completed with ${failed} issue(s). Eye icon works for successful rows.`, { id: "tier2-batch" });
    } else {
      toast.success("Tier 2 completed for all rows", { id: "tier2-batch" });
    }
  };

  const screenMutation = useMutation({
    mutationFn: api.screenEntities,
    onMutate: () => toast.loading("Tier 1 screening started", { id: "screening" }),
    onSuccess: async (data) => {
      toast.success("Tier 1 screening completed", { id: "screening" });
      setLastResult(data);
      setTier2ByEntity({});
      setTier2LoadingByEntity({});
      setTier2ErrorByEntity({});
      setActiveEntity(null);

      const names = data.results.map((r) => r.queriedName);
      await runAllTier2(data.runId, names);
      await refreshDerivedScreens(data.runId);
    },
    onError: (err) => toast.error(err.message, { id: "screening" }),
  });

  const onSubmit = form.handleSubmit((values) => {
    screenMutation.mutate({ customerName: values.customerName, entities: values.entries });
  });

  const clearResults = () => {
    setLastResult(null);
    setTier2ByEntity({});
    setTier2LoadingByEntity({});
    setTier2ErrorByEntity({});
    setActiveEntity(null);
  };

  const downloadReport = async (kind: "pdf" | "excel") => {
    if (!lastResult?.runId) {
      toast.error("Run a screening first");
      return;
    }
    const id = toast.loading(`Preparing ${kind.toUpperCase()}...`);
    try {
      await api.downloadReport(lastResult.runId, kind);
      toast.success(`${kind.toUpperCase()} downloaded`, { id });
    } catch (err) {
      toast.error((err as Error).message, { id });
    }
  };

  const resultRows: ScreeningResultRow[] = lastResult?.results.map((r, idx) => ({ ...r, id: idx + 1 })) ?? [];
  const readyCount = useMemo(() => Object.keys(tier2ByEntity).length, [tier2ByEntity]);

  const resultColumns: GridColDef<ScreeningResultRow>[] = [
    {
      field: "queriedName",
      headerName: "Name",
      flex: 1.2,
      minWidth: 200,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ height: "100%" }}>
          <span>{params.value as string}</span>
          {params.row.resultType === "customer" && <Chip label="Customer" size="small" color="info" variant="outlined" />}
        </Stack>
      ),
    },
    { field: "status", headerName: "Status", width: 160, renderCell: (params) => <StatusChip status={params.row.status} /> },
    { field: "matchScore", headerName: "Score", width: 100, valueFormatter: (value) => (typeof value === "number" ? `${value}%` : "-") },
    { field: "matchedName", headerName: "Matched Entity", flex: 1, minWidth: 200, valueGetter: (_, row) => row.matchedName ?? "-" },
    { field: "ofacSource", headerName: "List", width: 100, valueGetter: (_, row) => row.ofacSource ?? "-" },
    { field: "matchType", headerName: "Match Type", width: 130, valueGetter: (_, row) => row.matchType ?? "-" },
    {
      field: "tier2",
      headerName: "Tier 2",
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const name = params.row.queriedName;
        const loading = !!tier2LoadingByEntity[name];
        const hasResult = !!tier2ByEntity[name];
        const hasError = !!tier2ErrorByEntity[name];

        if (loading) return <CircularProgress size={18} />;

        return (
          <Tooltip title={hasResult ? "View Tier 2 details" : hasError ? tier2ErrorByEntity[name] : "Tier 2 pending"}>
            <span>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveEntity(name);
                }}
                disabled={!hasResult}
                color={hasResult ? "primary" : "default"}
              >
                <VisibilityOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        );
      },
    },
  ];

  const activeTier2 = activeEntity ? tier2ByEntity[activeEntity] : null;
  const selectedResultTier2 = selectedResult?.queriedName ? tier2ByEntity[selectedResult.queriedName] : null;

  const runFlagged = resultRows.filter((row) => row.status === "flagged").length;
  const runReview = resultRows.filter((row) => row.status === "review_needed").length;
  const runClear = resultRows.filter((row) => row.status === "clear").length;
const tier2Entities = Object.keys(tier2ByEntity);
  const runTier2Totals = tier2Entities.reduce(
    (acc, entityName) => {
      const t2 = tier2ByEntity[entityName];
      if (!t2) return acc;
      acc.sanctions += t2.sanctions_matches.length;
      acc.media += t2.adverse_media_findings.length;
      acc.flags += t2.risk_flags.length;
      return acc;
    },
    { sanctions: 0, media: 0, flags: 0 },
  );

  const runStatusData = [
    { name: "Flagged", value: runFlagged, fill: insightChartColors.flagged },
    { name: "Review Needed", value: runReview, fill: insightChartColors.review },
    { name: "Clear", value: runClear, fill: insightChartColors.clear },
  ];

  const runListSourceData = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const row of resultRows) {
      const source = (row.ofacSource ?? "Unknown").trim() || "Unknown";
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    return Array.from(bySource.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [resultRows]);
  const runTier2Data = [
    { name: "Sanctions Matches", value: runTier2Totals.sanctions },
    { name: "Adverse Media", value: runTier2Totals.media },
    { name: "Risk Flags", value: runTier2Totals.flags },
  ];

  return (
    <Stack spacing={2.5}>
      <PageTitle title="Screening" subtitle="Tier 1 and Tier 2 run together. Use eye icon per row to open Tier 2 details in popup." />

      <Card component={motion.div} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={onSubmit}>
            <TextField
              label="Customer Name"
              {...form.register("customerName")}
              error={!!form.formState.errors.customerName}
              helperText={form.formState.errors.customerName?.message}
            />

            {entriesArray.fields.map((field, index) => (
              <Grid2 container spacing={1.2} key={field.id} alignItems="center">
                <Grid2 size={{ xs: 12, md: 5 }}>
                  <TextField
                    fullWidth
                    label={`Company/Vendor ${index + 1}`}
                    {...form.register(`entries.${index}.companyName`)}
                    error={!!form.formState.errors.entries?.[index]?.companyName}
                    helperText={form.formState.errors.entries?.[index]?.companyName?.message}
                  />
                </Grid2>
                <Grid2 size={{ xs: 12, md: 3 }}>
                  <TextField fullWidth label="Country (Optional)" {...form.register(`entries.${index}.country`)} />
                </Grid2>
                <Grid2 size={{ xs: 10, md: 3 }}>
                  <TextField fullWidth label="Identifier (Optional)" {...form.register(`entries.${index}.identifier`)} />
                </Grid2>
                <Grid2 size={{ xs: 2, md: 1 }}>
                  <IconButton aria-label="remove entry" disabled={entriesArray.fields.length === 1} onClick={() => entriesArray.remove(index)}>
                    <DeleteOutlineOutlinedIcon />
                  </IconButton>
                </Grid2>
              </Grid2>
            ))}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems="center">
              <Button startIcon={<PlaylistAddOutlinedIcon />} onClick={() => entriesArray.append({ companyName: "", country: "", identifier: "" })}>Add Another Name</Button>
              <Button color="warning" onClick={() => form.reset({ customerName: "", entries: [{ companyName: "", country: "", identifier: "" }] })}>Clear Form</Button>
              <Button color="warning" onClick={clearResults} disabled={!lastResult && Object.keys(tier2ByEntity).length === 0}>Clear All</Button>
              <Button type="submit" disabled={screenMutation.isPending} variant="contained" startIcon={<PlayCircleOutlineOutlinedIcon />}>Screen All</Button>
              <Button startIcon={<DownloadOutlinedIcon />} disabled={!lastResult} onClick={() => void downloadReport("pdf")}>Download PDF</Button>
              <Button startIcon={<DownloadOutlinedIcon />} disabled={!lastResult} onClick={() => void downloadReport("excel")}>Download Excel</Button>
              <Typography variant="body2" color="text.secondary" sx={{ ml: "auto !important" }}>
                Have a long list? <Link component={RouterLink} to="/bulk-screening" underline="hover">Use Bulk Screening</Link>
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {lastResult && (
        <Card component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Tier 1 Results</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Run {lastResult.runId} completed in {lastResult.elapsedSeconds.toFixed(2)}s. Tier 2 ready for {readyCount}/{resultRows.length} rows. Click the eye icon to view details.
            </Alert>
            <Box sx={{ height: 420 }}>
              <DataGrid
                rows={resultRows}
                columns={resultColumns}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                onRowClick={(params) => setSelectedResult(params.row)}
                sx={{
                  "& .MuiDataGrid-row": { cursor: "pointer" },
                  "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
                  "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
                  "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": { backgroundColor: "inherit" },
                }}
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {resultRows.length > 0 && (
        <Card component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <CardContent>
            <Stack spacing={1.2}>
              <Typography variant="h6">Run Insights</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ xs: "flex-start", sm: "center" }} useFlexGap flexWrap="wrap">
                <Chip label={`Total Companies: ${resultRows.length}`} size="small" variant="outlined" />
                <Chip label={`Flagged: ${runFlagged}`} size="small" color="error" variant="outlined" />
                <Chip label={`Review: ${runReview}`} size="small" color="warning" variant="outlined" />
                <Chip label={`Clear: ${runClear}`} size="small" color="success" variant="outlined" />
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ width: { xs: "100%", md: 240 }, height: 220 }}>
                  <Typography variant="caption" color="text.secondary">Run Outcome Distribution</Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={runStatusData} dataKey="value" nameKey="name" outerRadius={78}>
                        {runStatusData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>

                <Box sx={{ width: { xs: "100%", md: 260 }, height: 220 }}>
                  <Typography variant="caption" color="text.secondary">Top List Sources</Typography>
                  {runListSourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={runListSourceData} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} width={22} />
                        <RechartsTooltip formatter={(value, name) => [value, name]} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {runListSourceData.map((entry, idx) => (
                            <Cell key={entry.name} fill={["#0b5ed7", "#22a06b", "#c77700", "#d14343", "#6f42c1", "#198754"][idx % 6]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Stack justifyContent="center" sx={{ height: "100%" }}>
                      <Typography variant="caption" color="text.secondary">No list-source data yet</Typography>
                    </Stack>
                  )}
                </Box>

                <Box sx={{ width: { xs: "100%", md: 300 }, height: 220 }}>
                  <Typography variant="caption" color="text.secondary">Tier 2 Breakdown</Typography>
                  {runTier2Data.some((item) => item.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={runTier2Data} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} width={22} />
                        <RechartsTooltip formatter={(value, name) => [value, name]} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {runTier2Data.map((entry, idx) => (
                            <Cell key={entry.name} fill={[insightChartColors.flagged, "#0b5ed7", insightChartColors.review][idx % 3]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Stack justifyContent="center" sx={{ height: "100%" }}>
                      <Typography variant="caption" color="text.secondary">No Tier 2 data yet</Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedResult} onClose={() => setSelectedResult(null)} fullWidth maxWidth="md">
        <DialogTitle>Screening Result Details</DialogTitle>
        <DialogContent dividers>
          {selectedResult && (
            <Stack spacing={1.4}>
              <Typography><strong>Name:</strong> {selectedResult.queriedName}</Typography>
              <Typography><strong>Status:</strong> {selectedResult.status}</Typography>
              <Typography><strong>Score:</strong> {typeof selectedResult.matchScore === "number" ? `${selectedResult.matchScore}%` : "-"}</Typography>
              <Typography><strong>Matched Entity:</strong> {selectedResult.matchedName ?? "-"}</Typography>
              <Typography><strong>List:</strong> {selectedResult.ofacSource ?? "-"}</Typography>
              <Typography><strong>Match Type:</strong> {selectedResult.matchType ?? "-"}</Typography>
              {selectedResult.remarks && <Typography><strong>Remarks:</strong> {selectedResult.remarks}</Typography>}

              {selectedResultTier2 ? (
                <Tier2StructuredDetails entityName={selectedResult.queriedName} result={selectedResultTier2} />
              ) : (
                <Alert severity="info">Tier 2 details are not available yet for this entity.</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(activeTier2)} onClose={() => setActiveEntity(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Tier 2 Investigation Details</DialogTitle>
        <DialogContent dividers>
          {activeEntity && activeTier2 && <Tier2StructuredDetails entityName={activeEntity} result={activeTier2} />}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}



















