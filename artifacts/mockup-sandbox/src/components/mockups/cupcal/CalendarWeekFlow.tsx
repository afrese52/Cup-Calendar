import React, { useMemo, useState } from "react";

type EventItem = {
  id: string;
  date: Date;
  time: string;
  title: string;
  category: string;
  format: string;
  region: string;
  color: string;
  status: string;
};

const categories = [
  { name: "Turnier", color: "#bf4c37" },
  { name: "Liga", color: "#337d79" },
  { name: "Quali", color: "#c38b32" },
  { name: "Training", color: "#7771a8" },
];

function CalendarWeekFlow() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState("Alle");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savedOnly, setSavedOnly] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const monday = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + weekOffset * 7);
    return date;
  }, [today, weekOffset]);
  const dateAt = (offset: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
  const keyFor = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const events = useMemo<EventItem[]>(() => {
    const make = (day: number, time: string, title: string, category: string, format: string, region: string, color: string, status: string): EventItem => ({
      id: `${day}-${time}-${title}`,
      date: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day),
      time, title, category, format, region, color, status,
    });
    return [
      make(0, "17:00", "FNCS Challenger Cup", "Turnier", "Duos", "EU", "#bf4c37", "Heute"),
      make(0, "19:30", "Zero Build Cup", "Turnier", "Solo", "EU", "#bf4c37", "Heute"),
      make(1, "18:00", "Community Scrims", "Training", "Trios", "EU", "#7771a8", "Morgen"),
      make(2, "17:00", "Victory Series", "Liga", "Duos", "EU", "#337d79", "Mittwoch"),
      make(3, "19:00", "Open Qualifier", "Quali", "Solo", "EU", " #c38b32".trim(), "Donnerstag"),
      make(4, "16:30", "FNCS Major · Runde 1", "Turnier", "Duos", "EU", "#bf4c37", "Freitag"),
      make(5, "18:00", "FNCS Major · Runde 2", "Turnier", "Duos", "EU", "#bf4c37", "Samstag"),
      make(6, "15:00", "Creator Cup", "Turnier", "Squads", "EU", "#bf4c37", "Sonntag"),
    ];
  }, [monday]);

  const shown = events.filter((event) =>
    (!savedOnly || saved[event.id]) &&
    (filter === "Alle" || event.category === filter)
  );
  const groups = Array.from({ length: 7 }, (_, day) => {
    const date = dateAt(day);
    return { date, items: shown.filter((event) => keyFor(event.date) === keyFor(date)) };
  });
  const monthTitle = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(monday);
  const shortRange = `${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(monday)} – ${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(dateAt(6))}`;

  return (
    <main className="weekflow">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .weekflow{--paper:#f4f1e9;--surface:#fffdf8;--ink:#262c27;--muted:#798078;--line:#deded3;--red:#bf4c37;min-height:100dvh;width:100%;box-sizing:border-box;background:var(--paper);color:var(--ink);font-family:'Manrope',sans-serif;padding:21px 17px 100px;position:relative;overflow:hidden}
        .weekflow *{box-sizing:border-box}
        .wf-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
        .wf-brand{display:flex;align-items:center;gap:9px;color:#58625a;font-size:10px;font-weight:800;letter-spacing:.18em}
        .wf-mark{width:24px;height:24px;border-radius:8px;background:var(--red);display:grid;place-items:center;color:#fff9ee;font:800 12px 'DM Mono',monospace;transform:rotate(-5deg)}
        .wf-avatar{border:1px solid #d5d4c8;background:#e9e7dc;color:#596158;border-radius:50%;width:34px;height:34px;font:800 10px 'Manrope',sans-serif}
        .wf-overline{font:500 9px 'DM Mono',monospace;letter-spacing:.15em;text-transform:uppercase;color:#8c9187}
        .wf-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
        .wf-title{font-size:27px;font-weight:800;letter-spacing:-1.2px;line-height:1.04;margin-top:5px}
        .wf-month{font-size:11px;color:#777f76;font-weight:700;text-transform:capitalize;margin-top:7px}
        .wf-nav{display:flex;gap:5px}
        .wf-nav button{width:34px;height:34px;border-radius:11px;border:1px solid #d8d8cc;background:#fbfaf5;color:#4f574f;font-size:19px;cursor:pointer}
        .wf-weekstrip{display:flex;gap:6px;overflow:auto;margin:0 -17px 12px;padding:0 17px 5px;scrollbar-width:none}
        .wf-weekstrip::-webkit-scrollbar{display:none}
        .wf-daypick{flex:1;min-width:43px;height:62px;border:1px solid transparent;border-radius:13px;background:transparent;color:#717970;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}
        .wf-daypick span:first-child{font:500 9px 'DM Mono',monospace;text-transform:uppercase}
        .wf-daypick strong{font-size:15px}
        .wf-daypick.active{background:#292f2a;color:#f5f1e8}
        .wf-daypick.today:not(.active){border-color:#c6c6b9;color:var(--red)}
        .wf-weekmeta{display:flex;justify-content:space-between;align-items:center;margin:0 1px 18px;color:#8b9087;font:500 9px 'DM Mono',monospace;letter-spacing:.03em}
        .wf-weekmeta button{border:0;background:none;color:#a14e3c;font:700 10px 'Manrope',sans-serif;cursor:pointer}
        .wf-filters{display:flex;gap:7px;overflow:auto;margin:0 -17px 20px;padding:0 17px 3px;scrollbar-width:none}
        .wf-chip{height:31px;white-space:nowrap;padding:0 11px;border:1px solid #d9d9ce;border-radius:999px;background:transparent;color:#697168;font:700 10px 'Manrope',sans-serif;cursor:pointer}
        .wf-chip.active{background:#e8e3d6;color:#30372f;border-color:#e8e3d6}
        .wf-chip.saved.active{background:#f0ddd5;border-color:#f0ddd5;color:#a04432}
        .wf-feedhead{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d9dbd0;padding:0 1px 10px;margin-bottom:3px}
        .wf-feedtitle{font-size:12px;font-weight:800;letter-spacing:-.1px}
        .wf-result{font:500 9px 'DM Mono',monospace;color:#92968e}
        .wf-group{display:grid;grid-template-columns:54px 1fr;gap:10px;padding:14px 0 5px}
        .wf-datecol{padding-top:3px}
        .wf-dayname{font:500 9px 'DM Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a9087}
        .wf-daynum{font-size:21px;line-height:1.2;font-weight:800;letter-spacing:-.7px;margin-top:3px}
        .wf-todaylabel{font:700 8px 'DM Mono',monospace;color:var(--red);margin-top:4px;text-transform:uppercase}
        .wf-timeline{border-left:1px solid #d6d7cb;padding:0 0 5px 13px;min-height:43px}
        .wf-event{position:relative;border:1px solid #e3e1d8;background:var(--surface);border-radius:13px;padding:11px 10px 10px;margin-bottom:8px;box-shadow:0 3px 9px #4a4b3710}
        .wf-event:before{content:"";position:absolute;left:-18px;top:17px;width:8px;height:8px;border-radius:50%;background:var(--event-color);border:2px solid var(--paper)}
        .wf-eventtop{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-bottom:6px}
        .wf-time{font:500 10px 'DM Mono',monospace;color:#737b72}
        .wf-tag{font:500 8px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.07em;color:var(--event-color)}
        .wf-name{font-size:12px;line-height:1.3;font-weight:800;letter-spacing:-.2px}
        .wf-eventbottom{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
        .wf-meta{font-size:9px;color:#8b9187;display:flex;align-items:center;gap:6px}
        .wf-save{width:25px;height:25px;border:1px solid #e3e2d9;border-radius:8px;background:#fbfaf5;color:#8e958b;display:grid;place-items:center;cursor:pointer}
        .wf-save.active{background:#f7e7dc;color:var(--red);border-color:#eed7ca}
        .wf-save svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.8}
        .wf-empty{margin:15px 0;border:1px dashed #cecec2;border-radius:14px;padding:19px 14px;text-align:center;color:#858c82;font-size:11px;line-height:1.5}
        .wf-tabs{position:fixed;z-index:4;bottom:13px;left:50%;transform:translateX(-50%);width:min(calc(100% - 28px),410px);height:59px;padding:5px;border:1px solid #d4d4c8;border-radius:18px;background:#fffdf2eF;backdrop-filter:blur(16px);display:flex;box-shadow:0 8px 22px #3c403217}
        .wf-tab{flex:1;border:0;border-radius:13px;background:transparent;color:#899087;display:flex;align-items:center;justify-content:center;gap:6px;font:700 10px 'Manrope',sans-serif;cursor:pointer}
        .wf-tab.active{background:#2c332d;color:#f5f1e8}
        .wf-tab svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7}
        .wf-sheetback{position:fixed;inset:0;background:#222a2470;z-index:6;display:flex;align-items:flex-end}
        .wf-sheet{width:100%;padding:21px 18px 30px;border-radius:23px 23px 0 0;background:#fbfaf5;box-shadow:0 -10px 36px #20261e25}
        .wf-sheethead{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
        .wf-sheethead strong{text-transform:capitalize;font-size:17px}
        .wf-sheethead button{border:0;background:none;color:#8c9289;font-size:20px;cursor:pointer}
        .wf-monthgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
        .wf-monthgrid button{height:36px;border:0;border-radius:9px;background:transparent;color:#454c45;font:700 11px 'Manrope',sans-serif;cursor:pointer}
        .wf-monthgrid button.selected{background:#2c332d;color:#f5f1e8}
        .wf-monthgrid button.dim{color:#b5b8ae}
        @media(max-width:370px){.weekflow{padding-left:14px;padding-right:14px}.wf-weekstrip,.wf-filters{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}.wf-group{grid-template-columns:47px 1fr;gap:8px}.wf-daynum{font-size:19px}}
        @media(prefers-reduced-motion:reduce){.weekflow *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
      `}</style>

      <header className="wf-top">
        <div className="wf-brand"><span className="wf-mark">C</span><span>CUPCAL <span style={{ color: "#a0a397" }}>/ FN</span></span></div>
        <button className="wf-avatar" aria-label="Profil">FN</button>
      </header>

      <section aria-label="Wochenübersicht">
        <div className="wf-heading">
          <div><div className="wf-overline">Dein Matchplan</div><div className="wf-title">Die Woche<br />im Flow.</div><div className="wf-month">{monthTitle}</div></div>
          <div className="wf-nav"><button aria-label="Vorige Woche" onClick={() => setWeekOffset((value) => value - 1)}>‹</button><button aria-label="Nächste Woche" onClick={() => setWeekOffset((value) => value + 1)}>›</button></div>
        </div>
        <div className="wf-weekstrip" aria-label="Tage dieser Woche">
          {Array.from({ length: 7 }, (_, index) => {
            const date = dateAt(index);
            const isToday = keyFor(date) === keyFor(today);
            return <button key={keyFor(date)} className={`wf-daypick${isToday ? " active" : ""}${isToday ? " today" : ""}`} onClick={() => document.getElementById(`wf-day-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span>{new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>
            </button>;
          })}
        </div>
        <div className="wf-weekmeta"><span>{shortRange} · ZEITEN LOKAL</span><button onClick={() => setMonthOpen(true)}>Monat ansehen ↗</button></div>
      </section>

      <div className="wf-filters" aria-label="Termine filtern">
        {["Alle", ...categories.map((category) => category.name)].map((name) => <button key={name} className={`wf-chip${filter === name ? " active" : ""}`} onClick={() => setFilter(name)}>{name}</button>)}
        <button className={`wf-chip saved${savedOnly ? " active" : ""}`} onClick={() => setSavedOnly((value) => !value)}>Merkliste</button>
      </div>

      <section aria-label="Wochenagenda">
        <div className="wf-feedhead"><span className="wf-feedtitle">{savedOnly ? "Deine Merkliste" : "Alle Spieltage"}</span><span className="wf-result">{shown.length} TERMINE</span></div>
        {groups.map(({ date, items }, index) => (
          <div className="wf-group" id={`wf-day-${index}`} key={keyFor(date)}>
            <div className="wf-datecol">
              <div className="wf-dayname">{new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date)}</div>
              <div className="wf-daynum">{String(date.getDate()).padStart(2, "0")}</div>
              {keyFor(date) === keyFor(today) && <div className="wf-todaylabel">Heute</div>}
            </div>
            <div className="wf-timeline">
              {items.map((event) => <article className="wf-event" key={event.id} style={{ "--event-color": event.color } as React.CSSProperties}>
                <div className="wf-eventtop"><span className="wf-time">{event.time} · {event.region}</span><span className="wf-tag">{event.category}</span></div>
                <div className="wf-name">{event.title}</div>
                <div className="wf-eventbottom"><span className="wf-meta">{event.format}<span>·</span>{event.status === "Heute" ? "Heute" : event.status}</span><button className={`wf-save${saved[event.id] ? " active" : ""}`} aria-label={saved[event.id] ? "Aus Merkliste entfernen" : "In Merkliste speichern"} aria-pressed={!!saved[event.id]} onClick={() => setSaved((current) => ({ ...current, [event.id]: !current[event.id] }))}><svg viewBox="0 0 16 16"><path d="M4 2.5h8v11l-4-2.7-4 2.7z" /></svg></button></div>
              </article>)}
            </div>
          </div>
        ))}
        {!shown.length && <div className="wf-empty">{savedOnly ? "Noch nichts gemerkt. Speichere einen Termin mit dem Lesezeichen." : "An diesem Spieltag gibt es keine Termine in diesem Filter."}</div>}
      </section>

      <nav className="wf-tabs" aria-label="Hauptnavigation">
        <button className={`wf-tab${!savedOnly ? " active" : ""}`} onClick={() => setSavedOnly(false)}><svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="13" rx="2.5" /><path d="M6 2.5v3M14 2.5v3M2.5 8h15" /></svg>Woche</button>
        <button className={`wf-tab${savedOnly ? " active" : ""}`} onClick={() => setSavedOnly(true)}><svg viewBox="0 0 20 20"><path d="M5 2.5h10v15l-5-3.2-5 3.2z" /></svg>Merkliste</button>
      </nav>

      {monthOpen && <div className="wf-sheetback" onClick={() => setMonthOpen(false)}>
        <section className="wf-sheet" aria-label="Monatskalender" onClick={(event) => event.stopPropagation()}>
          <div className="wf-sheethead"><strong>{monthTitle}</strong><button aria-label="Schließen" onClick={() => setMonthOpen(false)}>×</button></div>
          <div className="wf-monthgrid">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => <span key={day} style={{ textAlign: "center", color: "#92978d", font: "500 9px 'DM Mono', monospace" }}>{day}</span>)}
            {(() => {
              const first = new Date(monday.getFullYear(), monday.getMonth(), 1);
              const offset = (first.getDay() + 6) % 7;
              const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
              return Array.from({ length: 35 }, (_, index) => {
                const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
                const isCurrentWeek = date >= monday && date <= dateAt(6);
                return <button key={keyFor(date)} className={`${date.getMonth() !== monday.getMonth() ? "dim" : ""}${isCurrentWeek ? " selected" : ""}`} onClick={() => { const diff = Math.round((date.getTime() - today.getTime()) / 604800000); setWeekOffset(diff); setMonthOpen(false); }}>{date.getDate()}</button>;
              });
            })()}
          </div>
        </section>
      </div>}
    </main>
  );
}

export default CalendarWeekFlow;
