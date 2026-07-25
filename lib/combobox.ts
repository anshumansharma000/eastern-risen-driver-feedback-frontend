export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
};

function searchableText(option: ComboboxOption) {
  return [option.label, option.description, option.keywords].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function filterComboboxOptions(options: ComboboxOption[], query: string, selectedLabel?: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || selectedLabel === query) return options;
  return options.filter((option) => searchableText(option).includes(needle));
}
