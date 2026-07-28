import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/**
 * POST /api/auth/register — create a credentials account.
 * Sign-in itself is handled by NextAuth; this only provisions the user.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  const { password, name } = body;
  const locale = body.locale === "de" ? "de" : "en";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name: name?.trim() || null,
        passwordHash,
        locale,
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    // Two accounts created in the same instant both pass the check above; the
    // unique constraint is what actually decides, so report that as a taken
    // email rather than a server error.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    // Anything else — most often the database being unreachable or still
    // waking from idle — must return JSON. Without this the route throws an
    // HTML 500 page and the sign-up form can only show a generic message.
    console.error("[register] Could not create account:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
