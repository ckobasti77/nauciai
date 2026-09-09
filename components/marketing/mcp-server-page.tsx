import { KeyRound, Link2, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { McpAddressCopy } from "@/components/marketing/mcp-address-copy";
import { Panel, SectionHeader, SketchIcon, cn } from "@/components/ui/primitives";
import { mcpPageContent, withLocale, type Locale } from "@/lib/i18n";

/** Oblik `convex/mcp/catalog.ts:publicCatalog` — samo metapodaci, bez ijednog polja pozivaoca. */
export type McpCatalogTool = { name: string; description: string; scope: string };
export type McpCatalogResource = { uri: string; name: string; title?: string; description?: string };
export type McpCatalogResourceTemplate = { uriTemplate: string; name: string; title?: string; description?: string };
export type McpCatalogPromptArgument = { name: string; description?: string; required?: boolean };
export type McpCatalogPrompt = { name: string; title?: string; description?: string; arguments?: McpCatalogPromptArgument[] };
export type McpCatalog = {
  tools: McpCatalogTool[];
  resources: McpCatalogResource[];
  resourceTemplates: McpCatalogResourceTemplate[];
  prompts: McpCatalogPrompt[];
};

const MCP_SCOPE_WRITE = "mcp:write";

function ScopeChip({ scope, locale }: { scope: string; locale: Locale }) {
  const t = mcpPageContent[locale].catalog;
  const isWrite = scope === MCP_SCOPE_WRITE;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-black uppercase tracking-wide",
        isWrite ? "bg-yellow text-ink" : "bg-paper text-ink",
      )}
    >
      {isWrite ? t.scopeWrite : t.scopeRead}
    </span>
  );
}

