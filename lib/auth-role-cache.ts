import type { AccountRole } from "./server";

const roleCacheKey = (uid: string) => `snapschool:role:${uid}`;

export const readCachedAccountRole = (uid: string): AccountRole | null => {
  if (typeof window === "undefined") return null;

  const role = window.sessionStorage.getItem(roleCacheKey(uid));
  return role === "student" || role === "administrator" ? role : null;
};

export const cacheAccountRole = (uid: string, role: AccountRole) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(roleCacheKey(uid), role);
};

export const clearCachedAccountRole = (uid: string) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(roleCacheKey(uid));
};
