/**
 * The canonical origin. Used for `metadataBase` (so OG/Twitter image URLs and
 * canonicals resolve absolute), the sitemap and robots.txt.
 *
 * Hard-coded rather than read from VERCEL_URL: that variable holds the
 * per-deployment hostname, so canonicals built from it would point preview
 * builds at themselves and split the site's signals across throwaway domains.
 */
export const SITE_URL = "https://crowdwise.charlietrenorden.com";
