"""
Trade Sanctions Screening â€” CLI

Usage examples:
  python cli.py ingest                          # fetch live OFAC data (internet required)
  python cli.py ingest --force                  # force reload even if list is current
  python cli.py ingest-sec                      # fetch SEC EDGAR company data (internet required)
  python cli.py seed                            # load dummy data (offline, no internet)
  python cli.py screen --customer "Makglobal FZCO" "ITGlobe Incorporated" "G. B. B. INDUSTRIES" "AXLETECH INDIA PVT. LTD."
  python cli.py screen --customer "KSSL" --ai "ITGlobe Incorporated" "Technocraft India"
  python cli.py list
  python cli.py report 1
  python cli.py report 1 --excel
  python cli.py report 1 --pdf
"""
import sys
import time
import csv
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich import box
from rich.panel import Panel
from rich.text import Text
from rich.rule import Rule

# â”€â”€ Bootstrap path so imports work from project root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
sys.path.insert(0, str(Path(__file__).parent))

from database.db import init_db, SessionLocal
from database.models import MatchStatus, ScreeningRun, SanctionedEntity
from database.repository import (
    SanctionRepository, VendorRepository, ScreeningRunRepository, SyncStateRepository,
)
from engine import matcher as engine_matcher
from engine.graph import SupplierGraph
from reporter.excel import generate_excel
from reporter.pdf import generate_pdf
from reporter.erp_format import build_erp_payload

console = Console()

_STATUS_STYLE = {
    "flagged":      "[bold red]FLAGGED[/]",
    "review_needed": "[bold yellow]REVIEW[/]",
    "clear":        "[bold green]CLEAR[/]",
}
_STATUS_COLOUR = {
    "flagged":      "red",
    "review_needed": "yellow",
    "clear":        "green",
}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# CLI root
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@click.group()
def cli():
    """Trade Sanctions Screening Tool"""
    init_db()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# ingest  (live data from OFAC SLS API)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command()
@click.option("--force", is_flag=True, default=False, help="Reload even if list is already current.")
def ingest(force):
    """Fetch live OFAC sanctions data and load it into the local DB."""
    import logging
    logging.basicConfig(level=logging.WARNING)

    db = SessionLocal()

    from ingestion.ofac import OFACIngester
    ingesters = [("OFAC Sanctions List Service", _BASE_URL, OFACIngester())]

    total_loaded = 0

    for title, endpoint, ingester in ingesters:
        console.print(f"\n[bold cyan]{title}[/] - live ingest")
        console.print(f"  Source : [cyan]{endpoint}[/]")

        state = SyncStateRepository(db).get(ingester.list_source)
        if state and state.last_synced_at:
            console.print(
                f"  Last sync : [dim]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]  "
                f"({state.entity_count:,} entities, publication {state.last_publication_id})"
            )
        else:
            console.print("  Last sync : [yellow]never[/]")

        should_run = True
        if not force:
            with console.status("Checking for updates..."):
                try:
                    should_run = ingester.needs_update(db)
                except Exception as exc:
                    console.print(f"[yellow]Could not verify updates:[/] {exc}")
                    should_run = False

            if not should_run:
                console.print("[green]OK[/] List is current - no update needed. Use --force to reload.")
                continue

            console.print("  [yellow]Update available.[/] Downloading...\n")
        else:
            console.print("  [yellow]--force specified.[/] Reloading regardless.\n")

        start = time.perf_counter()
        with console.status("[cyan]Downloading and loading sanctions data...[/]"):
            try:
                count = ingester.ingest(db)
            except RuntimeError as exc:
                console.print(f"[red]Ingest failed:[/] {exc}")
                continue

        elapsed = time.perf_counter() - start
        total_loaded += count

        state = SyncStateRepository(db).get(ingester.list_source)
        console.print(
            f"[bold green]OK Ingest complete[/] - [cyan]{count:,}[/] entities loaded in [cyan]{elapsed:.1f}s[/]"
        )
        if state:
            console.print(f"  Publication ID : [cyan]{state.last_publication_id}[/]")
            console.print(f"  Synced at      : [cyan]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]")

    db.close()
    console.print(f"\n[bold]Total entities loaded this run:[/] [cyan]{total_loaded:,}[/]")


