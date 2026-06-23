import {
  forwardRef,
  useCallback,
  useState,
  useMemo,
  useRef,
} from "preact/compat";
import { Phone, ChevronDown, Check, X } from "lucide-preact";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js/min";

import { Icon } from "@/shared/ui/Icon";
import { cn } from "@/shared/utils/cn";
import { useUniqueId } from "@/shared/hooks/useUniqueId";

interface CountryEntry {
  iso: CountryCode;
  name: string;
  callingCode: string;
}

const regionNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

let cachedCountries: CountryEntry[] | null = null;
const getCountryList = (): CountryEntry[] => {
  if (cachedCountries) return cachedCountries;
  cachedCountries = getCountries()
    .map(
      (iso): CountryEntry => ({
        iso,
        name: regionNames?.of(iso) ?? iso,
        callingCode: getCountryCallingCode(iso),
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
};

// When a calling code maps to multiple countries (e.g. +1 → US, CA, JM…), pick
// the most common default so the picker doesn't surprise users.
const callingCodeDefaults: Record<string, CountryCode> = {
  "1": "US",
  "7": "RU",
  "44": "GB",
  "47": "NO",
  "358": "FI",
  "590": "GP",
  "599": "CW",
};

const isIsoCode = (value: string): value is CountryCode =>
  /^[A-Z]{2}$/.test(value);

const resolveIsoFromProp = (input?: string): CountryCode => {
  if (!input) return "US";
  if (isIsoCode(input)) return input;
  if (input.startsWith("+")) {
    const digits = input.slice(1).replace(/\D/g, "");
    if (digits && callingCodeDefaults[digits])
      return callingCodeDefaults[digits];
    if (digits) {
      const match = getCountryList().find((c) => c.callingCode === digits);
      if (match) return match.iso;
    }
  }
  return "US";
};

const detectIsoFromValue = (
  value: string,
  fallback: CountryCode,
): CountryCode => {
  if (!value) return fallback;
  const parsed = parsePhoneNumberFromString(value);
  if (parsed?.country) return parsed.country;
  if (value.trimStart().startsWith("+")) {
    const trimmed = value.trimStart().slice(1);
    const digitMatch = trimmed.match(/^(\d{1,4})/);
    if (digitMatch) {
      const digits = digitMatch[1];
      for (let len = digits.length; len > 0; len -= 1) {
        const slice = digits.slice(0, len);
        if (callingCodeDefaults[slice]) return callingCodeDefaults[slice];
        const match = getCountryList().find((c) => c.callingCode === slice);
        if (match) return match.iso;
      }
    }
  }
  return fallback;
};

const extractNationalPart = (value: string, iso: CountryCode): string => {
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(value, iso);
  if (parsed) return parsed.formatNational();
  const trimmed = value.trimStart();
  if (trimmed.startsWith("+")) {
    return trimmed.slice(1).replace(/^\d{1,4}\s*/, "");
  }
  return value;
};

const formatNationalDisplay = (raw: string, iso: CountryCode): string => {
  if (!raw) return "";
  return new AsYouType(iso).input(raw);
};

const buildEmittedValue = (
  national: string,
  iso: CountryCode,
  withCountryCode: boolean,
): string => {
  const trimmed = national.trim();
  if (!trimmed) return "";
  if (!withCountryCode) return trimmed;
  return `+${getCountryCallingCode(iso)} ${trimmed}`;
};

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "error" | "success";
  label?: string;
  description?: string;
  error?: string;
  /**
   * Initial / preferred country. Accepts an ISO alpha-2 code ('US', 'GB') or
   * a legacy calling-code form ('+1'). When the bound `value` already
   * carries a country prefix, the parsed country wins over this prop.
   */
  countryCode?: string;
  /** Fires with the selected ISO alpha-2 country code. */
  onCountryChange?: (iso: CountryCode) => void;
  showCountryCode?: boolean;
  /** No-op when showCountryCode=true (AsYouType always formats). Retained for back-compat. */
  format?: boolean;
  /** When true, render an inline check/X icon based on isValidPhoneNumber. */
  showValidation?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  "data-testid"?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value = "",
      onChange,
      placeholder,
      disabled = false,
      required = false,
      className = "",
      size = "md",
      variant = "default",
      label,
      description,
      error,
      countryCode,
      onCountryChange,
      showCountryCode = true,
      format: _format = true,
      showValidation = false,
      labelKey: _labelKey,
      descriptionKey: _descriptionKey,
      placeholderKey: _placeholderKey,
      errorKey: _errorKey,
      namespace: _namespace = "common",
      id,
      name,
      "data-testid": dataTestId,
    },
    ref,
  ) => {
    const inputElementRef = useRef<HTMLInputElement>(null);
    const countries = useMemo(() => getCountryList(), []);
    const propIso = useMemo(
      () => resolveIsoFromProp(countryCode),
      [countryCode],
    );
    const detectedIso = useMemo(
      () => detectIsoFromValue(value, propIso),
      [value, propIso],
    );
    const [manualIso, setManualIso] = useState<CountryCode | null>(null);
    const selectedIso = manualIso ?? detectedIso;

    const currentCountry = useMemo(
      () =>
        countries.find((c) => c.iso === selectedIso) ??
        countries.find((c) => c.iso === "US") ??
        countries[0],
      [countries, selectedIso],
    );

    const nationalPart = useMemo(
      () => extractNationalPart(value, selectedIso),
      [value, selectedIso],
    );
    const displayValue = useMemo(
      () => formatNationalDisplay(nationalPart, selectedIso),
      [nationalPart, selectedIso],
    );

    const handleCountryChange = useCallback(
      (event: Event) => {
        const target = event.target as HTMLSelectElement;
        const nextIso = target.value as CountryCode;
        setManualIso(nextIso);
        onCountryChange?.(nextIso);
        const nextValue = buildEmittedValue(
          nationalPart,
          nextIso,
          showCountryCode,
        );
        onChange?.(nextValue);
      },
      [nationalPart, onChange, onCountryChange, showCountryCode],
    );

    const handleInput = useCallback(
      (event: Event) => {
        const target = event.target as HTMLInputElement;
        const rawValue = target.value;
        const startsWithPlus = rawValue.trimStart().startsWith("+");

        const nextIso = startsWithPlus
          ? detectIsoFromValue(rawValue, selectedIso)
          : selectedIso;
        if (startsWithPlus && manualIso !== null) {
          setManualIso(null);
        }

        const nextNational = startsWithPlus
          ? extractNationalPart(rawValue, nextIso)
          : rawValue;
        const nextValue = showCountryCode
          ? buildEmittedValue(nextNational, nextIso, true)
          : formatNationalDisplay(rawValue, nextIso);
        onChange?.(nextValue);
      },
      [manualIso, onChange, selectedIso, showCountryCode],
    );

    const generatedId = useUniqueId("phone-input");
    const baseId = id || generatedId;
    const inputId = baseId;
    const descriptionId = `${baseId}-description`;
    const errorId = `${baseId}-error`;
    const validationErrorId = `${baseId}-validation-error`;

    const controlHeightClasses = {
      sm: "h-8",
      md: "h-10",
      lg: "h-12",
    } as const;

    const selectClasses = {
      sm: "w-[5.25rem] text-xs pl-2 pr-5",
      md: "w-[5.75rem] text-sm pl-3 pr-6",
      lg: "w-[6.25rem] text-base pl-3 pr-7",
    } as const;

    const inputSizeClasses = {
      sm: "px-2 py-1 text-sm",
      md: "px-3 py-1.5 text-sm",
      lg: "px-4 py-2 text-base",
    } as const;

    const iconPaddingClasses = {
      sm: "pl-8",
      md: "pl-10",
      lg: "pl-12",
    } as const;

    const rightIconPaddingClasses = {
      sm: "pr-8",
      md: "pr-10",
      lg: "pr-12",
    } as const;

    const variantClasses = {
      default: "",
      error: "is-error",
      success: "is-success",
    } as const;

    const trimmedValue = (value ?? "").trim();
    const validationIsValid = useMemo(() => {
      if (!trimmedValue) return null;
      try {
        return isValidPhoneNumber(trimmedValue, selectedIso);
      } catch {
        return false;
      }
    }, [trimmedValue, selectedIso]);
    const showInvalidValidation =
      showValidation && trimmedValue.length > 0 && validationIsValid === false;
    const isInvalid = Boolean(error) || showInvalidValidation;

    const inputClasses = cn(
      "w-full h-full rounded-none border-0 bg-transparent text-ink placeholder:text-dim-2",
      "focus:outline-none transition-all duration-200",
      inputSizeClasses[size],
      showCountryCode ? null : iconPaddingClasses[size],
      showValidation && trimmedValue.length > 0
        ? rightIconPaddingClasses[size]
        : null,
      "disabled:cursor-not-allowed",
    );

    const controlClasses = cn(
      "flex flex-nowrap items-stretch w-full overflow-hidden border focus-within:ring-2 ring-inset focus-within:ring-accent/30",
      controlHeightClasses[size],
      variantClasses[variant],
      isInvalid && "is-error",
      disabled && "opacity-50 cursor-not-allowed",
      className,
    );

    const placeholderForDisplay = useMemo(() => {
      if (!placeholder) return placeholder;
      if (!showCountryCode) return placeholder;
      const stripped = placeholder.replace(/^\s*\+\d{1,4}\s*/, "");
      return stripped || placeholder;
    }, [placeholder, showCountryCode]);

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputElementRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as { current: HTMLInputElement | null }).current = node;
        }
      },
      [ref],
    );

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label mb-1.5 block">
            {label}
            {required && (
              <span className="text-neg ml-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div
          className={controlClasses}
          style={{
            background: "var(--card)",
            borderColor: "var(--rule)",
            borderRadius: "var(--r-xs)",
          }}
        >
          {showCountryCode && (
            <div
              className="grid shrink-0 grid-cols-1 border-r"
              style={{
                borderRightColor:
                  "color-mix(in oklab, var(--rule) 58%, transparent)",
              }}
            >
              <select
                name={`${name ?? inputId}-country`}
                aria-label="Country"
                value={currentCountry.iso}
                onChange={handleCountryChange}
                disabled={disabled}
                className={cn(
                  "col-start-1 row-start-1 h-full appearance-none rounded-none bg-transparent text-ink whitespace-nowrap focus:outline-none",
                  selectClasses[size],
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {countries.map((country) => (
                  <option key={country.iso} value={country.iso}>
                    {country.iso} +{country.callingCode}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none col-start-1 row-start-1 mr-1.5 self-center justify-self-end w-3 h-3 text-dim-2"
                aria-hidden="true"
              />
            </div>
          )}

          <label
            className="relative flex-1 min-w-0"
          >
            {!showCountryCode ? (
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Phone
                  className="w-4 h-4 text-dim-2 shrink-0"
                  aria-hidden="true"
                />
              </div>
            ) : null}

            <input
              ref={setInputRef}
              id={inputId}
              name={name}
              type="tel"
              autoComplete="tel"
              value={displayValue}
              onInput={handleInput}
              placeholder={placeholderForDisplay}
              disabled={disabled}
              required={required}
              aria-required={required}
              aria-invalid={isInvalid ? "true" : undefined}
              aria-describedby={
                error
                  ? errorId
                  : showInvalidValidation
                    ? validationErrorId
                    : description
                      ? descriptionId
                      : undefined
              }
              data-testid={dataTestId}
              className={cn(inputClasses, "cursor-text leading-normal")}
            />

            {showValidation && trimmedValue.length > 0 && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                {validationIsValid ? (
                  <Icon icon={Check} className="w-4 h-4 text-pos" />
                ) : (
                  <Icon icon={X} className="w-4 h-4 text-neg" />
                )}
              </div>
            )}
          </label>
        </div>

        {error && (
          <p
            id={errorId}
            className="text-xs text-red-600 dark:text-red-400 mt-1"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        {showInvalidValidation && !error && (
          <p
            id={validationErrorId}
            className="text-xs text-red-600 dark:text-red-400 mt-1"
          >
            Please enter a valid phone number for {currentCountry.name}
          </p>
        )}

        {description && !error && !showInvalidValidation && (
          <p id={descriptionId} className="text-xs text-dim-2 mt-1">
            {description}
          </p>
        )}
      </div>
    );
  },
);
