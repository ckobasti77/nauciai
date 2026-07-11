export type PasswordRequirement = {
  id: "length" | "uppercase" | "number" | "special";
  labelSr: string;
  labelEn: string;
  test: (password: string) => boolean;
};

export const passwordRequirements: PasswordRequirement[] = [
  {
    id: "length",
    labelSr: "Najmanje 8 karaktera",
    labelEn: "At least 8 characters",
    test: (password) => password.length >= 8,
  },
  {
    id: "uppercase",
    labelSr: "Jedno veliko slovo",
    labelEn: "One uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    labelSr: "Jedan broj",
    labelEn: "One number",
    test: (password) => /\d/.test(password),
  },
  {
    id: "special",
    labelSr: "Jedan specijalni znak",
    labelEn: "One special character",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
];

export function passwordValidationErrors(password: string) {
  return passwordRequirements.filter((requirement) => !requirement.test(password));
}

export function isStrongPassword(password: string) {
  return passwordValidationErrors(password).length === 0;
}
