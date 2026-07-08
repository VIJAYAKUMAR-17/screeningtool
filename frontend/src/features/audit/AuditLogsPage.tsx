import { Box, Grid2, MenuItem, Stack, TextField } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/common/PageTitle";
import { api } from "@/services/api";
import { AuditLog } from "@/types/api";

const columns: GridColDef<AuditLog>[] = [
  { field: "auditId", headerName: "Audit ID", width: 110 },
  {
    field: "timestamp",
    headerName: "Timestamp",
    width: 210,
    valueGetter: (_, row) => format(new Date(row.timestamp), "PPpp"),
  },
  { field: "entity", headerName: "Entity", flex: 1, minWidth: 180 },
  { field: "action", headerName: "Action", width: 180 },
  { field: "outcome", headerName: "Outcome", width: 140 },
  { field: "user", headerName: "User", width: 150 },
];

export function AuditLogsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["audit-logs"], queryFn: api.getAuditLogs });
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("all");

  const filtered = useMemo(
    () =>
      data.filter((log) => {
        const searchMatch = `${log.entity} ${log.action} ${log.user}`.toLowerCase().includes(search.toLowerCase());
        const outcomeMatch = outcome === "all" ? true : log.outcome.toLowerCase() === outcome;
        return searchMatch && outcomeMatch;
      }),
    [data, search, outcome],
  );

  return (
    <Stack spacing={2}>
      <PageTitle title="Audit Logs" subtitle="Trace screening events, outcomes, and user-level activity." />

      <Grid2 container spacing={1.2}>
        <Grid2 size={{ xs: 12, md: 8 }}>
          <TextField fullWidth value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entity, action, or user..." />
        </Grid2>
        <Grid2 size={{ xs: 12, md: 4 }}>
          <TextField select fullWidth value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <MenuItem value="all">All Outcomes</MenuItem>
            <MenuItem value="complete">Complete</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="running">Running</MenuItem>
          </TextField>
        </Grid2>
      </Grid2>

      <Box sx={{ height: 640 }}>
        <DataGrid
          rows={filtered}
          loading={isLoading}
          columns={columns}
          getRowId={(row) => row.auditId}
          pagination
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>
    </Stack>
  );
}
