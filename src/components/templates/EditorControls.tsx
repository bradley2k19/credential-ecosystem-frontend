"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { NumericRange, TemplateOptions } from "@/lib/api";
import type { ColorToken } from "@/lib/certificateDesign";
import { certificateFontClasses, certificateFontFamily } from "@/lib/certificateFonts";
import { rangeStep } from "@/lib/templateEditor";

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Messages shown under a field: the field's own validation problems. */
export function FieldMessages({ messages, id }: { messages: string[]; id?: string }) {
  if (messages.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-red-700" id={id}>
      {messages.map((message) => <li key={message}>{capitalise(message)}</li>)}
    </ul>
  );
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function FieldLabel({ children, htmlFor, id }: { children: ReactNode; htmlFor?: string; id?: string }) {
  return <label className="block text-sm font-medium text-slate-700" htmlFor={htmlFor} id={id}>{children}</label>;
}

function decimals(step: number) {
  return step >= 1 ? 0 : String(step).split(".")[1]?.length ?? 0;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "";
}

/**
 * A slider with a number box for a value within a range from the options. Typing keeps its own text so partial
 * input ("1.") is not overwritten; an empty or invalid entry is stored as NaN and reported by validation.
 */
export function RangeField({ label, value, range, unit, onChange, messages = [] }: {
  label: string;
  value: number;
  range: NumericRange;
  unit?: string;
  onChange: (value: number) => void;
  messages?: string[];
}) {
  const id = useId();
  const step = rangeStep(range);
  const [text, setText] = useState(formatNumber(value));
  const [shownValue, setShownValue] = useState(value);
  if (!Object.is(shownValue, value)) {
    setShownValue(value);
    if (Number(text) !== value && !(Number.isNaN(value) && text.trim() === "")) setText(formatNumber(value));
  }
  const sliderValue = Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : range.min;

  return (
    <div>
      <FieldLabel htmlFor={`${id}-number`}>{label}</FieldLabel>
      <div className="mt-1 flex items-center gap-3">
        <input
          aria-label={`${label} slider`}
          className="min-w-0 flex-1 accent-teal-700"
          max={range.max}
          min={range.min}
          onChange={(event) => onChange(Number(Number(event.target.value).toFixed(decimals(step))))}
          step={step}
          type="range"
          value={sliderValue}
        />
        <div className="flex shrink-0 items-center gap-1">
          <input
            aria-describedby={messages.length ? `${id}-messages` : undefined}
            aria-invalid={messages.length > 0}
            className={`w-20 rounded-md border px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-100 ${messages.length ? "border-red-400" : "border-slate-300 focus:border-teal-600"}`}
            id={`${id}-number`}
            max={range.max}
            min={range.min}
            onChange={(event) => {
              setText(event.target.value);
              onChange(event.target.value.trim() === "" ? Number.NaN : Number(event.target.value));
            }}
            step={step}
            type="number"
            value={text}
          />
          {unit && <span className="w-6 text-xs text-slate-500">{unit}</span>}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">From {range.min} to {range.max}{unit ? ` ${unit}` : ""}</p>
      <FieldMessages id={`${id}-messages`} messages={messages} />
    </div>
  );
}

/** A colour picker and a #RRGGBB text box kept in sync; an invalid hex is kept as typed and reported. */
export function ColorField({ label, value, onChange, messages = [], action }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  messages?: string[];
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={`${id}-hex`}>{label}</FieldLabel>
      <div className="mt-1 flex items-center gap-2">
        <input
          aria-label={`${label} picker`}
          className="h-9 w-11 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={HEX_PATTERN.test(value) ? value.toLowerCase() : "#000000"}
        />
        <input
          aria-describedby={messages.length ? `${id}-messages` : undefined}
          aria-invalid={messages.length > 0}
          className={`w-28 rounded-md border px-2 py-1.5 font-mono text-sm uppercase text-slate-900 outline-none focus:ring-2 focus:ring-teal-100 ${messages.length ? "border-red-400" : "border-slate-300 focus:border-teal-600"}`}
          id={`${id}-hex`}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.trim())}
          spellCheck={false}
          value={value}
        />
        {action}
      </div>
      <FieldMessages id={`${id}-messages`} messages={messages} />
    </div>
  );
}

