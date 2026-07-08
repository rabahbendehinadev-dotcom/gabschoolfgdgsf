import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

interface PhoneNumberInputProps {
  value?: string;
  onChange: (value?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function PhoneNumberInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id,
}: PhoneNumberInputProps) {
  return (
    <div dir="ltr" className={cn("app-phone-input", className)}>
      <PhoneInput
        id={id}
        international
        defaultCountry="DZ"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        countrySelectProps={{ "aria-label": "Country" }}
        numberInputProps={{ inputMode: "tel" }}
      />
    </div>
  );
}
