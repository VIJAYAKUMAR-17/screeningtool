from agent.provider import AzureGPTProvider

_SYSTEM_PROMPT = """You are a compliance report writer for a trade sanctions screening system.
Your audience is the Finance and Supply Chain teams at an enterprise manufacturer.

Write in formal, precise English. Structure your output as:
1. Executive Summary (2–3 sentences)
2. Per-Vendor Findings (one paragraph each)
3. Recommended Actions (bulleted list)

Do not speculate beyond the data. Do not repeat the raw scores — describe risk in plain language.
Include the screening duration in the header line."""


class ReportNarrator:
    def __init__(self):
        self.provider = AzureGPTProvider()

    def generate_narrative(
        self,
        findings: dict,
        customer_name: str,
        elapsed_seconds: float,
    ) -> str:
        if not findings:
            return "No structured findings available to narrate."

        user_message = (
            f"Customer: {customer_name}\n"
            f"Screening duration: {elapsed_seconds:.2f} seconds\n\n"
            f"Structured findings:\n{findings}\n\n"
            "Write the compliance screening report."
        )

        return self.provider.run_with_tools(
            system_prompt=_SYSTEM_PROMPT,
            user_message=user_message,
            tools=[],
            tool_dispatcher=lambda fn, args: {},
        )
