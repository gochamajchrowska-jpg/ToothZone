import { useState, useEffect } from "react";
import { loadJson, saveJson } from "../utils/storage";

/**
 * useState z automatyczną synchronizacją z localStorage.
 * @param {string} key - klucz localStorage
 * @param {*} fallback - wartość domyślna
 */
export function useLocalStorage(key, fallback) {
  const [value, setValue] = useState(() => loadJson(key, fallback));

  useEffect(() => {
    saveJson(key, value);
  }, [key, value]);

  return [value, setValue];
}
