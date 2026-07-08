from rapidfuzz import fuzz
from engine.resolver import normalize_name
from database.models import SanctionedEntity, MatchStatus
from config import settings


def _best_score(query_norm: str, entity: SanctionedEntity) -> tuple[float, str, str]:
    """Return (best_score, match_type, matched_name) across name + aliases."""
    best = fuzz.token_sort_ratio(query_norm, normalize_name(entity.name))
    match_type = "name"
    matched_name = entity.name

    for alias in entity.aliases or []:
        score = fuzz.token_sort_ratio(query_norm, normalize_name(alias))
        if score > best:
            best, match_type, matched_name = score, "alias", alias

    return best, match_type, matched_name


def screen_entity(
    name: str,
    sanctioned_entities: list[SanctionedEntity],
    lists: list[str] = None,
) -> list[dict]:
    """
    Screen a single name against the provided entity list.
    Returns matches at or above fuzzy_review_threshold, sorted by score descending.
    """
    query_norm = normalize_name(name)
    results = []

    for entity in sanctioned_entities:
        if lists and entity.list_source not in lists:
            continue

        score, match_type, matched_name = _best_score(query_norm, entity)

        if score >= settings.fuzzy_review_threshold:
            status = (
                MatchStatus.FLAGGED if score >= settings.match_threshold
                else MatchStatus.REVIEW
            )
            results.append({
                "entity_id": entity.id,
                "entity_name": entity.name,
                "matched_name": matched_name,
                "match_score": round(score, 2),
                "match_type": match_type,
                "list_source": entity.list_source,
                "list_id": entity.list_id,
                "country": entity.country,
                "programs": entity.programs or [],
                "status": status,
            })

    return sorted(results, key=lambda x: x["match_score"], reverse=True)


def batch_screen(
    names: list[str],
    sanctioned_entities: list[SanctionedEntity],
    lists: list[str] = None,
) -> dict[str, list[dict]]:
    """Screen multiple names in one pass over the entity list."""
    return {name: screen_entity(name, sanctioned_entities, lists=lists) for name in names}
