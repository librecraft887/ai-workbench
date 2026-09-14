export function researchTimeWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const end = `${date.year}-${date.month}-${date.day}`;
  const startDate = new Date(Date.UTC(Number(date.year) - 1, Number(date.month) - 1, Number(date.day)));
  if(startDate.getUTCMonth() !== Number(date.month) - 1) startDate.setUTCDate(0);
  return { start: startDate.toISOString().slice(0, 10), end };
}
