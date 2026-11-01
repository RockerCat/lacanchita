// El torneo terminó oficialmente solo cuando su ciclo de vida lo dice: `finished` (Control solo lo permite si todo
// partido no cancelado tiene resultado oficial) o `closed`. Que haya pasado una fecha o se haya cerrado un partido
// no basta.
export const isTournamentOver = (status: string): boolean => status === "finished" || status === "closed";
