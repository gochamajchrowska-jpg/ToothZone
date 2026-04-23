import { useState, useEffect } from "react";
import { loadSet, saveSet } from "../utils/storage";

/**
 * Zbiór zapłaconych ID z synchronizacją do localStorage.
 * @param {string} storageKey - klucz localStorage
 */
export function usePaidSet(storageKey) {
  const [paidIds, setPaidIds] = useState(() => loadSet(storageKey));

  useEffect(() => {
    saveSet(storageKey, paidIds);
  }, [storageKey, paidIds]);

  const toggle = (id) => {
    setPaidIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return { paidIds, toggle };
}
