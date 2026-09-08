"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "@/convex/mcp/apiKey";
import { apiKeysContent, withLocale, type Locale } from "@/lib/i18n";

type KeyRow = {
  keyId: Id<"mcpApiKeys">;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

/** Dve ponude u UI-ju, ne slobodan izbor opsega: write uvek nosi i read. */
const SCOPE_CHOICES = {
  read: [MCP_SCOPE_READ],
  readWrite: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
} as const;
type ScopeChoice = keyof typeof SCOPE_CHOICES;

function formatDate(timestamp: number, locale: Locale) {
  // `sr-Latn-RS`, ne `sr-RS`: podrazumevani srpski je ćirilica, a UI je latinica.
  return new Date(timestamp).toLocaleDateString(locale === "sr" ? "sr-Latn-RS" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ScopeBadges({ scopes, locale }: { scopes: string[]; locale: Locale }) {
  const t = apiKeysContent[locale];

  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {scopes.map((scope) => (
        <Badge key={scope} size="sm" tone={scope === MCP_SCOPE_WRITE ? "yellow" : "neutral"}>
          {scope === MCP_SCOPE_WRITE ? t.scopeWrite : scope === MCP_SCOPE_READ ? t.scopeRead : scope}
        </Badge>
      ))}
    </span>
  );
}

function KeyRowItem({ row, locale, onRevoke }: { row: KeyRow; locale: Locale; onRevoke: () => void }) {
  const t = apiKeysContent[locale];
  const revoked = row.revokedAt !== null;

  return (
    <li className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between", revoked && "opacity-60")}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-h4 text-ink">{row.name}</span>
          {revoked ? (
            <Badge size="sm" tone="muted">
              {t.revoked}
            </Badge>
          ) : (
            <ScopeBadges scopes={row.scopes} locale={locale} />
          )}
        </div>
        <p className="font-mono text-sm font-bold text-ink">
          {row.prefix}
          <span aria-hidden="true">••••••••</span>
          <span className="sr-only"> ({t.prefixHint})</span>
        </p>
        <p className="type-caption font-semibold text-muted">
          {t.created} {formatDate(row.createdAt, locale)} · {t.lastUsed}:{" "}
          {row.lastUsedAt === null ? t.neverUsed : formatDate(row.lastUsedAt, locale)}
        </p>
      </div>
      {revoked ? null : (
        <Button variant="secondary" size="sm" icon={<Trash2 className="size-3.5" />} onClick={onRevoke} className="shrink-0 self-start sm:self-center">
          {t.revoke}
        </Button>
      )}
    </li>
  );
}

function ScopeOption({
  name,
  value,
  checked,
  title,
  body,
  onChange,
}: {
  name: string;
  value: ScopeChoice;
  checked: boolean;
  title: string;
  body: string;
  onChange: (value: ScopeChoice) => void;
}) {
  return (
    // Kontrola u obliku kartice: radijus se piše ručno jer `@layer base` daje
    // pilulu svakom `<label>` bez `rounded-*` (vidi AGENTS.md).
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[12px] border-2 px-4 py-3 transition",
        checked ? "border-ink bg-yellow/30" : "border-line bg-paper hover:border-ink",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
      />
      <span className="min-w-0">
        <span className="block type-body-sm font-black text-ink">{title}</span>
        <span className="mt-0.5 block type-caption font-semibold text-muted">{body}</span>
      </span>
    </label>
  );
}

function CreateKeyDialog({
  locale,
  open,
  onClose,
  onCreated,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onCreated: (created: { key: string; name: string }) => void;
}) {
  const t = apiKeysContent[locale];
  const createKey = useMutation(api.mcpKeys.createKey);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<ScopeChoice>("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setChoice("read");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createKey({ name: name.trim(), scopes: [...SCOPE_CHOICES[choice]] });
      reset();
      onCreated({ key: created.key, name: name.trim() });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setError(raw.includes("NEISPRAVNO_IME") ? t.invalidName : t.genericError);
    } finally {
      setBusy(false);
    }
  }

  const formId = "api-key-create-form";

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
      title={t.createTitle}
      description={t.createBody}
      closeLabel={t.close}
      size="md"
      dismissOnScrim={!busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy} icon={<KeyRound className="size-4" />}>
            {t.create}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <Field label={t.nameLabel} error={error ?? undefined}>
          {(field) => (
            <Input
              {...field}
              data-dialog-initial-focus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={64}
              required
              autoComplete="off"
            />
          )}
        </Field>
        <fieldset className="space-y-2">
          <legend className="type-body-sm font-black text-ink">{t.scopeLabel}</legend>
          <div className="mt-2 grid gap-2">
            <ScopeOption
              name="scope"
              value="read"
              checked={choice === "read"}
              title={t.readOnlyTitle}
              body={t.readOnlyBody}
              onChange={setChoice}
            />
            <ScopeOption
              name="scope"
              value="readWrite"
              checked={choice === "readWrite"}
              title={t.readWriteTitle}
              body={t.readWriteBody}
              onChange={setChoice}
            />
          </div>
          {choice === "readWrite" ? (
            <p role="note" className="flex items-start gap-2 rounded-[12px] bg-yellow/30 px-4 py-3 type-body-sm font-bold text-ink">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{t.writeWarning}</span>
            </p>
          ) : null}
        </fieldset>
      </form>
    </Dialog>
  );
}

