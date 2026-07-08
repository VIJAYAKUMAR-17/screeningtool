import { Chip } from "@mui/material";
import clsx from "clsx";
import { ScreeningStatus } from "@/types/api";

const map: Record<ScreeningStatus, { label: string; color: "success" | "warning" | "error" | "info" | "default" }> = {
  clear: { label: "Clear", color: "success" },
  review_needed: { label: "Review Required", color: "warning" },
  flagged: { label: "Match Found", color: "error" },
  pending: { label: "Pending", color: "default" },
  failed: { label: "Failed", color: "error" },
  running: { label: "Running", color: "info" },
};

export function StatusChip({ status }: { status: ScreeningStatus }) {
  const cfg = map[status] ?? map.pending;
  return <Chip label={cfg.label} color={cfg.color} size="small" className={clsx("status-chip", `status-${status}`)} />;
}
