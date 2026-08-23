"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Check,
  ChevronDown,
  Folder,
  Layers,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { projectErrorMessage } from "@/lib/studio-messages";
import { cn } from "@/components/ui/primitives";

export type StudioProjectItem = {
  _id: Id<"studioProjects">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  generationCount: number;
};

export function ProjectPicker({
  locale,
  activeProjectId,
  onSelectProject,
}: {
  locale: Locale;
  activeProjectId: Id<"studioProjects"> | null;
  onSelectProject: (projectId: Id<"studioProjects"> | null) => void;
}) {
  const projects = useQuery(api.studioProjects.listMyProjects, {});
  const createProject = useMutation(api.studioProjects.createProject);
  const renameProject = useMutation(api.studioProjects.renameProject);
  const archiveProject = useMutation(api.studioProjects.archiveProject);

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<Id<"studioProjects"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Samo aktivni (nearhivirani) projekti se prikazuju u biraču
  const activeProjects = (projects ?? []).filter((p) => p.archivedAt === undefined);
  const activeProject = activeProjects.find((p) => p._id === activeProjectId);

  // Ako je izabrani projekat u međuvremenu arhiviran ili ne postoji, resetuj na null
  useEffect(() => {
    if (activeProjectId && projects !== undefined) {
      const found = activeProjects.find((p) => p._id === activeProjectId);
      if (!found) {
        onSelectProject(null);
      }
    }
  }, [activeProjectId, projects, activeProjects, onSelectProject]);

  // Klik van dropdown-a ili Escape zatvara meni
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingProjectId(null);
        setErrorMessage(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isCreating) {
          setIsCreating(false);
          setErrorMessage(null);
        } else if (editingProjectId) {
          setEditingProjectId(null);
          setErrorMessage(null);
        } else {
          setIsOpen(false);
          setErrorMessage(null);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isCreating, editingProjectId]);

  // Fokus na input kad se otvori kreiranje
  useEffect(() => {
    if (isCreating) {
      createInputRef.current?.focus();
    }
  }, [isCreating]);

  // Fokus na input kad se otvori preimenovanje
  useEffect(() => {
    if (editingProjectId) {
      editInputRef.current?.focus();
    }
  }, [editingProjectId]);

  async function handleCreate() {
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setErrorMessage(projectErrorMessage("PROJEKAT_BEZ_IMENA", locale));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const newId = await createProject({ name: trimmed });
      setNewProjectName("");
      setIsCreating(false);
      onSelectProject(newId);
      setIsOpen(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setErrorMessage(projectErrorMessage(raw, locale));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename(projectId: Id<"studioProjects">) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMessage(projectErrorMessage("PROJEKAT_BEZ_IMENA", locale));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await renameProject({ projectId, name: trimmed });
      setEditingProjectId(null);
      setEditingName("");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setErrorMessage(projectErrorMessage(raw, locale));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchive(projectId: Id<"studioProjects">, event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await archiveProject({ projectId });
      if (activeProjectId === projectId) {
        onSelectProject(null);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setErrorMessage(projectErrorMessage(raw, locale));
    }
  }

  const allGenerationsLabel = locale === "sr" ? "Sve generacije" : "All generations";
  const newProjectLabel = locale === "sr" ? "Nov projekat" : "New project";
  const activeLabel = activeProject ? activeProject.name : allGenerationsLabel;

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      {/* Okidač: Ime aktivnog projekta ili "Sve generacije" */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setErrorMessage(null);
          setIsCreating(false);
          setEditingProjectId(null);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={locale === "sr" ? `Projekat: ${activeLabel}` : `Project: ${activeLabel}`}
        className={cn(
          "inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-black transition cursor-pointer studio-focus-ink",
          activeProject
            ? "bg-yellow text-ink shadow-[2px_2px_0_0_var(--ink)]"
            : "bg-paper-strong text-ink hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--shadow-hard)]",
        )}
      >
        {activeProject ? (
          <Folder className="size-3.5 shrink-0" />
        ) : (
          <Layers className="size-3.5 shrink-0" />
        )}
        <span className="max-w-[140px] truncate sm:max-w-[200px]">{activeLabel}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-180")} />
      </button>

      {/* Padajući meni */}
      {isOpen && (
        <div className="surface-card absolute right-0 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] border-2 border-ink bg-paper-strong p-2 shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          {/* Greška unutar dropdown-a ako postoji */}
          {errorMessage && (
            <div className="surface-inset mb-2 border border-red-500 bg-red-500/10 p-2 text-xs font-bold text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          {/* Podrazumevana opcija: Sve generacije */}
          <button
            type="button"
            onClick={() => {
              onSelectProject(null);
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full min-h-9 items-center justify-between gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold transition cursor-pointer studio-focus-ink",
              activeProjectId === null
                ? "bg-yellow text-ink font-black shadow-[2px_2px_0_0_var(--ink)]"
                : "text-ink hover:bg-paper",
            )}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Layers className="size-3.5 shrink-0" />
              <span className="truncate">{allGenerationsLabel}</span>
            </span>
            {activeProjectId === null && <Check className="size-3.5 shrink-0" />}
          </button>

          <div className="my-1.5 h-px w-full bg-ink/10" />

          {/* Lista korisničkih projekata */}
          <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
            {projects === undefined ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="size-4 animate-spin text-muted" />
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs font-bold text-muted">
                {locale === "sr" ? "Nema kreiranih projekata" : "No projects created yet"}
              </div>
            ) : (
              activeProjects.map((p) => {
                const isSelected = activeProjectId === p._id;
                const isEditing = editingProjectId === p._id;

                if (isEditing) {
                  return (
                    <div
                      key={p._id}
                      className="surface-inset flex items-center gap-1 border-2 border-ink bg-paper p-1"
                    >
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(p._id);
                          if (e.key === "Escape") setEditingProjectId(null);
                        }}
                        disabled={isSubmitting}
                        maxLength={60}
                        className="h-7 w-full bg-transparent px-2 text-xs font-extrabold text-ink outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(p._id)}
                        disabled={isSubmitting}
                        title={locale === "sr" ? "Sačuvaj" : "Save"}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink bg-yellow text-ink shadow-[1px_1px_0_0_var(--ink)] cursor-pointer"
                      >
                        {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProjectId(null)}
                        disabled={isSubmitting}
                        title={locale === "sr" ? "Odustani" : "Cancel"}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink bg-paper text-ink cursor-pointer"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={p._id}
                    onClick={() => {
                      onSelectProject(p._id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "group flex min-h-9 w-full items-center justify-between gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition cursor-pointer studio-focus-ink",
                      isSelected
                        ? "bg-yellow text-ink font-black shadow-[2px_2px_0_0_var(--ink)]"
                        : "text-ink hover:bg-paper",
                    )}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 truncate">
                      <Folder className="size-3.5 shrink-0 text-ink/70" />
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-[10px] text-muted">
                        ({p.generationCount})
                      </span>
                    </span>

                    {/* Akcije uz svaki projekat: preimenuj i arhiviraj */}
                    <div className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProjectId(p._id);
                          setEditingName(p.name);
                          setErrorMessage(null);
                        }}
                        title={locale === "sr" ? "Preimenuj" : "Rename"}
                        className="inline-flex size-6 items-center justify-center rounded-full text-ink hover:bg-ink/10 cursor-pointer"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleArchive(p._id, e)}
                        title={locale === "sr" ? "Arhiviraj" : "Archive"}
                        className="inline-flex size-6 items-center justify-center rounded-full text-ink hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                      >
                        <Archive className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="my-1.5 h-px w-full bg-ink/10" />

          {/* Inline forma za nov projekat */}
          {isCreating ? (
            <div className="surface-inset mt-1 flex items-center gap-1 border-2 border-ink bg-paper p-1">
              <input
                ref={createInputRef}
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setErrorMessage(null);
                  }
                }}
                placeholder={locale === "sr" ? "Ime projekta…" : "Project name…"}
                disabled={isSubmitting}
                maxLength={60}
                className="h-7 w-full bg-transparent px-2 text-xs font-extrabold text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={isSubmitting}
                title={locale === "sr" ? "Napravi" : "Create"}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink bg-yellow text-ink shadow-[1px_1px_0_0_var(--ink)] cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setErrorMessage(null);
                }}
                disabled={isSubmitting}
                title={locale === "sr" ? "Odustani" : "Cancel"}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink bg-paper text-ink cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsCreating(true);
                setNewProjectName("");
                setErrorMessage(null);
              }}
              className="flex w-full min-h-9 items-center gap-2 rounded-full border-2 border-dashed border-ink/30 px-3 py-1.5 text-xs font-black text-ink transition hover:border-ink hover:bg-paper cursor-pointer studio-focus-ink"
            >
              <Plus className="size-3.5 shrink-0" />
              <span>{newProjectLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
