export type ContentSelection = { trackId: string; courseId: string; lessonId: string };

export function changeContentSelection(
  current: ContentSelection,
  level: "track" | "course" | "lesson",
  id: string,
): ContentSelection {
  if (level === "track") return { trackId: id, courseId: "", lessonId: "" };
  if (level === "course") return { ...current, courseId: id, lessonId: "" };
  return { ...current, lessonId: id };
}
