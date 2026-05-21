export async function selectOne<T>(query: Promise<T[]>): Promise<T | null> {
  const [row] = await query;
  return row ?? null;
}

