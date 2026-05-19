export const CANONICAL_APP_ORIGIN = "https://modrek-plus.lovable.app";

export const buildCanonicalAppUrl = (path = "/") => new URL(path, CANONICAL_APP_ORIGIN).toString();