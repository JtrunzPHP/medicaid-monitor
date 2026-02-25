def compute(changes: list[dict], companies: list[dict]) -> list[dict]:
    changed = {c["abbr"] for c in changes}
    out = []
    for co in companies:
        hit = {a: p for a, p in co["state_exposure"].items()
               if a in changed and a != "OTHER"}
        if not hit:
            continue
        weight = round(sum(p * co["medicaid_pct"] for p in hit.values()) * 100, 2)
        out.append({**co, "exposed_states": hit, "impact_weight": weight,
                    "state_changes": [c for c in changes if c["abbr"] in hit]})
    return sorted(out, key=lambda x: x["impact_weight"], reverse=True)
