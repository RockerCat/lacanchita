"use client";

import { useContext, useId } from "react";
import { FormContext } from "@/components/form-context";

export const inputClass =
  "h-11 w-full rounded-xl border bg-surface-deep px-3 text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60";
const ok = "border-line focus:border-cancha/60 focus:ring-cancha/10";
const bad = "border-danger/60 focus:border-danger focus:ring-danger/10";

type Common = { name: string; label: string; hint?: string; className?: string };

function Shell({ id, label, hint, error, className = "", children }: { id: string; label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="flex items-start gap-1 text-xs font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="text-xs text-fg-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function useField(name: string) {
  const { errors, values } = useContext(FormContext);
  const id = `${name}-${useId()}`;
  return { id, error: errors[name], value: values[name] };
}

type InputProps = Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "className" | "id">;

// Campo de texto/número con etiqueta, error junto al campo y valor conservado tras un error del servidor.
export function TextField({ name, label, hint, className, defaultValue, children, ...rest }: InputProps) {
  const { id, error, value } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        defaultValue={value ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${inputClass} ${error ? bad : ok}`}
        {...rest}
      />
      {children}
    </Shell>
  );
}

export function SelectField({ name, label, hint, className, defaultValue, children, ...rest }: Common & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "className" | "id">) {
  const { id, error, value } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        name={name}
        defaultValue={value ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${inputClass} ${error ? bad : ok}`}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
}

export function TextAreaField({ name, label, hint, className, defaultValue, ...rest }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "className" | "id">) {
  const { id, error, value } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        name={name}
        defaultValue={value ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${inputClass} h-auto py-2 ${error ? bad : ok}`}
        {...rest}
      />
    </Shell>
  );
}

export function CheckboxField({ name, label, defaultChecked, required, className = "" }: { name: string; label: string; defaultChecked?: boolean; required?: boolean; className?: string }) {
  const { id, value, error } = useField(name);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="flex items-start gap-2 text-sm text-fg-2">
        <input
          id={id}
          type="checkbox"
          name={name}
          required={required}
          aria-invalid={error ? true : undefined}
          defaultChecked={value !== undefined ? value === "on" : defaultChecked}
          className="mt-0.5 h-4 w-4 accent-[var(--lc-cancha)]"
        />
        <span>{label}</span>
      </label>
      {error && (
        <p className="flex items-start gap-1 text-xs font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// Archivo (p. ej. escudo): valida el tamaño en el navegador con mensaje propio; el servidor repite la validación.
export function FileField({ name, label, hint, accept, maxBytes, maxLabel, className }: Common & { accept: string; maxBytes: number; maxLabel: string }) {
  const { id, error } = useField(name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        type="file"
        required
        accept={accept}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        data-custom-message={`El archivo supera ${maxLabel}.`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.setCustomValidity(f && f.size > maxBytes ? "grande" : "");
        }}
        className={`block w-full rounded-xl border bg-surface-deep px-3 py-2 text-sm text-fg file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-fg ${error ? bad : ok}`}
      />
    </Shell>
  );
}
