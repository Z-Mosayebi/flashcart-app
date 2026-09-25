import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { reserveAiCall } from "@/lib/entitlements";
import { tutorChat } from "@/lib/ai";

/** How many prior turns to replay to the model. Keeps prompt size bounded on
 *  long sessions while preserving enough context to judge mastery. */
const HISTORY_WINDOW = 20;

/** Matches the AI service's limit on a single learner message. */
const MAX_MESSAGE_CHARS = 2_000;

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
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
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

  // Reserved after the last early return and before anything is written, so
  // only a real tutor reply is counted. The opening turn counts like any other.
  const reservation = await reserveAiCall(userId, "tutor");
  if (!reservation.ok) return reservation.response;

  if (!session) {
    session = await prisma.tutorSession.create({ data: { userId, topicId } });
  }

  // The *latest* HISTORY_WINDOW messages: fetched newest-first, then put back
  // in chronological order. Ordering ascending with a take would replay the
  // opening of the session forever and hide everything the learner said since.
  const priorMessages = await prisma.tutorMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_WINDOW,
  });

  const history = priorMessages.reverse().map((m) => ({
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
    await reservation.release();
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
