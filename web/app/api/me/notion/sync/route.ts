import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchPageMarkdown } from "@/lib/notion";
import { generateCards } from "@/lib/ai";

// Card generation over a large page is slow; give it room on hosts that allow it.
export const maxDuration = 300;

/**
 * POST /api/me/notion/sync — pull the user's Notion pages and turn new or
 * changed content into cards they own.
 *
 * Pages whose `last_edited_time` matches the last sync are skipped, so repeat
 * runs are cheap and don't regenerate the whole deck.
 */
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await prisma.notionConnection.findUnique({ where: { userId } });
  if (!conn) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  let token: string;
  try {
    token = decryptSecret(conn.encryptedToken);
  } catch {
    return NextResponse.json({ error: "token_unreadable" }, { status: 400 });
  }

  const results: { page: string; status: string; cards?: number }[] = [];

  try {
    for (const pageId of conn.pageIds) {
      const { title, markdown, lastEditedTime } = await fetchPageMarkdown(token, pageId);

      const existing = await prisma.sourceDocument.findUnique({
        where: { ownerId_notionPageId: { ownerId: userId, notionPageId: pageId } },
      });

      // Skip untouched pages — this is what keeps repeat syncs cheap.
      if (existing?.lastEditedTime?.toISOString() === new Date(lastEditedTime).toISOString()) {
        results.push({ page: title, status: "unchanged" });
        continue;
      }

      if (!markdown.trim()) {
        results.push({ page: title, status: "empty" });
        continue;
      }

      const { cards } = await generateCards({
        rawMarkdown: markdown,
        sourceDocumentTitle: title,
      });

      const doc = await prisma.sourceDocument.upsert({
        where: { ownerId_notionPageId: { ownerId: userId, notionPageId: pageId } },
        create: {
          notionPageId: pageId,
          title,
          rawMarkdown: markdown,
          lastEditedTime: new Date(lastEditedTime),
          ownerId: userId,
        },
        update: {
          title,
          rawMarkdown: markdown,
          lastEditedTime: new Date(lastEditedTime),
          lastSyncedAt: new Date(),
        },
      });

      let created = 0;
      for (const card of cards) {
        // Topics are unique per (owner, name), so re-syncing an edited page
        // adds cards to the existing topic instead of duplicating it.
        const topic = await prisma.topic.upsert({
          where: { ownerId_name: { ownerId: userId, name: card.topicName } },
          create: {
            name: card.topicName,
            pattern: card.topicPattern,
            ownerId: userId,
            sourceDocumentId: doc.id,
          },
          update: { pattern: card.topicPattern ?? undefined },
        });

        // Skip cards whose prompt already exists for this user, so re-syncing
        // an edited page doesn't pile up near-duplicates.
        const dupe = await prisma.card.findFirst({
          where: { ownerId: userId, prompt: card.prompt },
          select: { id: true },
        });
        if (dupe) continue;

        await prisma.card.create({
          data: {
            type: card.type,
            prompt: card.prompt,
            answer: card.answer,
            explanation: card.explanation,
            hints: card.hints ?? [],
            sourceText: card.sourceText,
            topicId: topic.id,
            ownerId: userId,
            isTemplate: false,
          },
        });
        created += 1;
      }

      results.push({ page: title, status: "synced", cards: created });
    }

    await prisma.notionConnection.update({
      where: { userId },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await prisma.notionConnection.update({
      where: { userId },
      data: { lastSyncError: message },
    });
    return NextResponse.json({ error: "sync_failed", detail: message }, { status: 502 });
  }
}
