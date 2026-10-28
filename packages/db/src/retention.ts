import postgres from 'postgres';

/** Anonimiza titulares vencidos e limpa sessões expiradas. Roda como owner (worker diário). */
export async function runRetention(url: string, deletedDays = 180): Promise<number> {
  const sql = postgres(url, { max: 1 });
  try {
    const [row] = await sql<{ n: number }[]>`select lgpd_retention(${deletedDays}) as n`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}
