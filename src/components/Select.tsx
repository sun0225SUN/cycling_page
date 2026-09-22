import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

export type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  'aria-label'?: string;
  className?: string;
};

export function Select({
  value,
  options,
  onChange,
  label,
  'aria-label': ariaLabel,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const item = listRef.current?.children[activeIndex] as
      HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const choose = (next: string) => {
    onChange(next);
    close();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      if (!open) openMenu();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, Math.max(0, i) + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, (i < 0 ? selectedIndex : i) - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.value);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={rootRef} className={`relative inline-flex flex-col ${className}`}>
      {label && (
        <span className="mb-1.5 text-xs font-medium tracking-wide text-[var(--color-muted)]">
          {label}
        </span>
      )}
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className="bento-select-trigger inline-flex min-w-[7.5rem] items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[var(--color-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          onKeyDown={onListKeyDown}
          className="bento-select-menu absolute top-[calc(100%+6px)] right-0 z-50 flex max-h-64 min-w-full flex-col gap-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] focus:outline-none dark:shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-accent)] font-semibold text-[var(--color-on-accent)]'
                    : isActive
                      ? 'bg-[var(--color-pill)] text-[var(--color-text)]'
                      : 'hover-bg-pill text-[var(--color-text)]'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <svg
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
