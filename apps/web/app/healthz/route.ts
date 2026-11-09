/** Comprobación de salud del contenedor web (no consulta la API ni la base de datos). */
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
