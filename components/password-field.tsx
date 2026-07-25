"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function PasswordField({ id, label, required = true, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}{!required && " (optional)"}</label>
      <div className="password-input">
        <input
          {...props}
          className="input"
          id={inputId}
          type={visible ? "text" : "password"}
          required={required}
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5 9 5a17 17 0 0 1-2.2 2.6M6.6 6.7A17.3 17.3 0 0 0 3 9s3.5 5 9 5c1 0 2-.2 2.8-.5" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
