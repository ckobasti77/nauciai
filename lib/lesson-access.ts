export function canUseProLesson(role: string | undefined, proEnabled = true) {
  return proEnabled && (role === "admin" || role === "moderator" || role === "pro_student");
}
