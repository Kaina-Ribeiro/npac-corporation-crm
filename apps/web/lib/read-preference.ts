/** Lê o cookie no navegador. */
export function readPreference(name: string) {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}
