// Specific user IDs granted scoped admin capabilities outside their role.
// Keep this list short — every entry is an exception to role-based access.

// Maida (Sargodha Incharge) — can toggle per-lesson "requires submission".
export const COURSE_MANDATORY_EDITOR_IDS: string[] = [
  "1152f132-7263-481e-9ecd-ed86ecc4bf0b",
];

// Users granted full CEO-level course authoring (create, edit, upload media,
// publish). Implies COURSE_MANDATORY_EDITOR_IDS access.
export const COURSE_AUTHOR_IDS: string[] = [
  "1152f132-7263-481e-9ecd-ed86ecc4bf0b", // Maida
];

export function canEditCourseMandatory(
  userId: string | undefined,
  roles: string[],
): boolean {
  if (roles.includes("ceo")) return true;
  if (userId && COURSE_MANDATORY_EDITOR_IDS.includes(userId)) return true;
  if (userId && COURSE_AUTHOR_IDS.includes(userId)) return true;
  return false;
}

export function canAuthorCourses(
  userId: string | undefined,
  roles: string[],
): boolean {
  if (roles.includes("ceo")) return true;
  if (userId && COURSE_AUTHOR_IDS.includes(userId)) return true;
  return false;
}
