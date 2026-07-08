import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Tier2RelatedParty, Tier2ScreeningResult, Tier2SourceStatusValue } from "@/types/api";

type RelatedGroup = {
  key: string;
  title: string;
  items: Tier2RelatedParty[];
};

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function fmt(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sourceStatusColor(status: Tier2SourceStatusValue): "success" | "warning" | "error" | "default" {
  if (status === "checked") return "success";
  if (status === "partial") return "warning";
  if (status === "unavailable") return "error";
  return "default";
}

function RelatedTable({ items }: { items: Tier2RelatedParty[] }) {
  const showJurisdiction = items.some((item) => hasText(item.jurisdiction));
  const showRegNumber = items.some((item) => hasText(item.registration_number));
  const showSources = items.some((item) => item.source_refs.length > 0);

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            {showJurisdiction && <TableCell>Jurisdiction</TableCell>}
            {showRegNumber && <TableCell>Reg. Number</TableCell>}
            {showSources && <TableCell>Sources</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, idx) => (
            <TableRow key={`${item.name}-${idx}`}>
              <TableCell>{item.name}</TableCell>
              {showJurisdiction && <TableCell>{item.jurisdiction || ""}</TableCell>}
              {showRegNumber && <TableCell>{item.registration_number || ""}</TableCell>}
              {showSources && (
                <TableCell>
                  {item.source_refs.length
                    ? item.source_refs.map((ref) => ref.source).join(", ")
                    : ""}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function Tier2StructuredDetails({
  result,
  entityName,
}: {
  result: Tier2ScreeningResult;
  entityName?: string;
}) {
  const sourceStatuses = result.source_statuses ?? [];
  const limitations = result.limitations ?? [];
  const coverageStatus = result.coverage_status ?? "partial";
  const severity =
    result.risk_level === "high"
      ? "error"
      : result.risk_level === "medium"
        ? "warning"
        : "success";

  const relatedGroups: RelatedGroup[] = [
    { key: "parent", title: "Parent Companies", items: result.parent_companies },
    { key: "ultimate", title: "Ultimate Parent", items: result.ultimate_parent },
    { key: "subs", title: "Subsidiaries", items: result.subsidiaries },
    { key: "sister", title: "Sister Entities", items: result.sister_entities },
    { key: "do", title: "Directors and Officers", items: result.directors_and_officers },
    { key: "share", title: "Major Shareholders", items: result.major_shareholders },
    { key: "bo", title: "Beneficial Owners", items: result.beneficial_owners },
    { key: "related", title: "Related Entities", items: result.related_entities },
  ].filter((group) => group.items.length > 0);

  const totalRelated = relatedGroups.reduce((sum, group) => sum + group.items.length, 0);

  const showSanctions = result.sanctions_matches.length > 0;
  const sanctionsShowScore = result.sanctions_matches.some((m) => m.score !== null && m.score !== undefined);
  const sanctionsShowMatched = result.sanctions_matches.some((m) => hasText(m.matched_name));
  const sanctionsShowList = result.sanctions_matches.some((m) => hasText(m.list_source));
  const sanctionsShowType = result.sanctions_matches.some((m) => hasText(m.match_type));

  const showAdverse = result.adverse_media_findings.length > 0;
  const adverseShowTitle = result.adverse_media_findings.some((f) => hasText(f.title));
  const adverseShowSnippet = result.adverse_media_findings.some((f) => hasText(f.snippet));

  const showRiskFlags = result.risk_flags.length > 0;
  const showDataSources = result.data_sources_used.length > 0;
  const showSourceStatuses = sourceStatuses.length > 0;
  const coverageSeverity = coverageStatus === "complete" ? "success" : coverageStatus === "failed" ? "error" : "warning";

  const hasFindings =
    relatedGroups.length > 0 ||
    showSanctions ||
    showAdverse ||
    showRiskFlags ||
    showDataSources ||
    showSourceStatuses;

  return (
    <Stack spacing={1.2}>
      <Alert severity={severity}>
        <strong>{entityName || result.target_entity}</strong> | Risk Score: <strong>{result.risk_score}</strong> | Risk Level: <strong>{result.risk_level.toUpperCase()}</strong>
      </Alert>

      <Alert severity={coverageSeverity}>
        <strong>Coverage: {coverageStatus.toUpperCase()}</strong>
        {result.coverage_summary ? ` | ${result.coverage_summary}` : ""}
      </Alert>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Target: ${result.target_entity}`} variant="outlined" />
        <Chip label={`Coverage: ${fmt(coverageStatus)}`} color={coverageSeverity} variant="outlined" />
        {totalRelated > 0 && <Chip label={`Related Parties: ${totalRelated}`} variant="outlined" />}
        {showSanctions && <Chip label={`Sanctions Matches: ${result.sanctions_matches.length}`} color="error" variant="outlined" />}
        {showAdverse && <Chip label={`Adverse Media: ${result.adverse_media_findings.length}`} color="warning" variant="outlined" />}
        {showRiskFlags && <Chip label={`Risk Flags: ${result.risk_flags.length}`} color={severity} variant="outlined" />}
      </Stack>

      {!hasFindings && (
        <Alert severity="info">No Tier 2 findings identified for this company.</Alert>
      )}

      {relatedGroups.length > 0 && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Ownership and Related Parties</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.2}>
              {relatedGroups.map((group) => (
                <Box key={group.key}>
                  <Typography variant="subtitle2" sx={{ mb: 0.6 }}>{group.title}</Typography>
                  <RelatedTable items={group.items} />
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {showSanctions && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Sanctions Matches</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Relationship</TableCell>
                    <TableCell>Status</TableCell>
                    {sanctionsShowScore && <TableCell>Score</TableCell>}
                    {sanctionsShowMatched && <TableCell>Matched Name</TableCell>}
                    {sanctionsShowList && <TableCell>List</TableCell>}
                    {sanctionsShowType && <TableCell>Match Type</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.sanctions_matches.map((m, idx) => (
                    <TableRow key={`${m.name}-${idx}`}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell>{fmt(m.relationship)}</TableCell>
                      <TableCell>{fmt(m.status)}</TableCell>
                      {sanctionsShowScore && <TableCell>{m.score ?? ""}</TableCell>}
                      {sanctionsShowMatched && <TableCell>{m.matched_name || ""}</TableCell>}
                      {sanctionsShowList && <TableCell>{m.list_source || ""}</TableCell>}
                      {sanctionsShowType && <TableCell>{m.match_type || ""}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {showAdverse && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Adverse Media</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Entity</TableCell>
                    <TableCell>Keyword</TableCell>
                    <TableCell>Source</TableCell>
                    {adverseShowTitle && <TableCell>Title</TableCell>}
                    {adverseShowSnippet && <TableCell>Snippet</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.adverse_media_findings.map((f, idx) => (
                    <TableRow key={`${f.entity_name}-${idx}`}>
                      <TableCell>{f.entity_name}</TableCell>
                      <TableCell>{f.keyword}</TableCell>
                      <TableCell>{f.source}</TableCell>
                      {adverseShowTitle && <TableCell>{f.title || ""}</TableCell>}
                      {adverseShowSnippet && <TableCell>{f.snippet || ""}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {(showRiskFlags || showDataSources || showSourceStatuses || limitations.length > 0) && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Risk Flags and Source Coverage</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {showRiskFlags && (
              <TableContainer sx={{ mb: showDataSources || showSourceStatuses || limitations.length ? 1.2 : 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Code</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Points</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.risk_flags.map((flag, idx) => (
                      <TableRow key={`${flag.code}-${idx}`}>
                        <TableCell>{flag.code}</TableCell>
                        <TableCell>{flag.description}</TableCell>
                        <TableCell>{flag.points}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {showSourceStatuses && (
              <TableContainer sx={{ mb: showDataSources || limitations.length ? 1.2 : 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Source</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Records</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sourceStatuses.map((status, idx) => (
                      <TableRow key={`${status.source}-${idx}`}>
                        <TableCell>
                          {status.url ? (
                            <Link href={status.url} target="_blank" rel="noreferrer">
                              {status.source}
                            </Link>
                          ) : (
                            status.source
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={fmt(status.status)}
                            color={sourceStatusColor(status.status)}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{status.records_found ?? 0}</TableCell>
                        <TableCell>{status.message || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {limitations.length > 0 && (
              <Box sx={{ mb: showDataSources ? 1.2 : 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Limitations</Typography>
                <Stack spacing={0.4}>
                  {limitations.map((item, idx) => (
                    <Typography key={`${item}-${idx}`} variant="body2" color="text.secondary">
                      {item}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}

            {showDataSources && (
              <>
                {(showRiskFlags || showSourceStatuses || limitations.length > 0) && <Divider sx={{ my: 0.8 }} />}
                <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Data Sources Used</Typography>
                <Typography variant="body2" color="text.secondary">
                  {result.data_sources_used.join(", ")}
                </Typography>
              </>
            )}
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}
