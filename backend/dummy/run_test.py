"""
Standalone test — no server, no Azure credentials needed.

Loads dummy sanctions data directly from JSON files,
runs the screening engine, and prints results to the terminal.

Run:
  python dummy/run_test.py
"""
import json
import sys
import time
from pathlib import Path

# Make sure project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.matcher import batch_screen
from database.models import SanctionedEntity, MatchStatus

# ── Colour helpers (no dependencies) ─────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[91m"
YELLOW = "\033[93m"
GREEN  = "\033[92m"
CYAN   = "\033[96m"
DIM    = "\033[2m"

def colour(text, *codes):
    return "".join(codes) + str(text) + RESET

def status_colour(status_val):
    if status_val == "flagged":       return colour("FLAGGED",      BOLD, RED)
    if status_val == "review_needed": return colour("REVIEW NEEDED", BOLD, YELLOW)
    return colour("CLEAR", BOLD, GREEN)


# ── Load JSON sanctions data into in-memory SanctionedEntity objects ──────────
DUMMY_DIR = Path(__file__).parent / "sanctions"

def load_entities() -> list[SanctionedEntity]:
    entities = []
    for json_file in sorted(DUMMY_DIR.glob("*.json")):
        records = json.loads(json_file.read_text(encoding="utf-8"))
        for r in records:
            e = SanctionedEntity()
            e.id          = len(entities) + 1
            e.name        = r["name"]
            e.aliases     = r.get("aliases", [])
            e.country     = r.get("country")
            e.list_source = r["list_source"]
            e.list_id     = r.get("list_id")
            e.address     = r.get("address")
            e.programs    = r.get("programs", [])
            e.remarks     = r.get("remarks")
            entities.append(e)
    return entities


# ── Run screening ─────────────────────────────────────────────────────────────
def run(customer: str, vendors: list[str]):
    entities = load_entities()
    print(f"\n{colour('Trade Sanctions Screening Tool', BOLD, CYAN)}")
    print("─" * 60)
    print(f"  Customer  : {colour(customer, BOLD)}")
    print(f"  Vendors   : {len(vendors)}")
    print(f"  Sanctions DB: {len(entities)} entities loaded from dummy/sanctions/\n")

    start   = time.perf_counter()
    results = batch_screen(vendors, entities)
    elapsed = time.perf_counter() - start

    # ── Print results ─────────────────────────────────────────────────────────
    flagged = review = clear = 0
    print(f"{'Vendor':<35} {'Status':<18} {'Score':>6}  {'Matched Entity':<30} {'List'}")
    print("─" * 100)

    for vendor_name, matches in results.items():
        top        = matches[0] if matches else None
        status_val = top["status"].value if top else "clear"
        score_str  = f"{top['match_score']:.0f}%" if top else "—"
        matched    = (top["matched_name"] or "—")[:30] if top else "—"
        lst        = top["list_source"] if top else "—"

        if status_val == "flagged":       flagged += 1
        elif status_val == "review_needed": review  += 1
        else:                             clear   += 1

        print(
            f"{vendor_name:<35} "
            f"{status_colour(status_val):<28} "
            f"{score_str:>6}  "
            f"{matched:<30} "
            f"{lst}"
        )

        # Show top 3 matches on detail lines
        for m in matches[1:3]:
            print(
                f"  {'↳ also:':<33} "
                f"{'':28} "
                f"{m['match_score']:.0f}%    "
                f"{colour(m['matched_name'], DIM):<30} "
                f"{colour(m['list_source'], DIM)}"
            )

    # ── Summary ───────────────────────────────────────────────────────────────
    print("─" * 100)
    print(
        f"  {colour(f'Flagged: {flagged}', BOLD, RED)}   "
        f"{colour(f'Review: {review}', BOLD, YELLOW)}   "
        f"{colour(f'Clear: {clear}', BOLD, GREEN)}   "
        f"  {colour(f'({elapsed*1000:.1f} ms)', DIM)}"
    )
    print()

    if flagged or review:
        print(colour("⚠  Action required — see flagged/review vendors above.", BOLD, YELLOW))
    else:
        print(colour("✓  All vendors clear.", BOLD, GREEN))
    print()


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # ── Test 1: KSSL vendors ─────────────────────────────────────────────────
    run(
        customer="Makglobal FZCO",
        vendors=[
            "ITGlobe Incorporated",
            "G. B. B. INDUSTRIES",
            "AXLETECH INDIA PVT. LTD.",
        ],
    )

    # ── Test 2: Technocraft vendors ───────────────────────────────────────────
    run(
        customer="Technocraft India",
        vendors=[
            "ITGlobe Incorporated",
            "G. B. B. INDUSTRIES",
            "AXLETECH INDIA PVT. LTD.",
        ],
    )

    # ── Test 3: Clean vendors (should all be CLEAR) ───────────────────────────
    run(
        customer="Clean Test",
        vendors=[
            "Tata Consultancy Services Ltd",
            "Infosys BPM Limited",
            "Mahindra Logistics Pvt Ltd",
        ],
    )
