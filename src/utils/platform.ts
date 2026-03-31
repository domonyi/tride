const ua = navigator.userAgent.toLowerCase();
export const IS_WINDOWS = ua.includes("windows");
export const IS_MAC = ua.includes("macintosh") || ua.includes("mac os");
export const IS_LINUX = ua.includes("linux") && !ua.includes("android");

/** OS path separator */
export const SEP = IS_WINDOWS ? "\\" : "/";

/** Join path segments using the OS separator */
export function joinPath(...parts: string[]): string {
  return parts.join(SEP);
}

/** Get the parent directory of a path */
export function parentPath(filePath: string): string {
  const sep = filePath.includes("/") ? "/" : "\\";
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

/** Normalize a path to use the OS separator */
export function normalizePath(p: string): string {
  return IS_WINDOWS ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
}
