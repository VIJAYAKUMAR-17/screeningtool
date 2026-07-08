import re

# Legal entity suffixes stripped before comparison
_LEGAL_SUFFIXES = [
    r"\bfzco\b", r"\bfzc\b", r"\bfze\b", r"\bllc\b", r"\bltd\b",
    r"\blimited\b", r"\bpvt\b", r"\bprivate\b", r"\binc\b",
    r"\bincorporated\b", r"\bcorp\b", r"\bcorporation\b",
    r"\bgmbh\b", r"\bag\b", r"\bsa\b", r"\bbv\b", r"\bplc\b",
    r"\bindustries\b", r"\bindustry\b", r"\bgroup\b",
    r"\bholdings?\b", r"\benterprises?\b", r"\btrading\b",
]


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation and legal suffixes, collapse whitespace."""
    name = name.lower().strip()
    name = re.sub(r"[.,\-&()/]", " ", name)
    for suffix in _LEGAL_SUFFIXES:
        name = re.sub(suffix, "", name, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", name).strip()


def core_tokens(name: str) -> set[str]:
    """Meaningful tokens after normalization (length > 2)."""
    return {t for t in normalize_name(name).split() if len(t) > 2}


def names_overlap(name_a: str, name_b: str, min_ratio: float = 0.6) -> bool:
    """True if token overlap between names meets min_ratio against the smaller set."""
    ta, tb = core_tokens(name_a), core_tokens(name_b)
    if not ta or not tb:
        return False
    overlap = len(ta & tb)
    return (overlap / min(len(ta), len(tb))) >= min_ratio
