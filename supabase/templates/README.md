# Plantillas de correo de Supabase Auth (La Canchita)

Solo español. HTML con tablas y CSS en línea (compatible con Gmail/Outlook), sin JavaScript. El logo se carga desde
`https://www.lacanchita.fans/branding/LaCanchita_hor.png` (si se bloquean las imágenes se ve el texto «La Canchita»).
Los enlaces usan `{{ .ConfirmationURL }}`, que Supabase construye con el `redirectTo` de la app
(`/auth/confirmar?next=…`, ver `src/app/auth/confirmar/route.ts`); no hay URLs estáticas ni tokens escritos a mano.

| Archivo | Plantilla de Supabase | Asunto | Variables | ¿La app lo usa hoy? |
|---|---|---|---|---|
| `confirm-signup.html` | Confirm sign up | Confirma tu correo y entra a La Canchita ⚽ | `ConfirmationURL` | Sí (`signUp`) |
| `reset-password.html` | Reset password | Recupera tu contraseña \| La Canchita | `ConfirmationURL` | Sí (`resetPasswordForEmail`) |
| `invite-user.html` | Invite user | Te invitaron a La Canchita ⚽ | `ConfirmationURL` | No (invitaciones a parches son enlaces propios) |
| `change-email.html` | Change email address | Confirma tu nuevo correo \| La Canchita | `ConfirmationURL`, `Email`, `NewEmail` | No |
| `magic-link.html` | Magic link | Tu acceso a La Canchita | `ConfirmationURL` (solo enlace, sin OTP) | No |
| `reauthentication.html` | Reauthentication | Verifica tu identidad \| La Canchita | `Token` (código de 6 dígitos) | No |

## Aplicar al proyecto (`cfzxentitxytnvvumfpv`)

```
node scripts/auth-templates/apply.mjs           # simulacro: muestra SMTP y asuntos actuales
node scripts/auth-templates/apply.mjs --apply   # PATCH de los 12 campos mailer_* y verificación posterior
```

Usa `SUPABASE_ACCESS_TOKEN` o el token de la CLI de Supabase (llavero de macOS); no lo imprime. El PATCH es parcial: no
toca SMTP, URLs ni otros ajustes. Manual: Dashboard → Authentication → Email Templates (pegar asunto y HTML).
