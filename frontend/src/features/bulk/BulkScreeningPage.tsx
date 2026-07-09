import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
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
  IconButton,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { PageTitle } from "@/components/common/PageTitle";
import { StatusChip } from "@/components/common/StatusChip";
import { permissions, useCan } from "@/auth/permissions";
import { registerTenantReset } from "@/auth/tenantState";
import { api } from "@/services/api";
import { http } from "@/services/http";
import { Tier2StructuredDetails } from "@/components/common/Tier2StructuredDetails";
import { ScreenInput, ScreeningResult, Tier2ScreeningResult } from "@/types/api";

interface CsvRow extends ScreenInput {
  id: number;
  valid: boolean;
}

const insightChartColors = {
  clear: "#22a06b",
  review: "#c77700",
  flagged: "#d14343",
};

interface OutcomeRow extends ScreeningResult {
  id: number;
}
type BulkPageCache = {
  rows: CsvRow[];
  outcomeRows: OutcomeRow[];
  processed: number;
  matchesFound: number;
  activeTab: number;
  pasteBlock: string;
  tier2ByEntity: Record<string, Tier2ScreeningResult>;
  tier2LoadingByEntity: Record<string, boolean>;
  tier2ErrorByEntity: Record<string, string>;
  activeEntity: string | null;
};

const bulkPageCache: BulkPageCache = {
  rows: [],
  outcomeRows: [],
  processed: 0,
  matchesFound: 0,
  activeTab: 0,
  pasteBlock: "",
  tier2ByEntity: {},
  tier2LoadingByEntity: {},
  tier2ErrorByEntity: {},
  activeEntity: null,
};

function resetBulkPageCache() {
  bulkPageCache.rows = [];
  bulkPageCache.outcomeRows = [];
  bulkPageCache.processed = 0;
  bulkPageCache.matchesFound = 0;
  bulkPageCache.activeTab = 0;
  bulkPageCache.pasteBlock = "";
  bulkPageCache.tier2ByEntity = {};
  bulkPageCache.tier2LoadingByEntity = {};
  bulkPageCache.tier2ErrorByEntity = {};
  bulkPageCache.activeEntity = null;
}

const columns: GridColDef<CsvRow>[] = [
  { field: "companyName", headerName: "Company/Vendor Name", flex: 1.2, minWidth: 220 },
  { field: "country", headerName: "Country", flex: 0.7, minWidth: 120 },
  { field: "identifier", headerName: "Identifier", flex: 0.8, minWidth: 130 },
  { field: "valid", headerName: "Valid", type: "boolean", width: 110 },
];

const normalizeHeader = (value: string): string =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getValue = (row: Record<string, string | undefined>, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
};

const expectedHeaderKeys = new Set([
  "companyname",
  "companyvendorname",
  "vendorname",
  "vendor",
  "name",
  "entityname",
  "country",
  "countryname",
  "identifier",
  "id",
  "taxid",
  "registrationnumber",
]);

const looksLikeHeaderlessFile = (fields: string[] | undefined): boolean => {
  if (!fields?.length) return true;
  const normalizedFields = fields.map(normalizeHeader).filter(Boolean);
  if (!normalizedFields.length) return true;
  return !normalizedFields.some((field) => expectedHeaderKeys.has(field));
};

