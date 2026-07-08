from collections import defaultdict, deque
from database.models import Vendor


class SupplierGraph:
    """
    In-memory directed graph of vendor → sub-supplier relationships.
    Used for Tier 2 sanctions exposure: if a sub-supplier is sanctioned,
    the parent vendor inherits risk.
    """

    def __init__(self):
        self._children: dict[int, list[Vendor]] = defaultdict(list)
        self._by_id: dict[int, Vendor] = {}
        self._by_name: dict[str, Vendor] = {}

    def load(self, vendors: list[Vendor]):
        for v in vendors:
            self._by_id[v.id] = v
            self._by_name[v.name.lower()] = v
            if v.parent_vendor_id:
                self._children[v.parent_vendor_id].append(v)

    def find_by_name(self, name: str) -> Vendor | None:
        return self._by_name.get(name.lower())

    def get_supplier_chain(self, vendor_id: int, max_depth: int = 3) -> list[dict]:
        """BFS outward from vendor_id; returns all sub-suppliers up to max_depth."""
        visited: set[int] = set()
        queue = deque([(vendor_id, 0)])
        chain: list[dict] = []

        while queue:
            current_id, depth = queue.popleft()
            if current_id in visited or depth >= max_depth:
                continue
            visited.add(current_id)

            for child in self._children.get(current_id, []):
                chain.append({
                    "vendor_id": child.id,
                    "vendor_name": child.name,
                    "tier": depth + 1,
                    "parent_id": current_id,
                    "country": child.country,
                })
                queue.append((child.id, depth + 1))

        return chain

    def get_tier2_risks(
        self, vendor_id: int, flagged_ids: set[int]
    ) -> list[dict]:
        """Return sub-suppliers that are in the flagged set (Tier 2 exposure)."""
        chain = self.get_supplier_chain(vendor_id)
        return [node for node in chain if node["vendor_id"] in flagged_ids]
