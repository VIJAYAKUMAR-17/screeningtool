from engine import matcher as engine_matcher
from engine.resolver import names_overlap, normalize_name
from database.models import SanctionedEntity
from engine.graph import SupplierGraph

# ---------------------------------------------------------------------------
# Tool schemas â€” passed directly to Azure OpenAI
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "screen_entity",
            "description": (
                "Screen a company or individual name against all configured sanctions lists. "
                "Returns the top matches with scores, list sources, and preliminary status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Entity name to screen.",
                    },
                    "lists": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["OFAC", "UN", "BIS", "EU", "AUSTRALIA", "EDGAR"]},
                        "description": "Sanctions lists to restrict the search to. Omit to check all.",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_entity",
            "description": (
                "Determine whether two company names likely refer to the same legal entity, "
                "accounting for abbreviations, legal suffixes, and transliterations. "
                "Use this for borderline matches (score 70â€“84) before making a decision."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name_a": {"type": "string", "description": "First entity name."},
                    "name_b": {"type": "string", "description": "Second entity name."},
                    "country": {
                        "type": "string",
                        "description": "ISO country code if known â€” helps resolve ambiguity.",
                    },
                },
                "required": ["name_a", "name_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tier2_suppliers",
            "description": (
                "Return all Tier 1 and Tier 2 sub-suppliers of a given vendor and flag any "
                "that appear on sanctions lists. Use after screening direct vendors."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vendor_name": {
                        "type": "string",
                        "description": "Name of the vendor whose supply chain to trace.",
                    },
                },
                "required": ["vendor_name"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Dispatcher factory â€” binds tool implementations to live DB state
# ---------------------------------------------------------------------------

def make_dispatcher(
    sanctioned_entities: list[SanctionedEntity],
    graph: SupplierGraph | None = None,
) -> callable:
    """Returns a dispatcher closure bound to the current screening context."""

    def dispatch(fn_name: str, fn_args: dict) -> dict:
        if fn_name == "screen_entity":
            matches = engine_matcher.screen_entity(
                name=fn_args["name"],
                sanctioned_entities=sanctioned_entities,
                lists=fn_args.get("lists"),
            )
            return {
                "query": fn_args["name"],
                "match_count": len(matches),
                "matches": [
                    {
                        "entity_name": m["entity_name"],
                        "matched_name": m["matched_name"],
                        "score": m["match_score"],
                        "match_type": m["match_type"],
                        "list": m["list_source"],
                        "programs": m["programs"],
                        "status": (
                            m["status"].value
                            if hasattr(m["status"], "value")
                            else m["status"]
                        ),
                    }
                    for m in matches[:5]  # top 5 keeps context lean
                ],
            }

        elif fn_name == "resolve_entity":
            overlap = names_overlap(fn_args["name_a"], fn_args["name_b"])
            return {
                "name_a": fn_args["name_a"],
                "name_b": fn_args["name_b"],
                "normalized_a": normalize_name(fn_args["name_a"]),
                "normalized_b": normalize_name(fn_args["name_b"]),
                "likely_same_entity": overlap,
                "note": (
                    "Core token overlap â‰¥ 60% â€” probable match"
                    if overlap
                    else "Low token overlap â€” likely different entities"
                ),
            }

        elif fn_name == "get_tier2_suppliers":
            if not graph:
                return {
                    "vendor_name": fn_args["vendor_name"],
                    "tier2_suppliers": [],
                    "note": "No vendor graph loaded. Add relationships via POST /vendors/link.",
                }
            vendor = graph.find_by_name(fn_args["vendor_name"])
            if not vendor:
                return {
                    "vendor_name": fn_args["vendor_name"],
                    "tier2_suppliers": [],
                    "note": "Vendor not found in graph.",
                }
            chain = graph.get_supplier_chain(vendor.id)
            return {
                "vendor_name": fn_args["vendor_name"],
                "tier2_suppliers": chain,
            }

        return {"error": f"Unknown tool: {fn_name}"}

    return dispatch


