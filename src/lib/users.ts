type UserLike = { email?: string | null; user_metadata?: Record<string, unknown> | null };

// Mismo criterio que La Penúltima: username de los metadatos o, si falta, el prefijo del correo.
export function displayNameOf(user: UserLike): string {
  const username = user.user_metadata?.username;
  if (typeof username === "string" && username.trim()) return username.trim();
  return user.email?.split("@")[0] || "Tu cuenta";
}