_BASE_URL = "https://sanctionslistservice.ofac.treas.gov"


# ------------------------------------------------------------------------------
# ingest-sec  (live data from SEC EDGAR submissions API)
# ------------------------------------------------------------------------------
@cli.command("ingest-sec")
@click.option("--force", is_flag=True, default=False, help="Reload even if data is already synced today.")
@click.option("--max-companies", type=int, default=None, help="Max EDGAR companies to ingest.")
@click.option("--delay-seconds", type=float, default=None, help="Delay between SEC API requests.")
def ingest_sec(force, max_companies, delay_seconds):
    """Fetch SEC EDGAR company data and load it into the local DB as source 'EDGAR'."""
    import logging
    logging.basicConfig(level=logging.WARNING)

    from ingestion.sec_edgar import SECEDGARIngester

    db = SessionLocal()
    ingester = SECEDGARIngester(
        max_companies=max_companies,
        request_delay_seconds=delay_seconds,
    )

    console.print("\n[bold cyan]SEC EDGAR Company Submissions[/] - supplemental source ingest")
    console.print("  Source : [cyan]https://data.sec.gov/submissions/[/]")
    console.print("  List source : [cyan]EDGAR[/]")

    state = SyncStateRepository(db).get(ingester.list_source)
    if state and state.last_synced_at:
        console.print(
            f"  Last sync : [dim]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]  "
            f"({state.entity_count:,} entities, publication {state.last_publication_id})"
        )
    else:
        console.print("  Last sync : [yellow]never[/]")

    if not force and not ingester.needs_update(db):
        console.print("[green]OK[/] EDGAR source is current for today. Use --force to reload.")
        db.close()
        return

    start = time.perf_counter()
    with console.status("[cyan]Downloading and loading EDGAR company data...[/]"):
        try:
            count = ingester.ingest(db)
        except RuntimeError as exc:
            console.print(f"[red]Ingest failed:[/] {exc}")
            db.close()
            return

    elapsed = time.perf_counter() - start
    state = SyncStateRepository(db).get(ingester.list_source)
    console.print(
        f"[bold green]OK Ingest complete[/] - [cyan]{count:,}[/] entities loaded in [cyan]{elapsed:.1f}s[/]"
    )
    if state:
        console.print(f"  Publication ID : [cyan]{state.last_publication_id}[/]")
        console.print(f"  Synced at      : [cyan]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]")

    db.close()


# ------------------------------------------------------------------------------
# ingest-un  (local XML file)
# ------------------------------------------------------------------------------
@cli.command("ingest-un")
@click.option("--force", is_flag=True, default=False, help="Reload even if XML file is unchanged.")
def ingest_un(force):
    """Parse the local UN consolidated list XML and load it into the DB."""
    import logging
    logging.basicConfig(level=logging.WARNING)

    from ingestion.un import UNIngester, _XML_PATH

    db = SessionLocal()
    ingester = UNIngester()

    console.print(f"\n[bold cyan]UN Consolidated Sanctions List[/]")
    console.print(f"  Source : [cyan]{_XML_PATH}[/]")

    state = SyncStateRepository(db).get(ingester.list_source)
    if state and state.last_synced_at:
        console.print(
            f"  Last sync : [dim]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]  "
            f"({state.entity_count:,} entities)"
        )
    else:
        console.print("  Last sync : [yellow]never[/]")

    if not force:
        should_run = ingester.needs_update(db)
        if not should_run:
            console.print("[green]OK[/] UN list is current — XML unchanged. Use --force to reload.")
            db.close()
            return
        console.print("  [yellow]Update detected.[/] Parsing...\n")
    else:
        console.print("  [yellow]--force specified.[/] Reloading regardless.\n")

    start = time.perf_counter()
    with console.status("[cyan]Parsing UN XML and loading sanctions data...[/]"):
        try:
            count = ingester.ingest(db)
        except RuntimeError as exc:
            console.print(f"[red]Ingest failed:[/] {exc}")
            db.close()
            return

    elapsed = time.perf_counter() - start
    console.print(
        f"[bold green]OK Ingest complete[/] - [cyan]{count:,}[/] entities loaded "
        f"in [cyan]{elapsed:.1f}s[/]"
    )

    state = SyncStateRepository(db).get(ingester.list_source)
    if state:
        console.print(f"  Synced at : [cyan]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]")

    db.close()



