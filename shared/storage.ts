// Chrome throws on localStorage over file://, and Safari private mode blocks it.
export const store = {
  get(key: string, fallback: string): string {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  },
};
