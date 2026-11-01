// Contenido de la portada pública. Cada afirmación está respaldada por el comportamiento real del producto
// (ver CLAUDE.md): nada de precios, premios, plazas o torneos inventados.

export const LANDING_TITLE = "La Canchita · El fútbol se vive mejor en parche";
export const LANDING_DESCRIPTION =
  "Crea tu parche, invita a tus amigos, pronostica los partidos y demuestra quién sabe más de fútbol. Sin apuestas ni dinero: solo puntos y orgullo.";

export const STEPS = [
  { icon: "🧑‍🤝‍🧑", title: "Crea tu parche", text: "Arma un grupo con tus amigos, familiares o compañeros." },
  { icon: "🔗", title: "Invita a los tuyos", text: "Comparte un enlace por WhatsApp o donde quieras para que se unan." },
  { icon: "⚽", title: "Haz tus pronósticos", text: "Elige los marcadores antes de que empiece cada partido." },
  { icon: "🏆", title: "Suma puntos y gana", text: "Sigue los resultados, sube en la tabla y compite por el primer puesto." },
] as const;

// Ejemplo ilustrativo: partido Colombia 2–1 Argentina. Los puntos del ejemplo son los de la fase de grupos del
// Mundial 2026 (3 por marcador exacto, 1 por resultado); cada torneo define los suyos por fase.
export const SCORING_EXAMPLE = {
  match: "Colombia 2 – 1 Argentina",
  exactPoints: 3,
  resultPoints: 1,
  cases: [
    { guess: "2 – 1", label: "Marcador exacto", detail: "Acertaste los goles de los dos equipos.", points: 3, tone: "exact" },
    { guess: "1 – 0", label: "Resultado acertado", detail: "Acertaste quién ganó (o el empate), aunque no los goles.", points: 1, tone: "result" },
    { guess: "0 – 1", label: "No acertaste", detail: "Esta vez no sumas puntos.", points: 0, tone: "none" },
  ],
} as const;

export const SCORING_NOTES = [
  "Los puntos cambian según la fase del torneo: cada torneo define cuánto vale cada una y lo ves en la sección «Reglas» de tu parche.",
  "El marcador exacto no suma además el punto del resultado: se cuenta uno solo.",
  "Si una eliminatoria se define por penales, los penales no suman puntos.",
] as const;

export const LIVE_FEATURES = [
  { icon: "🔴", title: "Marcadores en vivo", text: "Mira cómo va cada partido; el marcador se actualiza solo." },
  { icon: "🎯", title: "Tus pronósticos", text: "Consulta lo que pronosticaste y los puntos que llevas." },
  { icon: "📊", title: "La tabla de tu parche", text: "Mira tu posición y quién va ganando." },
  { icon: "👀", title: "Los pronósticos de los demás", text: "Se revelan cuando empieza el partido, para que nadie copie." },
  { icon: "📰", title: "Noticias del torneo", text: "Cada partido que termina trae su resumen." },
  { icon: "🥇", title: "Podio y campeón", text: "Al terminar el torneo, el podio del parche celebra al campeón." },
] as const;

export const FAQ = [
  {
    q: "¿Qué es un parche?",
    a: "Es tu grupo de amigos, familiares o compañeros con quienes compites haciendo pronósticos. Cada parche tiene su propia tabla de posiciones.",
  },
  {
    q: "¿Cómo invito a mis amigos?",
    a: "Quien administra el parche genera un enlace de invitación y lo comparte por WhatsApp o donde prefiera. Quien lo abre crea su cuenta (o inicia sesión) y se une. El enlace vence a los 7 días y se puede desactivar.",
  },
  {
    q: "¿Puedo estar en varios parches?",
    a: "Sí. Puedes pertenecer a todos los parches que quieras, por ejemplo uno con tu familia y otro con tus compañeros de trabajo.",
  },
  {
    q: "¿Puedo hacer pronósticos diferentes en cada parche?",
    a: "Sí. Cada parche tiene sus propios pronósticos: puedes jugar distinto el mismo partido en cada uno.",
  },
  {
    q: "¿Hasta cuándo puedo cambiar un pronóstico?",
    a: "Hasta que empiece el partido. Cuando arranca, tu pronóstico queda cerrado. Si el partido se aplaza, puedes seguir editándolo hasta la nueva hora de inicio.",
  },
  {
    q: "¿Qué pasa cuando termina un torneo?",
    a: "La tabla final queda registrada y cada parche ve su podio con el campeón. Tu cuenta y tus parches siguen contigo para el próximo torneo.",
  },
  {
    q: "¿Se apuesta dinero?",
    a: "No. La Canchita no maneja apuestas, cuotas ni premios en dinero. Se juega por puntos, posiciones y el orgullo de ganarle a tus amigos.",
  },
] as const;

// Lo básico, en una línea cada uno, junto al hero (visible en móvil sin bajar hasta las preguntas frecuentes).
export const BASICS = [
  { icon: "👥", term: "Tu parche", text: "El grupo de personas con quienes compites." },
  { icon: "🎯", term: "Tu pronóstico", text: "El marcador que eliges antes de que empiece el partido." },
  { icon: "⭐", term: "Tus puntos", text: "Los que ganas cuando aciertas." },
  { icon: "📊", term: "La tabla", text: "Donde ves quién va ganando." },
] as const;
