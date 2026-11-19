import React, { useMemo, useState } from "react";

type Category = { label: string; color: string };
type EventItem = { time: string; title: string; type: string; format: string; region: string; color: string; countdown: string };
type IconName = "calendar" | "bookmark" | "sliders" | "clock" | "arrow" | "check";

function AgendaIcon({ name, size = 17 }: { name: IconName; size?: number }) {
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

const agendaCategories: Category[] = [
  { label: "Turnier", color: "#d7ed67" },
  { label: "Liga", color: "#7cc9d1" },
  { label: "Quali", color: "#efb969" },
  { label: "Training", color: "#b8a6dc" },
];
const agendaEvents: EventItem[] = [
  { time: "17:00", title: "FNCS Challenger Cup", type: "TURNIER", format: "Duos", region: "EU", color: "#d7ed67", countdown: "in 2 Std." },
  { time: "19:30", title: "Zero Build Cup", type: "CASH CUP", format: "Solo", region: "EU", color: "#7cc9d1", countdown: "heute" },
];
const weekdayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const filterOptions = ["Alle Termine", "Turnier", "Liga", "Quali", "Training"];

export default function CalendarAgendaLayout() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const [filter, setFilter] = useState("Alle Termine");
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("Kalender");

  const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const selectedKey = dateKey(selected);
  const todayKey = dateKey(new Date());
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(month);
  const selectedDateTitle = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(selected);
  const weekDays = useMemo(() => {
    const mondayOffset = (selected.getDay() + 6) % 7;
    const monday = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
  }, [selected]);
  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const visibleEvents = filter === "Alle Termine" ? agendaEvents : agendaEvents.filter((event) => (
    filter === "Turnier" ? event.type === "TURNIER" : filter === "Liga" ? false : true
  ));

  const changeMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const chooseDate = (date: Date) => {
    setSelected(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };
  const goToday = () => {
    const today = new Date();
    setSelected(today);
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  return (
    <main className="agenda-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .agenda-layout{--al-bg:#101512;--al-panel:#19201b;--al-panel2:#202a23;--al-line:#303b32;--al-ink:#f0f0e6;--al-muted:#9aa397;--al-lime:#d7ed67;min-height:100dvh;width:100%;box-sizing:border-box;background:radial-gradient(ellipse at 83% 0%,#2b351c 0,transparent 32%),var(--al-bg);color:var(--al-ink);font-family:'Manrope',system-ui,sans-serif;padding:21px 18px 105px;position:relative;overflow-x:hidden}
        .agenda-layout *{box-sizing:border-box}
        .al-header{display:flex;justify-content:space-between;align-items:center;margin:0 1px 24px}
        .al-brand{display:flex;align-items:center;gap:10px}.al-mark{width:12px;height:12px;background:var(--al-lime);border-radius:4px;transform:rotate(45deg);box-shadow:0 0 0 4px #d7ed6717}
        .al-brandname{font-size:10px;letter-spacing:.2em;font-weight:800;color:#b3b9ae}.al-avatar{width:34px;height:34px;border-radius:50%;border:1px solid #4a573b;background:#20291d;color:var(--al-lime);font:800 11px 'Manrope',sans-serif;cursor:pointer}
        .al-monthbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}
        .al-eyebrow{font:500 9px 'DM Mono',monospace;letter-spacing:.15em;color:#899389;text-transform:uppercase;margin-bottom:4px}
        .al-monthtitle{text-transform:capitalize;font-size:20px;font-weight:800;letter-spacing:-.6px}
        .al-month-controls{display:flex;gap:6px;align-items:center}.al-arrow,.al-today{height:33px;border:1px solid var(--al-line);border-radius:10px;background:var(--al-panel);color:var(--al-ink);cursor:pointer;transition:transform .16s,background .16s}
        .al-arrow{width:34px;font-size:20px;line-height:1}.al-today{padding:0 11px;color:var(--al-lime);font:700 10px 'Manrope',sans-serif;border-color:#56623d;background:#20281a}
        .al-arrow:hover,.al-today:hover,.al-month-toggle:hover{transform:translateY(-1px);background:var(--al-panel2)}
        .al-weekstrip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-bottom:15px}
        .al-weekday{height:67px;padding:8px 2px 7px;border:1px solid transparent;border-radius:13px;background:transparent;color:#a8afa3;display:flex;flex-direction:column;align-items:center;justify-content:space-between;cursor:pointer;font-family:'Manrope',sans-serif;transition:transform .16s,background .16s}
        .al-weekday:hover{background:#ffffff0b}.al-weekday.active{background:var(--al-lime);color:#202817;box-shadow:0 7px 18px #d7ed6719}.al-weekday.today:not(.active){border-color:#738149;color:var(--al-lime)}
        .al-weekname{font:500 9px 'DM Mono',monospace;text-transform:uppercase;opacity:.78}.al-weeknum{font-size:17px;font-weight:800;line-height:1}
        .al-dots{height:4px;display:flex;gap:3px}.al-dot{width:4px;height:4px;border-radius:50%;background:var(--al-lime)}.al-weekday.active .al-dot{background:#27340e}
        .al-week-footer{display:flex;align-items:center;justify-content:space-between;margin:0 1px 20px}
        .al-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.al-legend-item{display:flex;align-items:center;gap:5px;color:#a1aa9d;font-size:9px}.al-legend-dot{width:6px;height:6px;border-radius:50%}
        .al-month-toggle{border:0;background:none;color:#c6d36d;display:flex;align-items:center;gap:5px;padding:5px 0;font:700 10px 'Manrope',sans-serif;cursor:pointer;transition:transform .16s}
        .al-monthgrid{border:1px solid var(--al-line);border-radius:17px;background:#171e19;padding:10px 8px;margin:-7px 0 18px;animation:al-in .2s ease-out}
        .al-grid-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.al-grid-day{height:32px;border:1px solid transparent;border-radius:9px;background:transparent;color:#e5e8de;font:700 11px 'Manrope',sans-serif;display:grid;place-items:center;cursor:pointer}
        .al-grid-day.outside{color:#566158}.al-grid-day.active{background:var(--al-lime);color:#202817}.al-grid-day.today:not(.active){border-color:#6e7a47;color:var(--al-lime)}.al-grid-day:hover:not(.active){background:#ffffff0c}
        .al-grid-weekname{height:23px;display:grid;place-items:center;color:#7f8a80;font:500 9px 'DM Mono',monospace}
        .al-agenda{border-top:1px solid #2a352c;padding-top:18px}
        .al-agendahead{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
        .al-date-title{text-transform:capitalize;font-size:18px;font-weight:800;letter-spacing:-.55px;line-height:1.2}
        .al-agenda-sub{margin-top:5px;color:#8d988d;font:9px 'DM Mono',monospace;letter-spacing:.03em}
        .al-count{border:1px solid #3a4738;background:#20291f;color:#c4cf80;border-radius:8px;padding:6px 8px;font:500 9px 'DM Mono',monospace}
        .al-filter-wrap{position:relative;margin-bottom:11px}
        .al-filter{width:100%;height:39px;padding:0 11px;border:1px solid var(--al-line);border-radius:11px;background:#171e19;color:#b5bdb2;display:flex;align-items:center;gap:8px;text-align:left;cursor:pointer}
        .al-filter-label{font-size:10px;font-weight:800;color:#edf0e5}.al-filter-value{flex:1;color:#a7b09f;font-size:10px}.al-chevron{font-size:14px;color:#94a08d}
        .al-menu{position:absolute;z-index:3;top:44px;left:0;right:0;padding:6px;background:#202920;border:1px solid #3b483b;border-radius:13px;box-shadow:0 14px 26px #0008}
        .al-option{width:100%;height:35px;border:0;border-radius:8px;padding:0 10px;background:none;color:#eef0e7;display:flex;align-items:center;justify-content:space-between;text-align:left;font:600 11px 'Manrope',sans-serif;cursor:pointer}
        .al-option:hover,.al-option.active{background:#ffffff0b}.al-option.active{color:var(--al-lime)}
        .al-event{display:grid;grid-template-columns:48px 3px minmax(0,1fr) 41px;min-height:89px;margin-bottom:9px;border:1px solid #303c32;border-radius:15px;overflow:hidden;background:linear-gradient(110deg,#1b231d,#171e19);transition:transform .18s}
        .al-event:hover{transform:translateY(-2px)}
        .al-time{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#edf0e5;font:500 11px 'DM Mono',monospace}
        .al-time-icon{color:#869381;display:flex}
        .al-event-line{background:var(--event-color)}
        .al-event-main{min-width:0;padding:13px 10px 10px}
        .al-event-top{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:7px}
        .al-type{color:var(--event-color);font:500 8px 'DM Mono',monospace;letter-spacing:.1em;white-space:nowrap}
        .al-countdown{color:#b6c879;font:700 9px 'Manrope',sans-serif;white-space:nowrap}
        .al-event-title{font-size:12px;font-weight:800;letter-spacing:-.18px;line-height:1.25}
        .al-event-meta{display:flex;align-items:center;gap:6px;margin-top:7px;color:#9ba598;font-size:9px}
        .al-sep{width:3px;height:3px;border-radius:50%;background:#6f7b6c}
        .al-save{border:0;border-left:1px solid #303a31;background:#ffffff03;color:#879487;display:grid;place-items:center;cursor:pointer}
        .al-save.active{background:#d7ed670c;color:var(--al-lime)}
        .al-empty{border:1px dashed #3b483d;border-radius:14px;padding:19px 14px;color:#aab3a7;text-align:center;font-size:11px;line-height:1.55}
        .al-tabbar{position:fixed;z-index:5;bottom:14px;left:50%;transform:translateX(-50%);width:min(calc(100% - 28px),410px);height:61px;padding:5px;border:1px solid #39443b;border-radius:19px;background:#1b231eea;backdrop-filter:blur(18px);display:flex;box-shadow:0 13px 32px #0008}
        .al-tab{height:49px;flex:1;border:0;border-radius:14px;background:transparent;color:#929d91;display:flex;align-items:center;justify-content:center;gap:7px;font:700 10px 'Manrope',sans-serif;cursor:pointer;transition:background .16s,color .16s}
        .al-tab.active{background:#d7ed6712;color:var(--al-lime)}.al-tab svg{width:15px}
        @keyframes al-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:370px){.agenda-layout{padding-left:14px;padding-right:14px}.al-weekstrip{gap:3px}.al-weekday{height:62px}.al-legend{gap:7px}.al-legend-item{font-size:8px}.al-event{grid-template-columns:43px 3px minmax(0,1fr) 37px}.al-event-main{padding-left:8px;padding-right:7px}}
        @media(prefers-reduced-motion:reduce){.agenda-layout *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
      `}</style>

      <header className="al-header">
        <div className="al-brand"><span className="al-mark" /><span className="al-brandname">CAP-CALENDAR</span></div>
        <button className="al-avatar" aria-label="Profil und Informationen" onClick={() => setActiveTab("Info")}>FN</button>
      </header>

      <section aria-label="Woche auswählen">
        <div className="al-monthbar">
          <div>
            <div className="al-eyebrow">Spielplan im Blick</div>
            <div className="al-monthtitle">{monthName} <span style={{ color: "#81907c", fontSize: 13, letterSpacing: 0 }}>{month.getFullYear()}</span></div>
          </div>
          <div className="al-month-controls">
            <button className="al-arrow" aria-label="Vorheriger Monat" onClick={() => changeMonth(-1)}>‹</button>
            <button className="al-today" onClick={goToday}>Heute</button>
            <button className="al-arrow" aria-label="Nächster Monat" onClick={() => changeMonth(1)}>›</button>
          </div>
        </div>
        <div className="al-weekstrip">
          {weekDays.map((day, index) => {
            const key = dateKey(day);
            const hasEvent = day.getDate() === 5 || day.getDate() === 12 || day.getDate() === 19 || day.getDate() === 26;
            return (
              <button key={key} className={`al-weekday${selectedKey === key ? " active" : ""}${todayKey === key ? " today" : ""}`} aria-label={new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(day)} aria-pressed={selectedKey === key} onClick={() => chooseDate(day)}>
                <span className="al-weekname">{weekdayNames[index]}</span><span className="al-weeknum">{day.getDate()}</span>
                <span className="al-dots">{hasEvent && <i className="al-dot" />}{day.getDate() === 19 && <i className="al-dot" style={{ background: "#7cc9d1" }} />}</span>
              </button>
            );
          })}
        </div>
        <div className="al-week-footer">
          <div className="al-legend">
            {agendaCategories.map((category) => <span className="al-legend-item" key={category.label}><i className="al-legend-dot" style={{ background: category.color }} />{category.label}</span>)}
          </div>
          <button className="al-month-toggle" aria-expanded={monthOpen} onClick={() => setMonthOpen(!monthOpen)}>
            <AgendaIcon name="calendar" size={13} />{monthOpen ? "Woche" : "Monat"} <span>{monthOpen ? "⌃" : "⌄"}</span>
          </button>
        </div>
        {monthOpen && (
          <div className="al-monthgrid" aria-label="Monatskalender">
            <div className="al-grid-row">{weekdayNames.map((day) => <span className="al-grid-weekname" key={day}>{day}</span>)}</div>
            {Array.from({ length: 6 }, (_, row) => <div className="al-grid-row" key={row}>
              {monthDays.slice(row * 7, row * 7 + 7).map((day, index) => {
                const key = dateKey(day);
                return <button key={`${key}-${index}`} className={`al-grid-day${day.getMonth() !== month.getMonth() ? " outside" : ""}${selectedKey === key ? " active" : ""}${todayKey === key ? " today" : ""}`} aria-pressed={selectedKey === key} onClick={() => chooseDate(day)}>{day.getDate()}</button>;
              })}
            </div>)}
          </div>
        )}
      </section>

      <section className="al-agenda" aria-label="Termine des ausgewählten Tages">
        <div className="al-agendahead">
          <div><div className="al-date-title">{selectedDateTitle}</div><div className="al-agenda-sub">ZEITEN IN DEINER GERÄTEZEIT</div></div>
          <span className="al-count">{visibleEvents.length} {visibleEvents.length === 1 ? "TERMIN" : "TERMINE"}</span>
        </div>
        <div className="al-filter-wrap">
          <button className="al-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
            <AgendaIcon name="sliders" size={15} /><span className="al-filter-label">Filter</span><span className="al-filter-value">{filter}</span><span className="al-chevron">{filterOpen ? "⌃" : "⌄"}</span>
          </button>
          {filterOpen && <div className="al-menu">{filterOptions.map((option) => <button key={option} className={`al-option${filter === option ? " active" : ""}`} onClick={() => { setFilter(option); setFilterOpen(false); }}>{option}{filter === option && <AgendaIcon name="check" size={14} />}</button>)}</div>}
        </div>
        {visibleEvents.length ? visibleEvents.map((event) => (
          <article className="al-event" key={event.title} style={{ "--event-color": event.color } as React.CSSProperties}>
            <div className="al-time"><span className="al-time-icon"><AgendaIcon name="clock" size={13} /></span><span>{event.time}</span></div>
            <div className="al-event-line" />
            <div className="al-event-main">
              <div className="al-event-top"><span className="al-type">{event.type}</span><span className="al-countdown">{event.countdown}</span></div>
              <div className="al-event-title">{event.title}</div>
              <div className="al-event-meta"><span>{event.region}</span><i className="al-sep" /><span>{event.format}</span></div>
            </div>
            <button className={`al-save${saved[event.title] ? " active" : ""}`} aria-label={saved[event.title] ? "Aus Merkliste entfernen" : "In Merkliste speichern"} aria-pressed={!!saved[event.title]} onClick={() => setSaved((current) => ({ ...current, [event.title]: !current[event.title] }))}><AgendaIcon name="bookmark" size={16} /></button>
          </article>
        )) : <div className="al-empty">Keine passenden Termine. Passe den Filter an.</div>}
      </section>

      <nav className="al-tabbar" aria-label="Hauptnavigation">
        {(["Kalender", "Merkliste", "Info"] as const).map((item, index) => (
          <button key={item} className={`al-tab${activeTab === item ? " active" : ""}`} onClick={() => setActiveTab(item)}>
            <AgendaIcon name={index === 0 ? "calendar" : index === 1 ? "bookmark" : "arrow"} size={15} />{item}
          </button>
        ))}
      </nav>
    </main>
  );
}