export function BulkScreeningPage() {
  const [customerName] = useState("Bulk Compliance Run");
  const [rows, setRows] = useState<CsvRow[]>(bulkPageCache.rows);
  const [outcomeRows, setOutcomeRows] = useState<OutcomeRow[]>(bulkPageCache.outcomeRows);
  const [processed, setProcessed] = useState(bulkPageCache.processed);
  const [matchesFound, setMatchesFound] = useState(bulkPageCache.matchesFound);
  const [activeTab, setActiveTab] = useState(bulkPageCache.activeTab);
  const [pasteBlock, setPasteBlock] = useState(bulkPageCache.pasteBlock);
  const [tier2ByEntity, setTier2ByEntity] = useState<Record<string, Tier2ScreeningResult>>(bulkPageCache.tier2ByEntity);
  const [tier2LoadingByEntity, setTier2LoadingByEntity] = useState<Record<string, boolean>>(bulkPageCache.tier2LoadingByEntity);
  const [tier2ErrorByEntity, setTier2ErrorByEntity] = useState<Record<string, string>>(bulkPageCache.tier2ErrorByEntity);
  const [activeEntity, setActiveEntity] = useState<string | null>(bulkPageCache.activeEntity);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeRow | null>(null);
  const queryClient = useQueryClient();
  const canCreateScreening = useCan(permissions.screeningsCreate);
  const canCreateTier2 = useCan(permissions.tier2Create);
  const canExportReports = useCan(permissions.reportsExport);

  useEffect(
    () =>
      registerTenantReset(() => {
        resetBulkPageCache();
        setRows([]);
        setOutcomeRows([]);
        setProcessed(0);
        setMatchesFound(0);
        setActiveTab(0);
        setPasteBlock("");
        setTier2ByEntity({});
        setTier2LoadingByEntity({});
        setTier2ErrorByEntity({});
        setActiveEntity(null);
        setSelectedOutcome(null);
      }),
    [],
  );

  useEffect(() => {
    bulkPageCache.rows = rows;
  }, [rows]);

  useEffect(() => {
    bulkPageCache.outcomeRows = outcomeRows;
  }, [outcomeRows]);

  useEffect(() => {
    bulkPageCache.processed = processed;
  }, [processed]);

  useEffect(() => {
    bulkPageCache.matchesFound = matchesFound;
  }, [matchesFound]);

  useEffect(() => {
    bulkPageCache.activeTab = activeTab;
  }, [activeTab]);

  useEffect(() => {
    bulkPageCache.pasteBlock = pasteBlock;
  }, [pasteBlock]);

  useEffect(() => {
    bulkPageCache.tier2ByEntity = tier2ByEntity;
  }, [tier2ByEntity]);

  useEffect(() => {
    bulkPageCache.tier2LoadingByEntity = tier2LoadingByEntity;
  }, [tier2LoadingByEntity]);

  useEffect(() => {
    bulkPageCache.tier2ErrorByEntity = tier2ErrorByEntity;
  }, [tier2ErrorByEntity]);

  useEffect(() => {
    bulkPageCache.activeEntity = activeEntity;
  }, [activeEntity]);

  const refreshDerivedScreens = async (runIds: number[] = []) => {
    const uniqueRunIds = Array.from(new Set(runIds.filter((id) => id > 0)));
    const tier2RunInvalidations = uniqueRunIds.map((runId) =>
      queryClient.invalidateQueries({ queryKey: ["tier2-run", runId] }),
    );

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-charts"] }),
      queryClient.invalidateQueries({ queryKey: ["results"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
      queryClient.invalidateQueries({ queryKey: ["tier2-dashboard"] }),
      ...tier2RunInvalidations,
    ]);
  };

  const runTier2ForEntity = async (
    runId: number,
    entityName: string,
    context: { country?: string | null; identifier?: string | null } = {},
  ) => {
    setTier2LoadingByEntity((prev) => ({ ...prev, [entityName]: true }));
    setTier2ErrorByEntity((prev) => ({ ...prev, [entityName]: "" }));
    try {
      const { data } = await http.post<Tier2ScreeningResult>(
        "/tier2/screen",
        {
          run_id: runId,
          primary_entity: entityName,
          country: context.country || undefined,
          identifier: context.identifier || undefined,
          include_adverse_media: true,
        },
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

  const runAllTier2ForOutcomes = async (outcomes: OutcomeRow[]) => {
    if (!outcomes.length) return;
    toast.loading("Tier 2 screening started for all rows", { id: "tier2-batch-bulk" });

    const results = await Promise.all(
      outcomes.map((row) => {
        if (!row.tier1RunId || !row.queriedName?.trim()) return Promise.resolve(false);
        return runTier2ForEntity(row.tier1RunId, row.queriedName.trim(), {
          country: row.country,
          identifier: row.identifier,
        });
      }),
    );

    const issues = results.filter((ok) => !ok).length;
    if (issues > 0) {
      toast.error(`Tier 2 completed with ${issues} issue(s). Eye icon works for successful rows.`, { id: "tier2-batch-bulk" });
    } else {
      toast.success("Tier 2 completed for all rows", { id: "tier2-batch-bulk" });
    }
  };

  const onFile = (file: File) => {
    const applyMappedRows = (mapped: CsvRow[]) => {
      setRows(mapped);
      setOutcomeRows([]);
      setTier2ByEntity({});
      setTier2LoadingByEntity({});
      setTier2ErrorByEntity({});
      setActiveEntity(null);
      toast.success(`${mapped.length} records loaded from CSV`);
    };

    Papa.parse<Record<string, string | undefined>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results) => {
        setProcessed(0);
        setMatchesFound(0);

        if (looksLikeHeaderlessFile(results.meta.fields)) {
          Papa.parse<string[]>(file, {
            header: false,
            skipEmptyLines: true,
            complete: (rawResults) => {
              const mappedFromColumns: CsvRow[] = rawResults.data.map((cols, idx) => {
                const companyName = (cols[1] ?? "").trim();
                const country = (cols[3] ?? "").trim();
                const identifier = (cols[0] ?? "").trim();
                return {
                  id: idx + 1,
                  companyName,
                  country,
                  identifier,
                  valid: companyName.length > 1,
                };
              });
              applyMappedRows(mappedFromColumns);
            },
            error: (err) => toast.error(`CSV parse failed: ${err.message}`),
          });
          return;
        }

        const mapped: CsvRow[] = results.data.map((row, idx) => {
          const companyName = getValue(row, [
            "companyname",
            "companyvendorname",
            "vendorname",
            "vendor",
            "name",
            "entityname",
          ]);
          const country = getValue(row, ["country", "countryname"]);
          const identifier = getValue(row, ["identifier", "id", "taxid", "registrationnumber"]);

          return {
            id: idx + 1,
            companyName,
            country,
            identifier,
            valid: companyName.length > 1,
          };
        });

        applyMappedRows(mapped);
      },
      error: (err) => toast.error(`CSV parse failed: ${err.message}`),
    });
  };

  const addFromPaste = () => {
    const names = pasteBlock
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length) {
      toast.error("No valid names found in pasted text");
      return;
    }
    const mapped: CsvRow[] = names.map((name, idx) => ({
      id: idx + 1,
      companyName: name,
      country: "",
      identifier: "",
      valid: true,
    }));
    setRows(mapped);
    setOutcomeRows([]);
    setTier2ByEntity({});
    setTier2LoadingByEntity({});
    setTier2ErrorByEntity({});
    setActiveEntity(null);
    setProcessed(0);
    setMatchesFound(0);
    setPasteBlock("");
    toast.success(`Loaded ${names.length} names`);
  };

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows]);

  const screenBulk = useMutation({
    mutationFn: (payload: { customerName: string; entities: ScreenInput[] }) =>
      api.bulkScreen(payload, {
        batchSize: 300,
        timeoutMs: 0,
        onProgress: (progress) => {
          setProcessed(progress.processed);
          setMatchesFound(progress.matchesFound);
        },
      }),
    onMutate: () => {
      setProcessed(0);
      setMatchesFound(0);
      setOutcomeRows([]);
      setTier2ByEntity({});
      setTier2LoadingByEntity({});
      setTier2ErrorByEntity({});
      setActiveEntity(null);
      toast.loading("Bulk screening started", { id: "bulk" });
    },
    onSuccess: async (data) => {
      setProcessed(data.summary.total);
      setMatchesFound(data.summary.flagged);
      const mappedOutcomes =
        data.results.map((result, index) => ({
          ...result,
          id: index + 1,
        }));
      setOutcomeRows(mappedOutcomes);
      toast.success(`Bulk screening completed: ${data.summary.clear} clear, ${data.summary.reviewNeeded} review, ${data.summary.flagged} flagged`, { id: "bulk" });
      if (canCreateTier2) {
        await runAllTier2ForOutcomes(mappedOutcomes);
      }
      await refreshDerivedScreens(mappedOutcomes.map((row) => row.tier1RunId ?? 0));
    },
    onError: (err) => toast.error(err.message, { id: "bulk" }),
  });

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setActiveTab(0);
      onFile(file);
    }
  };

  const clearForm = () => {
    setRows([]);
    setPasteBlock("");
  };

  const clearAll = () => {
    setOutcomeRows([]);
    setTier2ByEntity({});
    setTier2LoadingByEntity({});
    setTier2ErrorByEntity({});
    setActiveEntity(null);
    setProcessed(0);
    setMatchesFound(0);
  };

  const readyCount = useMemo(() => Object.keys(tier2ByEntity).length, [tier2ByEntity]);
  const activeTier2 = activeEntity ? tier2ByEntity[activeEntity] : null;
  const selectedOutcomeTier2 = selectedOutcome?.queriedName ? tier2ByEntity[selectedOutcome.queriedName] : null;
  const bulkFlagged = outcomeRows.filter((row) => row.status === "flagged").length;
  const bulkReview = outcomeRows.filter((row) => row.status === "review_needed").length;
  const bulkClear = outcomeRows.filter((row) => row.status === "clear").length;
  const bulkStatusData = [
    { name: "Flagged", value: bulkFlagged, fill: insightChartColors.flagged },
    { name: "Review", value: bulkReview, fill: insightChartColors.review },
    { name: "Clear", value: bulkClear, fill: insightChartColors.clear },
  ];
  const bulkListSourceData = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const row of outcomeRows) {
      const source = (row.ofacSource ?? "Unknown").trim() || "Unknown";
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    return Array.from(bySource.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [outcomeRows]);
  const bulkTier2Data = [
    {
      name: "Sanctions Matches",
      value: Object.values(tier2ByEntity).reduce((sum, result) => sum + result.sanctions_matches.length, 0),
    },
    {
      name: "Adverse Media",
      value: Object.values(tier2ByEntity).reduce((sum, result) => sum + result.adverse_media_findings.length, 0),
    },
    {
      name: "Risk Flags",
      value: Object.values(tier2ByEntity).reduce((sum, result) => sum + result.risk_flags.length, 0),
    },
  ];
  const runIdsForReports = useMemo(
    () => Array.from(new Set(outcomeRows.map((row) => row.tier1RunId).filter((id): id is number => typeof id === "number" && id > 0))),
    [outcomeRows],
  );

  const downloadBulkReports = async (kind: "pdf" | "excel") => {
    if (!canExportReports) {
      toast.error("Your role cannot export reports.");
      return;
    }

    if (!runIdsForReports.length) {
      toast.error("Run bulk screening first");
      return;
    }

    const id = toast.loading(`Preparing ${kind.toUpperCase()} reports...`);
    try {
      await api.downloadAllReports(runIdsForReports, kind);
      toast.success(`${kind.toUpperCase()} reports downloaded`, { id });
    } catch (err) {
      toast.error((err as Error).message, { id });
    }
  };

  const outcomeColumns: GridColDef<OutcomeRow>[] = [
    { field: "queriedName", headerName: "Entity", flex: 1.1, minWidth: 220 },
    {
      field: "status",
      headerName: "Outcome",
      width: 170,
      renderCell: (params) => <StatusChip status={params.row.status} />,
    },
    {
      field: "matchScore",
      headerName: "Score",
      width: 110,
      valueFormatter: (value) => (typeof value === "number" ? `${value}%` : "-"),
    },
    { field: "matchedName", headerName: "Matched Name", flex: 1, minWidth: 220, valueGetter: (_, row) => row.matchedName ?? "-" },
    { field: "ofacSource", headerName: "List", width: 120, valueGetter: (_, row) => row.ofacSource ?? "-" },
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

  return (
    <Stack spacing={2.5}>
      <PageTitle title="Bulk Screening" subtitle="Upload CSV, validate entities, and run Tier 1 + Tier 2 screening at scale." />

      <Card
        component={motion.div}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        sx={{ border: 1, borderStyle: "dashed", borderColor: "divider" }}
      >
        <CardContent>
          <Tabs value={activeTab} onChange={(_, v: number) => setActiveTab(v)} sx={{ mb: 2 }}>
            <Tab label="Upload CSV" />
            <Tab label="Paste Names" />
          </Tabs>

          {activeTab === 0 && (
            <Stack spacing={1.3} alignItems="flex-start">
              <Typography color="text.secondary">
                Drag and drop a CSV onto this card, or pick a file manually. Expected columns: companyName, country, identifier.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button component="label" variant="contained" startIcon={<CloudUploadOutlinedIcon />}>
                  Upload CSV
                  <input
                    hidden
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onFile(file);
                    }}
                  />
                </Button>
                <Button onClick={clearForm}>Clear Form</Button>
                <Button onClick={clearAll} disabled={!outcomeRows.length && Object.keys(tier2ByEntity).length === 0}>Clear All</Button>
              </Stack>
            </Stack>
          )}

          {activeTab === 1 && (
            <Stack spacing={1.5}>
              <Typography color="text.secondary">
                Paste company or vendor names separated by commas or line breaks.
              </Typography>
              <TextField
                multiline
                minRows={7}
                fullWidth
                placeholder="e.g. ITGlobe Incorporated, Technocraft India&#10;Makglobal FZCO"
                value={pasteBlock}
                onChange={(e) => setPasteBlock(e.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={addFromPaste}>
                  Parse & Load
                </Button>
                <Button onClick={() => setPasteBlock("")}>Clear</Button>
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Alert severity="info">
        Records: {rows.length} | Valid: {validRows.length} | Processed: {processed} / {validRows.length} | Matches Found: {matchesFound}
      </Alert>

      <Button
        startIcon={<PlayArrowOutlinedIcon />}
        variant="contained"
        onClick={() => {
          if (!canCreateScreening) {
            toast.error("Your role cannot create screening runs.");
            return;
          }
          screenBulk.mutate({
            customerName,
            entities: validRows.map((r) => ({ companyName: r.companyName, country: r.country, identifier: r.identifier })),
          });
        }}
        disabled={!validRows.length || screenBulk.isPending || !canCreateScreening}
      >
        Screen All Uploaded Entities      </Button>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => void downloadBulkReports("pdf")}
          disabled={!runIdsForReports.length || !canExportReports}
        >
          Download PDF Reports
        </Button>
        <Button
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => void downloadBulkReports("excel")}
          disabled={!runIdsForReports.length || !canExportReports}
        >
          Download Excel Reports
        </Button>
      </Stack>

      {screenBulk.isPending && <LinearProgress />}

      <Box sx={{ height: 460 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          sx={{
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
            "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
            "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": { backgroundColor: "inherit" },
          }}
        />
      </Box>

      {outcomeRows.length > 0 && (
        <Card>
          <CardContent>
            <Stack spacing={1.2}>
              <Typography variant="h6">Screening Outcomes</Typography>
              <Typography color="text.secondary">Per-entity screening results after bulk run completion.</Typography>
              <Alert severity="info">
                Tier 2 ready for {readyCount}/{outcomeRows.length} rows.
              </Alert>
              <Box sx={{ height: 460 }}>
                <DataGrid
                  rows={outcomeRows}
                  columns={outcomeColumns}
                  pageSizeOptions={[10, 25, 50]}
                  disableRowSelectionOnClick
                  onRowClick={(params) => setSelectedOutcome(params.row)}
                  sx={{
                    "& .MuiDataGrid-row": { cursor: "pointer" },
                    "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
                    "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": { outline: "none" },
                    "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": { backgroundColor: "inherit" },
                  }}
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}



      {outcomeRows.length > 0 && (
        <Card>
          <CardContent>
            <Stack spacing={1.2}>
              <Typography variant="h6">Bulk Run Insights</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ xs: "flex-start", sm: "center" }} useFlexGap flexWrap="wrap">
                <Chip label={`Total Companies: ${outcomeRows.length}`} size="small" variant="outlined" />
                <Chip label={`Flagged: ${bulkFlagged}`} size="small" color="error" variant="outlined" />
                <Chip label={`Review: ${bulkReview}`} size="small" color="warning" variant="outlined" />
                <Chip label={`Clear: ${bulkClear}`} size="small" color="success" variant="outlined" />
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ width: { xs: "100%", md: 240 }, height: 220 }}>
                  <Typography variant="caption" color="text.secondary">Bulk Outcome Distribution</Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={bulkStatusData} dataKey="value" nameKey="name" outerRadius={78}>
                        {bulkStatusData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>

                
                <Box sx={{ width: { xs: "100%", md: 260 }, height: 220 }}>
                  <Typography variant="caption" color="text.secondary">Top List Sources</Typography>
                  {bulkListSourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bulkListSourceData} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} width={22} />
                        <RechartsTooltip formatter={(value, name) => [value, name]} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {bulkListSourceData.map((entry, idx) => (
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
                  <Typography variant="caption" color="text.secondary">Bulk Tier 2 Breakdown</Typography>
                  {bulkTier2Data.some((item) => item.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bulkTier2Data} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" hide />
                        <YAxis allowDecimals={false} width={22} />
                        <RechartsTooltip formatter={(value, name) => [value, name]} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {bulkTier2Data.map((entry, idx) => (
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
      <Dialog open={!!selectedOutcome} onClose={() => setSelectedOutcome(null)} fullWidth maxWidth="md">
        <DialogTitle>Bulk Result Details</DialogTitle>
        <DialogContent dividers>
          {selectedOutcome && (
            <Stack spacing={1.4}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.2}>
                    <Typography variant="subtitle1">Bulk Run Insights</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ xs: "flex-start", sm: "center" }} useFlexGap flexWrap="wrap">
                      <Chip label={`Total Companies: ${outcomeRows.length}`} size="small" variant="outlined" />
                      <Chip label={`Flagged: ${bulkFlagged}`} size="small" color="error" variant="outlined" />
                      <Chip label={`Review: ${bulkReview}`} size="small" color="warning" variant="outlined" />
                      <Chip label={`Clear: ${bulkClear}`} size="small" color="success" variant="outlined" />
                    </Stack>

                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <Box sx={{ width: { xs: "100%", md: 220 }, height: 200 }}>
                        <Typography variant="caption" color="text.secondary">Bulk Outcome Distribution</Typography>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={bulkStatusData} dataKey="value" nameKey="name" outerRadius={74}>
                              {bulkStatusData.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(value, name) => [value, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>

                      <Box sx={{ width: { xs: "100%", md: 260 }, height: 200 }}>
                        <Typography variant="caption" color="text.secondary">Top List Sources</Typography>
                        {bulkListSourceData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bulkListSourceData} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" hide />
                              <YAxis allowDecimals={false} width={22} />
                              <RechartsTooltip formatter={(value, name) => [value, name]} />
                              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {bulkListSourceData.map((entry, idx) => (
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

                      <Box sx={{ width: { xs: "100%", md: 260 }, height: 200 }}>
                        <Typography variant="caption" color="text.secondary">Bulk Tier 2 Breakdown</Typography>
                        {bulkTier2Data.some((item) => item.value > 0) ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bulkTier2Data} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" hide />
                              <YAxis allowDecimals={false} width={22} />
                              <RechartsTooltip formatter={(value, name) => [value, name]} />
                              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {bulkTier2Data.map((entry, idx) => (
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

              <Typography><strong>Entity:</strong> {selectedOutcome.queriedName}</Typography>
              <Typography><strong>Status:</strong> {selectedOutcome.status}</Typography>
              <Typography><strong>Score:</strong> {typeof selectedOutcome.matchScore === "number" ? `${selectedOutcome.matchScore}%` : "-"}</Typography>
              <Typography><strong>Matched Name:</strong> {selectedOutcome.matchedName ?? "-"}</Typography>
              <Typography><strong>List:</strong> {selectedOutcome.ofacSource ?? "-"}</Typography>
              <Typography><strong>Match Type:</strong> {selectedOutcome.matchType ?? "-"}</Typography>
              {selectedOutcome.remarks && <Typography><strong>Remarks:</strong> {selectedOutcome.remarks}</Typography>}

              {selectedOutcomeTier2 ? (
                <Tier2StructuredDetails entityName={selectedOutcome.queriedName} result={selectedOutcomeTier2} />
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











































