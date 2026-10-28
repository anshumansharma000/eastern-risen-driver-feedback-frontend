"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface BookingSection {
  id: string;
  label: string;
  render: (active: boolean) => ReactNode;
}

/** Hash links open the right section; visited panels retain local state. */
export function BookingSections({ sections }: { sections: BookingSection[] }) {
  const [selected, setSelected] = useState(sections[0].id);
  const [visited, setVisited] = useState<string[]>([sections[0].id]);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const followHash = () => {
      const id = window.location.hash.slice(1);
      if (!sections.some(section => section.id === id)) return;
      setSelected(id);
      setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    };
    queueMicrotask(followHash);
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [sections]);

  function select(index: number, focus = false) {
    const id = sections[index].id;
    setSelected(id);
    setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
    if (focus) buttons.current[index]?.focus();
  }

  return <div className="booking-sections">
    <div className="booking-tabs" role="tablist" aria-label="Booking sections">
      {sections.map((section, index) => <button
        key={section.id}
        ref={element => { buttons.current[index] = element; }}
        type="button"
        role="tab"
        id={`${section.id}-tab`}
        aria-selected={selected === section.id}
        aria-controls={section.id}
        tabIndex={selected === section.id ? 0 : -1}
        onClick={() => select(index)}
        onKeyDown={event => {
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % sections.length;
          else if (event.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = sections.length - 1;
          else return;
          event.preventDefault();
          select(next, true);
        }}
      >{section.label}</button>)}
    </div>
    {sections.map(section => <div
      key={section.id}
      id={section.id}
      role="tabpanel"
      aria-labelledby={`${section.id}-tab`}
      hidden={selected !== section.id}
      tabIndex={0}
    >{visited.includes(section.id) ? section.render(selected === section.id) : null}</div>)}
  </div>;
}
