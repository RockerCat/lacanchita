"use client";

import { createContext } from "react";

// Estado de validación que ActionForm comparte con sus campos (errores por campo y valores a conservar).
export type FormContextValue = { errors: Record<string, string>; values: Record<string, string> };
export const FormContext = createContext<FormContextValue>({ errors: {}, values: {} });
