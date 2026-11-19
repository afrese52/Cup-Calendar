import React, { useMemo, useState } from "react";

type IconName = "bookmark" | "clock" | "sliders" | "check";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const categories = [
  { label: "Turnier", color: "#d9f36b" },
  { label: "Liga", color: "#6dc9e5" },
  { label: "Quali", color: "#f2bd71" },
  { label: "Training", color: "#b6a1ec" },
];
const events = [
  { time: "17:00", title: "FNCS Challenger Cup", type: "TURNIER", format: "Duos", color: "#d9f36b", mark: "In 2 Std." },
  { time: "19:30", title: "Zero Build Cup", type: "LIGA", format: "Solo", color: "#6dc9e5", mark: "Heute" },
];

export default function CalendarCompact() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(new Date());
  const [filter, setFilter] = useState("Alle Termine");
  const [filterOpen, setFilterOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(month);
  const keyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const selectedKey = keyOf(selected);
  const todayKey = keyOf(new Date());
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    const count = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const dayTitle = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(selected);
  const visibleEvents = filter === "Alle Termine" ? events : events.filter((event) => filter === "Turnier" ? event.type === "TURNIER" : filter === "Liga" ? event.type === "LIGA" : false);
  const shiftMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const setToday = () => { const now = new Date(); setSelected(now); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); };
  const eventColors = (date: Date) => date.getDate() === 5 || date.getDate() === 12 || date.getDate() === 19 || date.getDate() === 26
    ? date.getDate() === 19 ? [categories[0].color, categories[1].color, categories[2].color] : [categories[Math.floor(date.getDate() / 5) % categories.length].color]
    : [];

  return (
    <main className="compact-calendar">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .compact-calendar{--bg:#111719;--panel:#192124;--panel-hi:#202a2c;--line:#303b3d;--ink:#f1f3e9;--muted:#899595;--lime:#d9f36b;min-height:100dvh;width:100%;padding:22px 18px 96px;box-sizing:border-box;overflow:hidden;color:var(--ink);background:radial-gradient(ellipse at 78% -8%,#29331d 0,transparent 34%),var(--bg);font-family:'Manrope',sans-serif}
        .compact-calendar *{box-sizing:border-box}.cm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:23px}.cm-brand{display:flex;gap:10px;align-items:center;color:#aeb7b2;font-size:10px;font-weight:800;letter-spacing:.2em}.cm-mark{width:11px;height:11px;background:var(--lime);border-radius:3px;transform:rotate(45deg);box-shadow:0 0 0 4px #d9f36b14}.cm-avatar{width:32px;height:32px;border:1px solid #4c5938;border-radius:50%;background:#20281a;color:var(--lime);font:800 10px 'Manrope',sans-serif}
        .cm-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.cm-month{font-size:29px;line-height:1.02;font-weight:800;letter-spacing:-1.2px;text-transform:capitalize}.cm-year{font:10px 'DM Mono',monospace;color:#929e99;margin-top:5px;letter-spacing:.03em}.cm-controls{display:flex;gap:6px;align-items:center}.cm-nav{width:32px;height:32px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);font-size:21px;line-height:1;cursor:pointer}.cm-today{height:32px;padding:0 10px;border:1px solid #53623b;border-radius:10px;background:#202719;color:var(--lime);font:700 10px 'Manrope',sans-serif;cursor:pointer}
        .cm-cal{border:1px solid #303b3d;border-radius:18px;background:linear-gradient(145deg,#1a2225,#171e20);padding:9px 8px 8px;box-shadow:0 14px 30px #0003}.cm-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}.cm-weekday{height:23px;display:grid;place-items:center;color:#84918e;font:500 9px 'DM Mono',monospace;text-transform:uppercase}.cm-date{height:34px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1px solid transparent;border-radius:10px;background:transparent;color:#e7eade;font:700 11px 'Manrope',sans-serif;cursor:pointer;transition:transform .15s,background .15s}.cm-date:hover{background:#ffffff0a}.cm-date.outside{color:#56615f}.cm-date.today:not(.selected){border-color:#667744;color:var(--lime)}.cm-date.selected{background:var(--lime);color:#1e2910;box-shadow:0 3px 10px #d9f36b25;border-color:var(--lime)}.cm-date.selected:after{content:"";position:absolute;inset:2px;border:1px solid #29371755;border-radius:7px;pointer-events:none}.cm-dots{height:3px;display:flex;gap:2px;align-items:center}.cm-dot{width:3px;height:3px;border-radius:50%;background:var(--dot)}.cm-date.selected .cm-dot{background:#293717}
        .cm-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 3px 14px}.cm-legend-item{display:flex;align-items:center;gap:5px;color:#9ca7a2;font-size:9px}.cm-legend-dot{width:6px;height:6px;border-radius:50%}
        .cm-filter-wrap{position:relative;margin-bottom:19px}.cm-filter{width:100%;height:40px;border:1px solid var(--line);border-radius:12px;background:#192124;padding:0 11px;display:flex;gap:8px;align-items:center;text-align:left;color:#a7b1ad;cursor:pointer}.cm-filter strong{font-size:11px;color:var(--ink)}.cm-filter span:nth-of-type(1){flex:1;color:#a0aba7;font-size:10px}.cm-caret{font-size:14px}.cm-menu{position:absolute;z-index:3;top:45px;left:0;right:0;padding:6px;border:1px solid #354144;border-radius:13px;background:#202a2c;box-shadow:0 12px 25px #0008}.cm-option{width:100%;height:34px;padding:0 9px;display:flex;align-items:center;justify-content:space-between;border:0;border-radius:8px;background:transparent;color:var(--ink);font:600 11px 'Manrope',sans-serif;text-align:left;cursor:pointer}.cm-option.active,.cm-option:hover{background:#ffffff0a;color:var(--lime)}
        .cm-agenda-head{display:flex;align-items:flex-end;justify-content:space-between;margin:0 2px 10px}.cm-daytitle{font-size:16px;line-height:1.2;text-transform:capitalize;font-weight:800;letter-spacing:-.3px}.cm-timezone{margin-top:4px;color:#83908c;font:9px 'DM Mono',monospace;letter-spacing:.02em}.cm-count{padding:5px 8px;border:1px solid #34403b;border-radius:7px;background:#202a27;color:#a9b4ad;font:9px 'DM Mono',monospace}.cm-event{display:flex;min-height:73px;margin-bottom:8px;overflow:hidden;border:1px solid #303b3d;border-radius:14px;background:linear-gradient(110deg,#1b2427,#171e20)}.cm-stripe{width:3px;background:var(--event)}.cm-event-body{flex:1;padding:10px 11px}.cm-event-top{display:flex;justify-content:space-between;margin-bottom:5px}.cm-event-type{color:var(--event);font:500 8px 'DM Mono',monospace;letter-spacing:.08em}.cm-event-mark{color:#b4c765;font-size:9px;font-weight:700}.cm-event-title{font-size:12px;font-weight:800;letter-spacing:-.1px}.cm-event-meta{display:flex;gap:6px;align-items:center;margin-top:5px;color:#96a19d;font-size:9px}.cm-save{width:39px;border:0;border-left:1px solid #303a3b;background:#ffffff03;color:#84928d;display:grid;place-items:center;cursor:pointer}.cm-save.active{color:var(--lime);background:#d9f36b0b}.cm-empty{padding:16px;border:1px dashed #3b4748;border-radius:12px;text-align:center;color:#a0aaa6;font-size:11px}
        @media(max-width:360px){.compact-calendar{padding-left:13px;padding-right:13px}.cm-date{height:31px}.cm-legend{gap:9px}.cm-legend-item{font-size:8px}.cm-month{font-size:27px}}
      `}</style>
      <header className="cm-head"><div className="cm-brand"><i className="cm-mark" />CAP-CALENDAR</div><button className="cm-avatar" aria-label="Profil">FN</button></header>
      <section className="cm-title-row">
        <div><div className="cm-month">{monthName}</div><div className="cm-year">{month.getFullYear()}　·　SPIELPLAN IM BLICK</div></div>
        <div className="cm-controls"><button className="cm-nav" aria-label="Vorheriger Monat" onClick={() => shiftMonth(-1)}>‹</button><button className="cm-today" onClick={setToday}>Heute</button><button className="cm-nav" aria-label="Nächster Monat" onClick={() => shiftMonth(1)}>›</button></div>
      </section>
      <section className="cm-cal" aria-label="Kompakter Monatskalender">
        <div className="cm-grid">{weekdays.map((day) => <div className="cm-weekday" key={day}>{day}</div>)}
          {days.map((date) => {
            const dateKey = keyOf(date);
            const marks = eventColors(date);
            const selectedDate = dateKey === selectedKey;
            return <button key={dateKey} className={`cm-date${date.getMonth() !== month.getMonth() ? " outside" : ""}${dateKey === todayKey ? " today" : ""}${selectedDate ? " selected" : ""}`} aria-label={new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(date)} aria-pressed={selectedDate} onClick={() => { setSelected(date); if (date.getMonth() !== month.getMonth()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}>
              <span>{date.getDate()}</span><span className="cm-dots">{marks.map((color, index) => <i key={index} className="cm-dot" style={{ "--dot": color } as React.CSSProperties} />)}</span>
            </button>;
          })}
        </div>
      </section>
      <div className="cm-legend">{categories.map((category) => <div className="cm-legend-item" key={category.label}><i className="cm-legend-dot" style={{ background: category.color }} />{category.label}</div>)}</div>
      <div className="cm-filter-wrap"><button className="cm-filter" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><Icon name="sliders" size={14} /><strong>Filter</strong><span>{filter}</span><span className="cm-caret">{filterOpen ? "⌃" : "⌄"}</span></button>
        {filterOpen && <div className="cm-menu">{["Alle Termine", "Turnier", "Liga", "Quali", "Training"].map((option) => <button className={`cm-option${filter === option ? " active" : ""}`} key={option} onClick={() => { setFilter(option); setFilterOpen(false); }}>{option}{filter === option && <Icon name="check" size={14} />}</button>)}</div>}
      </div>
      <section><div className="cm-agenda-head"><div><div className="cm-daytitle">{dayTitle}</div><div className="cm-timezone">ZEITEN IN DEINER GERÄTEZEIT</div></div><span className="cm-count">{visibleEvents.length} {visibleEvents.length === 1 ? "TERMIN" : "TERMINE"}</span></div>
        {visibleEvents.length ? visibleEvents.map((event) => <article className="cm-event" key={event.title} style={{ "--event": event.color } as React.CSSProperties}><i className="cm-stripe" /><div className="cm-event-body"><div className="cm-event-top"><span className="cm-event-type">{event.type}</span><span className="cm-event-mark">{event.mark}</span></div><div className="cm-event-title">{event.title}</div><div className="cm-event-meta"><Icon name="clock" size={11} />{event.time}<span>·</span>EU<span>·</span>{event.format}</div></div><button className={`cm-save${saved ? " active" : ""}`} aria-label={saved ? "Aus Merkliste entfernen" : "In Merkliste speichern"} aria-pressed={saved} onClick={() => setSaved(!saved)}><Icon name="bookmark" size={16} /></button></article>) : <div className="cm-empty">Keine passenden Termine. Passe den Filter an.</div>}
      </section>
    </main>
  );
}
