import { describe, expect, it } from "vitest";
import { getCommunityPostPath, getCommunityPostSlug } from "./community-slug";
import { withLocale, type Locale } from "./i18n";

function buildThreadJsonLd({
  post,
  comments,
  canonicalUrl,
}: {
  post: {
    title: string;
    body: string;
    language: "sr" | "en";
    createdAt: number;
    updatedAt: number;
    lastActivityAt?: number;
    authorName: string;
    commentsCount: number;
    upvoteCount: number;
  };
  comments: Array<{
    body: string;
    authorName: string;
    createdAt: number;
    upvoteCount?: number;
  }>;
  canonicalUrl: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: post.body,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.lastActivityAt ?? post.updatedAt ?? post.createdAt).toISOString(),
    url: canonicalUrl,
    author: {
      "@type": "Person",
      name: post.authorName,
    },
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: post.upvoteCount ?? 0,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: post.commentsCount ?? 0,
      },
    ],
    comment: comments.map((comment) => ({
      "@type": "Comment",
      text: comment.body,
      author: {
        "@type": "Person",
        name: comment.authorName,
      },
      dateCreated: new Date(comment.createdAt).toISOString(),
      upvoteCount: comment.upvoteCount ?? 0,
    })),
  };

  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return { jsonLd, safeJsonLd };
}

function computeRobotsDirectives(post: { commentsCount: number; body: string }) {
  const isThinContent = post.commentsCount === 0 && post.body.trim().length < 200;
  return isThinContent
    ? { index: false, follow: true }
    : { index: true, follow: true };
}

function computeCanonicalUrl(
  origin: string,
  post: { title: string; _id: string; language: "sr" | "en" },
) {
  const canonicalLocale: Locale = post.language === "en" ? "en" : "sr";
  const slug = getCommunityPostSlug(post.title, post._id);
  return `${origin}${withLocale(canonicalLocale, `/community/${slug}`)}`;
}

describe("community-seo", () => {
  it("builds valid and safely escaped JSON-LD for DiscussionForumPosting", () => {
    const post = {
      title: "Kako napraviti <script>alert('xss')</script> i video?",
      body: "Ovo je sadržaj koji sadrži <b>HTML</b> i </script> tagove koji moraju biti bezbedni.",
      language: "sr" as const,
      createdAt: 1700000000000,
      updatedAt: 1700000100000,
      lastActivityAt: 1700000200000,
      authorName: "Marko Petrović",
      commentsCount: 2,
      upvoteCount: 5,
    };
    const comments = [
      {
        body: "Odličan post! <script>code</script>",
        authorName: "Ana Jovanović",
        createdAt: 1700000150000,
        upvoteCount: 3,
      },
    ];
    const canonicalUrl = "https://nauciai.com/sr/community/kako-napraviti-video-123";

    const { safeJsonLd } = buildThreadJsonLd({ post, comments, canonicalUrl });

    // Safe stringification must NOT contain raw unescaped '<'
    expect(safeJsonLd).not.toContain("<script>");
    expect(safeJsonLd).not.toContain("</script>");
    expect(safeJsonLd).toContain("\\u003cscript>alert");
    expect(safeJsonLd).toContain("\\u003c/script>");

    // Must be valid JSON when parsed
    const parsed = JSON.parse(safeJsonLd);
    expect(parsed["@type"]).toBe("DiscussionForumPosting");
    expect(parsed.headline).toBe(post.title);
    expect(parsed.author.name).toBe("Marko Petrović");
    expect(parsed.author.email).toBeUndefined();
    expect(parsed.author._id).toBeUndefined();
    expect(parsed.datePublished).toBe(new Date(post.createdAt).toISOString());
    expect(parsed.dateModified).toBe(new Date(post.lastActivityAt).toISOString());
    expect(parsed.url).toBe(canonicalUrl);
    expect(parsed.interactionStatistic).toHaveLength(2);
    expect(parsed.interactionStatistic[0].userInteractionCount).toBe(5);
    expect(parsed.interactionStatistic[1].userInteractionCount).toBe(2);
    expect(parsed.comment).toHaveLength(1);
    expect(parsed.comment[0]["@type"]).toBe("Comment");
    expect(parsed.comment[0].author.name).toBe("Ana Jovanović");
    expect(parsed.comment[0].upvoteCount).toBe(3);
  });

  it("canonical URL always matches post.language regardless of accessed route locale", () => {
    const origin = "https://nauciai.com";
    const srPost = { _id: "post123", title: "Nauči AI Tutorijal", language: "sr" as const };
    const enPost = { _id: "post456", title: "Learn AI Tutorial", language: "en" as const };

    const srCanonical = computeCanonicalUrl(origin, srPost);
    expect(srCanonical).toBe("https://nauciai.com/sr/community/nauci-ai-tutorijal-post123");

    const enCanonical = computeCanonicalUrl(origin, enPost);
    expect(enCanonical).toBe("https://nauciai.com/en/community/learn-ai-tutorial-post456");
  });

  it("applies noindex, follow to thin content (<200 chars and 0 comments)", () => {
    const thinPost = {
      commentsCount: 0,
      body: "Kratak post.",
    };
    expect(computeRobotsDirectives(thinPost)).toEqual({ index: false, follow: true });
  });

  it("applies index, follow when post has 0 comments but body >= 200 chars", () => {
    const longPost = {
      commentsCount: 0,
      body: "a".repeat(200),
    };
    expect(computeRobotsDirectives(longPost)).toEqual({ index: true, follow: true });
  });

  it("applies index, follow when post has comments even if body < 200 chars", () => {
    const shortPostWithComments = {
      commentsCount: 1,
      body: "Kratko pitanje?",
    };
    expect(computeRobotsDirectives(shortPostWithComments)).toEqual({ index: true, follow: true });
  });

  it("generates sitemap items with matching language and lastModified", () => {
    const origin = "https://nauciai.com";
    const thread = {
      _id: "th1",
      title: "Srpska tema",
      language: "sr" as const,
      lastActivityAt: 1725000000000,
    };
    const sitemapItem = {
      url: `${origin}${getCommunityPostPath(thread.language, thread)}`,
      lastModified: new Date(thread.lastActivityAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };

    expect(sitemapItem.url).toBe("https://nauciai.com/sr/community/srpska-tema-th1");
    expect(sitemapItem.lastModified.getTime()).toBe(1725000000000);
  });
});