# ------------------------------------------------------------------------------
# ingest-australia  (DFAT consolidated sanctions list XLSX)
# ------------------------------------------------------------------------------
@cli.command("ingest-australia")
@click.option("--force", is_flag=True, default=False, help="Reload even if dataset hash is unchanged.")
def ingest_australia(force):
    """Download DFAT Australian sanctions consolidated XLSX and load it into the DB."""
    import logging
    logging.basicConfig(level=logging.WARNING)

    from ingestion.australia import AustraliaIngester, _XLSX_URL

    db = SessionLocal()
    ingester = AustraliaIngester()

    console.print("\n[bold cyan]Australia Consolidated Sanctions List (DFAT)[/]")
    console.print(f"  Source : [cyan]{_XLSX_URL}[/]")
    console.print("  Format : [cyan]XLSX[/]")

    state = SyncStateRepository(db).get(ingester.list_source)
    if state and state.last_synced_at:
        console.print(
            f"  Last sync : [dim]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]  "
            f"({state.entity_count:,} entities, publication {state.last_publication_id})"
        )
    else:
        console.print("  Last sync : [yellow]never[/]")

    if not force:
        with console.status("Checking for updates..."):
            try:
                should_run = ingester.needs_update(db)
            except Exception as exc:
                console.print(f"[red]Update check failed:[/] {exc}")
                db.close()
                return

        if not should_run:
            console.print("[green]OK[/] Australia list is current. Use --force to reload.")
            db.close()
            return

        console.print("  [yellow]Update detected.[/] Downloading and parsing...\n")
    else:
        console.print("  [yellow]--force specified.[/] Reloading regardless.\n")

    start = time.perf_counter()
    with console.status("[cyan]Parsing XLSX and loading sanctions data...[/]"):
        try:
            count = ingester.ingest(db)
        except RuntimeError as exc:
            console.print(f"[red]Ingest failed:[/] {exc}")
            db.close()
            return

    elapsed = time.perf_counter() - start
    state = SyncStateRepository(db).get(ingester.list_source)
    console.print(
        f"[bold green]OK Ingest complete[/] - [cyan]{count:,}[/] entities loaded in [cyan]{elapsed:.1f}s[/]"
    )
    if state:
        console.print(f"  Publication ID : [cyan]{state.last_publication_id}[/]")
        console.print(f"  Synced at      : [cyan]{state.last_synced_at.strftime('%Y-%m-%d %H:%M UTC')}[/]")

    db.close()
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# seed
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command()
@click.option("--clear", is_flag=True, default=False, help="Wipe existing sanctions data first.")
def seed(clear):
    """Load dummy sanctions data into the local database."""
    from scripts.seed_data import DUMMY_ENTITIES, DUMMY_VENDOR_LINKS

    db = SessionLocal()
    sanction_repo = SanctionRepository(db)
    vendor_repo   = VendorRepository(db)

    if clear:
        for lst in ("OFAC", "UN", "BIS", "EU", "AUSTRALIA", "EDGAR"):
            sanction_repo.clear_list(lst)
        console.print("[yellow]Cleared existing sanctions data.[/]")

    console.print(f"Seeding [cyan]{len(DUMMY_ENTITIES)}[/] sanctioned entities...")
    sanction_repo.bulk_add(DUMMY_ENTITIES)

    console.print(f"Seeding [cyan]{len(DUMMY_VENDOR_LINKS)}[/] vendor relationships...")
    for parent_name, child_name in DUMMY_VENDOR_LINKS:
        parent = vendor_repo.get_or_create(parent_name)
        child  = vendor_repo.get_or_create(child_name)
        vendor_repo.link_supplier(parent.id, child.id)

    db.close()
    console.print("[bold green]âœ“ Seed complete.[/]")

    # Show what was loaded
    t = Table(box=box.SIMPLE_HEAD, show_header=True)
    t.add_column("List",    style="cyan")
    t.add_column("Entries", justify="right")
    counts = {}
    for e in DUMMY_ENTITIES:
        counts[e["list_source"]] = counts.get(e["list_source"], 0) + 1
    for lst, count in sorted(counts.items()):
        t.add_row(lst, str(count))
    console.print(t)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# screen
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command()
@click.argument("vendors", nargs=-1, required=True)
@click.option("--customer", "-c", default="Demo Customer", help="Customer name for this run.")
@click.option("--lists",    "-l", multiple=True, help="Restrict to specific list(s): OFAC UN BIS EU AUSTRALIA EDGAR")
@click.option("--ai",       is_flag=True, default=False, help="Run GPT agent analysis (requires Azure credentials).")
def screen(vendors, customer, lists, ai):
    """Screen one or more vendor names against sanctions lists.

    \b
    Example:
      python cli.py screen --customer "Makglobal FZCO" \\
        "ITGlobe Incorporated" "G. B. B. INDUSTRIES" "AXLETECH INDIA PVT. LTD."
    """
    db = SessionLocal()
    sanction_repo = SanctionRepository(db)
    vendor_repo   = VendorRepository(db)
    run_repo      = ScreeningRunRepository(db)

    entities = sanction_repo.get_all(lists=list(lists) or None)
    if not entities:
        console.print("[red]No sanctions data found. Run [bold]python cli.py seed[/] first.[/]")
        db.close()
        return

    console.print(Rule(f"[bold]Screening {len(vendors)} vendor(s) for [cyan]{customer}[/]"))
    console.print(f"  Sanctions DB: [cyan]{len(entities)}[/] entities across "
                  f"[cyan]{len({e.list_source for e in entities})}[/] lists\n")

    all_vendors = vendor_repo.get_all()
    graph = SupplierGraph()
    graph.load(all_vendors)

    run    = run_repo.create(customer_name=customer, vendor_names=list(vendors))
    run_id = run.id   # capture before any commits expire the object
    start  = time.perf_counter()

    from database.models import RunStatus
    run_repo.update_status(run_id, RunStatus.RUNNING)

    batch = engine_matcher.batch_screen(list(vendors), entities, lists=list(lists) or None)

    results_out = []
    for vendor_name, matches in batch.items():
        vendor_repo.get_or_create(vendor_name, customer_name=customer)
        top = matches[0] if matches else None
        result_data = {
            "vendor_name":  vendor_name,
            "status":       top["status"] if top else MatchStatus.CLEAR,
            "match_score":  top["match_score"] if top else None,
            "matched_name": top["matched_name"] if top else None,
            "list_source":  top["list_source"] if top else None,
            "match_type":   top["match_type"] if top else None,
            "tier": 1,
        }
        run_repo.add_result(run_id, result_data)
        results_out.append((vendor_name, top, matches))

    elapsed = time.perf_counter() - start

    # â”€â”€ Results table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    t = Table(box=box.ROUNDED, show_header=True, header_style="bold white on dark_blue")
    t.add_column("Vendor Name",     min_width=30)
    t.add_column("Status",          justify="center", min_width=14)
    t.add_column("Score",           justify="right",  min_width=7)
    t.add_column("Matched Entity",  min_width=28)
    t.add_column("List",            justify="center", min_width=6)
    t.add_column("Match Type",      justify="center", min_width=10)

    flagged = review = clear = 0
    for vendor_name, top, _ in results_out:
        status_val = top["status"].value if top else "clear"
        colour     = _STATUS_COLOUR.get(status_val, "white")
        label      = _STATUS_STYLE.get(status_val, status_val)

        if status_val == "flagged":      flagged += 1
        elif status_val == "review_needed": review += 1
        else:                            clear   += 1

        t.add_row(
            vendor_name,
            label,
            f"{top['match_score']:.0f}%" if top else "â€”",
            top["matched_name"] if top else "â€”",
            top["list_source"]  if top else "â€”",
            top["match_type"]   if top else "â€”",
            style=f"on grey11" if status_val == "flagged" else "",
        )

    console.print(t)

    # â”€â”€ Summary panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    summary = (
        f"[bold red]Flagged:[/] {flagged}   "
        f"[bold yellow]Review:[/] {review}   "
        f"[bold green]Clear:[/] {clear}   "
        f"  [dim]Run ID: {run_id}  |  {elapsed:.2f}s[/]"
    )
    console.print(Panel(summary, title="Summary", border_style="blue"))

    # â”€â”€ AI analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ai_summary = None
    if ai:
        console.print("\n[dim]Running GPT agent analysis...[/]")
        try:
            from agent.analyst import ScreeningAnalyst
            from agent.narrator import ReportNarrator
            analyst  = ScreeningAnalyst()
            analysis = analyst.analyze(list(vendors), customer, entities, graph)
            narrator = ReportNarrator()
            ai_summary = narrator.generate_narrative(
                analysis.get("findings"), customer, elapsed
            )
            run_repo.update_status(run_id, RunStatus.COMPLETE, elapsed=elapsed, summary=ai_summary)
            console.print(Panel(ai_summary, title="[bold]AI Compliance Analysis[/]", border_style="magenta"))
        except Exception as exc:
            console.print(f"[yellow]AI analysis skipped: {exc}[/]")
            run_repo.update_status(run_id, RunStatus.COMPLETE, elapsed=elapsed)
    else:
        run_repo.update_status(run_id, RunStatus.COMPLETE, elapsed=elapsed)

    db.close()
    console.print(
        f"\n[dim]Download report:[/]  "
        f"[cyan]python cli.py report {run_id} --excel[/]  or  "
        f"[cyan]python cli.py report {run_id} --pdf[/]"
    )


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# list
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command("list")
@click.option("--limit", default=10, help="Max runs to show.")
def list_runs(limit):
    """List recent screening runs."""
    db = SessionLocal()
    runs = (
        db.query(ScreeningRun)
        .order_by(ScreeningRun.started_at.desc())
        .limit(limit)
        .all()
    )
    db.close()

    if not runs:
        console.print("[yellow]No screening runs found.[/]")
        return

    t = Table(box=box.SIMPLE_HEAD, header_style="bold")
    t.add_column("Run ID",    justify="right", style="cyan")
    t.add_column("Customer")
    t.add_column("Vendors",   justify="right")
    t.add_column("Status",    justify="center")
    t.add_column("Duration",  justify="right")
    t.add_column("Started At")

    for r in runs:
        t.add_row(
            str(r.id),
            r.customer_name or "â€”",
            str(len(r.vendor_names or [])),
            r.status.value.upper(),
            f"{r.elapsed_seconds:.2f}s" if r.elapsed_seconds else "â€”",
            r.started_at.strftime("%Y-%m-%d %H:%M"),
        )

    console.print(t)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# report
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command()
@click.argument("run_id", type=int)
@click.option("--excel", is_flag=True, help="Save as Excel workbook.")
@click.option("--pdf",   is_flag=True, help="Save as PDF report.")
@click.option("--erp",   is_flag=True, help="Print ERP JSON payload.")
@click.option("--out",   default=".", help="Output directory (default: current dir).")
def report(run_id, excel, pdf, erp, out):
    """Display or export a screening report.

    \b
    Examples:
      python cli.py report 1
      python cli.py report 1 --excel --pdf --out ./reports
    """
    db   = SessionLocal()
    repo = ScreeningRunRepository(db)
    run  = repo.get(run_id)

    if not run:
        console.print(f"[red]Run {run_id} not found.[/]")
        db.close()
        return

    if not excel and not pdf and not erp:
        _print_report(run)
    else:
        out_path = Path(out)
        out_path.mkdir(parents=True, exist_ok=True)

        if excel:
            fname = out_path / f"screening_report_SCR-{run_id:06d}.xlsx"
            fname.write_bytes(generate_excel(run))
            console.print(f"[green]âœ“ Excel saved:[/] {fname}")

        if pdf:
            fname = out_path / f"screening_report_SCR-{run_id:06d}.pdf"
            fname.write_bytes(generate_pdf(run))
            console.print(f"[green]âœ“ PDF saved:[/]   {fname}")

        if erp:
            import json
            payload = build_erp_payload(run)
            console.print_json(json.dumps(payload, indent=2, default=str))

    db.close()


