import React, { useMemo, useState } from "react";

type IconName = "calendar" | "bookmark" | "sliders" | "clock" | "arrow" | "check";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z" />,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const shortDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const categories = [
  { label: "Turnier", color: "#d8f35a" },
  { label: "Liga", color: "#65c5e4" },
  { label: "Quali", color: "#f1b761" },
  { label: "Training", color: "#b5a1ef" },
];
const sampleEvents = [
  { time: "17:00", title: "FNCS Challenger Cup", type: "TURNIER", format: "Duos", region: "EU", color: "#d8f35a", countdown: "in 2 Std." },
  { time: "19:30", title: "Zero Build Cup", type: "CASH CUP", format: "Solo", region: "EU", color: "#65c5e4", countdown: "heute" },
];

export default function CalendarRefine() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const [filter, setFilter] = useState("Alle Termine");
  const [filterOpen, setFilterOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("Kalender");
  const monthLabel = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(month);
  const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selected);
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const selectedDateTitle = new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "numeric", month: "long",
  }).format(selected);
  const visibleEvents = filter === "Alle Termine" ? sampleEvents : sampleEvents.filter((event) => (
    filter === "Turnier" ? event.type === "TURNIER" : filter === "Liga" ? false : true
  ));

  const moveMonth = (amount: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + amount, 1));
  const goToday = () => {
    const now = new Date();
    setSelected(now);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <main className="cc-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .cc-shell{--bg:#0c1014;--surface:#141a20;--surface2:#1a2229;--line:#28313a;--ink:#f2f4ed;--muted:#89939b;--lime:#d8f35a;min-height:100dvh;width:100%;box-sizing:border-box;background:radial-gradient(ellipse at 80% 0%,#202914 0,transparent 34%),var(--bg);color:var(--ink);font-family:'Manrope',system-ui,sans-serif;padding:24px 19px 106px;position:relative;overflow:hidden}
        .cc-shell *{box-sizing:border-box}.cc-header{display:flex;align-items:center;justify-content:space-between;margin:0 2px 28px}
        .cc-brand{display:flex;align-items:center;gap:10px}.cc-mark{width:13px;height:13px;background:var(--lime);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 0 4px #d8f35a17}
        .cc-brandname{font-size:11px;letter-spacing:.19em;font-weight:800;color:#aab1b2}.cc-avatar{width:34px;height:34px;border:1px solid #485238;border-radius:50%;display:grid;place-items:center;color:var(--lime);font-size:11px;font-weight:800;background:#1b2318}
        .cc-heading{display:flex;align-items:flex-end;justify-content:space-between;margin:0 1px 19px}.cc-month{font-size:34px;letter-spacing:-1.4px;line-height:1.05;font-weight:800;text-transform:capitalize}.cc-subtitle{font-size:12px;color:var(--muted);margin-top:7px}.cc-controls{display:flex;align-items:center;gap:7px}
        .cc-control{border:1px solid var(--line);color:var(--ink);background:var(--surface);border-radius:12px;width:38px;height:38px;display:grid;place-items:center;cursor:pointer;font-size:23px;line-height:1;transition:transform .16s,background .16s}
        .cc-control:hover,.cc-today:hover{transform:translateY(-1px);background:var(--surface2)}.cc-today{height:38px;padding:0 12px;border-radius:12px;border:1px solid #59663a;background:#1a2114;color:var(--lime);font:700 12px 'Manrope',sans-serif;cursor:pointer}
        .cc-calendar{border:1px solid var(--line);background:linear-gradient(145deg,#171e24,#13191f);border-radius:22px;padding:12px 9px 10px;box-shadow:0 16px 35px #0003}
        .cc-week,.cc-weekrow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.cc-week{margin-bottom:4px}.cc-weekname{height:28px;display:grid;place-items:center;font:500 10px 'DM Mono',monospace;color:#818c93;text-transform:uppercase}
        .cc-day{height:42px;border:1px solid transparent;background:transparent;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--ink);font:700 13px 'Manrope',sans-serif;cursor:pointer;transition:transform .15s,background .15s}
        .cc-day:hover{background:#ffffff0b}.cc-day.outside{color:#5e686e}.cc-day.selected{background:var(--lime);color:#17200c;box-shadow:0 5px 15px #d8f35a22}.cc-day.today:not(.selected){border-color:#73834b;color:var(--lime)}
        .cc-dots{height:4px;display:flex;gap:2px}.cc-dot{width:4px;height:4px;border-radius:50%;background:var(--lime)}.cc-day.selected .cc-dot{background:#26320c}
        .cc-legend{display:flex;gap:13px;flex-wrap:wrap;padding:14px 5px 16px}.cc-legenditem{display:flex;align-items:center;gap:6px;font-size:10px;color:#929da2}.cc-legenddot{width:6px;height:6px;border-radius:50%}
        .cc-filterwrap{position:relative;margin-bottom:22px}.cc-filter{width:100%;height:46px;border:1px solid var(--line);background:#151b21;border-radius:14px;padding:0 13px;display:flex;align-items:center;gap:9px;color:#a6b0b2;text-align:left;cursor:pointer}
        .cc-filter strong{color:var(--ink);font-size:12px}.cc-filter span{flex:1;font-size:11px;color:#9ba5a8}.cc-chevron{font-size:15px;color:#84908f}
        .cc-menu{position:absolute;z-index:3;top:51px;left:0;right:0;padding:7px;background:#1a2229;border:1px solid #303a40;border-radius:15px;box-shadow:0 16px 28px #0008}
        .cc-option{height:39px;border:0;background:none;color:var(--ink);font:600 12px 'Manrope',sans-serif;text-align:left;width:100%;border-radius:9px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}
        .cc-option:hover,.cc-option.active{background:#ffffff0a}.cc-option.active{color:var(--lime)}
        .cc-agendahead{display:flex;align-items:flex-end;justify-content:space-between;margin:0 2px 12px}.cc-agendaday{font-size:17px;line-height:1.2;text-transform:capitalize;letter-spacing:-.35px;font-weight:800}.cc-agenda-meta{font:10px 'DM Mono',monospace;color:#859196;margin-top:5px}
        .cc-count{font:10px 'DM Mono',monospace;color:#9ba5a1;background:#1c2426;border:1px solid #2b3732;padding:6px 9px;border-radius:8px}
        .cc-event{display:flex;min-height:85px;align-items:stretch;border:1px solid #2a343a;background:linear-gradient(105deg,#171e24,#13191f);border-radius:16px;margin-bottom:9px;overflow:hidden;transition:transform .18s}
        .cc-event:hover{transform:translateY(-2px)}.cc-eventline{width:3px;background:var(--event-color)}.cc-eventmain{flex:1;padding:12px 12px 11px}.cc-eventtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
        .cc-type{font:500 9px 'DM Mono',monospace;color:var(--event-color);letter-spacing:.09em}.cc-countdown{font-size:10px;color:#a5bb55;font-weight:700}
        .cc-eventtitle{font-size:13px;font-weight:800;letter-spacing:-.15px}.cc-eventmeta{display:flex;gap:7px;align-items:center;margin-top:7px;color:#8f9a9d;font-size:10px}.cc-sep{width:3px;height:3px;border-radius:50%;background:#637076}
        .cc-save{width:43px;border:0;border-left:1px solid #283239;color:#829092;background:#ffffff03;display:grid;place-items:center;cursor:pointer}.cc-save.active{color:var(--lime);background:#d8f35a0b}
        .cc-empty{border:1px dashed #354047;padding:18px;border-radius:15px;color:#9da7a9;font-size:12px;text-align:center}
        .cc-tabbar{position:fixed;bottom:15px;left:50%;transform:translateX(-50%);width:min(calc(100% - 28px),410px);height:64px;border:1px solid #303b3e;background:#171e22ee;backdrop-filter:blur(18px);border-radius:20px;display:flex;align-items:center;padding:5px;box-shadow:0 13px 32px #0008;z-index:5}
        .cc-tab{flex:1;border:0;background:transparent;color:#879194;border-radius:15px;height:52px;display:flex;align-items:center;justify-content:center;gap:7px;font:700 11px 'Manrope',sans-serif;cursor:pointer;transition:background .16s,color .16s}
        .cc-tab.active{color:var(--lime);background:#d8f35a12}.cc-tab svg{width:16px}
        @media(max-width:380px){.cc-shell{padding-left:14px;padding-right:14px}.cc-month{font-size:30px}.cc-day{height:39px}.cc-legend{gap:10px}.cc-legenditem{font-size:9px}}
      `}</style>

      <header className="cc-header">
        <div className="cc-brand"><span className="cc-mark" /><span className="cc-brandname">CAP-CALENDAR</span></div>
        <button className="cc-avatar" aria-label="Profil" onClick={() => setTab("Info")}>FN</button>
      </header>

      <section className="cc-heading">
        <div>
          <div className="cc-month">{monthLabel}</div>
          <div className="cc-subtitle">{month.getFullYear()} <span style={{ color: "#58645e" }}>·</span> Spielplan im Blick</div>
        </div>
        <div className="cc-controls">
          <button className="cc-control" aria-label="Vorheriger Monat" onClick={() => moveMonth(-1)}>‹</button>
          <button className="cc-today" onClick={goToday}>Heute</button>
          <button className="cc-control" aria-label="Nächster Monat" onClick={() => moveMonth(1)}>›</button>
        </div>
      </section>

      <section className="cc-calendar" aria-label="Monatskalender">
        <div className="cc-week">{shortDays.map((day) => <div className="cc-weekname" key={day}>{day}</div>)}</div>
        {Array.from({ length: 6 }, (_, row) => (
          <div className="cc-weekrow" key={row}>
            {calendarDays.slice(row * 7, row * 7 + 7).map((day, index) => {
              const key = dateKey(day);
              const isSelected = key === selectedKey;
              const hasEvents = day.getDate() === 5 || day.getDate() === 12 || day.getDate() === 19 || day.getDate() === 26;
              return <button
                key={`${key}-${index}`}
                className={`cc-day${day.getMonth() !== month.getMonth() ? " outside" : ""}${isSelected ? " selected" : ""}${key === todayKey ? " today" : ""}`}
                aria-label={new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(day)}
                aria-pressed={isSelected}
                onClick={() => { setSelected(day); if (day.getMonth() !== month.getMonth()) setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}
              >
                <span>{day.getDate()}</span><span className="cc-dots">{hasEvents && <i className="cc-dot" />}{day.getDate() === 19 && <i className="cc-dot" style={{ background: "#65c5e4" }} />}</span>
              </button>;
            })}
          </div>
        ))}
      </section>

      <div className="cc-legend">
        {categories.map((cat) => <div className="cc-legenditem" key={cat.label}><i className="cc-legenddot" style={{ background: cat.color }} />{cat.label}</div>)}
      </div>

      <div className="cc-filterwrap">
        <button className="cc-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
          <Icon name="sliders" size={16} /><strong>Filter</strong><span>{filter}</span><span className="cc-chevron">{filterOpen ? "⌃" : "⌄"}</span>
        </button>
        {filterOpen && <div className="cc-menu">{["Alle Termine", "Turnier", "Liga", "Quali", "Training"].map((option) => (
          <button className={`cc-option${filter === option ? " active" : ""}`} key={option} onClick={() => { setFilter(option); setFilterOpen(false); }}>
            {option}{filter === option && <Icon name="check" size={15} />}
          </button>
        ))}</div>}
      </div>

      <section>
        <div className="cc-agendahead">
          <div><div className="cc-agendaday">{selectedDateTitle}</div><div className="cc-agenda-meta">ZEITEN IN DEINER GERÄTEZEIT</div></div>
          <span className="cc-count">{visibleEvents.length} {visibleEvents.length === 1 ? "TERMIN" : "TERMINE"}</span>
        </div>
        {visibleEvents.length ? visibleEvents.map((event) => (
          <article className="cc-event" key={event.title} style={{ "--event-color": event.color } as React.CSSProperties}>
            <div className="cc-eventline" />
            <div className="cc-eventmain">
              <div className="cc-eventtop"><span className="cc-type">{event.type}</span><span className="cc-countdown">{event.countdown}</span></div>
              <div className="cc-eventtitle">{event.title}</div>
              <div className="cc-eventmeta"><Icon name="clock" size={12} />{event.time}<i className="cc-sep" />{event.region}<i className="cc-sep" />{event.format}</div>
            </div>
            <button className={`cc-save${saved ? " active" : ""}`} aria-label={saved ? "Aus Merkliste entfernen" : "In Merkliste speichern"} aria-pressed={saved} onClick={() => setSaved(!saved)}><Icon name="bookmark" size={17} /></button>
          </article>
        )) : <div className="cc-empty">Keine passenden Termine. Passe den Filter an.</div>}
      </section>

      <nav className="cc-tabbar" aria-label="Hauptnavigation">
        {(["Kalender", "Merkliste", "Info"] as const).map((item, index) => (
          <button className={`cc-tab${tab === item ? " active" : ""}`} key={item} onClick={() => setTab(item)}>
            <Icon name={index === 0 ? "calendar" : index === 1 ? "bookmark" : "arrow"} size={16} />{item}
          </button>
        ))}
      </nav>
    </main>
  );
}
