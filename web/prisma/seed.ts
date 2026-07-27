/**
 * Seed script — loads the starter German deck (weswegen relative clauses,
 * Massentourismus vocab gap-fills, common error-correction drills and practice
 * sentences) so a fresh install has content to review immediately, before any
 * Notion sync is configured.
 *
 * Cards are shared content, not per-user: every account reviews the same deck
 * and gets its own CardProgress rows. No user is created here — accounts come
 * from sign-up.
 *
 * Run: npm run seed
 */

import { PrismaClient, CardType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // The template set is identified by isTemplate = true / ownerId = null.
  // Re-running would duplicate it, so bail out if it already exists.
  const existing = await prisma.card.count({ where: { isTemplate: true } });
  if (existing > 0) {
    console.log(`Skipping seed: ${existing} template cards already exist.`);
    return;
  }

  // ---------- Topic: weswegen relative clause ----------
  const weswegenTopic = await prisma.topic.create({
    data: {
      name: "weswegen relative clause",
      description:
        "Connects a subordinate clause to 'der Grund/die Gründe', sending the conjugated verb to the end.",
      pattern: "der Grund/die Gründe + , weswegen + subject + ... + verb (end of clause)",
      isTemplate: true,
    },
  });

  // ---------- Topic: aus [Dativ] ... werden ----------
  const ausWerdenTopic = await prisma.topic.create({
    data: {
      name: "aus + Dativ ... werden (transformation)",
      description: "'To turn into' / 'to become out of something'. Result noun stays Nominative.",
      pattern: "aus + [Subject in Dativ] + [New Thing in Nominativ] + werden",
      isTemplate: true,
    },
  });

  // ---------- Topic: Massentourismus vocab ----------
  const vocabTopic = await prisma.topic.create({
    data: {
      name: "Reise-Vokabeln (Massentourismus)",
      description: "Travel/tourism vocabulary in context: Massen, Ballermann, Anbindung, Infrastruktur, Badestrand.",
      isTemplate: true,
    },
  });

  // ---------- Topic: common grammar mistakes (error log) ----------
  const errorLogTopic = await prisma.topic.create({
    data: {
      name: "Häufige Fehler",
      description: "Recurring mistakes: verb position, relative pronouns, wissen vs. kennen, prepositions.",
      isTemplate: true,
    },
  });

  console.log("Seeding starter template cards...");

  // isTemplate is applied to every row below at insert time rather than repeated
  // on each card, so a new card can't accidentally be added without the flag.
  const templateCards = [
      // --- weswegen: sentence production ---
      {
        type: CardType.SENTENCE_PRODUCTION,
        topicId: weswegenTopic.id,
        prompt: "Using 'weswegen', write a sentence explaining why you are learning German (Muster: Der Grund, weswegen ich ..., ist ...).",
        answer: "Der Grund, weswegen ich Deutsch lerne, ist die Integration mit den Deutschen.",
        explanation: "The verb must be conjugated (ich lerne, not lernen), nouns are capitalized, and 'die Deutschen' after 'mit' takes Dativ.",
        hints: ["Verb goes to the very end", "Integration needs an article: die Integration"],
        sourceText: "Der Grund, weswegen ich Deutsch lerne, ist die Integration mit den Deutschen.",
      },
      {
        type: CardType.SENTENCE_PRODUCTION,
        topicId: weswegenTopic.id,
        prompt: "Using 'weswegen', explain why you moved to Berlin.",
        answer: "Der Grund, weswegen ich nach Berlin gekommen bin, ist die bessere Wohnung.",
        explanation: "'kommen' takes 'sein' in the Perfekt, not 'haben'. Adjective ending: 'bessere' (weak declension after 'die').",
        hints: ["kommen -> ist ... gekommen"],
        sourceText: "Der Grund, weswegen ich nach Berlin gekommen bin, ist die bessere Wohnung.",
      },
      {
        type: CardType.SENTENCE_PRODUCTION,
        topicId: weswegenTopic.id,
        prompt: "Using 'weswegen', explain why you want to become an AI Engineer (use a zu-Infinitiv clause after 'ist').",
        answer: "Der Grund, weswegen ich AI Engineer werden möchte, ist, ein gutes Gehalt zu verdienen.",
        explanation: "When an action (not just a noun) follows 'ist', use 'ist, ... zu + Infinitiv'.",
        hints: ["ist, + zu-Infinitiv when a full action follows"],
        sourceText: "Der Grund, weswegen ich AI Engineer werden möchte, ist, ein gutes Gehalt zu verdienen.",
      },
      {
        type: CardType.GRAMMAR_QA,
        topicId: weswegenTopic.id,
        prompt: "What are two more formal synonyms of 'weswegen', and one more casual/spoken alternative?",
        answer: "weshalb (formal, written — nearly identical to weswegen); warum (casual, more common in speech). All three send the verb to the end.",
        explanation: "weswegen and weshalb are essentially interchangeable in formal/written register; warum is the everyday spoken choice.",
        hints: [],
      },
      {
        type: CardType.ERROR_CORRECTION,
        topicId: weswegenTopic.id,
        prompt: "Fix the mistake: 'Der Grund, weswegen ich Deutsch lernen, ist die Integration.'",
        answer: "Der Grund, weswegen ich Deutsch lerne, ist die Integration.",
        explanation: "The verb must be conjugated to match the subject (ich lerne), not left as the infinitive (lernen).",
        hints: ["Look at the verb form"],
      },

      // --- aus + Dativ ... werden ---
      {
        type: CardType.GRAMMAR_QA,
        topicId: ausWerdenTopic.id,
        prompt: "In the sentence 'die Gründe, weswegen aus einem Ort ein beliebtes Reiseziel wird' — why is 'ein beliebtes Reiseziel' in the Nominative case, not Dative?",
        answer: "Because it is the predicate noun of 'werden' — the result of the transformation stays in the Nominative case, while only the starting point after 'aus' takes Dative.",
        explanation: "Structure: aus + [Subject in Dativ] + [New Thing in Nominativ] + werden.",
        hints: ["werden always takes a Nominative predicate"],
      },
      {
        type: CardType.GRAMMAR_QA,
        topicId: ausWerdenTopic.id,
        prompt: "Why does the adjective in 'ein beliebtes Reiseziel' end in -es?",
        answer: "'das Reiseziel' is neuter, and the indefinite article 'ein' doesn't signal gender clearly, so the adjective takes the strong neuter ending -es (beliebtes) to carry that information.",
        explanation: "Strong adjective declension fills in for articles that don't show gender/case clearly.",
        hints: ["das Reiseziel is neuter"],
      },
      {
        type: CardType.SENTENCE_PRODUCTION,
        topicId: ausWerdenTopic.id,
        prompt: "Use the pattern 'aus + Dativ ... werden' to say a small village became a popular tourist destination.",
        answer: "Aus einem kleinen Dorf wurde ein beliebtes Reiseziel.",
        explanation: "'einem kleinen Dorf' is Dativ (aus), 'ein beliebtes Reiseziel' stays Nominativ as the result.",
        hints: [],
      },

      // --- Vocab (Massentourismus gap-fill dialogue) ---
      {
        type: CardType.CLOZE,
        topicId: vocabTopic.id,
        prompt: "„Ist es dort voll?“ – „Nein, keine Sorge: Es ist ein relativ ruhiger Ort im Nordosten von Mallorca – die ___ fahren alle an den ___.“",
        answer: "Massen / Ballermann",
        explanation: "'die Massen' = the crowds; 'der Ballermann' = the famous party beach area in Mallorca.",
        hints: ["First blank: crowds. Second: a famous party spot in Mallorca."],
        sourceText: "„Was können Sie mir über den Urlaubsort sagen? Ist es dort voll?“",
      },
      {
        type: CardType.CLOZE,
        topicId: vocabTopic.id,
        prompt: "„Wie ist denn da die ___ an den Flughafen?“ – „Wir können Ihnen gerne Angebote für einen Mietwagen raussuchen.“",
        answer: "Anbindung",
        explanation: "'die Anbindung an + Akkusativ' = the connection to (a place) — not 'nach'.",
        hints: ["connection/link to the airport"],
      },
      {
        type: CardType.CLOZE,
        topicId: vocabTopic.id,
        prompt: "„Und wie ist die ___ vor Ort?“ – „Es gibt dort mehrere Geschäfte, viele kleine Bars und Restaurants.“",
        answer: "Infrastruktur",
        explanation: "'die Infrastruktur' — shops, bars, restaurants available locally.",
        hints: [],
      },
      {
        type: CardType.CLOZE,
        topicId: vocabTopic.id,
        prompt: "„Gibt es in dem Ort auch einen ___?“ – „Ja, 300 Meter von der Ferienwohnung entfernt gibt es einen mit ganz feinem weißem Sand.“",
        answer: "Badestrand",
        explanation: "'der Badestrand' = a swimming beach.",
        hints: [],
      },
      {
        type: CardType.VOCAB,
        topicId: vocabTopic.id,
        prompt: "Historian Hasso Spode — what two things does he say matter for a place to become a tourist destination?",
        answer: "That the destination is easy to reach (gut erreichen kann) and that a touristic infrastructure exists.",
        explanation: "From the Massentourismus text discussion.",
        hints: [],
      },

      // --- Error log cards ---
      {
        type: CardType.ERROR_CORRECTION,
        topicId: errorLogTopic.id,
        prompt: "Fix the mistake: 'weil das ein Ort ist' was correct — but what's the WRONG version this rule guards against? Write the corrected verb-final form for: 'weil da ist ein Ort'.",
        answer: "weil das ein Ort ist",
        explanation: "In weil/dass clauses, the conjugated verb goes to the very end.",
        hints: ["Verb to the end"],
      },
      {
        type: CardType.ERROR_CORRECTION,
        topicId: errorLogTopic.id,
        prompt: "Fix: a relative clause needs a relative pronoun. Correct this: 'ein Ort man gern bereist'.",
        answer: "ein Ort, den man gern bereist",
        explanation: "'der Ort' is masculine, and it's the direct object of 'bereisen', so the relative pronoun is Akkusativ: den.",
        hints: ["der Ort is masculine -> Akkusativ relative pronoun is 'den'"],
      },
      {
        type: CardType.GRAMMAR_QA,
        topicId: errorLogTopic.id,
        prompt: "Explain the difference between 'wissen' and 'kennen' with an example of each.",
        answer: "'wissen' = to know a fact (Ich weiß, dass...); 'kennen' = to be familiar with something (Ich kenne das Wort nicht).",
        explanation: "wissen takes clauses/facts; kennen takes direct objects you're familiar with.",
        hints: [],
      },
      {
        type: CardType.ERROR_CORRECTION,
        topicId: errorLogTopic.id,
        prompt: "Fix: 'die Anbindung nach den Flughafen'",
        answer: "die Anbindung an den Flughafen",
        explanation: "'Anbindung an' + Akkusativ, not 'nach'.",
        hints: [],
      },
      {
        type: CardType.GRAMMAR_QA,
        topicId: errorLogTopic.id,
        prompt: "Why are German compound words like 'der Wohnort' and 'der Arbeitsplatz' never written as two separate words?",
        answer: "German compounds (Komposita) are always written as one word: der Wohnort (not 'Wohnung Ort'), der Arbeitsplatz (not 'Arbeit Platz').",
        explanation: "This is a structural rule of German word formation, not a stylistic choice.",
        hints: [],
      },
      {
        type: CardType.ERROR_CORRECTION,
        topicId: errorLogTopic.id,
        prompt: "Fix: 'ich habe mich nicht sicher'",
        answer: "ich bin mir nicht sicher",
        explanation: "'sich sicher sein' is a reflexive construction with 'sein', not 'haben'.",
        hints: ["sich sicher sein uses sein, not haben"],
      },
      {
        type: CardType.ERROR_CORRECTION,
        topicId: errorLogTopic.id,
        prompt: "Fix: 'es habe Badestrand'",
        answer: "es gibt einen Badestrand",
        explanation: "'es gibt' + Akkusativ is the fixed construction for 'there is/are'.",
        hints: ["es gibt + Akkusativ"],
      },
  ];

  await prisma.card.createMany({
    data: templateCards.map((card) => ({ ...card, isTemplate: true })),
  });

  console.log(
    `Seed complete. ${templateCards.length} starter cards are ready — each new ` +
      `account gets its own copy on first sign-in.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
