import { apiAssetUrl } from "@/lib/api";

/**
 * An institution image (logo, seal, signature) served by the API, or a local data: URL preview.
 * A plain <img> on purpose: these come from the API host, and next/image would need remote-image configuration.
 */
export function AssetImage({ path, src, alt, className }: { path?: string | null; src?: string; alt: string; className?: string }) {
  const url = src ?? apiAssetUrl(path);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={className} src={url} />;
}