function RevealKeyDialog({
  locale,
  revealed,
  onClose,
}: {
  locale: Locale;
  revealed: { key: string; name: string } | null;
  onClose: () => void;
}) {
  const t = apiKeysContent[locale];
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.key);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  function close() {
    setCopied(false);
    setCopyError(false);
    onClose();
  }

  return (
    // Bez zatvaranja klikom na pozadinu: ključ se vidi jednom, pa zatvaranje mora
    // da bude svesno - dugmetom ili Escape-om.
    <Dialog
      open={revealed !== null}
      onClose={close}
      title={t.createdTitle}
      eyebrow={revealed?.name}
      description={t.createdBody}
      closeLabel={t.close}
      size="md"
      dismissOnScrim={false}
      footer={
        <div className="flex justify-end">
          <Button onClick={close} icon={<Check className="size-4" />}>
            {t.done}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <code className="block select-all break-all rounded-[12px] border border-line bg-paper px-4 py-3 font-mono text-sm font-bold text-ink">
          {revealed?.key}
        </code>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={copy} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}>
            {copied ? t.copied : t.copy}
          </Button>
          {copyError ? <p role="alert" className="type-caption font-black text-red-700">{t.copyFailed}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}

export function ApiKeysPage({ locale }: { locale: Locale }) {
  const t = apiKeysContent[locale];
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const keys = useQuery(api.mcpKeys.listMyKeys, isAuthenticated ? {} : "skip");
  const revokeKey = useMutation(api.mcpKeys.revokeKey);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function confirmRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    setRevokeError(null);
    try {
      await revokeKey({ keyId: revoking.keyId });
      setRevoking(null);
    } catch {
      setRevokeError(t.genericError);
    } finally {
      setRevokeBusy(false);
    }
  }

  const header = (
    <div className="space-y-3">
      <Link
        href={withLocale(locale, "/app/profile")}
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-extrabold text-muted hover:text-ink hover:underline focus-visible:outline-2 outline-offset-2 outline-ink"
      >
        <ArrowLeft className="size-4" />
        {t.backToProfile}
      </Link>
      <SectionHeader variant="app" underline title={t.title} body={t.body} />
    </div>
  );

  if (authLoading || (isAuthenticated && keys === undefined)) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="flex min-h-32 items-center justify-center p-6">
          <Spinner size="md" label={t.title} className="text-muted" />
        </Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        {header}
        <Panel className="p-6">
          <p className="type-body type-measure font-bold text-muted">{t.signIn}</p>
          <Link
            href={withLocale(locale, "/sign-in")}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-paper-strong shadow-[4px_4px_0_0_var(--yellow)] transition hover:-translate-y-0.5"
          >
            {t.signInCta}
          </Link>
        </Panel>
      </div>
    );
  }

  const rows = keys ?? [];

  return (
    <div className="space-y-6">
      {header}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-4">
          <span className="inline-flex items-center gap-2 type-h3 text-ink">
            <KeyRound className="size-5" aria-hidden="true" />
            {t.title}
          </span>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            {t.newKey}
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={KeyRound}
              title={t.emptyTitle}
              body={t.emptyBody}
              action={
                <Button icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                  {t.newKey}
                </Button>
              }
            />
          </div>
        ) : (
          // Lista, ne mreža: redove razdvaja jedna `--line` crta, ne po okvir na svakom.
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <KeyRowItem key={row.keyId} row={row} locale={locale} onRevoke={() => setRevoking(row)} />
            ))}
          </ul>
        )}
      </Panel>

      <CreateKeyDialog
        locale={locale}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          setRevealed(created);
        }}
      />

      <RevealKeyDialog locale={locale} revealed={revealed} onClose={() => setRevealed(null)} />

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => {
          setRevoking(null);
          setRevokeError(null);
        }}
        onConfirm={confirmRevoke}
        busy={revokeBusy}
        destructive
        title={t.revokeTitle}
        description={revoking ? t.revokeBody(revoking.name) : ""}
        confirmLabel={t.revokeConfirm}
        cancelLabel={t.cancel}
        closeLabel={t.close}
      >
        {revokeError ? <p role="alert" className="type-caption font-black text-red-700">{revokeError}</p> : null}
      </ConfirmDialog>
    </div>
  );
}
