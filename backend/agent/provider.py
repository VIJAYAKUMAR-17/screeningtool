import json
from openai import AzureOpenAI
from config import settings


class AzureGPTProvider:
    """
    Thin wrapper around Azure OpenAI that handles the tool-use loop:
    send → receive tool calls → dispatch → send results → repeat until text reply.
    """

    def __init__(self):
        self.client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
        self.deployment = settings.azure_openai_deployment

    def run_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict],
        tool_dispatcher: callable,
        max_iterations: int = 12,
    ) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        for _ in range(max_iterations):
            kwargs = {"model": self.deployment, "messages": messages}
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            response = self.client.chat.completions.create(**kwargs)
            msg = response.choices[0].message

            if not msg.tool_calls:
                return msg.content or ""

            messages.append(msg)

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments)
                result = tool_dispatcher(fn_name, fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                })

        return "Agent reached max iterations without producing a final answer."
