"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterComboboxOptions, type ComboboxOption } from "@/lib/combobox";
export type { ComboboxOption } from "@/lib/combobox";

export function Combobox({
  id,
  name,
  label,
  options,
  defaultValue = "",
  placeholder = "Search and select",
  emptyMessage = "No matching options",
  error,
  hint,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyMessage?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = `${id}-listbox`;
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const displayedQuery = query || (selectedValue ? selectedOption?.label ?? "" : "");

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const filtered = useMemo(() => {
    return filterComboboxOptions(options, displayedQuery, selectedOption?.label);
  }, [options, displayedQuery, selectedOption?.label]);

  function firstEnabled(from: number, direction: 1 | -1) {
    if (!filtered.length) return -1;
    let index = from;
    for (let checked = 0; checked < filtered.length; checked += 1) {
      index = (index + direction + filtered.length) % filtered.length;
      if (!filtered[index].disabled) return index;
    }
    return -1;
  }

  function select(option: ComboboxOption) {
    if (option.disabled) return;
    setSelectedValue(option.value);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.setCustomValidity("");
    inputRef.current?.focus();
  }

  return <div className="field combobox" ref={rootRef}>
    <label htmlFor={id}>{label}</label>
    <input type="hidden" name={name} value={selectedValue} />
    <div className="combobox-control">
      <input
        ref={inputRef}
        className="input"
        id={id}
        value={displayedQuery}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-invalid={!!error}
        aria-describedby={descriptionId}
        aria-required={required}
        required={required}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(firstEnabled(-1, 1));
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setSelectedValue("");
          setOpen(true);
          event.currentTarget.setCustomValidity(required && nextQuery ? `Choose a ${label.toLocaleLowerCase()} from the list.` : "");
          setActiveIndex(filterComboboxOptions(options, nextQuery).findIndex((option) => !option.disabled));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => firstEnabled(current, event.key === "ArrowDown" ? 1 : -1));
          } else if (event.key === "Enter" && open && activeIndex >= 0) {
            event.preventDefault();
            const option = filtered[activeIndex];
            if (option) select(option);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(selectedOption?.label ?? "");
          }
        }}
      />
      <button
        className="combobox-toggle"
        type="button"
        aria-label={open ? `Close ${label.toLocaleLowerCase()} options` : `Open ${label.toLocaleLowerCase()} options`}
        tabIndex={-1}
        onClick={() => {
          setOpen((current) => !current);
          inputRef.current?.focus();
        }}
      >⌄</button>
    </div>
    {open && <div className="combobox-options" id={listId} role="listbox" aria-label={label}>
      {filtered.length === 0 && <div className="combobox-empty">{emptyMessage}</div>}
      {filtered.map((option, index) => <div
        id={`${id}-option-${index}`}
        key={option.value}
        role="option"
        aria-selected={selectedValue === option.value}
        aria-disabled={option.disabled}
        className="combobox-option"
        data-active={index === activeIndex}
        data-disabled={option.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => select(option)}
      >
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </div>)}
    </div>}
    {error ? <small className="field-error" id={`${id}-error`}>{error}</small> : hint ? <small id={`${id}-hint`}>{hint}</small> : null}
  </div>;
}
