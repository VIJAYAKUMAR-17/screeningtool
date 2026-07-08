import json
import re
from agent.provider import AzureGPTProvider
from agent.tools import TOOL_DEFINITIONS, make_dispatcher
from database.models import SanctionedEntity
from engine.graph import SupplierGraph

_SYSTEM_PROMPT = """You are a trade sanctions compliance analyst for an enterprise ERP screening system.

Your responsibilities:
1. Screen each vendor against global sanctions lists using the screen_entity tool.
2. For borderline matches (score 70â€“84), call resolve_entity to reason about entity identity.
3. Check Tier 2 supplier exposure via get_tier2_suppliers for each vendor.
4. Produce a structured findings JSON block at the end of your response.

Decision rules:
- Score â‰¥ 85  â†’ FLAGGED   (high-confidence sanctions match â€” block vendor)
- Score 70â€“84 â†’ REVIEW    (ambiguous â€” escalate to compliance officer)
- Score < 70  â†’ CLEAR     (no material match found)

Be factual and concise. One sentence of reasoning per finding is sufficient.

End your response with a JSON block in EXACTLY this format (no other JSON in your response):

```json
{
  "findings": [
    {
      "vendor_name": "string",
      "status": "FLAGGED | REVIEW | CLEAR",
      "top_match": "matched entity name or null",
      "list_source": "OFAC | UN | BIS | EU | AUSTRALIA | EDGAR | null",
      "score": 0.0,
      "tier2_exposure": false,
      "reasoning": "one-sentence rationale"
    }
  ],
  "overall_risk": "HIGH | MEDIUM | LOW",
  "requires_human_review": true
}
```"""


class ScreeningAnalyst:
    def __init__(self):
        self.provider = AzureGPTProvider()

    def analyze(
        self,
        vendors: list[str],
        customer_name: str,
        sanctioned_entities: list[SanctionedEntity],
        graph: SupplierGraph | None = None,
    ) -> dict:
        dispatcher = make_dispatcher(sanctioned_entities, graph)
        vendor_list = "\n".join(f"- {v}" for v in vendors)

        user_message = (
            f"Customer: {customer_name}\n\n"
            f"Vendors to screen:\n{vendor_list}\n\n"
            "Screen each vendor and provide your compliance findings."
        )

        raw = self.provider.run_with_tools(
            system_prompt=_SYSTEM_PROMPT,
            user_message=user_message,
            tools=TOOL_DEFINITIONS,
            tool_dispatcher=dispatcher,
        )

        return {
            "raw_response": raw,
            "findings": _extract_findings(raw),
        }


def _extract_findings(response: str) -> dict | None:
    match = re.search(r"```json\s*(.*?)\s*```", response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None


