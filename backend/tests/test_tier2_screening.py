import unittest

from tier2_screening.providers import (
    AdverseMediaProvider,
    _extract_sec_subsidiaries,
    infer_sister_entities,
)
from tier2_screening.schemas import RelatedParty, SourceRef, SourceStatus
from tier2_screening.service import Tier2ScreeningService, normalize_tier2_findings


class FakeHttp:
    def __init__(self, text_by_url: dict[str, str]):
        self.text_by_url = text_by_url

    async def get_text(self, url: str, params=None, headers=None):
        return self.text_by_url.get(url)


class Tier2ProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_sister_entities_are_not_fabricated_from_parent_name(self):
        related = [
            RelatedParty(
                name="Example Holdings LLC",
                relationship="parent_company",
                source_refs=[SourceRef(source="GLEIF", note="Registry sourced parent")],
            )
        ]

        assert infer_sister_entities(related, "Example Operating LLC") == []

    def test_sec_subsidiary_extraction_reads_exhibit_21_names(self):
        document = """
        <html><body>
          <table>
            <tr><th>Name</th><th>Jurisdiction</th></tr>
            <tr><td>Example Operating Corporation</td><td>Delaware</td></tr>
            <tr><td>Example Finance LLC</td><td>New York</td></tr>
            <tr><td>Example Parent Corporation</td><td>Delaware</td></tr>
          </table>
        </body></html>
        """

        subsidiaries = _extract_sec_subsidiaries(document, "Example Parent Corporation")

        assert "Example Operating Corporation" in subsidiaries
        assert "Example Finance LLC" in subsidiaries
        assert "Example Parent Corporation" not in subsidiaries

    async def test_adverse_media_requires_entity_and_keyword_in_same_item(self):
        url = "https://example.test/rss"
        provider = AdverseMediaProvider(FakeHttp({url: """
        <rss><channel>
          <item>
            <title>Example Corp opens new office</title>
            <description>Routine corporate announcement.</description>
            <link>https://example.test/office</link>
          </item>
          <item>
            <title>Fraud indictment announced</title>
            <description>Another company was named in the case.</description>
            <link>https://example.test/other-case</link>
          </item>
          <item>
            <title>Example Corp charged in fraud scheme</title>
            <description>Authorities announced an enforcement action.</description>
            <link>https://example.test/example-case</link>
          </item>
        </channel></rss>
        """}))
        provider.SOURCES = [("Example feed", url)]

        findings, statuses = await provider.scan(["Example Corp"])

        assert len(findings) == 1
        assert findings[0].url == "https://example.test/example-case"
        assert findings[0].keyword == "fraud"
        assert statuses[0].status == "checked"


class Tier2RiskTests(unittest.TestCase):
    def test_unavailable_critical_source_adds_partial_coverage_risk(self):
        service = Tier2ScreeningService.__new__(Tier2ScreeningService)
        statuses = [
            SourceStatus(source="SEC EDGAR", status="unavailable", message="timeout"),
            SourceStatus(source="OFAC live file", status="checked", records_found=100),
            SourceStatus(source="CSL API", status="checked", records_found=0),
        ]

        flags, score = service._compute_risk(
            sanctions_matches=[],
            adverse_media_count=0,
            related_entities_count=0,
            offshore_chain=False,
            source_statuses=statuses,
            coverage_status="partial",
        )

        assert score == 25
        assert [flag.code for flag in flags] == ["tier2_partial_coverage"]

    def test_skipped_optional_source_does_not_add_partial_coverage_risk(self):
        service = Tier2ScreeningService.__new__(Tier2ScreeningService)
        statuses = [
            SourceStatus(source="OFAC live file", status="checked", records_found=100),
            SourceStatus(source="CSL API", status="checked", records_found=0),
            SourceStatus(source="Adverse media", status="skipped", message="disabled"),
        ]

        coverage_status, _, limitations = service._coverage(statuses)
        flags, score = service._compute_risk(
            sanctions_matches=[],
            adverse_media_count=0,
            related_entities_count=0,
            offshore_chain=False,
            source_statuses=statuses,
            coverage_status=coverage_status,
        )

        assert coverage_status == "complete"
        assert limitations == []
        assert score == 0
        assert flags == []

    def test_normalize_tier2_findings_adds_backward_compatible_defaults(self):
        payload = normalize_tier2_findings(
            {},
            run_id=42,
            tier1_run_id=7,
            target_entity="Example Corp",
            risk_score=25,
            risk_level="medium",
        )

        assert payload["run_id"] == 42
        assert payload["tier1_run_id"] == 7
        assert payload["target_entity"] == "Example Corp"
        assert payload["risk_score"] == 25
        assert payload["risk_level"] == "medium"
        assert payload["source_statuses"] == []
        assert payload["limitations"] == []
        assert payload["coverage_status"] == "partial"


if __name__ == "__main__":
    unittest.main()
