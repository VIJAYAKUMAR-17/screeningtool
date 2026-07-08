"""
Dummy sanctions data for local testing.

Designed so the sample companies produce a mix of outcomes:
  ITGlobe Incorporated        → FLAGGED  (OFAC exact-alias match)
  G. B. B. INDUSTRIES         → FLAGGED  (UN match via alias)
  AXLETECH INDIA PVT. LTD.    → REVIEW   (EU partial match)
  Makglobal FZCO              → FLAGGED  (OFAC alias match)
  Technocraft India           → REVIEW   (BIS partial match)
"""

DUMMY_ENTITIES = [
    # ── OFAC SDN ──────────────────────────────────────────────────────────────
    {
        "name": "IT Globe Incorporated",
        "aliases": ["IT Globe Inc", "ITGlobe Corp", "I.T. Globe Inc."],
        "country": "US",
        "list_source": "OFAC",
        "list_id": "OFAC-SDN-19823",
        "entity_type": "company",
        "address": "2100 Technology Drive, Reston, VA 20191, USA",
        "programs": ["IRAN", "CYBER"],
        "remarks": "Designated for illicit procurement of dual-use technology.",
    },
    {
        "name": "Makglobal International Trading FZCO",
        "aliases": ["Mak Global FZCO", "Makglobal FZCO", "MAK Global FZC"],
        "country": "AE",
        "list_source": "OFAC",
        "list_id": "OFAC-SDN-34421",
        "entity_type": "company",
        "address": "Jebel Ali Free Zone, Dubai, UAE",
        "programs": ["SDGT"],
        "remarks": "Front company linked to sanctioned arms network.",
    },
    {
        "name": "Black Sea Logistics LLC",
        "aliases": ["BSL Logistics", "Black Sea LLC"],
        "country": "RU",
        "list_source": "OFAC",
        "list_id": "OFAC-SDN-77104",
        "entity_type": "company",
        "address": "12 Morskaya St, Novorossiysk, Russia",
        "programs": ["UKRAINE-EO13685"],
        "remarks": "Sanctioned under Ukraine-related executive orders.",
    },
    # ── UN Consolidated ───────────────────────────────────────────────────────
    {
        "name": "G.B.B. Industrial Group",
        "aliases": ["GBB Industries", "G B B Industries Ltd", "GBB Industrial"],
        "country": "IN",
        "list_source": "UN",
        "list_id": "UN-1267-QDe.156",
        "entity_type": "company",
        "address": "Plot 44, MIDC Industrial Area, Pune, Maharashtra, India",
        "programs": ["1267/1989/2253 ISIL"],
        "remarks": "Listed for financing prohibited procurement activities.",
    },
    {
        "name": "Crescent Star Trading Co",
        "aliases": ["Crescent Trading", "CST Co."],
        "country": "PK",
        "list_source": "UN",
        "list_id": "UN-1267-QDe.201",
        "entity_type": "company",
        "address": "Karachi Export Zone, Pakistan",
        "programs": ["Taliban"],
        "remarks": "Designated for providing financial support.",
    },
    # ── EU Consolidated ───────────────────────────────────────────────────────
    {
        "name": "Axle Technologies GmbH",
        "aliases": ["AxleTech GmbH", "Axle Tech International", "Axle Technologies Europe"],
        "country": "DE",
        "list_source": "EU",
        "list_id": "EU-2024-1865-0034",
        "entity_type": "company",
        "address": "Industriestrasse 88, Munich, Germany",
        "programs": ["RUSSIA-2022"],
        "remarks": "Sanctioned for supply of dual-use goods to restricted end-users.",
    },
    {
        "name": "Nord Stream Services AG",
        "aliases": ["NSS AG", "Nord Stream Services"],
        "country": "CH",
        "list_source": "EU",
        "list_id": "EU-2022-0328-0012",
        "entity_type": "company",
        "address": "Bahnhofstrasse 10, Zug, Switzerland",
        "programs": ["RUSSIA-2022"],
        "remarks": "Sanctioned entity under EU Russia sanctions package.",
    },
    # ── BIS Entity List ───────────────────────────────────────────────────────
    {
        "name": "Technocraft Systems Private Limited",
        "aliases": ["Technocraft Systems", "Technocraft Pvt Ltd", "Technocraft India Pvt"],
        "country": "IN",
        "list_source": "BIS",
        "list_id": "BIS-EL-2023-IN-0087",
        "entity_type": "company",
        "address": "SEEPZ Special Economic Zone, Mumbai, India",
        "programs": ["EAR-Entity-List"],
        "remarks": "Listed for unauthorized re-export of controlled items.",
    },
    {
        "name": "Shenzhen Micro Precision Ltd",
        "aliases": ["SMP Limited", "Shenzhen MP Ltd"],
        "country": "CN",
        "list_source": "BIS",
        "list_id": "BIS-EL-2024-CN-0312",
        "entity_type": "company",
        "address": "Longhua District, Shenzhen, Guangdong, China",
        "programs": ["EAR-Entity-List", "MILITARY-END-USER"],
        "remarks": "Designated as military end-user.",
    },
    # ── Clearly non-matching entries (control group) ──────────────────────────
    {
        "name": "Meridian Capital Partners",
        "aliases": ["Meridian Capital"],
        "country": "GB",
        "list_source": "OFAC",
        "list_id": "OFAC-SDN-55901",
        "entity_type": "company",
        "address": "30 St Mary Axe, London, UK",
        "programs": ["IRAN"],
        "remarks": "Designated for facilitating Iran-linked transactions.",
    },
    {
        "name": "Volga Petroleum Export JSC",
        "aliases": ["VPE JSC", "Volga Petroleum"],
        "country": "RU",
        "list_source": "UN",
        "list_id": "UN-1718-0077",
        "entity_type": "company",
        "address": "Samara, Russia",
        "programs": ["DPRK"],
        "remarks": "Involved in prohibited oil transfers.",
    },
]

# Tier 2 supplier relationships for graph testing
# (parent_name → child_name)
DUMMY_VENDOR_LINKS = [
    ("ITGlobe Incorporated",    "Shenzhen Micro Precision Ltd"),
    ("AXLETECH INDIA PVT. LTD.", "Nord Stream Services AG"),
]