def _print_report(run: ScreeningRun):
    console.print(Rule(f"[bold]SCR-{run.id:06d} â€” {run.customer_name}[/]"))
    console.print(
        f"  Status: [bold]{run.status.value.upper()}[/]   "
        f"Duration: [cyan]{run.elapsed_seconds:.2f}s[/]   "
        f"Started: {run.started_at.strftime('%Y-%m-%d %H:%M')}\n"
    )

    t = Table(box=box.ROUNDED, header_style="bold white on dark_blue")
    t.add_column("Vendor Name",    min_width=30)
    t.add_column("Status",         justify="center")
    t.add_column("Score",          justify="right")
    t.add_column("Matched Entity", min_width=26)
    t.add_column("List",           justify="center")
    t.add_column("Tier",           justify="center")

    for r in run.results:
        status_val = r.status.value
        label      = _STATUS_STYLE.get(status_val, status_val)
        t.add_row(
            r.vendor_name,
            label,
            f"{r.match_score:.0f}%" if r.match_score else "â€”",
            r.matched_name  or "â€”",
            r.list_source   or "â€”",
            f"Tier {r.tier}" if r.tier else "â€”",
        )

    console.print(t)

    if run.ai_summary:
        console.print(Panel(run.ai_summary, title="[bold magenta]AI Analysis[/]", border_style="magenta"))


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# status
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@cli.command()
def status():
    """Show what sanctions data is currently loaded in the local DB."""
    db = SessionLocal()

    sync_states = SyncStateRepository(db).all()
    sanction_repo = SanctionRepository(db)

    t = Table(box=box.SIMPLE_HEAD, header_style="bold")
    t.add_column("List",         style="cyan")
    t.add_column("Entities",     justify="right")
    t.add_column("Last Synced")
    t.add_column("Publication",  justify="right")
    t.add_column("Status",       justify="center")

    sources_with_state = {s.list_source for s in sync_states}

    for state in sync_states:
        count = len(sanction_repo.get_all(lists=[state.list_source]))
        synced = state.last_synced_at.strftime("%Y-%m-%d %H:%M") if state.last_synced_at else "â€”"
        status_label = (
            "[green]OK[/]"     if state.status == "ok"     else
            "[red]FAILED[/]"   if state.status == "failed" else
            "[yellow]NEVER[/]"
        )
        t.add_row(
            state.list_source,
            f"{count:,}",
            synced,
            str(state.last_publication_id or "â€”"),
            status_label,
        )

    # Show sources with dummy data but no sync state (seeded via `seed` command)
    for src in ("OFAC", "UN", "BIS", "EU", "AUSTRALIA", "EDGAR"):
        if src not in sources_with_state:
            count = len(sanction_repo.get_all(lists=[src]))
            if count:
                t.add_row(src, f"{count:,}", "dummy data", "â€”", "[dim]SEEDED[/]")

    db.close()

    console.print()
    console.print(t)
    console.print(
        "[dim]Run [/][cyan]python cli.py ingest[/][dim] to fetch live OFAC data.[/]\n"
    )


