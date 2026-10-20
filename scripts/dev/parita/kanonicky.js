/* Kanonický JSON: seřazené klíče, aby porovnání a hash nezávisely na pořadí
   vlastností. Samostatný modul, protože zmrazit.js má při importu vedlejší
   účinky (přepíše Date, setTimeout a fetch) a orchestrátor ho importovat nesmí. */
export function kanonicky(v) {
  if (Array.isArray(v)) return `[${v.map(kanonicky).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${kanonicky(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
