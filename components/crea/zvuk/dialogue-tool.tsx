"use client";

import { MessagesSquare } from "lucide-react";
import { useState } from "react";

import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { DialogueEditor } from "@/components/crea/zvuk/dialogue-editor";
import { emptyDialogue } from "@/lib/crea-dialogue";

/** Dijalog i podkast (Crea K22, A5): do 10 govornika, plaća se samo izmenjena replika. */
export default function DialogueTool({ tool, locale, canSave, projectId, paid }: CreaToolProps) {
  const [initial] = useState(emptyDialogue);
  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<MessagesSquare aria-hidden="true" className="size-5" />} />
      <div className="mt-5 border-t border-line pt-5">
        <DialogueEditor locale={locale} canSave={canSave} projectId={projectId} paid={paid} toolId={tool.id} storageKey="crea-dijalog-v1" initial={initial} preferDraft />
      </div>
    </section>
  );
}
