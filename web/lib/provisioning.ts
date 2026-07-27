/**
 * New-account deck provisioning.
 *
 * Cards and topics are per-user, so a fresh account owns nothing and would land
 * on an empty review screen. To avoid that, the seeded starter deck is stored as
 * a template (ownerId = null, isTemplate = true) and copied into each account
 * the first time it's needed.
 *
 * The copy is deliberate rather than a shared reference: once it's theirs, users
 * can edit or delete cards without affecting anyone else.
 */

import { prisma } from "@/lib/prisma";

/**
 * Copies the starter deck to a user if they have no deck yet.
 * Safe to call on every sign-in — it's a no-op after the first run.
 *
 * Returns the number of cards copied (0 if provisioning already happened).
 */
export async function provisionStarterDeck(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deckProvisionedAt: true },
  });

  // Already provisioned, or the user no longer exists.
  if (!user || user.deckProvisionedAt) return 0;

  const templateTopics = await prisma.topic.findMany({
    where: { isTemplate: true, ownerId: null },
    include: { cards: { where: { isTemplate: true } } },
  });

  if (templateTopics.length === 0) {
    // Nothing seeded yet. Mark as provisioned anyway so we don't re-query on
    // every request; the user can still connect Notion to get content.
    await prisma.user.update({
      where: { id: userId },
      data: { deckProvisionedAt: new Date() },
    });
    return 0;
  }

  let copied = 0;

  // One transaction so a user never ends up with a half-copied deck.
  await prisma.$transaction(async (tx) => {
    for (const template of templateTopics) {
      const topic = await tx.topic.create({
        data: {
          name: template.name,
          description: template.description,
          pattern: template.pattern,
          language: template.language,
          ownerId: userId,
          isTemplate: false,
        },
      });

      if (template.cards.length > 0) {
        await tx.card.createMany({
          data: template.cards.map((card) => ({
            type: card.type,
            prompt: card.prompt,
            answer: card.answer,
            explanation: card.explanation,
            hints: card.hints,
            sourceText: card.sourceText,
            aiGenerated: card.aiGenerated,
            topicId: topic.id,
            ownerId: userId,
            isTemplate: false,
          })),
        });
        copied += template.cards.length;
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: { deckProvisionedAt: new Date() },
    });
  });

  return copied;
}
