import { Helmet } from "react-helmet-async";
import { SITE_NAME, SITE_URL, OG_IMAGE } from "@/content/seoPages";

export type SeoProps = {
  title: string;
  description: string;
  /** Absolute path of the current page, e.g. "/education". */
  path: string;
  noindex?: boolean;
  /** Extra JSON-LD blocks (already plain objects). */
  jsonLd?: Record<string, unknown>[];
  type?: "website" | "article";
};

const abs = (path: string) => new URL(path, SITE_URL).toString();

const Seo = ({ title, description, path, noindex, jsonLd = [], type = "website" }: SeoProps) => {
  const url = abs(path);
  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex ? (
        <meta name="robots" content="noindex, follow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
      )}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content="ar_EG" />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE} />
      {jsonLd.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
};

export default Seo;
