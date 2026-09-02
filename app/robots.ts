import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// robots.txt returned 404 before this, which is a soft failure: crawlers assume
// allow-all, but nothing points them at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // JSON endpoints, not pages. Nothing links to them and an indexed API
      // response is a dead end for a reader.
      disallow: ["/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
