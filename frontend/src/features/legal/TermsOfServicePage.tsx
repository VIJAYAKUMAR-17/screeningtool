import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import { Box, Card, CardContent, Divider, List, ListItem, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/common/PageTitle";

const sections: Array<{ id: string; title: string; paragraphs?: string[]; bullets?: string[] }> = [
  {
    id: "1",
    title: "Nature of the Service - Please Read First",
    paragraphs: [
      "The Service is an automated screening and decision-support tool. It checks names and entities you submit against publicly available sanctions, restricted-party, watchlist, legal-entity, and adverse-media data sources, and returns possible matches with risk indicators.",
      "The Service is not a legal determination, compliance certification, or clearance to proceed with any transaction. It does not constitute legal, financial, regulatory, or professional advice. A result of \"no match\" does not mean a party is safe or lawful to deal with, and a reported match does not by itself mean a party is restricted. All results require independent human review and verification before any decision is made.",
      "You remain solely responsible for your own compliance with all applicable sanctions, export-control, anti-money-laundering, and trade laws.",
    ],
  },
  {
    id: "2",
    title: "No Warranty (\"As Is\")",
    paragraphs: [
      "The Service and all data are provided \"as is\" and \"as available\", without warranties of any kind, whether express or implied, including but not limited to accuracy, completeness, timeliness, reliability, fitness for a particular purpose, or non-infringement.",
      "We aggregate data from third-party and government sources that we do not control and that may be incomplete, delayed, inaccurate, or out of date. We do not guarantee that the Service will identify every restricted party (false negatives) or that every reported match is correct (false positives). Automated and fuzzy name matching identifies potential name similarities only; it does not confirm the identity of any individual or entity.",
      "We are not the system of record for any source list. The official source agency or publication always governs.",
    ],
  },
  {
    id: "3",
    title: "User Responsibilities",
    paragraphs: ["By using the Service, you agree that you will:"],
    bullets: [
      "Independently verify every potential match against the official source before acting. Where a match relates to a sanctions or restricted-party list, you must confirm it against the official publication and conduct appropriate additional due diligence.",
      "Make your own compliance decisions. You, not Liquidmind, are the decision-maker for any transaction.",
      "Comply with all applicable laws in your use of the Service and of any results, including sanctions, export-control, data-protection, anti-discrimination, and defamation laws.",
      "Not rely on the Service as your sole compliance control.",
    ],
  },
  {
    id: "4",
    title: "Sanctions & Export-Control Compliance; Acceptable Use",
    paragraphs: [
      "The Service is intended to help you detect and avoid dealings with restricted parties. You must not use the Service, its data, or its results to facilitate, structure, conceal, or assist any violation of sanctions or export-control law, including attempts to evade designations, ownership thresholds (such as the OFAC 50% Rule), or licensing requirements.",
      "The Service does not authorize, license, or approve any transaction. Identifying that a party is not listed does not mean a transaction is permitted; restrictions may apply through ownership, control, end-use, end-user, or jurisdiction-based rules that are outside the scope of this Service.",
    ],
  },
  {
    id: "5",
    title: "Data Sources & Required Notices",
    paragraphs: ["The Service draws on the following sources. Each is subject to the notices below.", "Source availability can vary by deployment configuration, third-party uptime, network access, licensing limits, and jurisdiction. The absence of a source in a specific screening run does not imply the source does not exist; it may have been unavailable or disabled for that run."],
  },
  {
    id: "5.1",
    title: "U.S. Consolidated Screening List (CSL) - International Trade Administration (ITA)",
    paragraphs: [
      "This product uses the International Trade Administration's Data API but is not endorsed or certified by the International Trade Administration.",
      "The CSL consolidates multiple export-screening lists of the U.S. Departments of Commerce, State, and the Treasury. The CSL API is not the system of record. If a party to your transaction matches a name on the CSL, you must check the official publication of restricted parties in the U.S. Federal Register, or the official lists maintained on the websites of the Departments of Commerce, State, and the Treasury, to ensure full compliance with all terms and conditions of the restrictions on the listed parties.",
      "Source and information URLs accompanying each result should be used to verify against the originating agency.",
    ],
  },
  {
    id: "5.2",
    title: "U.S. Treasury - Office of Foreign Assets Control (OFAC)",
    paragraphs: [
      "The Service uses OFAC sanctions data, including the Specially Designated Nationals (SDN) List and the Consolidated Sanctions List, sourced from the U.S. Department of the Treasury. OFAC is the authoritative source; the official OFAC lists govern. OFAC data is used here without endorsement by, or affiliation with, the U.S. Department of the Treasury.",
      "Note the OFAC 50% Rule: entities owned 50% or more, directly or indirectly, individually or in the aggregate, by one or more blocked persons are themselves blocked even if not separately listed. This ownership analysis is the user's responsibility and may not be fully reflected in list data.",
    ],
  },
  {
    id: "5.3",
    title: "GLEIF - Legal Entity Identifier (LEI) Data",
    paragraphs: [
      "The Service uses Legal Entity Identifier data published by the Global Legal Entity Identifier Foundation (GLEIF). LEI reference data is made available by GLEIF under a public-domain (CC0) dedication. LEI records are self-declared by entities and validated by registration agents; GLEIF does not warrant the accuracy or completeness of the data, and neither do we. Presence, absence, or status of an LEI is not by itself a compliance indicator.",
    ],
  },
  {
    id: "5.4",
    title: "Adverse Media & Public Enforcement Sources (SEC, DOJ, FBI, World Bank, and similar)",
    paragraphs: [
      "The Service surfaces information from publicly available enforcement, regulatory, and news sources, which may include the U.S. Securities and Exchange Commission (SEC), the U.S. Department of Justice (DOJ), the Federal Bureau of Investigation (FBI), the World Bank Group (including its Listing of Ineligible/Debarred Firms and Individuals), and other public or third-party media feeds.",
      "Important notices regarding this information:",
    ],
    bullets: [
      "Informational only; not a finding of guilt. The appearance of any person or entity in adverse-media or enforcement results does not mean they have committed any offense. Allegations, charges, investigations, and indictments are not convictions. All persons are presumed innocent unless and until proven guilty by a competent authority.",
      "No endorsement or affiliation. Liquidmind and the Screening Tool are not affiliated with, endorsed by, certified by, or sponsored by the SEC, DOJ, FBI, the World Bank Group, or any other source agency.",
      "May be inaccurate, incomplete, or outdated. Media and enforcement records may contain errors, may have been updated, withdrawn, settled, dismissed, or overturned, and may relate to a different individual or entity with a similar name.",
      "Lawful and fair use required. You must use adverse-media results in compliance with applicable data-protection, anti-discrimination, fair-credit, employment, and defamation laws, and only for legitimate compliance and due-diligence purposes.",
    ]
  },
  {
    id: "5.5",
    title: "Australia Consolidated Sanctions List (DFAT)",
    paragraphs: [
      "The Service may use data from the Australian Government Department of Foreign Affairs and Trade (DFAT) Consolidated List. DFAT is the authoritative source for Australian sanctions designations; the official DFAT publication governs.",
      "DFAT publishes this material publicly and, except where otherwise noted, under Creative Commons Attribution 4.0 terms. You are responsible for complying with applicable attribution and source terms when reusing exported data.",
    ],
  },
  {
    id: "5.6",
    title: "United Nations Security Council Consolidated List (UN)",
    paragraphs: [
      "The Service may use data derived from the United Nations Security Council Consolidated List. The United Nations publication is the authoritative source and governs in case of any discrepancy.",
      "UN data can change at any time. You must verify all matches against the current UN official publication before making a compliance decision.",
    ],
  },
  {
    id: "5.7",
    title: "European Union Restrictive Measures / Consolidated Financial Sanctions (EU)",
    paragraphs: [
      "The Service may use data from European Union sanctions and restrictive measures publications. The official EU legal acts and competent authority publications govern.",
      "Users are responsible for checking current EU measures, updates, and scope (including sectoral and ownership/control restrictions) before acting.",
    ],
  },
  {
    id: "5.8",
    title: "U.S. Department of Commerce - Bureau of Industry and Security (BIS)",
    paragraphs: [
      "The Service may use data from BIS restricted-party publications (including, where applicable, Entity List and related controls). BIS and the U.S. Government publications are authoritative.",
      "Export-control obligations may apply even where no exact list match is returned. End-use, end-user, destination, and licensing rules remain your responsibility.",
    ],
  },
  {
    id: "5.9",
    title: "U.S. SEC EDGAR Company Filings (Supplemental Ownership Context)",
    paragraphs: [
      "The Service may use publicly available SEC EDGAR submissions as a supplemental source for entity and ownership context. EDGAR content is filed by issuers and can be incomplete, amended, superseded, or delayed.",
      "EDGAR-derived data is contextual and should not be treated as a sanctions determination or legal conclusion.",
    ],
  },
  {
    id: "5.10",
    title: "OpenCorporates (Corporate Registry Aggregation)",
    paragraphs: [
      "The Service may use OpenCorporates data for related-party and registration context. OpenCorporates aggregates records from multiple registries and may contain delays, normalization differences, or missing records.",
      "Use of OpenCorporates-derived data is subject to OpenCorporates terms and any underlying registry restrictions. Registry of record remains the authoritative source.",
    ],
  },
  {
    id: "5.11",
    title: "Source Coverage, Availability, and Verification Duty",
    bullets: [
      "No guaranteed complete coverage: not every authority or list worldwide is included in every run.",
      "No guaranteed continuity: source APIs, file formats, and publication endpoints may change, degrade, or become unavailable without notice.",
      "No guaranteed timeliness: ingestion and caching can lag behind official publications.",
      "You must verify all potentially relevant hits and all clear outcomes against official sources appropriate to your jurisdiction and transaction risk.",
    ],
  },  {
    id: "6",
    title: "Personal Data & Privacy",
    paragraphs: [
      "Screening necessarily involves processing the personal data of named individuals.",
      "When you submit names or entity information for screening, you are the data fiduciary/controller for that data, and Liquidmind acts as a data processor on your documented instructions, solely to provide the screening Service.",
      "We process source-list and adverse-media personal data for the purpose of enabling lawful compliance screening, on the basis of legitimate use/legal obligation rather than consent, consistent with India's Digital Personal Data Protection Act, 2023 and other applicable data-protection law.",
      "We apply reasonable technical and organizational security measures and retain data only as long as necessary for screening and audit purposes.",
      "Individuals may have rights regarding their personal data (such as access or correction).",
      "For full details, see our Privacy Policy.",
    ],
  },
  {
    id: "7",
    title: "Accuracy, Updates & Audit",
    paragraphs: [
      "Source data is refreshed periodically and may lag behind official sources. We retain dated snapshots of the data used for each screening to support audit and reproducibility, but we do not guarantee that any screening reflects the most current state of any source at the moment you act.",
      "Always reconfirm against the official source for time-sensitive or high-stakes decisions.",
    ],
  },
  {
    id: "8",
    title: "Limitation of Liability",
    paragraphs: [
      "To the maximum extent permitted by law, Liquidmind, its officers, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, business, goodwill, data, or for any regulatory penalty, fine, or enforcement action, arising out of or relating to your use of, or inability to use, the Service or its data.",
      "To the maximum extent permitted by law, our total aggregate liability arising out of or relating to the Service shall not exceed the total fees paid by you to Liquidmind for the Service in the preceding 12 months.",
      "Nothing in these terms excludes or limits liability that cannot be excluded or limited under applicable law.",
    ],
  },
  {
    id: "9",
    title: "Indemnification",
    paragraphs: [
      "You agree to indemnify, defend, and hold harmless Liquidmind and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to: (a) your use of the Service or its results; (b) your compliance decisions; (c) your violation of these terms or of any applicable law; or (d) your use of any third-party or government source data accessed through the Service.",
      "You also agree to comply with, and indemnify against breach of, the terms imposed by the underlying data providers, including the International Trade Administration's API terms.",
    ],
  },
  {
    id: "10",
    title: "Third-Party Terms",
    paragraphs: [
      "Your use of data originating from third-party and government sources may be subject to those sources' own terms. You are responsible for reviewing and complying with the applicable terms of the originating sources referenced in Section 5.",
    ],
  },
  {
    id: "11",
    title: "Changes to These Terms",
    paragraphs: [
      "We may update these terms and notices from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised terms. The Last updated date above indicates the current version.",
    ],
  },
  {
    id: "12",
    title: "Governing Law",
    paragraphs: [
      "These terms are governed by the laws of India, with exclusive jurisdiction of the courts of Bengaluru, Karnataka, without prejudice to any mandatory consumer or data-protection protections available to you.",
      "Your independent obligations under U.S. and other applicable sanctions and export-control laws continue to apply regardless of governing law.",
    ],
  },
];

export function TermsOfServicePage() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const timer = window.setTimeout(() => setShowIntro(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Box sx={{ position: "relative", minHeight: 360 }}>
      <AnimatePresence>
        {showIntro && (
          <Box
            component={motion.div}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.28 } }}
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 1400,
              display: "grid",
              placeItems: "center",
              background: (theme) =>
                theme.palette.mode === "light"
                  ? "radial-gradient(circle at center, rgba(11,94,215,0.10), rgba(255,255,255,0.92) 62%)"
                  : "radial-gradient(circle at center, rgba(112,162,255,0.18), rgba(13,21,32,0.93) 62%)",
              borderRadius: 2,
            }}
          >
            <Stack alignItems="center" spacing={1.4}>
              <Box
                component={motion.div}
                initial={{ rotate: -52, y: -28 }}
                animate={{ rotate: [ -52, -52, 10, 0 ], y: [ -28, -28, 10, 0 ] }}
                transition={{ duration: 0.75, times: [0, 0.5, 0.82, 1], ease: "easeInOut" }}
                sx={{ transformOrigin: "85% 20%" }}
              >
                <GavelOutlinedIcon sx={{ fontSize: 88, color: "primary.main" }} />
              </Box>

              <Box
                component={motion.div}
                initial={{ scaleX: 0.5, opacity: 0.35 }}
                animate={{ scaleX: [0.5, 1.16, 1], opacity: [0.35, 0.95, 0.65] }}
                transition={{ duration: 0.35, delay: 0.6 }}
                sx={{
                  width: 180,
                  height: 8,
                  borderRadius: 8,
                  background: (theme) =>
                    theme.palette.mode === "light"
                      ? "linear-gradient(90deg, rgba(11,94,215,0.20), rgba(11,94,215,0.75), rgba(11,94,215,0.20))"
                      : "linear-gradient(90deg, rgba(112,162,255,0.22), rgba(112,162,255,0.85), rgba(112,162,255,0.22))",
                }}
              />

              <Typography
                component={motion.p}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.8 }}
                variant="subtitle1"
                sx={{ fontWeight: 700 }}
              >
                Terms and Conditions
              </Typography>
            </Stack>
          </Box>
        )}
      </AnimatePresence>

      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: showIntro ? 0 : 1, y: showIntro ? 12 : 0 }}
        transition={{ duration: 0.34, ease: "easeOut" }}
      >
        <Stack spacing={2.2}>
          <PageTitle
            title="Screening Tool - Terms of Use, Disclaimer & Data Source Notices"
            subtitle="Operated by: Liquidmind Product Consulting Pvt. Ltd. - Last updated: 29/06/2026"
          />

          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                By using the Service you acknowledge that you have read, understood, and agreed to these Terms of Use and Disclaimer.
              </Typography>
            </CardContent>
          </Card>

          {sections.map((section) => (
            <Card key={section.id}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {section.id}. {section.title}
                </Typography>
                <Stack spacing={0.9}>
                  {section.paragraphs?.map((para, idx) => (
                    <Typography key={`${section.id}-p-${idx}`} variant="body2" color="text.secondary">
                      {para}
                    </Typography>
                  ))}
                  {section.bullets && (
                    <List dense sx={{ pt: 0 }}>
                      {section.bullets.map((item, idx) => (
                        <ListItem key={`${section.id}-b-${idx}`} sx={{ display: "list-item", py: 0.2, color: "text.secondary" }}>
                          <Typography variant="body2" color="text.secondary">
                            {item}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}

          <Divider />
          <Box sx={{ pb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Template adapted from user-provided legal text. Obtain formal legal review before production publication.
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}







