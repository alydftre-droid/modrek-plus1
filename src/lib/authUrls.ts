export const CANONICAL_APP_ORIGIN = "https://modrekplus.com";

export const buildCanonicalAppUrl = (path = "/") => new URL(path, CANONICAL_APP_ORIGIN).toString();