@cli.command("sanctions")
@click.option("--list", "list_source", default="OFAC", show_default=True, help="List source to retrieve (e.g., OFAC).")
@click.option("--limit", default=50, show_default=True, help="Maximum rows to print to console.")
@click.option("--details", is_flag=True, default=False, help="Include address and remarks in console output.")
@click.option("--export", "export_path", default="", help="CSV path to export all rows for the selected list.")
def sanctions(list_source, limit, details, export_path):
    """Show sanctions entries for a list source and optionally export to CSV."""
    db = SessionLocal()
    source = (list_source or "").strip().upper()

    rows = (
        db.query(SanctionedEntity)
        .filter(SanctionedEntity.list_source == source)
        .order_by(SanctionedEntity.name.asc())
        .all()
    )

    if not rows:
        console.print(f"[yellow]No sanctions entries found for list source:[/] {source}")
        db.close()
        return

    to_show = rows[: max(1, int(limit))]

    t = Table(box=box.SIMPLE_HEAD, header_style="bold")
    t.add_column("Name")
    t.add_column("List ID", justify="right")
    t.add_column("Country", justify="center")
    t.add_column("Type", justify="center")
    if details:
        t.add_column("Address")
        t.add_column("Remarks")

    for e in to_show:
        row = [
            e.name or "-",
            e.list_id or "-",
            e.country or "-",
            e.entity_type or "-",
        ]
        if details:
            row.extend([e.address or "-", e.remarks or "-"])
        t.add_row(*row)

    console.print(f"\n[bold]{source} entries:[/] {len(rows):,} total (showing {len(to_show):,})")
    console.print(t)

    if export_path:
        out = Path(export_path)
        if not out.suffix:
            out = out.with_suffix(".csv")
        out.parent.mkdir(parents=True, exist_ok=True)

        with out.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["name", "list_id", "country", "entity_type", "address", "remarks"])
            for e in rows:
                writer.writerow([
                    e.name or "",
                    e.list_id or "",
                    e.country or "",
                    e.entity_type or "",
                    e.address or "",
                    e.remarks or "",
                ])
        console.print(f"[green]Exported[/] {len(rows):,} rows to {out}")

    db.close()


