// Tipos de la comunidad/clasificación que usan los componentes recuperados (originalmente lib/groups.ts).
// En La Canchita el «grupo» es el PARCHE y no hay dinero: no se porta ningún cálculo de premios.
export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  total_points: number;
  exact_count: number;
  result_count: number;
  pred_count: number;
  rank: number;
};

export function formatMemberCount(n: number): string {
  return n === 1 ? "1 participante" : `${n} participantes`;
}

export function formatRelativeDate(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

export type MemberDetail = {
  user_id: string;
  display_name: string;
  role: "owner" | "admin" | "member";
  status: "active" | "disabled";
  joined_at: string;
  is_me?: boolean;
};
