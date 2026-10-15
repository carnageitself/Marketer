"use client";
import { useEffect, useState } from "react";

/** Fetches one stats report; re-fetches when any param changes. */
export function useReport<T>(siteId: string, report: string, params: Record<string, string | undefined>, enabled = true) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string }>({ key: "", data: null, error: "" });
  const qs = new URLSearchParams({ report, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string> }).toString();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/sites/${siteId}/stats?${qs}`)
      .then(async r => {
        const d = await r.json();
        if (alive) setState({ key: qs, data: r.ok ? d : null, error: r.ok ? "" : d.error ?? "Failed to load" });
      })
      .catch(e => alive && setState({ key: qs, data: null, error: String(e) }));
    return () => { alive = false; };
  }, [siteId, qs, enabled]);
  // Results for an older query aren't shown while the new one loads.
  const fresh = state.key === qs;
  return { data: fresh ? state.data : null, error: fresh ? state.error : "", loading: !fresh };
}