@cli.command("stats")
@click.option("--sample", default=3, show_default=True, help="Sample rows to print per source.")
def stats(sample):
    """Show per-source counts and a small sample of entities from each source."""
    db = SessionLocal()
    sample_size = max(1, int(sample))

    rows = (
        db.query(SanctionedEntity.list_source)
        .distinct()
        .order_by(SanctionedEntity.list_source.asc())
        .all()
    )
    sources = [r[0] for r in rows]

    if not sources:
        console.print("[yellow]No data found in sanctioned_entities.[/]")
        db.close()
        return

    summary = Table(box=box.SIMPLE_HEAD, header_style="bold")
    summary.add_column("Source", style="cyan")
    summary.add_column("Total Rows", justify="right")

    for src in sources:
        count = (
            db.query(SanctionedEntity)
            .filter(SanctionedEntity.list_source == src)
            .count()
        )
        summary.add_row(src, f"{count:,}")

    console.print("\n[bold]Source Summary[/]")
    console.print(summary)

    for src in sources:
        sample_rows = (
            db.query(SanctionedEntity)
            .filter(SanctionedEntity.list_source == src)
            .order_by(SanctionedEntity.id.desc())
            .limit(sample_size)
            .all()
        )
        t = Table(box=box.SIMPLE_HEAD, header_style="bold")
        t.add_column("Name")
        t.add_column("List ID")
        t.add_column("Country", justify="center")
        t.add_column("Type", justify="center")
        for e in sample_rows:
            t.add_row(
                e.name or "-",
                e.list_id or "-",
                e.country or "-",
                str(e.entity_type or "-"),
            )

        console.print(f"\n[bold]{src}[/] sample ({len(sample_rows)} row(s))")
        console.print(t)

    db.close()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if __name__ == "__main__":
    cli()