/** A small set of mutually exclusive choices shown as a segmented control. */
export function ChoiceField<T extends string>({ label, value, choices, onChange, messages = [] }: {
  label: string;
  value: T;
  choices: { value: T; label: string }[];
  onChange: (value: T) => void;
  messages?: string[];
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-1 inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-0.5" role="radiogroup">
        {choices.map((choice) => (
          <label
            className={`cursor-pointer rounded px-3 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-300 ${choice.value === value ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            key={choice.value}
          >
            <input checked={choice.value === value} className="sr-only" name={id} onChange={() => onChange(choice.value)} type="radio" value={choice.value} />
            {choice.label}
          </label>
        ))}
      </div>
      <FieldMessages messages={messages} />
    </fieldset>
  );
}

const TOKEN_LABELS: Record<ColorToken, string> = { primary: "Primary", accent: "Accent", text: "Text", muted: "Muted" };

/** Picks one of the four colour tokens, each shown with the colour it currently stands for. */
export function TokenField({ label, value, colors, onChange, messages = [] }: {
  label: string;
  value: ColorToken;
  colors: Record<ColorToken, string>;
  onChange: (value: ColorToken) => void;
  messages?: string[];
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup">
        {(Object.keys(TOKEN_LABELS) as ColorToken[]).map((token) => (
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-300 ${token === value ? "border-teal-700 bg-teal-50 font-semibold text-teal-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            key={token}
          >
            <input checked={token === value} className="sr-only" name={id} onChange={() => onChange(token)} type="radio" value={token} />
            <span aria-hidden="true" className="h-4 w-4 rounded-sm ring-1 ring-slate-300" style={{ backgroundColor: HEX_PATTERN.test(colors[token]) ? colors[token] : "transparent" }} />
            {TOKEN_LABELS[token]}
          </label>
        ))}
      </div>
      <FieldMessages messages={messages} />
    </fieldset>
  );
}

export function ToggleField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: ReactNode }) {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input checked={checked} className="h-4 w-4 rounded border-slate-300 accent-teal-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        {label}
      </label>
      {hint && <p className="ml-6 mt-0.5 text-xs text-amber-800">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string>({ label, value, choices, onChange, messages = [] }: {
  label: string;
  value: T;
  choices: { value: T; label: string }[];
  onChange: (value: T) => void;
  messages?: string[];
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select className="field py-2 text-sm" id={id} onChange={(event) => onChange(event.target.value as T)} value={value}>
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
      <FieldMessages messages={messages} />
    </div>
  );
}

const ROLE_LABELS = { heading: "Heading", body: "Body", script: "Script" } as const;

/**
 * A font dropdown whose options are drawn in their own typeface and tagged with their role. A custom listbox,
 * because native <option> elements cannot show web fonts in every browser.
 */
export function FontPicker({ label, value, fonts, onChange, messages = [] }: {
  label: string;
  value: string;
  fonts: TemplateOptions["fonts"];
  onChange: (fontId: string) => void;
  messages?: string[];
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = fonts.find((font) => font.id === value);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  function open() {
    setActiveIndex(Math.max(0, fonts.findIndex((font) => font.id === value)));
    setIsOpen(true);
  }

  function choose(index: number) {
    onChange(fonts[index].id);
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(fonts.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(fonts.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(activeIndex); }
    else if (event.key === "Escape" || event.key === "Tab") { setIsOpen(false); if (event.key === "Escape") buttonRef.current?.focus(); }
  }

  return (
    <div className={`relative ${certificateFontClasses}`} ref={rootRef}>
      <span className="block text-sm font-medium text-slate-700" id={`${id}-label`}>{label}</span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label ${id}-button`}
        className={`mt-1 flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 ${messages.length ? "border-red-400" : "border-slate-300"}`}
        id={`${id}-button`}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); open(); } }}
        ref={buttonRef}
        type="button"
      >
        <span className="truncate text-base" style={{ fontFamily: certificateFontFamily(value) }}>{current?.label ?? value}</span>
        <span className="flex shrink-0 items-center gap-2">
          {current && <RoleTag role={current.role} />}
          <span aria-hidden="true" className="text-xs text-slate-500">▾</span>
        </span>
      </button>
      {isOpen && (
        <ul
          aria-activedescendant={`${id}-option-${activeIndex}`}
          aria-labelledby={`${id}-label`}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg outline-none"
          onKeyDown={handleListKeyDown}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
        >
          {fonts.map((font, index) => (
            <li
              aria-selected={font.id === value}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${index === activeIndex ? "bg-teal-50" : ""}`}
              id={`${id}-option-${index}`}
              key={font.id}
              onClick={() => choose(index)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <span className="truncate text-lg text-slate-900" style={{ fontFamily: certificateFontFamily(font.id) }}>{font.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                <RoleTag role={font.role} />
                {font.id === value && <span aria-hidden="true" className="text-sm text-teal-700">✓</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <FieldMessages messages={messages} />
    </div>
  );
}

function RoleTag({ role }: { role: keyof typeof ROLE_LABELS }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-slate-600">{ROLE_LABELS[role]}</span>;
}

/**
 * A design text (title, body or footer) with an "Insert placeholder" menu that inserts {{name}} at the cursor,
 * and a live character counter against the limit. Line breaks cannot be typed; pasted ones are reported.
 */
export function PlaceholderTextField({ label, value, onChange, maxLength, placeholders, multiline = false, messages = [] }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholders: TemplateOptions["placeholders"];
  multiline?: boolean;
  messages?: string[];
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const over = value.length > maxLength;

  function insert(name: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const token = `{{${name}}}`;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const shared = {
    "aria-describedby": `${id}-count${messages.length ? ` ${id}-messages` : ""}`,
    "aria-invalid": messages.length > 0,
    className: `field text-sm ${messages.length ? "border-red-400" : ""}`,
    id,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    ref: inputRef,
    spellCheck: true,
    value,
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <select
          aria-label={`Insert placeholder into ${label.toLowerCase()}`}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
          onChange={(event) => { if (event.target.value) insert(event.target.value); event.target.value = ""; }}
          value=""
        >
          <option value="">Insert placeholder…</option>
          {placeholders.map((placeholder) => <option key={placeholder.name} value={placeholder.name}>{placeholder.label}</option>)}
        </select>
      </div>
      {multiline
        ? <textarea {...shared} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} rows={5} />
        : <input {...shared} />}
      <p className={`mt-0.5 text-right text-xs ${over ? "font-semibold text-red-700" : "text-slate-500"}`} id={`${id}-count`}>{value.length} / {maxLength} characters</p>
      <FieldMessages id={`${id}-messages`} messages={messages} />
    </div>
  );
}
