export type Society = {
  id: string;
  name: string;
  logo_url: string | null;
  theme_color: string;
  version: number;
  role?: "admin" | "committee";
};
export type SocietyAccess = { superadmin: boolean; societies: Society[] };
export function logoSrc(path: string | null, supabaseUrl: string) {
  if (!path) return null;
  return path.startsWith("/storage/") ? `${supabaseUrl}${path}` : path;
}
export function themeStyle(color: string): React.CSSProperties {
  if (color.toLowerCase() === "#b88724") return {};
  return {
    "--orange": color,
    "--accent": `color-mix(in srgb, ${color} 28%, white)`,
  } as React.CSSProperties;
}
