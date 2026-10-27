(() => {
  const TIMEZONE = "America/Sao_Paulo";

  const partsInZone = (date, timeZone = TIMEZONE) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  };

  const zonedTimeToUtc = (dateValue, timeValue, timeZone = TIMEZONE) => {
    const [year, month, day] = String(dateValue).split("-").map(Number);
    const [hour, minute, second = 0] = String(timeValue).split(":").map(Number);
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    let guess = desired;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const actual = partsInZone(new Date(guess), timeZone);
      const actualAsUtc = Date.UTC(
        Number(actual.year),
        Number(actual.month) - 1,
        Number(actual.day),
        Number(actual.hour),
        Number(actual.minute),
        Number(actual.second)
      );
      guess += desired - actualAsUtc;
    }
    const result = new Date(guess);
    return Number.isNaN(result.getTime()) ? null : result;
  };

  const addDays = (dateValue, amount) => {
    const date = new Date(`${dateValue}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };

  const buildBlockedPeriod = ({ startDate, startTime, endDate, endTime, allDay }, timeZone = TIMEZONE) => {
    if (!startDate || !endDate) return { error: "Informe a data inicial e a data final." };
    const start = zonedTimeToUtc(startDate, allDay ? "00:00:00" : startTime, timeZone);
    const exclusiveEndDate = allDay ? addDays(endDate, 1) : endDate;
    const end = zonedTimeToUtc(exclusiveEndDate, allDay ? "00:00:00" : endTime, timeZone);
    if (!start || !end) return { error: "Informe horários válidos para o bloqueio." };
    if (start >= end) return { error: "O fim do bloqueio deve ser posterior ao início." };
    return { starts_at: start.toISOString(), ends_at: end.toISOString() };
  };

  const formatBlockedPeriod = (startsAt, endsAt, timeZone = TIMEZONE) => {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short"
    });
    return `${formatter.format(new Date(startsAt))} até ${formatter.format(new Date(endsAt))}`;
  };

  globalThis.STUDIO_B_ADMIN_UTILS = Object.freeze({
    TIMEZONE,
    addDays,
    buildBlockedPeriod,
    formatBlockedPeriod,
    partsInZone,
    zonedTimeToUtc
  });
})();
