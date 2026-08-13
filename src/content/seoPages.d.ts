export type SeoSection = {
  h2: string;
  body?: string;
  items?: { title: string; text: string }[];
  list?: string[];
};

export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  breadcrumbs: { name: string; path: string }[];
  sections: SeoSection[];
  faq?: { q: string; a: string }[];
  links?: { label: string; path: string; note?: string }[];
  changefreq?: string;
  priority?: string;
};

export declare const SITE_URL: string;
export declare const SITE_NAME: string;
export declare const OG_IMAGE: string;
export declare const staticRoutes: { path: string; changefreq: string; priority: string }[];
export declare const noindexRoutes: string[];
export declare const seoPages: SeoPage[];
export declare function getSeoPage(slug: string): SeoPage | undefined;