/** Jedan red kataloga — ime, opis (na srpskom, iz registra) i opciono opseg/argumenti. */
function CatalogRow({
  name,
  description,
  scope,
  args,
  locale,
}: {
  name: string;
  description?: string;
  scope?: string;
  args?: McpCatalogPromptArgument[];
  locale: Locale;
}) {
  const t = mcpPageContent[locale].catalog;

  return (
    <li className="flex flex-col gap-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-black text-ink">{name}</code>
        {scope ? <ScopeChip scope={scope} locale={locale} /> : null}
      </div>
      {description ? <p className="type-body-sm font-semibold leading-6 text-muted">{description}</p> : null}
      {args && args.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-black uppercase tracking-wide text-muted">{t.argumentsLabel}:</span>
          {args.map((argument) => (
            <span
              key={argument.name}
              className="inline-flex items-center rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-bold text-ink"
            >
              {argument.name}
              <span className="ml-1 font-semibold text-muted">
                ({argument.required ? t.requiredLabel : t.optionalLabel})
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function CatalogGroup({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="type-h4 text-ink">{title}</p>
      <p className="mt-1 type-body-sm font-semibold text-muted">{body}</p>
      <Panel level={1} className="mt-4 overflow-hidden">
        <ul className="divide-y divide-line">{children}</ul>
      </Panel>
    </div>
  );
}

export function McpServerPage({
  locale,
  mcpUrl,
  catalog,
}: {
  locale: Locale;
  mcpUrl: string | null;
  catalog: McpCatalog | null;
}) {
  const t = mcpPageContent[locale];
  const apiKeysHref = withLocale(locale, "/app/profile/api-keys");
  const studioHref = withLocale(locale, "/studio");

  return (
    <main className="bg-surface-a text-ink">
      {/* Hero — bez videa, kratak uvod za nekog ko prvi put čuje za MCP. */}
      <section className="border-b-2 border-ink bg-surface-a px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            kicker={t.hero.kicker}
            title={`${t.hero.titleLead}${t.hero.titleHighlight}`}
            titleLead={t.hero.titleLead}
            titleHighlight={t.hero.titleHighlight}
            body={t.hero.body}
          />
        </div>
      </section>

      {/* Kako se dodaje — dva puta, jasno razdvojena (tačka 1). */}
      <section className="border-b-2 border-ink bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader title={t.connect.title} />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Panel level={0} className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <SketchIcon>
                  <Link2 className="size-5" />
                </SketchIcon>
                <p className="type-h4 text-ink">{t.connect.oauth.title}</p>
                <span className="inline-flex items-center rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-ink">
                  {t.connect.recommendedBadge}
                </span>
              </div>
              <p className="type-body-sm font-semibold text-muted">{t.connect.oauth.body}</p>
              <ol className="list-decimal space-y-2 pl-5 type-body-sm font-semibold text-ink">
                {t.connect.oauth.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="mt-auto pt-2">
                <p className="text-xs font-black uppercase tracking-wide text-muted">{t.connect.serverLabel}</p>
                <div className="mt-2">
                  {mcpUrl ? (
                    <McpAddressCopy address={mcpUrl} copyLabel={t.connect.copyLabel} copiedLabel={t.connect.copiedLabel} />
                  ) : (
                    <p className="type-body-sm font-semibold text-muted">—</p>
                  )}
                </div>
              </div>
            </Panel>

            <Panel level={0} className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <SketchIcon>
                  <KeyRound className="size-5" />
                </SketchIcon>
                <p className="type-h4 text-ink">{t.connect.apiKey.title}</p>
              </div>
              <p className="type-body-sm font-semibold text-muted">{t.connect.apiKey.body}</p>
              <ol className="list-decimal space-y-2 pl-5 type-body-sm font-semibold text-ink">
                {t.connect.apiKey.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="mt-auto pt-2">
                <Link
                  href={apiKeysHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <KeyRound className="size-4" />
                  {t.connect.apiKey.keysLinkLabel}
                </Link>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      {/* Opsezi — mcp:write troši kredite, VIDLJIVO, ne u fusnoti (tačka 4). */}
      <section className="border-b-2 border-ink bg-surface-a px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader title={t.scopes.title} />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Panel level={1} className="p-6">
              <p className="type-h4 text-ink">{t.scopes.read.title}</p>
              <p className="mt-2 type-body-sm font-semibold leading-6 text-muted">{t.scopes.read.body}</p>
            </Panel>
            <Panel level={1} className="p-6 shadow-[6px_6px_0_0_var(--yellow)]">
              <p className="flex items-center gap-2 type-h4 text-ink">
                <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
                {t.scopes.write.title}
              </p>
              <p className="mt-2 type-body-sm font-semibold leading-6 text-muted">{t.scopes.write.body}</p>
            </Panel>
          </div>
        </div>
      </section>

      {/* Katalog — IZVEDEN iz registra (convex/mcp/catalog.ts), ništa prekucano u JSX. */}
      <section className="border-b-2 border-ink bg-surface-b px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader title={t.catalog.title} body={t.catalog.intro} />
          {catalog ? (
            <div className="mt-10 space-y-10">
              <CatalogGroup title={t.catalog.toolsTitle} body={t.catalog.toolsBody}>
                {catalog.tools.map((tool) => (
                  <CatalogRow key={tool.name} name={tool.name} description={tool.description} scope={tool.scope} locale={locale} />
                ))}
              </CatalogGroup>

              <CatalogGroup title={t.catalog.resourcesTitle} body={t.catalog.resourcesBody}>
                {[...catalog.resources, ...catalog.resourceTemplates].map((resource) => (
                  <CatalogRow
                    key={"uri" in resource ? resource.uri : resource.uriTemplate}
                    name={"uri" in resource ? resource.uri : resource.uriTemplate}
                    description={resource.description}
                    locale={locale}
                  />
                ))}
              </CatalogGroup>

              <CatalogGroup title={t.catalog.promptsTitle} body={t.catalog.promptsBody}>
                {catalog.prompts.map((prompt) => (
                  <CatalogRow
                    key={prompt.name}
                    name={prompt.name}
                    description={prompt.description}
                    args={prompt.arguments}
                    locale={locale}
                  />
                ))}
              </CatalogGroup>
            </div>
          ) : (
            <Panel level={1} className="mt-10 max-w-xl p-6 text-center">
              <p className="type-body font-bold text-muted">{t.catalog.empty}</p>
            </Panel>
          )}
        </div>
      </section>

      {/* Tihi cross-sell (isti obrazac kao Studio landing) — bez drugog footera ovde. */}
      <section className="bg-surface-a px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href={studioHref}
            className="inline-flex items-center gap-2 font-display text-2xl text-ink underline decoration-[var(--yellow)] decoration-4 underline-offset-8 hover:decoration-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Sparkles className="size-5" aria-hidden="true" />
            {t.crossSell}
          </Link>
        </div>
      </section>
    </main>
  );
}
