/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

const formatDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date) => {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date, count) =>
  new Date(date.getFullYear(), date.getMonth() + count, 1);

const isSameDay = (first, second) => {
  if (!first || !second) return false;
  return formatDateKey(first) === formatDateKey(second);
};

const dateInRange = (value, start, end) => {
  if (!value || !start || !end) return false;
  return (
    new Date(value).getTime() >= new Date(start).getTime() &&
    new Date(value).getTime() <= new Date(end).getTime()
  );
};

const getCalendarDays = (monthDate) => {
  const monthStart = startOfMonth(monthDate);
  const firstWeekDay = monthStart.getDay();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const dayOffset = i - firstWeekDay + 1;
    const cellDate = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      dayOffset,
    );
    cells.push(cellDate);
  }

  return cells;
};

const getQuickRange = (type, anchorDate) => {
  const today = new Date(anchorDate);

  switch (type) {
    case "today":
      return [today, today];
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return [yesterday, yesterday];
    }
    case "thisWeek": {
      const weekStart = startOfWeek(today);
      return [weekStart, today];
    }
    case "last7Days": {
      return [addDays(today, -6), today];
    }
    case "last30Days": {
      return [addDays(today, -29), today];
    }
    case "thisMonth": {
      return [startOfMonth(today), today];
    }
    case "lastMonth": {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return [startOfMonth(lastMonth), lastMonthEnd];
    }
    case "thisYear": {
      return [new Date(today.getFullYear(), 0, 1), today];
    }
    case "lastYear": {
      const lastYear = today.getFullYear() - 1;
      return [new Date(lastYear, 0, 1), new Date(lastYear, 11, 31)];
    }
    default:
      return [today, today];
  }
};

