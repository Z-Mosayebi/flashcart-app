import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { tutorChat } from "@/lib/ai";

/** How many prior turns to replay to the model. Keeps prompt size bounded on
 *  long sessions while preserving enough context to judge mastery. */
const HISTORY_WINDOW = 20;

/**
 * POST /api/tutor/chat
 * body: { topicId, sessionId?, message }
 *
 * One turn of the conversational tutoring loop:
 *  1. Resolve (or create) the TutorSession for this user + topic.
 *  2. Replay recent history to the AI service along with the new message.
 *  3. Persist both the learner's message and the tutor's reply.
 *  4. When the tutor signals mastery, close the session out.
 *
 * An empty message starts the session — the tutor opens with the first prompt.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { topicId?: string; sessionId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { topicId, sessionId } = body;
  const message = (body.message ?? "").trim();

  if (!topicId) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  // Owner-scoped so a guessed topic id can't start a session on someone
  // else's material.
  const topic = await prisma.topic.findFirst({ where: { id: topicId, ownerId: userId } });
  if (!topic) return NextResponse.json({ error: "topic not found" }, { status: 404 });

  // Resolve the session, verifying ownership so a guessed id can't read
  // someone else's conversation.
  let session = sessionId
    ? await prisma.tutorSession.findFirst({ where: { id: sessionId, userId } })
    : null;

  if (sessionId && !session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (!session) {
    session = await prisma.tutorSession.create({ data: { userId, topicId } });
  }

  const priorMessages = await prisma.tutorMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: HISTORY_WINDOW,
  });

  const history = priorMessages.map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  let result;
  try {
    result = await tutorChat({
      topicName: topic.name,
      topicPattern: topic.pattern ?? undefined,
      history,
      userMessage: message,
    });
  } catch (err) {
    console.error("tutorChat failed", err);
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }

  // Persist the turn. The learner's message is skipped on the opening call,
  // where there's nothing for them to have said yet.
  await prisma.$transaction([
    ...(message
      ? [
          prisma.tutorMessage.create({
            data: { sessionId: session.id, role: "USER" as const, content: message },
          }),
        ]
      : []),
    prisma.tutorMessage.create({
      data: { sessionId: session.id, role: "ASSISTANT" as const, content: result.reply },
    }),
    prisma.tutorSession.update({
      where: { id: session.id },
      data: result.mastered
        ? { mastered: true, endedAt: new Date() }
        : {},
    }),
  ]);

  return NextResponse.json({
    sessionId: session.id,
    reply: result.reply,
    mastered: result.mastered,
  });
}