export function DateRangeFilter({ value, onChange }) {
  const today = useMemo(() => new Date(), []);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({
    left: 12,
    top: 12,
  });
  const [viewMonth, setViewMonth] = useState(
    startOfMonth(parseDateKey(value?.[0]) ?? today),
  );
  const [monthDirection, setMonthDirection] = useState(1);
  const [draftRange, setDraftRange] = useState({
    start: parseDateKey(value?.[0]) ?? null,
    end: parseDateKey(value?.[1]) ?? null,
  });

  useEffect(() => {
    if (!isOpen) return;
    setDraftRange({
      start: parseDateKey(value?.[0]) ?? null,
      end: parseDateKey(value?.[1]) ?? null,
    });
    setViewMonth(startOfMonth(parseDateKey(value?.[0]) ?? today));
  }, [isOpen, value, today]);

  const dateLabel =
    value?.[0] && value?.[1]
      ? `${value[0]} - ${value[1]}`
      : "Select date range";

  const secondMonth = addMonths(viewMonth, 1);

  const updatePopupPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const bounds = trigger.getBoundingClientRect();
    const popupWidth = Math.min(800, window.innerWidth - 24);
    const header = document.querySelector("[data-marisx-header]");
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;

    setPopupPosition({
      left: Math.max(
        12,
        Math.min(bounds.left, window.innerWidth - popupWidth - 12),
      ),
      top: Math.max(bounds.bottom + 2, headerBottom + 2),
    });
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [isOpen]);

  const handleMonthChange = (delta) => {
    setMonthDirection(delta >= 0 ? 1 : -1);
    setViewMonth((current) => addMonths(current, delta));
  };

  const handleCellClick = (cellDate) => {
    if (!draftRange.start || (draftRange.start && draftRange.end)) {
      setDraftRange({ start: cellDate, end: null });
      return;
    }

    if (cellDate < draftRange.start) {
      setDraftRange({ start: cellDate, end: null });
      return;
    }

    setDraftRange({ start: draftRange.start, end: cellDate });
  };

  const applyRange = () => {
    if (!draftRange.start) {
      setIsOpen(false);
      return;
    }

    const startKey = formatDateKey(draftRange.start);
    const endKey = draftRange.end ? formatDateKey(draftRange.end) : startKey;
    onChange([startKey, endKey]);
    setIsOpen(false);
  };

  const renderMonth = (monthDate) => {
    const calendarDays = getCalendarDays(monthDate);

    return (
      <div className="flex-1">
        <div className="mb-4 text-center text-[18px] font-medium text-slate-700">
          {monthDate.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </div>

        <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[12px] font-medium text-slate-500">
          {DAY_NAMES.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((cellDate, index) => {
            const inCurrentMonth = cellDate.getMonth() === monthDate.getMonth();
            const isSelectedStart =
              draftRange.start && isSameDay(cellDate, draftRange.start);
            const isSelectedEnd =
              draftRange.end && isSameDay(cellDate, draftRange.end);
            const isInRange =
              draftRange.start &&
              draftRange.end &&
              dateInRange(cellDate, draftRange.start, draftRange.end);

            return (
              <button
                key={`${monthDate.getMonth()}-${index}`}
                type="button"
                onClick={() => handleCellClick(cellDate)}
                className={[
                  "flex h-11 items-center justify-center rounded-full text-[15px] transition",
                  inCurrentMonth ? "text-slate-700" : "text-slate-300",
                  isSelectedStart || isSelectedEnd
                    ? "bg-slate-800 text-white"
                    : isInRange
                      ? "bg-slate-200 text-slate-800"
                      : "hover:bg-slate-100",
                ].join(" ")}
              >
                {cellDate.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative mb-4">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          if (!isOpen) updatePopupPosition();
          setIsOpen((open) => !open);
        }}
        className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left shadow-sm"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        <span className="w-full border-0 bg-transparent text-[15px] text-slate-700 outline-none">
          {dateLabel}
        </span>
      </button>

      {isOpen && (
        <>
          <style>{`
            @keyframes month-slide-left {
              0% { opacity: 0.5; transform: translateX(18px); }
              100% { opacity: 1; transform: translateX(0); }
            }
            @keyframes month-slide-right {
              0% { opacity: 0.5; transform: translateX(-18px); }
              100% { opacity: 1; transform: translateX(0); }
            }
          `}</style>

          <div
            ref={popupRef}
            className="fixed z-[1100] max-h-[calc(100vh-24px)] w-[min(800px,calc(100vw-24px))] overflow-y-auto rounded-md border border-slate-800 bg-white p-0 shadow-xl"
            style={popupPosition}
          >
            <div className="flex max-h-[420px]">
              <aside className="w-[150px] border-r border-slate-200 bg-slate-50 px-4 py-3">
                <div className="space-y-[2px]">
                  {[
                    "Today",
                    "Yesterday",
                    "This week",
                    "Last 7 days",
                    "Last 30 days",
                    "This month",
                    "Last month",
                    "This year",
                    "Last year",
                  ].map((label) => {
                    const normalized = label
                      .toLowerCase()
                      .replace(/\s+/g, "")
                      .replace(/[^a-z]/g, "");
                    const preset = (() => {
                      if (normalized.includes("today")) return "today";
                      if (normalized.includes("yesterday")) return "yesterday";
                      if (normalized.includes("week")) return "thisWeek";
                      if (normalized.includes("last7")) return "last7Days";
                      if (normalized.includes("last30")) return "last30Days";
                      if (normalized.includes("thismonth")) return "thisMonth";
                      if (normalized.includes("lastmonth")) return "lastMonth";
                      if (normalized.includes("thisyear")) return "thisYear";
                      if (normalized.includes("lastyear")) return "lastYear";
                      return "today";
                    })();

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const [start, end] = getQuickRange(preset, today);
                          setDraftRange({ start, end });
                          setViewMonth(startOfMonth(start));
                        }}
                        className="flex w-full items-center justify-start rounded-full px-4 py-2.5 text-left text-[15px] text-slate-700 transition hover:bg-slate-200"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="flex flex-1 flex-col px-6 py-5">
                <div className="mb-5 flex items-center justify-center">
                  <div className="w-full">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex w-8 justify-start">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-700 transition hover:bg-slate-100"
                          onClick={() => handleMonthChange(-1)}
                          aria-label="Previous month"
                        >
                          ‹
                        </button>
                      </div>

                      <div
                        key={`${viewMonth.getFullYear()}-${viewMonth.getMonth()}-${monthDirection}`}
                        className="flex flex-1 items-start justify-center gap-8"
                        style={{
                          animation:
                            monthDirection === 1
                              ? "month-slide-left 220ms ease-out"
                              : "month-slide-right 220ms ease-out",
                        }}
                      >
                        <div className="w-[calc(50%-1rem)] min-w-0">
                          {renderMonth(viewMonth)}
                        </div>

                        <div className="h-full w-px self-stretch bg-slate-200" />

                        <div className="w-[calc(50%-1rem)] min-w-0">
                          {renderMonth(secondMonth)}
                        </div>
                      </div>

                      <div className="flex w-8 justify-end">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-700 transition hover:bg-slate-100"
                          onClick={() => handleMonthChange(1)}
                          aria-label="Next month"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-6 border-t border-slate-200 px-6 py-3">
              <button
                type="button"
                className="text-[14px] font-semibold uppercase tracking-[0.12em] text-slate-600"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-[14px] font-semibold uppercase tracking-[0.12em] text-slate-900"
                onClick={applyRange}
              >
                Ok
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
